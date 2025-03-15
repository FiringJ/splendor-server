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
  private deck1: Card[] = [];
  private deck2: Card[] = [];
  private deck3: Card[] = [];

  // 初始化游戏
  public initializeGame(players: Player[]): GameRoom {
    try {
      this.logger.debug(`Initializing game for ${players.length} players`);

      // 确保每次初始化时，所有卡牌集合都是全新的
      const initialCards = this.generateInitialCards();
      const gameState: GameState = {
        players: new Map(players.map(p => [p.id, p])),
        currentTurn: players[0].id,
        gems: this.getInitialGems(players.length),
        cards: {
          level1: initialCards.level1,
          level2: initialCards.level2,
          level3: initialCards.level3,
          deck1: initialCards.deck1,
          deck2: initialCards.deck2,
          deck3: initialCards.deck3
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

      this.logger.debug(`Game initialized with room ID: ${room.id}`);
      return room;
    } catch (error) {
      this.logger.error('Failed to initialize game', error);
      throw new GameError('Failed to initialize game', 'INIT_GAME_FAILED', { error });
    }
  }

  // 处理游戏动作
  public handleGameAction(gameState: GameState, action: GameAction): GameState {
    try {
      this.logger.debug('Handling game action:', {
        actionType: action.type,
        actionDetails: action
      });

      let newState = { ...gameState };

      // 验证动作合法性
      if (!this.validateAction(newState, action)) {
        this.logger.error('Invalid action:', { action });
        throw new GameError('Invalid action', 'INVALID_ACTION', { action });
      }

      this.logger.debug('Action validation passed, processing action...');

      // 使用当前回合玩家ID，如果动作没指定
      const playerId = 'playerId' in action && action.playerId ? action.playerId : newState.currentTurn;

      switch (action.type) {
        case 'TAKE_GEMS':
          newState = this.handleTakeGems(newState, playerId, action.payload.gems);
          break;
        case 'PURCHASE_CARD':
          newState = this.handleBuyCard(newState, playerId, action.payload.cardId);
          break;
        case 'RESERVE_CARD':
          // 传递level参数，以支持从牌堆预留卡牌
          newState = this.handleReserveCard(newState, playerId, action.payload.cardId, action.payload.level);
          break;
        case 'DISCARD_GEMS':
          newState = this.handleDiscardGems(newState, playerId, action.payload.gems);
          break;
        default:
          this.logger.error('Invalid action type:', { action });
          throw new GameError('Invalid action type', 'INVALID_ACTION_TYPE', { action });
      }

      // 记录动作
      newState.actions = [...newState.actions, action];

      // 检查游戏结束条件
      this.checkGameEnd(newState);

      this.logger.debug('Action handled successfully');

      return newState;
    } catch (error) {
      this.logger.error('Failed to handle game action', error);
      throw new GameError('Failed to handle game action', 'HANDLE_ACTION_FAILED', { error });
    }
  }

  // 处理玩家断开连接
  public handlePlayerDisconnect(gameState: GameState, playerId: string): GameState {
    try {
      this.logger.debug(`Handling player disconnect: ${playerId}`);

      // 在这里处理玩家断开连接的逻辑
      // 例如，可能需要自动传递回合等

      // 如果是当前玩家的回合，自动结束回合
      if (gameState.currentTurn === playerId) {
        return this.endTurn(gameState);
      }

      return gameState;
    } catch (error) {
      this.logger.error('Failed to handle player disconnect', error);
      throw new GameError('Failed to handle player disconnect', 'HANDLE_DISCONNECT_FAILED', { error });
    }
  }

  // 私有方法：处理拿取宝石
  private handleTakeGems(state: GameState, playerId: string, selectedGems: Partial<Record<GemType, number>>): GameState {
    if (!this.canTakeGems(selectedGems, state)) {
      throw new GameError('Invalid gems selection', 'INVALID_GEMS_SELECTION');
    }

    const newState = { ...state };
    const player = newState.players.get(playerId);
    if (!player) throw new GameError('Player not found', 'PLAYER_NOT_FOUND');

    // 更新宝石数量
    Object.entries(selectedGems).forEach(([gem, count]) => {
      const gemType = gem as GemType;
      if (!count) return;

      newState.gems[gemType] -= count;
      player.gems[gemType] = (player.gems[gemType] || 0) + count;
    });

    // 检查玩家宝石总数是否超过10个
    const totalGems = Object.values(player.gems).reduce((sum, count) => sum + (count || 0), 0);
    if (totalGems > 10) {
      // 不立即抛出错误，而是标记需要丢弃的宝石
      // 但不结束回合，等待玩家丢弃宝石
      return {
        ...newState,
        pendingDiscard: {
          playerId,
          gemsCount: totalGems - 10
        }
      };
    }

    // 如果没有溢出，正常结束回合
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
  private handleReserveCard(state: GameState, playerId: string, cardId: number, level?: number): GameState {
    const newState = { ...state };
    const player = newState.players.get(playerId);
    if (!player) throw new Error('Player not found');

    if (!this.canReserveCard(player)) {
      throw new Error('Cannot reserve more cards');
    }

    let card: Card | undefined;

    // 处理从牌堆顶部预留卡牌的情况
    if (cardId === -1 && level) {
      // 确定牌堆
      const deckKey = `deck${level}` as keyof typeof this;
      const deck = this[deckKey] as Card[];

      if (deck.length === 0) {
        throw new Error(`No cards left in level ${level} deck`);
      }

      // 从牌堆中取出顶部卡牌
      card = deck.pop();

      // 更新前端显示的牌堆信息
      const deckDisplayKey = `deck${level}` as keyof typeof state.cards;
      state.cards[deckDisplayKey] = deck.map(c => ({ ...c, isCardBack: true }));
    } else {
      // 从展示区域预留可见卡牌
      card = this.findCard(newState, cardId);
      if (!card) throw new Error('Card not found');

      // 从展示区移除卡牌并补充
      this.removeAndReplenishCard(newState, card);
    }

    // 预留卡牌
    player.reservedCards.push(card);

    // 获得一个金色宝石（如果有）
    if (newState.gems.gold > 0) {
      newState.gems.gold--;
      player.gems.gold = (player.gems.gold || 0) + 1;
    }

    return this.endTurn(newState);
  }

  // 私有方法：处理丢弃宝石
  private handleDiscardGems(state: GameState, playerId: string, gemsToDiscard: Partial<Record<GemType, number>>): GameState {
    const newState = { ...state };
    const player = newState.players.get(playerId);
    if (!player) throw new GameError('Player not found', 'PLAYER_NOT_FOUND');

    // 验证丢弃的宝石数量
    const currentTotal = Object.values(player.gems).reduce((sum, count) => sum + (count || 0), 0);
    const discardTotal = Object.values(gemsToDiscard).reduce((sum, count) => sum + (count || 0), 0);
    const remainingTotal = currentTotal - discardTotal;

    if (remainingTotal > 10) {
      throw new GameError(
        'Must discard enough gems to have 10 or fewer',
        'INVALID_DISCARD',
        { currentTotal, discardTotal, remainingTotal }
      );
    }

    // 验证玩家是否有足够的宝石可以丢弃
    for (const [gemType, count] of Object.entries(gemsToDiscard)) {
      const availableGems = player.gems[gemType as GemType] || 0;
      if ((count || 0) > availableGems) {
        throw new GameError(
          'Player does not have enough gems to discard',
          'INVALID_DISCARD',
          { gemType, requested: count, available: availableGems }
        );
      }
    }

    // 执行丢弃操作
    Object.entries(gemsToDiscard).forEach(([gemType, count]) => {
      if (!count) return;
      const type = gemType as GemType;
      player.gems[type] = (player.gems[type] || 0) - count;
      newState.gems[type] = (newState.gems[type] || 0) + count;
    });

    // 清除pendingDiscard状态
    delete newState.pendingDiscard;

    // 结束当前玩家回合，进入下一个玩家
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

    // 创建全新副本并洗牌，避免引用原始数组
    const level1Cards = shuffleArray([...LEVEL1_CARDS]);
    const level2Cards = shuffleArray([...LEVEL2_CARDS]);
    const level3Cards = shuffleArray([...LEVEL3_CARDS]);

    // 明确分离展示区和牌堆卡牌
    const display1 = level1Cards.slice(0, 4);
    const display2 = level2Cards.slice(0, 4);
    const display3 = level3Cards.slice(0, 4);

    // 将剩余卡牌放入牌堆
    this.deck1 = level1Cards.slice(4);
    this.deck2 = level2Cards.slice(4);
    this.deck3 = level3Cards.slice(4);

    // 检查并确保所有卡牌ID唯一
    this.validateUniqueCardIds(display1, display2, display3, this.deck1, this.deck2, this.deck3);

    return {
      level1: display1,
      level2: display2,
      level3: display3,
      // 添加牌堆数量信息，用于前端展示
      deck1: this.deck1.map(card => ({ ...card, isCardBack: true })),
      deck2: this.deck2.map(card => ({ ...card, isCardBack: true })),
      deck3: this.deck3.map(card => ({ ...card, isCardBack: true }))
    };
  }

  // 验证所有卡牌ID唯一
  private validateUniqueCardIds(...cardArrays: Card[][]) {
    const allCardIds = new Set<number>();
    let hasDuplicate = false;

    for (const cardArray of cardArrays) {
      for (const card of cardArray) {
        if (allCardIds.has(card.id)) {
          this.logger.error(`发现重复卡牌ID: ${card.id}`);
          hasDuplicate = true;
        } else {
          allCardIds.add(card.id);
        }
      }
    }

    if (hasDuplicate) {
      this.logger.error('卡牌初始化存在重复ID，这可能导致游戏中卡牌重复问题');
    }
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
    // 检查是否有玩家达到15分或以上
    for (const [playerId, player] of state.players.entries()) {
      if (player.points >= 15 && !state.lastRound) {
        // 标记最后一轮开始
        state.lastRound = true;
        state.lastRoundStartPlayer = playerId;
        this.logger.debug(`Player ${playerId} reached 15 points, last round started`);
        return;
      }
    }

    // 如果最后一轮已经开始，检查是否回到了开始最后一轮的玩家之前的玩家
    if (state.lastRound && state.lastRoundStartPlayer) {
      // 计算玩家顺序
      const playerIds = Array.from(state.players.keys());
      const currentPlayerIndex = playerIds.indexOf(state.currentTurn);
      const lastRoundStartPlayerIndex = playerIds.indexOf(state.lastRoundStartPlayer);

      // 如果当前玩家是开始最后一轮的玩家之前的玩家，游戏结束
      if (
        (currentPlayerIndex < lastRoundStartPlayerIndex && currentPlayerIndex === 0) ||
        currentPlayerIndex === lastRoundStartPlayerIndex
      ) {
        // 找出得分最高的玩家
        let maxPoints = 0;
        let winnerId: string | null = null;

        for (const [playerId, player] of state.players.entries()) {
          if (player.points > maxPoints) {
            maxPoints = player.points;
            winnerId = playerId;
          }
        }

        // 处理平局情况（卡牌数量少的获胜）
        if (winnerId) {
          const playersWithMaxPoints = Array.from(state.players.entries())
            .filter(([_, p]) => p.points === maxPoints);

          if (playersWithMaxPoints.length > 1) {
            // 如果有多个玩家得分相同，则拥有卡牌最少的玩家获胜
            let minCards = Number.MAX_SAFE_INTEGER;

            for (const [pid, p] of playersWithMaxPoints) {
              const cardCount = p.cards.length;
              if (cardCount < minCards) {
                minCards = cardCount;
                winnerId = pid;
              }
            }
          }
        }

        state.winner = winnerId;
        this.logger.debug(`Game ended, winner: ${winnerId}`);
      }
    }
  }

  // 游戏规则验证方法
  private canTakeGems(selectedGems: Partial<Record<GemType, number>>, state: GameState): boolean {
    // 禁止选择黄金
    if (selectedGems.gold) return false;

    const differentColors = Object.entries(selectedGems).filter(([_, count]) => count && count > 0).length;
    const sameColorCount = Math.max(...Object.values(selectedGems).map(v => v || 0));

    if (differentColors === 0) return false; // 至少要选择一种宝石

    // 检查是否有足够的宝石可以拿
    for (const [type, count] of Object.entries(selectedGems) as [GemType, number][]) {
      if (count > 0 && (state.gems[type] ?? 0) < count) return false;
    }

    // 规则1: 拿取2个同色宝石
    if (sameColorCount === 2) {
      if (differentColors !== 1) return false;
      const gemType = Object.entries(selectedGems).find(([, count]) => count === 2)?.[0];
      if (!gemType) return false;
      return (state.gems[gemType as GemType] || 0) >= 4;
    }

    // 规则2: 拿取不同颜色宝石 (可以少于3个)
    if (sameColorCount === 1) {
      // 检查每种选择的宝石是否有足够数量
      for (const [gemType, count] of Object.entries(selectedGems)) {
        if ((state.gems[gemType as GemType] || 0) < (count || 0)) return false;
      }
      return differentColors <= 3;
    }

    return false;
  }

  public canPurchaseCard(card: Card, player: Player): boolean {
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
    const deckKey = `deck${card.level}` as keyof typeof this;
    const deck = this[deckKey] as Card[];

    // 从展示区移除当前卡牌
    state.cards[level] = state.cards[level].filter(c => c.id !== card.id);

    // 如果牌堆还有卡牌，则补充
    if (deck.length > 0) {
      // 直接取出牌堆顶卡牌
      const newCard = deck.pop()!;

      // 添加到展示区
      state.cards[level].push(newCard);

      // 更新前端显示的牌堆信息
      const deckDisplayKey = `deck${card.level}` as keyof typeof state.cards;
      state.cards[deckDisplayKey] = deck.map(card => ({ ...card, isCardBack: true }));
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
    if (!state || !action) return false;

    // 确保当前有玩家回合
    if (!state.currentTurn) {
      this.logger.error('No current turn defined in game state');
      return false;
    }

    // 为action添加playerId如果不存在
    // 如果action没有指定playerId，使用当前回合的玩家ID
    const playerId = 'playerId' in action && action.playerId ? action.playerId : state.currentTurn;

    // 验证动作类型和必要的属性
    switch (action.type) {
      case 'TAKE_GEMS':
        // 检查gems是否在payload中
        if (!action.payload || !action.payload.gems) {
          this.logger.error('TAKE_GEMS action missing gems in payload', { action });
          return false;
        }
        if (!this.validateTurn(state, playerId)) {
          this.logger.error('Not player turn', { currentTurn: state.currentTurn, playerId });
          return false;
        }
        return this.canTakeGems(action.payload.gems, state);

      case 'PURCHASE_CARD':
        if (!action.payload || !('cardId' in action.payload)) {
          this.logger.error('PURCHASE_CARD action missing cardId in payload', { action });
          return false;
        }
        if (!this.validateTurn(state, playerId)) return false;
        const card = this.findCard(state, action.payload.cardId);
        if (!card) return false;
        const player = state.players.get(playerId);
        return player ? this.canPurchaseCard(card, player) : false;

      case 'RESERVE_CARD':
        if (!action.payload || !('cardId' in action.payload)) {
          this.logger.error('RESERVE_CARD action missing cardId in payload', { action });
          return false;
        }
        if (!this.validateTurn(state, playerId)) return false;
        const playerForReserve = state.players.get(playerId);
        return playerForReserve ? this.canReserveCard(playerForReserve) : false;

      case 'DISCARD_GEMS':
        if (!action.payload || !('gems' in action.payload)) {
          this.logger.error('DISCARD_GEMS action missing gems in payload', { action });
          return false;
        }
        if (!this.validateTurn(state, playerId)) return false;
        return true; // 丢弃宝石的检查在处理函数中执行

      default:
        this.logger.error('Unknown action type', { actionType: action.type });
        return false;
    }
  }

  // 验证是否是玩家的回合
  private validateTurn(state: GameState, playerId: string): boolean {
    return state.currentTurn === playerId;
  }

  // 状态恢复相关方法
  public replayGameState(actions: GameAction[], players: Player[]): GameState {
    // 从动作历史重建游戏状态
    return this.replayActions(actions, players);
  }

  private replayActions(actions: GameAction[], players: Player[]): GameState {
    // 创建初始状态
    const initialCards = this.generateInitialCards();
    const initialState: GameState = {
      players: new Map(players.map(p => [p.id, { ...p }])),
      currentTurn: players[0].id,
      gems: this.getInitialGems(players.length),
      cards: {
        level1: initialCards.level1,
        level2: initialCards.level2,
        level3: initialCards.level3,
        deck1: initialCards.deck1,
        deck2: initialCards.deck2,
        deck3: initialCards.deck3
      },
      nobles: this.generateNobles(players.length + 1),
      winner: null,
      lastRound: false,
      lastRoundStartPlayer: null,
      actions: []
    };

    // 重放所有动作
    let currentState = initialState;
    for (const action of actions) {
      // 跳过无效动作
      if (!this.validateAction(currentState, action)) {
        this.logger.warn('Skipping invalid action during replay', { action });
        continue;
      }

      const playerId = 'playerId' in action && action.playerId ? action.playerId : currentState.currentTurn;

      switch (action.type) {
        case 'TAKE_GEMS':
          currentState = this.handleTakeGems(currentState, playerId, action.payload.gems);
          break;
        case 'PURCHASE_CARD':
          currentState = this.handleBuyCard(currentState, playerId, action.payload.cardId);
          break;
        case 'RESERVE_CARD':
          currentState = this.handleReserveCard(currentState, playerId, action.payload.cardId);
          break;
        case 'DISCARD_GEMS':
          currentState = this.handleDiscardGems(currentState, playerId, action.payload.gems);
          break;
      }

      // 记录动作
      currentState.actions.push(action);
    }

    return currentState;
  }

  // 游戏房间创建/加入方法
  public createRoomData(playerId: string): GameRoom {
    try {
      const roomId = uuidv4();
      const room: GameRoom = {
        id: roomId,
        players: [{
          id: playerId,
          name: `玩家1`,
          gems: { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0 },
          cards: [],
          reservedCards: [],
          nobles: [],
          points: 0
        }],
        status: 'waiting',
        gameState: null
      };

      this.logger.debug(`Room data created: ${roomId}`);
      return room;
    } catch (error) {
      this.logger.error('Failed to create room data', error);
      throw new GameError('Failed to create room data', 'CREATE_ROOM_FAILED', { error });
    }
  }
} 