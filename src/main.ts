import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import { logger } from './logger';
import { SocketIoAdapter } from './socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      instance: logger,
    }),
  });

  app.enableCors({
    origin: ['https://www.splendor.uno', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Sec-WebSocket-Protocol',
    ],
    credentials: true,
    maxAge: 86400,
  });

  app.useWebSocketAdapter(new SocketIoAdapter(app));

  const port = process.env.PORT || 3001;
  await app.listen(port);

  // 用 logger
  logger.info(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
