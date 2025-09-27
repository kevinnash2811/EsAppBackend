import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe }  from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // ⬇️ CONFIGURAR CORS PARA ACEPTAR EL FRONTEND
  app.enableCors({
    origin: [
      'http://localhost:3001', // ⬅️ URL del frontend en desarrollo
      'http://localhost:5173', // Puerto alternativo de Vite
      'https://tu-frontend.com' // Producción
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  });
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  Logger.log(`App running in the environment : ${process.env.NODE_ENV}`);
  await app.listen(`${process.env.PORT}`, '0.0.0.0');
  console.log(`🚀 Servidor NestJS corriendo en: http://localhost:${process.env.PORT}`);
  console.log(`📡 WebSocket Gateway corriendo en: ws://localhost:${process.env.PORT}/chat`);
}
bootstrap();
