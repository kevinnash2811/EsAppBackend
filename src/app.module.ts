import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SocketModule } from './socket/socket.module';
import { ChatModule } from './chat/chat.module';
Logger.log('ENVIRONMENT: ' + process.env.NODE_ENV);
@Module({
  imports: [
     ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${(process.env.NODE_ENV || 'development').toLowerCase()}`
    }),
    SocketModule,
    ChatModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
