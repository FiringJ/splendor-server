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
import { AIService } from './ai.service';
import { logger } from '../logger';

@WebSocketGateway({
  path: '/socket.io', // 必须与客户端连接路径完全一致
  cors: {
    origin: ['https://www.splendor.uno', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Sec-WebSocket-Protocol'],
    credentials: true
  },
  transports: ['websocket', 'polling'], // 必须保留传输模式
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

  constructor(
    private readonly gameService: GameService,
    private readonly aiService: AIService
  ) { }

  handleConnection(client: Socket) {
    logger.info(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    logger.info(`Client disconnected: ${client.id}, reason:`, client.disconnected ? 'client disconnected' : 'transport error');

    // 查找该客户端所在的房间
    for (const [roomId, room] of this.rooms.entries()) {
      const player = room.players.find(p => p.clientId === client.id);
      if (player) {
        logger.info(`Player ${player.name} (${player.id}) disconnected from room ${roomId}`, {
          roomStatus: room.status,
          isLocalMode: room.isLocalMode,
          playersCount: room.players.length
        });

        // 如果是本地模式且游戏已经开始，不做任何处理
        if (room.isLocalMode && room.status === 'playing') {
          logger.info(`Local mode game in progress, ignoring disconnect for player ${player.id}`);
          return;
        }

        // 不管游戏是否开始，都先标记为暂时断开
        player.clientId = undefined;
        this.server.to(roomId).emit('roomUpdate', room);

        // 发送系统消息通知玩家断开连接
        this.sendSystemMessage(roomId, `玩家 ${player.name} 断开连接`);

        // 设置一个较长的超时时间，如果玩家在这段时间内没有重连，才将其移除
        if (room.status === 'waiting') {
          setTimeout(() => {
            const currentRoom = this.rooms.get(roomId);
            if (currentRoom) {
              // 再次检查是否是本地模式
              if (currentRoom.isLocalMode) {
                logger.info(`Local mode room, not removing disconnected player ${player.id}`);
                return;
              }

              const playerStillDisconnected = currentRoom.players.find(p => p.id === player.id && !p.clientId);
              if (playerStillDisconnected) {
                logger.info(`Removing disconnected player ${player.id} from room ${roomId}`);
                currentRoom.players = currentRoom.players.filter(p => p.id !== player.id);
                if (currentRoom.players.length === 0) {
                  logger.info(`Room ${roomId} is empty, deleting it`);
                  this.rooms.delete(roomId);
                } else if (currentRoom.hostId === player.id) {
                  logger.info(`Host ${player.id} disconnected, assigning new host: ${currentRoom.players[0].id}`);
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
    @MessageBody() data: { playerId: string, playerName?: string }
  ) {
    logger.info('Received createRoom request:', {
      clientId: client.id,
      playerId: data.playerId,
      playerName: data.playerName
    });

    try {
      // 使用修改后的Service方法创建房间数据
      const newRoomData = this.gameService.createRoomData(data.playerId);
      const roomId = newRoomData.id;

      // 设置房间的客户端ID和主机ID，以及房主名称
      const room: RoomState = {
        ...newRoomData,
        hostId: data.playerId,
        players: newRoomData.players.map(p => ({
          ...p,
          clientId: client.id, // 设置客户端ID
          name: data.playerName || p.name // 使用传入的名称或默认名称
        })),
        isLocalMode: false
      };

      // 在Gateway中保存房间状态
      this.rooms.set(roomId, room);

      // 将客户端加入Socket.IO房间
      client.join(roomId);

      logger.info('Room created:', {
        roomId,
        hostId: room.hostId,
        playerName: room.players[0].name,
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
      logger.error('Error creating room:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; playerId: string; isAI?: boolean; playerName?: string }
  ) {
    try {
      // 从Map中获取房间
      const room = this.rooms.get(data.roomId);
      if (!room) {
        return { success: false, error: 'Room not found' };
      }

      // 检查房间状态
      if (room.status !== 'waiting') {
        return { success: false, error: 'Game already started' };
      }

      // 检查玩家人数上限
      if (room.players.length >= 4) {
        return { success: false, error: 'Room is full' };
      }

      // 检查是否已经在房间中
      const existingPlayer = room.players.find(p => p.id === data.playerId);
      if (existingPlayer) {
        // 如果玩家已经在，但客户端ID不同（可能是重连），则更新
        existingPlayer.clientId = data.isAI ? undefined : client.id;

        // 广播房间更新
        this.server.to(data.roomId).emit('roomUpdate', room);

        // 让新客户端加入房间
        if (!data.isAI) {
          client.join(data.roomId);
          // 发送系统消息通知玩家重新连接
          this.sendSystemMessage(data.roomId, `玩家 ${existingPlayer.name} 重新连接`);
        }

        return { success: true, room };
      }

      // 创建新玩家并添加到房间
      const playerNumber = room.players.length + 1;
      const playerName = data.playerName || `玩家${playerNumber}`;

      const newPlayer: Player = {
        id: data.playerId,
        name: playerName,
        gems: { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0 },
        cards: [],
        reservedCards: [],
        nobles: [],
        points: 0,
        isAI: Boolean(data.isAI),
        clientId: data.isAI ? undefined : client.id
      };

      room.players.push(newPlayer);

      // 广播房间更新
      this.server.to(data.roomId).emit('roomUpdate', room);

      // 让新客户端加入房间
      if (!data.isAI) {
        client.join(data.roomId);
        // 发送系统消息通知新玩家加入
        this.sendSystemMessage(data.roomId, `玩家 ${playerName} 加入了房间`);
      } else {
        // 发送系统消息通知AI玩家加入
        this.sendSystemMessage(data.roomId, `AI玩家 ${playerName} 加入了房间`);
      }

      return { success: true, room };
    } catch (error) {
      logger.error('Error joining room:', error);
      return { success: false, error: 'Failed to join room' };
    }
  }

  @SubscribeMessage('startGame')
  handleStartGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string, isLocalMode?: boolean }
  ) {
    try {
      logger.info('Starting game for room:', data.roomId, 'isLocalMode:', data.isLocalMode);

      const room = this.rooms.get(data.roomId);
      if (!room) {
        logger.error('Room not found:', data.roomId);
        return { success: false, error: 'Room not found' };
      }

      if (room.players.length < 2) {
        logger.error('Not enough players:', room.players.length);
        return { success: false, error: 'Need at least 2 players' };
      }

      // 单机模式下或有AI玩家时跳过连接检查
      const hasAIPlayers = room.players.some(p => p.isAI);
      if (!data.isLocalMode && !hasAIPlayers) {
        // 确保所有非AI玩家都在房间中
        const connectedSockets = this.server.sockets.adapter.rooms.get(data.roomId);
        const humanPlayers = room.players.filter(p => !p.isAI);

        if (!connectedSockets || connectedSockets.size !== humanPlayers.length) {
          logger.error('Not all human players are connected:', {
            expected: humanPlayers.length,
            connected: connectedSockets?.size || 0
          });
          return { success: false, error: 'Not all players are connected' };
        }
      }

      // 确保是房主在开始游戏
      if (room.hostId !== room.players.find(p => p.clientId === client.id)?.id) {
        logger.error('Only host can start the game');
        return { success: false, error: 'Only host can start the game' };
      }

      logger.info('Initializing game with players:', room.players);
      const gameRoom = this.gameService.initializeGame(room.players);

      // 更新房间状态
      room.status = 'playing';
      room.gameState = gameRoom.gameState;

      // 在本地模式下，标记房间为本地模式
      if (data.isLocalMode) {
        logger.info('Setting room to local mode');
        room.isLocalMode = true;
      }

      this.rooms.set(data.roomId, room);

      logger.info('Room state after initialization:', {
        id: room.id,
        status: room.status,
        isLocalMode: room.isLocalMode,
        playersCount: room.players.length,
        aiPlayersCount: room.players.filter(p => p.isAI).length
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

      logger.info('Game initialized, sending full state to players');
      this.server.to(data.roomId).emit('gameStarted', fullState);

      // 如果有AI玩家，立即开始AI回合（如果当前回合是AI玩家）
      if (hasAIPlayers && gameRoom.gameState.currentTurn) {
        const currentPlayer = gameRoom.gameState.players.get(gameRoom.gameState.currentTurn);
        if (currentPlayer && currentPlayer.isAI) {
          logger.info('AI player turn, triggering AI action');
          setTimeout(() => this.handleAITurn(data.roomId), 1000);
        }
      }

      logger.info('Game started successfully for room:', data.roomId);
      return { success: true, gameState };
    } catch (error) {
      logger.error('Error starting game:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  @SubscribeMessage('gameAction')
  handleGameAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; action: GameAction }
  ) {
    logger.info('Received gameAction:', {
      clientId: client.id,
      roomId: data.roomId,
      actionType: data.action.type,
      actionData: data.action
    });

    try {
      // 从Gateway的rooms Map中获取房间
      const room = this.rooms.get(data.roomId);
      if (!room) {
        logger.error('Room not found:', data.roomId);
        return { success: false, error: 'Room not found' };
      }

      // 特殊处理RESTART_GAME动作
      if (data.action.type === 'RESTART_GAME') {
        return this.handleRestartGame(client, data.roomId, data.action);
      }

      // 使用Service处理游戏动作，传入当前gameState而非roomId
      const newGameState = this.gameService.handleGameAction(room.gameState, data.action);

      // 更新房间状态
      room.gameState = newGameState;
      this.rooms.set(data.roomId, room);

      // 转换状态用于传输
      const gameStateForTransport = this.convertGameStateForTransport(newGameState);

      logger.info('Game action processed successfully:', {
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

      // 处理AI玩家的回合
      setTimeout(() => this.handleAITurn(data.roomId), 1000);

      return { success: true };
    } catch (error) {
      logger.error('Error processing game action:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // 处理重新开始游戏
  private handleRestartGame(client: Socket, roomId: string, action: GameAction) {
    try {
      logger.info('Restarting game for room:', roomId);

      const room = this.rooms.get(roomId);
      if (!room) {
        logger.error('Room not found for restart:', roomId);
        return { success: false, error: 'Room not found' };
      }

      // 重置所有玩家状态
      const players = room.players.map(player => ({
        ...player,
        gems: { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0 },
        cards: [],
        reservedCards: [],
        nobles: [],
        points: 0
      }));

      // 初始化新游戏
      const gameRoom = this.gameService.initializeGame(players);

      // 更新房间状态
      room.gameState = gameRoom.gameState;
      room.status = 'playing';
      this.rooms.set(roomId, room);

      // 转换状态用于传输
      const gameStateForTransport = this.convertGameStateForTransport(gameRoom.gameState);

      // 广播游戏状态更新
      this.server.to(roomId).emit('gameStateUpdate', {
        gameState: gameStateForTransport,
        action: action
      });

      logger.info('Game restarted successfully for room:', roomId);

      // 处理AI玩家的回合
      setTimeout(() => this.handleAITurn(roomId), 1000);

      return { success: true, gameState: gameStateForTransport };
    } catch (error) {
      logger.error('Error restarting game:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 处理AI玩家的回合
   */
  private async handleAITurn(roomId: string) {
    try {
      const room = this.rooms.get(roomId);
      if (!room || room.status !== 'playing') return;

      const currentPlayerId = room.gameState.currentTurn;
      const currentPlayer = room.gameState.players.get(currentPlayerId);

      // 检查当前玩家是否是AI
      if (!currentPlayer || !currentPlayer.isAI) return;

      logger.info(`处理AI玩家回合: ${currentPlayer.name} (${currentPlayerId})`);

      // 获取AI的下一步动作
      const aiAction = this.aiService.getNextAction(room.gameState, currentPlayerId);

      // 执行AI动作
      const result = this.gameService.handleGameAction(room.gameState, aiAction);

      // 更新房间的游戏状态
      room.gameState = result;
      this.rooms.set(roomId, room);

      // 转换状态用于传输
      const gameStateForTransport = this.convertGameStateForTransport(result);

      // 广播游戏状态更新
      this.server.to(roomId).emit('gameStateUpdate', {
        gameState: gameStateForTransport,
        action: aiAction
      });

      // 如果下一个玩家也是AI，继续处理
      setTimeout(() => this.handleAITurn(roomId), 1000);
    } catch (error) {
      logger.error('处理AI回合出错:', error);
    }
  }

  // 辅助方法：将 GameState 转换为可传输的格式
  private convertGameStateForTransport(gameState: GameState): Omit<GameState, 'players'> & { players: Player[] } {
    return {
      ...gameState,
      players: Array.from(gameState.players.values())
    };
  }

  @SubscribeMessage('sendMessage')
  handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      roomId: string;
      message: {
        sender: string;
        senderName: string;
        text: string;
      }
    }
  ) {
    try {
      const { roomId, message } = data;
      const room = this.rooms.get(roomId);

      if (!room) {
        return { success: false, error: 'Room not found' };
      }

      // 验证消息发送者是否在房间中
      const player = room.players.find(p => p.id === message.sender);
      if (!player) {
        return { success: false, error: 'Player not in room' };
      }

      // 创建完整的消息对象
      const fullMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        sender: message.sender,
        senderName: message.senderName || player.name,
        text: message.text,
        timestamp: Date.now()
      };

      // 将消息广播给房间中的所有人
      this.server.to(roomId).emit('chatMessage', fullMessage);

      return { success: true };
    } catch (error) {
      logger.error('Error sending message:', error);
      return { success: false, error: 'Failed to send message' };
    }
  }

  @SubscribeMessage('removePlayer')
  handleRemovePlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; playerId: string }
  ) {
    try {
      logger.info('Removing player from room:', data);

      const room = this.rooms.get(data.roomId);
      if (!room) {
        logger.error('Room not found for removing player:', data.roomId);
        return { success: false, error: 'Room not found' };
      }

      // 确保只有房主可以移除玩家
      const requestingPlayer = room.players.find(p => p.clientId === client.id);
      if (!requestingPlayer || requestingPlayer.id !== room.hostId) {
        logger.error('Only host can remove players');
        return { success: false, error: 'Only host can remove players' };
      }

      // 确保游戏尚未开始
      if (room.status !== 'waiting') {
        logger.error('Cannot remove players once game has started');
        return { success: false, error: 'Cannot remove players once game has started' };
      }

      // 确保要移除的是AI玩家
      const playerToRemove = room.players.find(p => p.id === data.playerId);
      if (!playerToRemove) {
        logger.error('Player not found in room:', data.playerId);
        return { success: false, error: 'Player not found in room' };
      }

      if (!playerToRemove.isAI) {
        logger.error('Only AI players can be removed:', data.playerId);
        return { success: false, error: 'Only AI players can be removed' };
      }

      // 移除玩家
      room.players = room.players.filter(p => p.id !== data.playerId);
      this.rooms.set(data.roomId, room);

      // 通知房间内所有玩家
      this.server.to(data.roomId).emit('roomUpdate', room);

      // 发送系统消息通知
      this.sendSystemMessage(data.roomId, `${playerToRemove.name}已被移除`);

      logger.info('Player removed successfully:', data.playerId);
      return { success: true };
    } catch (error) {
      logger.error('Error removing player:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // 发送系统消息的辅助方法
  private sendSystemMessage(roomId: string, text: string) {
    const systemMessage = {
      id: `system_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      sender: 'system',
      senderName: '系统消息',
      text,
      timestamp: Date.now(),
      isSystem: true
    };

    this.server.to(roomId).emit('systemMessage', systemMessage);
  }
} 