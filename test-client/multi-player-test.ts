import { io } from 'socket.io-client';

function createTestPlayer(playerName: string) {
  const socket = io('http://localhost:3000');

  socket.on('connect', () => {
    console.log(`${playerName} 已连接`);
  });

  return socket;
}

async function runTest() {
  // 创建4个测试玩家
  const player1 = createTestPlayer('玩家1');
  const player2 = createTestPlayer('玩家2');
  const player3 = createTestPlayer('玩家3');
  const player4 = createTestPlayer('玩家4');

  // 玩家1创建房间
  player1.emit('createRoom', (response) => {
    const roomId = response.roomId;
    console.log('房间已创建:', roomId);

    // 其他玩家依次加入房间
    player2.emit('joinRoom', roomId);
    player3.emit('joinRoom', roomId);
    player4.emit('joinRoom', roomId);

    // 测试游戏动作
    setTimeout(() => {
      player1.emit('gameAction', {
        roomId,
        action: {
          type: 'TAKE_GEMS',
          gems: { ruby: 1, sapphire: 1, emerald: 1 }
        }
      });
    }, 2000);
  });
}

runTest(); 