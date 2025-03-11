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
    console.log('Received createRoom request:', {
      clientId: client.id,
      playerId: data.playerId
    });

    try {
      // 使用修改后的Service方法创建房间数据
      const newRoomData = this.gameService.createRoomData(data.playerId);
      const roomId = newRoomData.id;

      // 设置房间的客户端ID和主机ID
      const room: RoomState = {
        ...newRoomData,
        hostId: data.playerId,
        players: newRoomData.players.map(p => ({
          ...p,
          clientId: client.id // 设置客户端ID
        })),
        isLocalMode: false
      };

      // 在Gateway中保存房间状态
      this.rooms.set(roomId, room);

      // 将客户端加入Socket.IO房间
      client.join(roomId);

      console.log('Room created:', {
        roomId,
        hostId: room.hostId,
        playersCount: room.players.length
      });

      return {
        success: true,
        roomId,
        room: {
          ...room,
          id: roomId
        }
      };
    } catch (error) {
      console.error('Error creating room:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; playerId: string; isAI?: boolean }
  ) {
    console.log('Received joinRoom request:', {
      clientId: client.id,
      roomId: data.roomId,
      playerId: data.playerId,
      isAI: data.isAI
    });

    try {
      // 从Gateway的rooms Map中获取房间
      const room = this.rooms.get(data.roomId);
      if (!room) {
        console.error('Room not found:', data.roomId);
        return { success: false, error: 'Room not found' };
      }

      if (room.status !== 'waiting') {
        console.error('Game already started in room:', data.roomId);
        return { success: false, error: 'Game already started' };
      }

      // 检查玩家是否已经在房间中
      if (room.players.some(p => p.id === data.playerId)) {
        console.error('Player already in room:', {
          roomId: data.roomId,
          playerId: data.playerId
        });
        return { success: false, error: 'Player already in room' };
      }

      // 检查房间是否已满
      if (room.players.length >= 4) {
        console.error('Room is full:', data.roomId);
        return { success: false, error: 'Room is full' };
      }

      // 新玩家的信息
      const newPlayer = {
        id: data.playerId,
        clientId: data.isAI ? null : client.id,
        name: `玩家${room.players.length + 1}`,
        gems: { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0 },
        cards: [],
        reservedCards: [],
        nobles: [],
        points: 0,
        isAI: !!data.isAI
      };

      // 更新房间玩家列表
      room.players.push(newPlayer);
      this.rooms.set(data.roomId, room);

      // 非AI玩家需要加入Socket.IO房间
      if (!data.isAI) {
        client.join(data.roomId);
      }

      console.log('Player joined room:', {
        roomId: data.roomId,
        playerId: data.playerId,
        isAI: data.isAI,
        playerCount: room.players.length
      });

      // 通知房间内所有玩家
      this.server.to(data.roomId).emit('roomUpdated', room);

      return { success: true, room };
    } catch (error) {
      console.error('Error joining room:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
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
      // 从Gateway的rooms Map中获取房间
      const room = this.rooms.get(data.roomId);
      if (!room) {
        console.error('Room not found:', data.roomId);
        return { success: false, error: 'Room not found' };
      }

      // 使用Service处理游戏动作，传入当前gameState而非roomId
      const newGameState = this.gameService.handleGameAction(room.gameState, data.action);

      // 更新房间状态
      room.gameState = newGameState;
      this.rooms.set(data.roomId, room);

      // 转换状态用于传输
      const gameStateForTransport = this.convertGameStateForTransport(newGameState);

      console.log('Game action processed successfully:', {
        roomId: data.roomId,
        actionType: data.action.type,
        newGameState: {
          currentTurn: gameStateForTransport.currentTurn,
          players: Array.from(gameStateForTransport.players),
          status: room.status
        }
      });

      // 广播游戏状态更新
      this.server.to(data.roomId).emit('gameStateUpdate', {
        gameState: gameStateForTransport,
        action: data.action
      });

      return { success: true };
    } catch (error) {
      console.error('Error processing game action:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
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