import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

// 连接成功事件
socket.on('connect', () => {
  console.log('已连接到服务器');

  // 创建房间
  socket.emit('createRoom', (response) => {
    console.log('创建房间响应:', response);
    const roomId = response.roomId;

    // 加入房间
    socket.emit('joinRoom', roomId);
  });
});

// 监听玩家加入事件
socket.on('playerJoined', (data) => {
  console.log('新玩家加入:', data);
});

// 监听游戏动作更新
socket.on('gameActionUpdate', (data) => {
  console.log('游戏动作更新:', data);
});

// 错误处理
socket.on('error', (error) => {
  console.error('WebSocket错误:', error);
});

// 断开连接事件
socket.on('disconnect', () => {
  console.log('与服务器断开连接');
}); 