import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

interface RoomResponse {
  roomId: string;
  room: {
    id: string;
    players: Array<{
      id: string;
      name: string;
      gems: Record<string, number>;
      cards: any[];
      reservedCards: any[];
      nobles: any[];
      points: number;
    }>;
    status: string;
  };
}

interface GameResponse {
  success: boolean;
  error?: string;
  gameState?: any;
}

const WEBSOCKET_URL = 'http://localhost:3001';

class WebSocketTestClient {
  private socket: Socket;
  private playerId: string;

  constructor() {
    this.playerId = uuidv4();
    this.socket = io(WEBSOCKET_URL);
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to server');
      console.log('Socket ID:', this.socket.id);
      console.log('Player ID:', this.playerId);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    this.socket.on('roomUpdate', (room) => {
      console.log('Room Update:', room);
    });

    this.socket.on('gameStateUpdate', (gameState) => {
      console.log('Game State Update:', gameState);
    });
  }

  // 测试创建房间
  async testCreateRoom(): Promise<RoomResponse> {
    console.log('\n=== Testing Create Room ===');
    return new Promise((resolve) => {
      this.socket.emit('createRoom', { playerId: this.playerId }, (response: RoomResponse) => {
        console.log('Create Room Response:', response);
        resolve(response);
      });
    });
  }

  // 测试加入房间
  async testJoinRoom(roomId: string): Promise<RoomResponse> {
    console.log('\n=== Testing Join Room ===');
    return new Promise((resolve) => {
      this.socket.emit('joinRoom', { roomId, playerId: uuidv4() }, (response: RoomResponse) => {
        console.log('Join Room Response:', response);
        resolve(response);
      });
    });
  }

  // 测试开始游戏
  async testStartGame(roomId: string): Promise<GameResponse> {
    console.log('\n=== Testing Start Game ===');
    return new Promise((resolve) => {
      this.socket.emit('startGame', { roomId }, (response: GameResponse) => {
        console.log('Start Game Response:', response);
        resolve(response);
      });
    });
  }

  // 关闭连接
  disconnect() {
    this.socket.disconnect();
  }
}

// 运行测试
async function runTests() {
  const client = new WebSocketTestClient();

  // 等待连接建立
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // 测试创建房间
    const createRoomResponse = await client.testCreateRoom();

    if (createRoomResponse?.roomId) {
      // 测试加入房间
      await client.testJoinRoom(createRoomResponse.roomId);

      // 测试开始游戏
      await client.testStartGame(createRoomResponse.roomId);
    }
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // 等待一会儿确保所有消息都被处理
    await new Promise(resolve => setTimeout(resolve, 2000));
    client.disconnect();
  }
}

// 运行测试
runTests(); 