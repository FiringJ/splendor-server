import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GameRoom, GameState, Player, GameAction, Gems, Card, Noble, GemType } from './interfaces/game.interface';
import { LEVEL1_CARDS, LEVEL2_CARDS, LEVEL3_CARDS, NOBLES } from './data/cards';

export class GameError extends Error {
  constructor(
    message: string,
    public code: string,
    public data?: any
  ) {
    super(message);
    this.name = 'GameError';
  }
}

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  private rooms = new Map<string, GameRoom>();
  private deck1: Card[] = [];
  private deck2: Card[] = [];
  private deck3: Card[] = [];

  // 初始化游戏
  public initializeGame(players: Player[]): GameRoom {
    try {
      this.logger.debug(`Initializing game for ${players.length} players`);

      const gameState: GameState = {
        players: new Map(players.map(p => [p.id, p])),
        currentTurn: players[0].id,
        gems: this.getInitialGems(players.length),
        cards: {
          level1: this.generateInitialCards().level1,
          level2: this.generateInitialCards().level2,
          level3: this.generateInitialCards().level3
        },
        nobles: this.generateNobles(players.length + 1),
        winner: null,
        lastRound: false,
        lastRoundStartPlayer: null,
        actions: []
      };

      const room: GameRoom = {
        id: uuidv4(),
        players,
        gameState,
        status: 'playing'
      };

      this.rooms.set(room.id, room);
      this.logger.debug(`Game initialized with room ID: ${room.id}`);
      return room;
    } catch (error) {
      this.logger.error('Failed to initialize game', error);
      throw new GameError('Failed to initialize game', 'INIT_FAILED', { error });
    }
  }

  // 处理游戏动作
  public handleGameAction(roomId: string, action: GameAction): GameRoom {
    try {
      this.logger.debug(`Handling action ${action.type} for room ${roomId}`);

      const room = this.rooms.get(roomId);
      if (!room) {
        throw new GameError('Room not found', 'ROOM_NOT_FOUND', { roomId });
      }

      const { gameState } = room;
      let newState = { ...gameState };

      // 验证动作合法性
      if (!this.validateAction(newState, action)) {
        throw new GameError('Invalid action', 'INVALID_ACTION', { action });
      }

      switch (action.type) {
        case 'TAKE_GEMS':
          newState = this.handleTakeGems(newState, action.playerId, action.gems);
          break;
        case 'BUY_CARD':
          newState = this.handleBuyCard(newState, action.playerId, action.cardId);
          break;
        case 'RESERVE_CARD':
          newState = this.handleReserveCard(newState, action.playerId, action.cardId);
          break;
        default:
          throw new GameError('Invalid action type', 'INVALID_ACTION_TYPE', { action });
      }

      // 记录动作
      newState.actions = [...newState.actions, action];

      // 检查游戏结束条件
      this.checkGameEnd(newState);

      // 更新房间状态
      room.gameState = newState;
      this.rooms.set(roomId, room);

      this.logger.debug(`Action handled successfully`);
      return room;
    } catch (error) {
      if (error instanceof GameError) {
        throw error;
      }
      this.logger.error('Failed to handle game action', error);
      throw new GameError(
        'Failed to handle game action',
        'ACTION_FAILED',
        { roomId, action, error }
      );
    }
  }

  // 处理玩家断开连接
  public handlePlayerDisconnect(playerId: string): void {
    try {
      this.logger.debug(`Handling disconnect for player ${playerId}`);

      for (const [roomId, room] of this.rooms.entries()) {
        if (room.players.some(p => p.id === playerId)) {
          room.status = 'finished';
          this.rooms.set(roomId, room);
          this.logger.debug(`Room ${roomId} marked as finished due to player disconnect`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to handle player disconnect', error);
      throw new GameError(
        'Failed to handle player disconnect',
        'DISCONNECT_FAILED',
        { playerId, error }
      );
    }
  }

  // 私有方法：处理拿取宝石
  private handleTakeGems(state: GameState, playerId: string, selectedGems: Partial<Record<GemType, number>>): GameState {
    if (!this.canTakeGems(selectedGems, state)) {
      throw new Error('Invalid gems selection');
    }

    const newState = { ...state };
    const player = newState.players.get(playerId);
    if (!player) throw new Error('Player not found');

    // 更新宝石数量
    Object.entries(selectedGems).forEach(([gem, count]) => {
      const gemType = gem as GemType;
      if (!count) return;

      newState.gems[gemType] -= count;
      player.gems[gemType] = (player.gems[gemType] || 0) + count;
    });

    return this.endTurn(newState);
  }

  // 私有方法：处理购买卡牌
  private handleBuyCard(state: GameState, playerId: string, cardId: number): GameState {
    const newState = { ...state };
    const player = newState.players.get(playerId);
    if (!player) throw new Error('Player not found');

    // 查找卡牌
    const card = this.findCard(newState, cardId);
    if (!card) throw new Error('Card not found');

    if (!this.canPurchaseCard(card, player)) {
      throw new Error('Cannot purchase this card');
    }

    // 支付费用
    this.handlePayment(newState, card, player);

    // 添加卡牌到玩家手中
    player.cards.push(card);
    player.points += card.points;

    // 从展示区或预留区移除卡牌
    this.removeAndReplenishCard(newState, card, player);

    // 检查是否可以获得贵族
    this.checkNobles(newState, player);

    return this.endTurn(newState);
  }

  // 私有方法：处理预留卡牌
  private handleReserveCard(state: GameState, playerId: string, cardId: number): GameState {
    const newState = { ...state };
    const player = newState.players.get(playerId);
    if (!player) throw new Error('Player not found');

    if (!this.canReserveCard(player)) {
      throw new Error('Cannot reserve more cards');
    }

    // 查找卡牌
    const card = this.findCard(newState, cardId);
    if (!card) throw new Error('Card not found');

    // 预留卡牌
    player.reservedCards.push(card);

    // 获得一个金色宝石（如果有）
    if (newState.gems.gold > 0) {
      newState.gems.gold--;
      player.gems.gold = (player.gems.gold || 0) + 1;
    }

    // 从展示区移除卡牌并补充
    this.removeAndReplenishCard(newState, card);

    return this.endTurn(newState);
  }

  // 私有方法：游戏辅助函数
  private getInitialGems(playerCount: number): Gems {
    return {
      diamond: playerCount <= 2 ? 4 : 7,
      sapphire: playerCount <= 2 ? 4 : 7,
      emerald: playerCount <= 2 ? 4 : 7,
      ruby: playerCount <= 2 ? 4 : 7,
      onyx: playerCount <= 2 ? 4 : 7,
      gold: 5
    };
  }

  private generateInitialCards() {
    const shuffleArray = <T>(array: T[]): T[] => {
      const newArray = [...array];
      for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
      }
      return newArray;
    };

    const shuffled1 = shuffleArray([...LEVEL1_CARDS]);
    const shuffled2 = shuffleArray([...LEVEL2_CARDS]);
    const shuffled3 = shuffleArray([...LEVEL3_CARDS]);

    this.deck1 = shuffled1.slice(4);
    this.deck2 = shuffled2.slice(4);
    this.deck3 = shuffled3.slice(4);

    return {
      level1: shuffled1.slice(0, 4),
      level2: shuffled2.slice(0, 4),
      level3: shuffled3.slice(0, 4)
    };
  }

  private generateNobles(count: number): Noble[] {
    const shuffled = [...NOBLES].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private findCard(state: GameState, cardId: number): Card | undefined {
    // 需要同时在预留区查找
    const allCards = [
      ...state.cards.level1,
      ...state.cards.level2,
      ...state.cards.level3,
      ...Array.from(state.players.values()).flatMap(p => p.reservedCards)
    ];
    return allCards.find(c => c.id === cardId);
  }

  private endTurn(state: GameState): GameState {
    const players = Array.from(state.players.keys());
    const currentPlayerIndex = players.indexOf(state.currentTurn);
    state.currentTurn = players[(currentPlayerIndex + 1) % players.length];
    return state;
  }

  private checkGameEnd(state: GameState): void {
    // 检查是否有玩家达到15分
    const hasPlayerReached15Points = Array.from(state.players.values()).some(player => player.points >= 15);

    if (hasPlayerReached15Points && !state.lastRound) {
      state.lastRound = true;
      state.lastRoundStartPlayer = state.currentTurn;
    }

    // 如果是最后一轮，检查是否所有玩家都进行了最后一次行动
    if (state.lastRound && state.lastRoundStartPlayer) {
      const players = Array.from(state.players.keys());
      const startPlayerIndex = players.indexOf(state.lastRoundStartPlayer);
      const currentPlayerIndex = players.indexOf(state.currentTurn);

      if (currentPlayerIndex === (startPlayerIndex - 1 + players.length) % players.length) {
        // 找出获胜者
        let maxPoints = -1;
        let winner: string | null = null;

        for (const [playerId, player] of state.players.entries()) {
          if (player.points > maxPoints) {
            maxPoints = player.points;
            winner = playerId;
          } else if (player.points === maxPoints && winner) {
            // 如果分数相同，比较卡牌数量
            const currentWinnerCards = state.players.get(winner)?.cards.length || 0;
            if (player.cards.length < currentWinnerCards) {
              winner = playerId;
            }
          }
        }

        state.winner = winner;
      }
    }

    // 需要在游戏结束时更新房间状态
    if (state.winner) {
      const room = Array.from(this.rooms.values())
        .find(r => r.gameState === state);
      if (room) {
        room.status = 'finished';
      }
    }
  }

  // 游戏规则验证方法
  private canTakeGems(selectedGems: Partial<Record<GemType, number>>, state: GameState): boolean {
    const player = state.players.get(state.currentTurn);
    if (!player) return false;

    const currentGemCount = Object.values(player.gems).reduce((sum, count) => sum + (count || 0), 0);
    const selectedGemCount = Object.values(selectedGems).reduce((sum, count) => sum + (count || 0), 0);

    // 检查是否会超过宝石上限
    if (currentGemCount + selectedGemCount > 10) return false;

    // 禁止选择黄金
    if (selectedGems.gold) return false;

    const differentColors = Object.keys(selectedGems).length;
    const sameColorCount = Math.max(...Object.values(selectedGems).map(v => v || 0));

    // 规则1: 拿取2个同色宝石
    if (sameColorCount === 2) {
      if (differentColors !== 1) return false;
      const gemType = Object.entries(selectedGems).find(([, count]) => count === 2)?.[0];
      if (!gemType) return false;
      return (state.gems[gemType as GemType] || 0) >= 4;
    }

    // 规则2: 拿取不同颜色宝石
    if (sameColorCount === 1) {
      // 检查每种选择的宝石是否有足够数量
      for (const [gemType, count] of Object.entries(selectedGems)) {
        if ((state.gems[gemType as GemType] || 0) < (count || 0)) return false;
      }

      return differentColors === 3 || (differentColors > 0 && differentColors <= Math.min(3, 10 - currentGemCount));
    }

    return false;
  }

  private canPurchaseCard(card: Card, player: Player): boolean {
    // 计算玩家拥有的资源（包括卡牌提供的永久宝石）
    const cardBonuses = player.cards.reduce((acc, c) => {
      acc[c.gem] = (acc[c.gem] || 0) + 1;
      return acc;
    }, {} as Partial<Record<GemType, number>>);

    let remainingGold = player.gems.gold || 0;

    // 检查每种宝石的需求
    for (const [gemType, required] of Object.entries(card.cost)) {
      if (!required) continue;

      const gemAvailable = player.gems[gemType as GemType] || 0;
      const cardBonus = cardBonuses[gemType as GemType] || 0;
      const totalAvailable = gemAvailable + cardBonus;

      if (totalAvailable < required) {
        const shortfall = required - totalAvailable;
        if (remainingGold < shortfall) return false;
        remainingGold -= shortfall;
      }
    }

    return true;
  }

  private canReserveCard(player: Player): boolean {
    if (player.reservedCards.length >= 3) return false;
    const currentGemCount = Object.values(player.gems).reduce((sum, count) => sum + (count || 0), 0);
    return currentGemCount < 10;
  }

  private handlePayment(state: GameState, card: Card, player: Player): void {
    const cardBonuses = player.cards.reduce((acc, c) => {
      acc[c.gem] = (acc[c.gem] || 0) + 1;
      return acc;
    }, {} as Partial<Record<GemType, number>>);

    let remainingGold = player.gems.gold || 0;
    const payments: Partial<Record<GemType, number>> = {};

    // 计算每种宝石实际需要支付的数量
    Object.entries(card.cost).forEach(([gem, cost]) => {
      if (!cost) return;
      const gemType = gem as GemType;
      const playerGems = player.gems[gemType] || 0;
      const bonus = cardBonuses[gemType] || 0;
      const actualCost = Math.max(0, cost - bonus);

      if (playerGems >= actualCost) {
        payments[gemType] = actualCost;
      } else {
        payments[gemType] = playerGems;
        const shortfall = actualCost - playerGems;
        remainingGold -= shortfall;
      }
    });

    // 执行支付
    Object.entries(payments).forEach(([gem, amount]) => {
      if (!amount) return;
      const gemType = gem as GemType;
      player.gems[gemType] = (player.gems[gemType] || 0) - amount;
      state.gems[gemType] = (state.gems[gemType] || 0) + amount;
    });

    // 支付黄金
    if (remainingGold < player.gems.gold!) {
      const goldUsed = player.gems.gold! - remainingGold;
      player.gems.gold = remainingGold;
      state.gems.gold = (state.gems.gold || 0) + goldUsed;
    }
  }

  private removeAndReplenishCard(state: GameState, card: Card, player?: Player): void {
    // 如果是从预留区购买，从预留区移除
    if (player) {
      const reservedIndex = player.reservedCards.findIndex(c => c.id === card.id);
      if (reservedIndex !== -1) {
        player.reservedCards.splice(reservedIndex, 1);
        return;
      }
    }

    // 从展示区移除并补充
    const level = `level${card.level}` as keyof typeof state.cards;
    const deck = this[`deck${card.level}`] as Card[];

    state.cards[level] = state.cards[level].filter(c => c.id !== card.id);

    if (deck.length > 0) {
      state.cards[level].push(deck.pop()!);
    }
  }

  private checkNobles(state: GameState, player: Player): void {
    state.nobles = state.nobles.filter(noble => {
      const canAcquire = this.canAcquireNoble(noble, player);
      if (canAcquire) {
        player.nobles.push(noble);
        player.points += noble.points;
        return false;
      }
      return true;
    });
  }

  private canAcquireNoble(noble: Noble, player: Player): boolean {
    const cardBonuses = player.cards.reduce((acc, card) => {
      acc[card.gem] = (acc[card.gem] || 0) + 1;
      return acc;
    }, {} as Partial<Record<GemType, number>>);

    return Object.entries(noble.requirements).every(([gemType, required]) => {
      if (!required) return true;
      return (cardBonuses[gemType as GemType] || 0) >= required;
    });
  }

  // 验证动作合法性
  private validateAction(state: GameState, action: GameAction): boolean {
    // 检查游戏是否已结束
    if (state.winner !== null) {
      throw new Error('Game is already finished');
    }

    // START_GAME 动作不需要验证玩家回合
    if (action.type === 'START_GAME') {
      return true;
    }

    // 检查是否是玩家的回合
    if (!this.validateTurn(state, action.playerId)) {
      throw new Error('Not your turn');
    }

    // 检查玩家是否存在
    const player = state.players.get(action.playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    return true;
  }

  // 验证是否是玩家的回合
  private validateTurn(state: GameState, playerId: string): boolean {
    return state.currentTurn === playerId;
  }

  // 状态恢复相关方法
  public restoreGameState(roomId: string): GameRoom | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    // 从动作历史重建游戏状态
    const newState = this.replayActions(room.gameState.actions, room.players);
    room.gameState = newState;
    return room;
  }

  private replayActions(actions: GameAction[], players: Player[]): GameState {
    // 创建初始状态
    const initialState: GameState = {
      players: new Map(players.map(p => [p.id, {
        ...p,
        gems: { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0 },
        cards: [],
        reservedCards: [],
        nobles: [],
        points: 0
      }])),
      currentTurn: players[0].id,
      gems: this.getInitialGems(players.length),
      cards: this.generateInitialCards(),
      nobles: this.generateNobles(players.length + 1),
      winner: null,
      lastRound: false,
      lastRoundStartPlayer: null,
      actions: []
    };

    // 重放所有动作
    return actions.reduce((state, action) => {
      let newState = { ...state };

      try {
        switch (action.type) {
          case 'TAKE_GEMS':
            newState = this.handleTakeGems(newState, action.playerId, action.gems);
            break;
          case 'BUY_CARD':
            newState = this.handleBuyCard(newState, action.playerId, action.cardId);
            break;
          case 'RESERVE_CARD':
            newState = this.handleReserveCard(newState, action.playerId, action.cardId);
            break;
          case 'START_GAME':
            // START_GAME 动作不需要特殊处理，因为已经在初始状态中设置
            break;
        }

        // 记录动作
        newState.actions = [...newState.actions, action];

        return newState;
      } catch (error) {
        console.error(`Failed to replay action: ${error.message}`, action);
        return state;
      }
    }, initialState);
  }
} 