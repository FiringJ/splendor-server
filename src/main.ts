import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SocketIoAdapter } from './socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // 保留原有 HTTP CORS 配置（用于 REST API）
    cors: { 
      origin: ['https://www.splendor.uno', 'http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Sec-WebSocket-Protocol'],
      credentials: true,
      maxAge: 86400
    },
  });

  // 使用自定义 Socket.io 适配器（覆盖默认 WebSocket 配置）
  app.useWebSocketAdapter(new SocketIoAdapter(app));

  await app.listen(3001);
}
bootstrap();