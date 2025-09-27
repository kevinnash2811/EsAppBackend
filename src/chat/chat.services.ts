import { Injectable, Logger } from '@nestjs/common';
import { Message, User, Room, ConnectedUser, RoomUser, RoomInfo } from './interfaces/chat.interface';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  
  // Almacenamiento en memoria (puedes cambiar por base de datos)
  private rooms: Map<string, Room> = new Map();
  private connectedUsers: Map<string, ConnectedUser> = new Map(); // socketId -> ConnectedUser

  // Gestión de usuarios conectados
  addConnectedUser(socketId: string, username: string): string {
    const userId = this.generateId();
    const user: ConnectedUser = {
      userId,
      socketId,
      username,
    };
    this.connectedUsers.set(socketId, user);
    this.logger.log(`Usuario conectado: ${username} (${socketId})`);
    return userId;
  }

  removeConnectedUser(socketId: string): ConnectedUser | null {
    const user = this.connectedUsers.get(socketId);
    if (user) {
      this.connectedUsers.delete(socketId);
      
      // Remover usuario de todas las salas
      this.rooms.forEach((room) => {
        room.users.delete(user.userId);
      });
      
      this.logger.log(`Usuario desconectado: ${user.username} (${socketId})`);
      return user;
    }
    return null;
  }

  getConnectedUser(socketId: string): ConnectedUser | undefined {
    return this.connectedUsers.get(socketId);
  }

  // Gestión de salas
  createRoom(roomId: string, roomName?: string): Room {
    const room: Room = {
      id: roomId,
      name: roomName || roomId,
      users: new Map(),
      messages: [],
      createdAt: new Date(),
    };
    this.rooms.set(roomId, room);
    this.logger.log(`Sala creada: ${roomId}`);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getOrCreateRoom(roomId: string): Room {
    let room = this.getRoom(roomId);
    if (!room) {
      room = this.createRoom(roomId);
    }
    return room;
  }

  // Gestión de usuarios en salas
  joinRoom(roomId: string, socketId: string, username: string): { room: Room; user: User } {
    const connectedUser = this.getConnectedUser(socketId);
    if (!connectedUser) {
      throw new Error('Usuario no conectado');
    }

    const room = this.getOrCreateRoom(roomId);
    const user: User = {
      id: connectedUser.userId,
      username,
      socketId,
      isOnline: true,
      joinedAt: new Date(),
    };

    room.users.set(user.id, user);
    this.logger.log(`Usuario ${username} se unió a la sala ${roomId}`);

    return { room, user };
  }

  leaveRoom(roomId: string, socketId: string): { room: Room; user: User } | null {
    const connectedUser = this.getConnectedUser(socketId);
    if (!connectedUser) return null;

    const room = this.getRoom(roomId);
    if (!room) return null;

    const user = room.users.get(connectedUser.userId);
    if (user) {
      room.users.delete(connectedUser.userId);
      this.logger.log(`Usuario ${user.username} salió de la sala ${roomId}`);
      
      // Si la sala queda vacía, opcionalmente puedes eliminarla
      if (room.users.size === 0) {
        this.rooms.delete(roomId);
        this.logger.log(`Sala ${roomId} eliminada por estar vacía`);
      }
      
      return { room, user };
    }
    return null;
  }

  // Gestión de mensajes
  addMessage(roomId: string, text: string, socketId: string): Message | null {
    const connectedUser = this.getConnectedUser(socketId);
    if (!connectedUser) return null;

    const room = this.getRoom(roomId);
    if (!room) return null;

    const user = room.users.get(connectedUser.userId);
    if (!user) return null;

    const message: Message = {
      id: this.generateId(),
      text,
      user: user.username,
      userId: user.id,
      timestamp: new Date().toISOString(),
      roomId,
    };

    room.messages.push(message);
    
    // Mantener solo los últimos 100 mensajes por sala
    if (room.messages.length > 100) {
      room.messages = room.messages.slice(-100);
    }

    this.logger.log(`Mensaje en sala ${roomId}: ${user.username} - ${text}`);
    return message;
  }

  getRoomMessages(roomId: string, limit: number = 50): Message[] {
    const room = this.getRoom(roomId);
    if (!room) return [];
    
    return room.messages.slice(-limit);
  }

  getRoomUsers(roomId: string): User[] {
    const room = this.getRoom(roomId);
    if (!room) return [];
    
    return Array.from(room.users.values());
  }

  // Utilidades
  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  // Estadísticas
  getStats() {
    return {
      totalRooms: this.rooms.size,
      totalConnectedUsers: this.connectedUsers.size,
      rooms: Array.from(this.rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        userCount: room.users.size,
        messageCount: room.messages.length,
      })),
    };
  }

  getAllRoomsInfo() {
  const roomsInfo: RoomInfo[] = [];
  for (const [roomId, room] of this.rooms.entries()) {
    roomsInfo.push({
      id: roomId,
      name: room.name,
      userCount: room.users.size,
      users: Array.from(room.users.values()).map(user => ({
        id: user.id,
        username: user.username,
        socketId: user.socketId
      })),
      messageCount: room.messages.length,
      createdAt: room.createdAt
    });
  }
  return roomsInfo;
}
  getRoomInfo(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    return {
      id: roomId,
      name: room.name,
      userCount: room.users.size,
      users: Array.from(room.users.values()),
      messageCount: room.messages.length,
      createdAt: room.createdAt
    };
  }

  // Método para debug rápido
  printDebugInfo() {
    console.log('=== DEBUG CHAT SERVICE ===');
    console.log('Total salas:', this.rooms.size);
    console.log('Total usuarios conectados:', this.connectedUsers.size);
    
    this.rooms.forEach((room, roomId) => {
      console.log(`Sala "${roomId}":`);
      console.log(`- Usuarios: ${room.users.size}`);
      room.users.forEach((user, userId) => {
        console.log(`  - ${user.username} (${user.socketId})`);
      });
      console.log(`- Mensajes: ${room.messages.length}`);
    });
    console.log('=== FIN DEBUG ===');
  }

  
}