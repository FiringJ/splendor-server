import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { getCorsOrigins } from './cors-origins';

export class SocketIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: getCorsOrigins(),
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true,
      }
    });
    return server;
  }
}
