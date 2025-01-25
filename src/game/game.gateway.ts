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
import { GameAction, RoomState, Player, GameState } from './interfaces/game.interface';
import { v4 as uuidv4 } from 'uuid';

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
    client.join(roomId);
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

    if (room.players.some(p => p.id === data.playerId)) {
      client.join(data.roomId);
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
    client.join(data.roomId);

    this.server.to(data.roomId).emit('roomUpdate', room);

    return { success: true, room };
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

      const gameRoom = this.gameService.initializeGame(room.players);
      room.status = 'playing';

      // 将 Map 转换为数组以便于传输
      const gameState = this.convertGameStateForTransport(gameRoom.gameState);

      this.server.to(data.roomId).emit('gameStarted', {
        gameState,
        status: 'playing'
      });

      this.server.to(data.roomId).emit('roomUpdate', {
        ...room,
        status: 'playing'
      });

      return { success: true, gameState };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('gameAction')
  handleGameAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; action: GameAction }
  ) {
    try {
      const room = this.gameService.handleGameAction(data.roomId, data.action);
      const gameState = this.convertGameStateForTransport(room.gameState);

      this.server.to(data.roomId).emit('gameStateUpdate', {
        gameState,
        status: room.status
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 辅助方法：将 GameState 转换为可传输的格式
  private convertGameStateForTransport(gameState: GameState): any {
    return {
      ...gameState,
      players: Array.from(gameState.players.values())
    };
  }
} 