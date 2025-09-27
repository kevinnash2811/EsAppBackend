import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3002', // Puerto de Quasar
    credentials: true,
  },
})
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private clients: Map<string, Socket> = new Map();

  handleConnection(client: Socket) {
    console.log('Cliente conectado:', client.id);
    this.clients.set(client.id, client);
    
    // Emitir evento de conexión
    client.emit('connected', { message: 'Conectado al servidor', id: client.id });
  }

  handleDisconnect(client: Socket) {
    console.log('Cliente desconectado:', client.id);
    this.clients.delete(client.id);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(client: Socket, room: string) {
    client.join(room);
    client.to(room).emit('userJoined', { user: client.id, room });
  }

  @SubscribeMessage('sendMessage')
  handleMessage(client: Socket, payload: { room: string; message: string }) {
    // Emitir a todos en la sala incluyendo al remitente
    this.server.to(payload.room).emit('newMessage', {
      user: client.id,
      message: payload.message,
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('typing')
  handleTyping(client: Socket, payload: { room: string; isTyping: boolean }) {
    client.to(payload.room).emit('userTyping', {
      user: client.id,
      isTyping: payload.isTyping,
    });
  }
}