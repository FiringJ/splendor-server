import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: [
        'https://www.splendor.uno',  // 生产环境域名
        'http://localhost:3000'      // 本地开发环境
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // 包含 OPTIONS
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Sec-WebSocket-Protocol' // WebSocket 专用头
      ],
      credentials: true,          // 允许携带 Cookie/Token
      maxAge: 86400               // 预检缓存时间（秒）
    },
  });
  await app.listen(3001);
}
bootstrap();