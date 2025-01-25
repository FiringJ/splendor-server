import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { GameAction } from './interfaces/game.interface';
import { v4 as uuidv4 } from 'uuid';
import { RoomState } from './interfaces/game.interface';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3000',
    credentials: true
  },
  port: 3001
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private rooms: Map<string, RoomState> = new Map();

  constructor(private readonly gameService: GameService) { }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.gameService.handlePlayerDisconnect(client.id);
  }

  @SubscribeMessage('createRoom')
  handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { playerId: string }
  ) {
    const roomId = uuidv4();
    const room: RoomState = {
      id: roomId,
      players: [{
        id: data.playerId,
        name: `玩家1`,
        gems: { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0 },
        cards: [],
        reservedCards: [],
        nobles: [],
        points: 0
      }],
      hostId: data.playerId,
      status: 'waiting'
    };

    this.rooms.set(roomId, room);

    // 让创建者加入房间
    client.join(roomId);

    // 广播房间创建
    this.server.to(roomId).emit('roomUpdate', room);

    return { roomId, room };
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; playerId: string }
  ) {
    const room = this.rooms.get(data.roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // 如果玩家已经在房间里，直接返回房间信息
    if (room.players.some(p => p.id === data.playerId)) {
      client.join(data.roomId);
      // 广播房间更新
      this.server.to(data.roomId).emit('roomUpdate', room);
      return { success: true, room };
    }

    const newPlayer = {
      id: data.playerId,
      name: `玩家${room.players.length + 1}`,
      gems: { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0 },
      cards: [],
      reservedCards: [],
      nobles: [],
      points: 0
    };

    room.players.push(newPlayer);

    // 让客户端加入房间
    client.join(data.roomId);

    // 立即广播房间更新给所有玩家，包括新加入的玩家
    this.server.to(data.roomId).emit('roomUpdate', {
      ...room,
      hostId: room.hostId || room.players[0].id
    });

    // 返回完整的房间信息给加入的玩家
    return {
      success: true,
      room: {
        ...room,
        hostId: room.hostId || room.players[0].id
      }
    };
  }

  @SubscribeMessage('gameAction')
  handleGameAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; action: GameAction },
  ) {
    try {
      const room = this.gameService.handleGameAction(data.roomId, data.action);

      // 广播游戏状态更新
      this.server.to(data.roomId).emit('gameStateUpdate', {
        gameState: room.gameState,
        status: room.status
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('startGame')
  handleStartGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string }
  ) {
    try {
      const room = this.rooms.get(data.roomId);
      if (!room) {
        return { success: false, error: 'Room not found' };
      }

      if (room.players.length < 2) {
        return { success: false, error: 'Need at least 2 players' };
      }

      // 初始化游戏状态
      const gameRoom = this.gameService.initializeGame(room.players);
      room.status = 'playing';

      // 将 Map 转换为数组
      const playersArray = Array.from(gameRoom.gameState.players.values());

      // 广播游戏开始
      this.server.to(data.roomId).emit('gameStarted', {
        gameState: {
          ...gameRoom.gameState,
          players: playersArray
        },
        status: 'playing'
      });

      // 广播房间状态更新
      this.server.to(data.roomId).emit('roomUpdate', {
        ...room,
        status: 'playing'
      });

      return {
        success: true,
        gameState: {
          ...gameRoom.gameState,
          players: playersArray
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
} 