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
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST']
  },
  pingInterval: 25000,
  pingTimeout: 15000,
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  cookie: {
    name: 'io',
    httpOnly: true,
    path: '/'
  }
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
    console.log(`Client disconnected: ${client.id}, reason:`, client.disconnected ? 'client disconnected' : 'transport error');

    // 查找该客户端所在的房间
    for (const [roomId, room] of this.rooms.entries()) {
      const player = room.players.find(p => p.clientId === client.id);
      if (player) {
        console.log(`Player ${player.name} (${player.id}) disconnected from room ${roomId}`, {
          roomStatus: room.status,
          isLocalMode: room.isLocalMode,
          playersCount: room.players.length
        });

        // 如果是本地模式且游戏已经开始，不做任何处理
        if (room.isLocalMode && room.status === 'playing') {
          console.log(`Local mode game in progress, ignoring disconnect for player ${player.id}`);
          return;
        }

        // 不管游戏是否开始，都先标记为暂时断开
        player.clientId = undefined;
        this.server.to(roomId).emit('roomUpdate', room);

        // 设置一个较长的超时时间，如果玩家在这段时间内没有重连，才将其移除
        if (room.status === 'waiting') {
          setTimeout(() => {
            const currentRoom = this.rooms.get(roomId);
            if (currentRoom) {
              // 再次检查是否是本地模式
              if (currentRoom.isLocalMode) {
                console.log(`Local mode room, not removing disconnected player ${player.id}`);
                return;
              }

              const playerStillDisconnected = currentRoom.players.find(p => p.id === player.id && !p.clientId);
              if (playerStillDisconnected) {
                console.log(`Removing disconnected player ${player.id} from room ${roomId}`);
                currentRoom.players = currentRoom.players.filter(p => p.id !== player.id);
                if (currentRoom.players.length === 0) {
                  console.log(`Room ${roomId} is empty, deleting it`);
                  this.rooms.delete(roomId);
                } else if (currentRoom.hostId === player.id) {
                  console.log(`Host ${player.id} disconnected, assigning new host: ${currentRoom.players[0].id}`);
                  currentRoom.hostId = currentRoom.players[0].id;
                }
                this.server.to(roomId).emit('roomUpdate', currentRoom);
              }
            }
          }, 30000); // 30秒超时
        }
        break;
      }
    }
  }

  @SubscribeMessage('createRoom')
  handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { playerId: string }
  ) {
    console.log('Creating room for player:', {
      clientId: client.id,
      playerId: data.playerId
    });

    const roomId = uuidv4();
    const room: RoomState = {
      id: roomId,
      players: [{
        id: data.playerId,
        clientId: client.id,
        name: `玩家1`,
        gems: { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0 },
        cards: [],
        reservedCards: [],
        nobles: [],
        points: 0
      }],
      hostId: data.playerId,
      status: 'waiting',
      gameState: null
    };

    this.rooms.set(roomId, room);
    client.join(roomId);

    console.log('Room created:', {
      roomId,
      hostId: room.hostId,
      playerCount: room.players.length
    });

    this.server.to(roomId).emit('roomUpdate', room);
    return { roomId, room };
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; playerId: string }
  ) {
    console.log('Player attempting to join room:', {
      clientId: client.id,
      playerId: data.playerId,
      roomId: data.roomId
    });

    const room = this.rooms.get(data.roomId);
    if (!room) {
      console.error('Room not found:', data.roomId);
      return { success: false, error: 'Room not found' };
    }

    // 检查玩家是否已经在房间中
    const existingPlayer = room.players.find(p => p.id === data.playerId);
    if (existingPlayer) {
      console.log('Player rejoining room:', {
        playerId: data.playerId,
        roomId: data.roomId,
        oldClientId: existingPlayer.clientId,
        newClientId: client.id
      });

      // 更新玩家的客户端ID
      existingPlayer.clientId = client.id;
      client.join(data.roomId);

      // 通知房间其他玩家
      this.server.to(data.roomId).emit('roomUpdate', room);
      return { success: true, room };
    }

    // 新玩家加入
    console.log('New player joining room:', {
      playerId: data.playerId,
      roomId: data.roomId,
      clientId: client.id
    });

    const newPlayer = {
      id: data.playerId,
      clientId: client.id,
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
    @MessageBody() data: { roomId: string, isLocalMode?: boolean }
  ) {
    try {
      console.log('Starting game for room:', data.roomId, 'isLocalMode:', data.isLocalMode);

      const room = this.rooms.get(data.roomId);
      if (!room) {
        console.error('Room not found:', data.roomId);
        return { success: false, error: 'Room not found' };
      }

      if (room.players.length < 2) {
        console.error('Not enough players:', room.players.length);
        return { success: false, error: 'Need at least 2 players' };
      }

      // 单机模式下跳过连接检查
      if (!data.isLocalMode) {
        // 确保所有玩家都在房间中
        const connectedSockets = this.server.sockets.adapter.rooms.get(data.roomId);
        if (!connectedSockets || connectedSockets.size !== room.players.length) {
          console.error('Not all players are connected:', {
            expected: room.players.length,
            connected: connectedSockets?.size || 0
          });
          return { success: false, error: 'Not all players are connected' };
        }
      }

      // 确保是房主在开始游戏
      if (room.hostId !== room.players.find(p => p.clientId === client.id)?.id) {
        console.error('Only host can start the game');
        return { success: false, error: 'Only host can start the game' };
      }

      console.log('Initializing game with players:', room.players);
      const gameRoom = this.gameService.initializeGame(room.players);

      // 更新房间状态
      room.status = 'playing';
      room.gameState = gameRoom.gameState;

      // 在本地模式下，标记房间为本地模式
      if (data.isLocalMode) {
        console.log('Setting room to local mode');
        room.isLocalMode = true;
      }

      this.rooms.set(data.roomId, room);

      console.log('Room state after initialization:', {
        id: room.id,
        status: room.status,
        isLocalMode: room.isLocalMode,
        playersCount: room.players.length
      });

      // 将 Map 转换为数组以便于传输
      const gameState = this.convertGameStateForTransport(gameRoom.gameState);

      // 发送完整的游戏状态
      const fullState = {
        room: {
          ...room,
          gameState  // 包含完整的游戏状态
        },
        gameState,
        status: 'playing'
      };

      console.log('Game initialized, sending full state to players');
      this.server.to(data.roomId).emit('gameStarted', fullState);

      console.log('Game started successfully for room:', data.roomId);
      return { success: true, gameState };
    } catch (error) {
      console.error('Error starting game:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  @SubscribeMessage('gameAction')
  handleGameAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; action: GameAction }
  ) {
    console.log('Received gameAction:', {
      clientId: client.id,
      roomId: data.roomId,
      actionType: data.action.type,
      actionData: data.action
    });

    try {
      const room = this.gameService.handleGameAction(data.roomId, data.action);
      const gameState = this.convertGameStateForTransport(room.gameState);

      console.log('Game action processed successfully:', {
        roomId: data.roomId,
        actionType: data.action.type,
        newGameState: {
          currentTurn: gameState.currentTurn,
          players: Array.from(gameState.players.entries()),
          status: room.status
        }
      });

      this.server.to(data.roomId).emit('gameStateUpdate', {
        gameState,
        status: room.status
      });

      return { success: true };
    } catch (error) {
      console.error('Error handling game action:', {
        roomId: data.roomId,
        actionType: data.action.type,
        error: error.message,
        stack: error.stack
      });
      return { success: false, error: error.message };
    }
  }

  // 辅助方法：将 GameState 转换为可传输的格式
  private convertGameStateForTransport(gameState: GameState): Omit<GameState, 'players'> & { players: Player[] } {
    return {
      ...gameState,
      players: Array.from(gameState.players.values())
    };
  }
} 