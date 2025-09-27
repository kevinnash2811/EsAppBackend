import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.services';
import { JoinRoomDto } from './dto/join-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { TypingDto } from './dto/typing.dto';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3001', // ⬅️ Frontend development
      'http://localhost:5173', // Vite default
      'https://tu-frontend.com' // Production
    ],
    credentials: true,
  },
  // namespace: 'chat',
})
@UsePipes(new ValidationPipe())
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatService: ChatService) {}

  afterInit(server: Server) {
    this.logger.log('Chat Gateway inicializado');
  }

  async handleConnection(client: Socket) {
    try {
      // Obtener username del handshake
      const username = client.handshake.auth.username || `Usuario-${client.id.substring(0, 6)}`;
      
      console.log('🔗 Cliente intentando conectar:', {
        id: client.id,
        username: username,
        auth: client.handshake.auth,
        headers: client.handshake.headers
      });

      // Registrar usuario conectado
      const userId = this.chatService.addConnectedUser(client.id, username);
      
      // ⬇️ ENVIAR EVENTO DE CONEXIÓN CORRECTA - esto es lo más importante
      client.emit('connected', {
        socketId: client.id,
        userId: userId,
        message: 'Conectado al servidor correctamente',
      });

      console.log('✅ Cliente conectado exitosamente:', client.id, '- Usuario:', username);
      
      // También enviar evento de conexión general
      this.server.emit('user:connected', {
        user: {
          id: userId,
          username: username,
          isOnline: true,
        },
        message: `${username} se ha conectado`,
      });
      
    } catch (error) {
      console.error('❌ Error en conexión:', error.message);
      client.emit('error', {
        message: 'Error al conectar: ' + error.message,
        code: 'CONNECTION_ERROR',
      });
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const disconnectedUser = this.chatService.removeConnectedUser(client.id);
      
      if (disconnectedUser) {
        // Notificar a todos los clientes sobre la desconexión
        this.server.emit('user:disconnected', {
          user: {
            id: disconnectedUser.userId,
            username: disconnectedUser.username,
            isOnline: false,
          },
          message: `${disconnectedUser.username} se desconectó`,
        });

        this.logger.log(`Cliente desconectado: ${client.id} - ${disconnectedUser.username}`);
      }
      
    } catch (error) {
      this.logger.error(`Error en desconexión: ${error.message}`);
    }
  }

  @SubscribeMessage('join:room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() joinRoomDto: JoinRoomDto,
  ) {
    try {
      const { roomId, username } = joinRoomDto;
      
      console.log('🚪 SOLICITUD DE UNIÓN A SALA:', {
        clientId: client.id,
        username,
        roomId,
        salasActuales: Array.from(client.rooms)
      });

      // Unir al cliente a la sala de Socket.io
      await client.join(roomId);
      
      console.log('✅ Cliente unido a sala Socket.io:', {
        clientId: client.id,
        roomId,
        salasDespues: Array.from(client.rooms)
      });

      // Registrar en nuestro servicio
      const { room, user } = this.chatService.joinRoom(roomId, client.id, username);
      
      console.log('📊 ESTADO DE LA SALA DESPUÉS DE UNIRSE:', {
        roomId,
        totalUsuarios: room.users.size,
        usuarios: Array.from(room.users.values()).map(u => ({
          id: u.id,
          username: u.username,
          socketId: u.socketId
        }))
      });

      // Notificar al cliente que se unió
      client.emit('room:joined', {
        roomId,
        user,
        message: `Te uniste a la sala ${roomId}`,
      });
      
      // Enviar historial de mensajes
      const messages = this.chatService.getRoomMessages(roomId, 50);
      client.emit('room:history', {
        roomId,
        messages,
      });
      
      // Notificar a otros usuarios de la sala
      client.to(roomId).emit('user:joined', {
        user,
        roomId,
        message: `${username} se unió a la sala`,
      });
      
      // Enviar lista actualizada de usuarios de la sala
      const roomUsers = this.chatService.getRoomUsers(roomId);
      this.server.to(roomId).emit('room:users', {
        roomId,
        users: roomUsers,
      });
      
      console.log('🎉 Usuario agregado exitosamente a la sala');
      this.logger.log(`Usuario ${username} se unió a la sala ${roomId}`);
      
    } catch (error) {
      this.logger.error(`Error al unirse a sala: ${error.message}`);
      client.emit('error', {
        message: 'Error al unirse a la sala',
        code: 'JOIN_ERROR',
      });
    }
  }

  @SubscribeMessage('leave:room')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() leaveRoomDto: { roomId: string },
  ) {
    try {
      const { roomId } = leaveRoomDto;
      
      console.log('🚪 SOLICITUD DE SALIDA DE SALA:', {
        clientId: client.id,
        roomId
      });

      // Sacar al cliente de la sala de Socket.io
      await client.leave(roomId);
      
      // Registrar en nuestro servicio
      const result = this.chatService.leaveRoom(roomId, client.id);
      
      if (result) {
        const { user } = result;
        
        console.log('📊 ESTADO DE LA SALA DESPUÉS DE SALIR:', {
          roomId,
          usuarioSalio: user.username,
          salasRestantes: Array.from(client.rooms)
        });

        // Notificar al cliente que salió
        client.emit('room:left', {
          roomId,
          message: `Saliste de la sala ${roomId}`,
        });
        
        // Notificar a otros usuarios de la sala
        client.to(roomId).emit('user:left', {
          user,
          roomId,
          message: `${user.username} salió de la sala`,
        });
        
        // Enviar lista actualizada de usuarios de la sala
        const roomUsers = this.chatService.getRoomUsers(roomId);
        this.server.to(roomId).emit('room:users', {
          roomId,
          users: roomUsers,
        });
        
        this.logger.log(`Usuario ${user.username} salió de la sala ${roomId}`);
      }
      
    } catch (error) {
      this.logger.error(`Error al salir de sala: ${error.message}`);
      client.emit('error', {
        message: 'Error al salir de la sala',
        code: 'LEAVE_ERROR',
      });
    }
  }

  @SubscribeMessage('send:message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() sendMessageDto: SendMessageDto,
  ) {
    try {
      const { roomId, text } = sendMessageDto;
      
      console.log('📨 MENSAJE RECIBIDO:', {
        clientId: client.id,
        roomId,
        text,
        salasDelCliente: Array.from(client.rooms)
      });

      // Validar que el usuario esté en la sala
      const room = this.chatService.getRoom(roomId);
      if (!room) {
        throw new Error(`Sala ${roomId} no encontrada`);
      }

      // Verificar que el cliente esté en la sala
      const userInRoom = Array.from(room.users.values()).find(u => u.socketId === client.id);
      if (!userInRoom) {
        throw new Error(`Usuario no está en la sala ${roomId}`);
      }

      console.log('👤 Usuario encontrado en sala:', userInRoom.username);
      
      // Agregar mensaje al historial
      const message = this.chatService.addMessage(roomId, text, client.id);
      
      if (message) {
        console.log('📤 ENVIANDO MENSAJE A SALA:', {
          roomId,
          totalUsuarios: room.users.size,
          usuarios: Array.from(room.users.values()).map(u => u.username),
          mensaje: message.text
        });

        // Enviar mensaje a todos en la sala
        this.server.to(roomId).emit('room:message', message);
        
        console.log('✅ Mensaje enviado exitosamente a la sala');
        this.logger.log(`Mensaje enviado a sala ${roomId}: ${message.user} - ${message.text}`);
      }
      
    } catch (error) {
      console.error('❌ Error al enviar mensaje:', error.message);
      client.emit('error', {
        message: 'Error al enviar mensaje',
        code: 'MESSAGE_ERROR',
      });
    }
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() typingDto: TypingDto,
  ) {
    try {
      const { roomId } = typingDto;
      const user = this.chatService.getConnectedUser(client.id);
      
      if (user) {
        console.log('⌨️ Usuario escribiendo:', { usuario: user.username, roomId });
        
        // Notificar a otros usuarios de la sala que alguien está escribiendo
        client.to(roomId).emit('user:typing:start', {
          user: {
            id: user.userId,
            username: user.username,
            isOnline: true,
          },
          roomId,
        });
      }
      
    } catch (error) {
      this.logger.error(`Error en typing start: ${error.message}`);
    }
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() typingDto: TypingDto,
  ) {
    try {
      const { roomId } = typingDto;
      const user = this.chatService.getConnectedUser(client.id);
      
      if (user) {
        console.log('💤 Usuario dejó de escribir:', { usuario: user.username, roomId });
        
        // Notificar a otros usuarios de la sala que alguien dejó de escribir
        client.to(roomId).emit('user:typing:stop', {
          user: {
            id: user.userId,
            username: user.username,
            isOnline: true,
          },
          roomId,
        });
      }
      
    } catch (error) {
      this.logger.error(`Error en typing stop: ${error.message}`);
    }
  }

  // Método para debug - ver estado de todas las salas
  @SubscribeMessage('debug:rooms')
  async handleDebugRooms(@ConnectedSocket() client: Socket) {
    try {
      // Obtener información de todas las salas (necesitarás agregar este método al ChatService)
      const roomsInfo = this.chatService.getAllRoomsInfo();
      
      client.emit('debug:rooms:response', {
        totalSalas: roomsInfo.length,
        salas: roomsInfo
      });
      
      console.log('🐛 DEBUG - Estado de salas:', roomsInfo);
    } catch (error) {
      console.error('Error en debug:', error);
    }
  }

  // Método para debug - ver estado de una sala específica
  @SubscribeMessage('debug:room')
  async handleDebugRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string }
  ) {
    try {
      const { roomId } = data;
      const roomInfo = this.chatService.getRoomInfo(roomId);
      
      client.emit('debug:room:response', {
        roomId,
        existe: !!roomInfo,
        info: roomInfo
      });
      
      console.log(`🐛 DEBUG - Sala ${roomId}:`, roomInfo);
    } catch (error) {
      console.error('Error en debug room:', error);
    }
  }
}