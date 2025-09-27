export interface Message {
  id: string;
  text: string;
  user: string;
  userId: string;
  timestamp: string;
  roomId: string;
}

export interface User {
  id: string;
  username: string;
  socketId: string;
  isOnline: boolean;
  joinedAt: Date;
}

export interface Room {
  id: string;
  name: string;
  users: Map<string, User>; // userId -> User
  messages: Message[];
  createdAt: Date;
}

export interface ConnectedUser {
  userId: string;
  socketId: string;
  username: string;
}

export interface RoomUser {
  id: string;
  username: string;
  socketId: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  userCount: number;
  users: RoomUser[];
  messageCount: number;
  createdAt: Date;
}