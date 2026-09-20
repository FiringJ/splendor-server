import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import { logger } from './logger';
import { SocketIoAdapter } from './socket-io.adapter';
import { getCorsOrigins } from './cors-origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      instance: logger,
    }),
  });

  app.enableCors({
    origin: getCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Sec-WebSocket-Protocol',
    ],
    credentials: true,
    maxAge: 86400,
  });

  // Fly.io HTTP health check (and simple liveness for local/Docker).
  app.getHttpAdapter().get('/health', (_req: unknown, res: any) => {
    res.status(200).send('ok');
  });

  app.useWebSocketAdapter(new SocketIoAdapter(app));

  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);

  logger.info(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
