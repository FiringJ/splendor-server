import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

// 定义接口类型
interface RoomResponse {
  roomId: string;
  room: {
    id: string;
    players: Player[];
    status: 'waiting' | 'playing' | 'finished';
  };
}

interface Player {
  id: string;
  name: string;
  gems: Record<string, number>;
  cards: any[];
  reservedCards: any[];
  nobles: any[];
  points: number;
}

interface GameResponse {
  success: boolean;
  error?: string;
  gameState?: any;
}

class SocketTester {
  private socket: Socket;
  private playerId: string;

  constructor(private url: string = 'http://localhost:3001') {
    this.playerId = uuidv4();
    this.socket = io(url, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 5000,
    });
  }

  async runTests() {
    console.log('\n=== 开始WebSocket接口测试 ===');
    console.log('连接到服务器:', this.url);
    console.log('测试玩家ID:', this.playerId);

    try {
      // 测试基础连接
      await this.testConnection();

      // 测试创建房间
      const roomData = await this.testCreateRoom();
      if (!roomData?.roomId) {
        throw new Error('创建房间失败');
      }

      // 测试加入房间
      await this.testJoinRoom(roomData.roomId);

      // 测试开始游戏
      await this.testStartGame(roomData.roomId);

      console.log('\n✅ 所有测试完成');
    } catch (error) {
      console.error('\n❌ 测试失败:', error);
    } finally {
      this.disconnect();
    }
  }

  private testConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        reject(new Error('连接超时'));
      }, 5000);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        console.log('\n✅ 连接成功');
        console.log('Socket ID:', this.socket.id);
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`连接错误: ${error.message}`));
      });
    });
  }

  private testCreateRoom(): Promise<RoomResponse> {
    console.log('\n=== 测试创建房间 ===');
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('创建房间超时'));
      }, 5000);

      this.socket.emit('createRoom', { playerId: this.playerId }, (response: RoomResponse) => {
        clearTimeout(timeout);
        console.log('创建房间响应:', response);
        if (response?.roomId) {
          console.log('✅ 房间创建成功, ID:', response.roomId);
          resolve(response);
        } else {
          reject(new Error('创建房间失败: 无效的响应'));
        }
      });
    });
  }

  private testJoinRoom(roomId: string): Promise<RoomResponse> {
    console.log('\n=== 测试加入房间 ===');
    const secondPlayerId = uuidv4();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('加入房间超时'));
      }, 5000);

      this.socket.emit('joinRoom', { roomId, playerId: secondPlayerId }, (response: RoomResponse) => {
        clearTimeout(timeout);
        console.log('加入房间响应:', response);
        if (response?.room) {
          console.log('✅ 成功加入房间');
          console.log('当前玩家数:', response.room.players.length);
          resolve(response);
        } else {
          reject(new Error('加入房间失败: 无效的响应'));
        }
      });
    });
  }

  private testStartGame(roomId: string): Promise<GameResponse> {
    console.log('\n=== 测试开始游戏 ===');
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('开始游戏超时'));
      }, 5000);

      this.socket.emit('startGame', { roomId }, (response: GameResponse) => {
        clearTimeout(timeout);
        console.log('开始游戏响应:', response);
        if (response?.success) {
          console.log('✅ 游戏成功开始');
          resolve(response);
        } else {
          reject(new Error(`开始游戏失败: ${response?.error || '未知错误'}`));
        }
      });
    });
  }

  private disconnect() {
    if (this.socket.connected) {
      console.log('\n正在断开连接...');
      this.socket.disconnect();
    }
  }
}

// 运行测试
const tester = new SocketTester();
tester.runTests(); 