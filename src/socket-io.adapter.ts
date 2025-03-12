import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

export class SocketIoAdapter extends IoAdapter {
  createIOServer(
    port: number,
    options?: ServerOptions & { namespace?: string; server?: any },
  ): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: { // 关键：为 Socket.io 单独配置 CORS
        origin: [
          'https://www.splendor.uno',
          'http://localhost:3000'
        ],
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });
    return server;
  }
}