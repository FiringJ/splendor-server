import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GameRoom, GameState, Player, GameAction, Gems, Card, Noble } from './interfaces/game.interface';
import { LEVEL1_CARDS, LEVEL2_CARDS, LEVEL3_CARDS, NOBLES } from './data/cards';

@Injectable()
export class GameService {
  private rooms = new Map<string, GameRoom>();
  private deck1: Card[] = [];
  private deck2: Card[] = [];
  private deck3: Card[] = [];

  public initializeGame(players: Player[]): GameRoom {
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

    console.log(gameState.players);

    return {
      id: uuidv4(),
      players,
      gameState,
      status: 'playing'
    };
  }

  createRoom(hostId: string) {
    const roomId = uuidv4();
    const initialPlayer: Player = {
      id: hostId,
      name: `Player ${hostId.slice(0, 4)}`,
      gems: { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0 },
      cards: [],
      reservedCards: [],
      nobles: [],
      points: 0
    };

    this.rooms.set(roomId, {
      id: roomId,
      players: [initialPlayer],
      gameState: this.initializeGameState([initialPlayer]),
      status: 'waiting'
    });

    return roomId;
  }

  joinRoom(roomId: string, playerId: string) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.status !== 'waiting') {
      throw new Error('Game already started');
    }
    if (room.players.length >= 4) {
      throw new Error('Room is full');
    }

    const newPlayer: Player = {
      id: playerId,
      name: `Player ${playerId.slice(0, 4)}`,
      gems: { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0 },
      cards: [],
      reservedCards: [],
      nobles: [],
      points: 0
    };

    room.players.push(newPlayer);
    return room;
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  handlePlayerDisconnect(playerId: string) {
    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);

        // 如果游戏已经开始,标记为结束
        if (room.status === 'playing') {
          room.status = 'finished';
          // 如果只剩一个玩家,将其设为赢家
          if (room.players.length === 1) {
            room.gameState.winner = room.players[0].id;
          }
        }

        // 如果房间空了就删除
        if (room.players.length === 0) {
          this.rooms.delete(roomId);
        }
      }
    }
  }

  handleGameAction(roomId: string, action: GameAction) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    switch (action.type) {
      case 'START_GAME':
        if (room.players.length < 2) {
          throw new Error('Not enough players');
        }
        room.status = 'playing';
        room.gameState = this.initializeGameState(room.players);
        break;

      case 'TAKE_GEMS':
        this.handleTakeGems(room, action);
        break;

      case 'BUY_CARD':
        this.handleBuyCard(room, action);
        break;

      case 'RESERVE_CARD':
        this.handleReserveCard(room, action);
        break;
    }

    this.checkNobles(room);
    this.checkWinCondition(room);

    return room;
  }

  private initializeGameState(players: Player[]): GameState {
    const initialCards = this.generateInitialCards();
    return {
      players: new Map(players.map(p => [p.id, p])),
      currentTurn: players[0].id,
      gems: this.getInitialGems(players.length),
      cards: {
        level1: initialCards.level1,
        level2: initialCards.level2,
        level3: initialCards.level3
      },
      nobles: this.generateNobles(players.length + 1),
      lastRound: false,
      lastRoundStartPlayer: null,
      actions: [],
      winner: null
    };
  }

  private generateInitialCards() {
    // 先打乱所有卡组
    const shuffled1 = this.shuffle([...LEVEL1_CARDS]).map((card, index) => ({
      ...card,
      spritePosition: {
        x: index % 4,  // 每行4张卡牌
        y: Math.floor(index / 4)  // 根据索引计算行数
      }
    }));
    const shuffled2 = this.shuffle([...LEVEL2_CARDS]).map((card, index) => ({
      ...card,
      spritePosition: {
        x: index % 4,
        y: Math.floor(index / 4)
      }
    }));
    const shuffled3 = this.shuffle([...LEVEL3_CARDS]).map((card, index) => ({
      ...card,
      spritePosition: {
        x: index % 4,
        y: Math.floor(index / 4)
      }
    }));

    // 保存牌组
    this.deck1 = shuffled1.slice(4);
    this.deck2 = shuffled2.slice(4);
    this.deck3 = shuffled3.slice(4);

    return {
      level1: shuffled1.slice(0, 4),
      level2: shuffled2.slice(0, 4),
      level3: shuffled3.slice(0, 4)
    };
  }

  private getInitialGems(playerCount: number): Gems {
    const gemCount = playerCount === 2 ? 4 : playerCount === 3 ? 5 : 7;
    return {
      diamond: gemCount,
      sapphire: gemCount,
      emerald: gemCount,
      ruby: gemCount,
      onyx: gemCount,
      gold: 5
    };
  }

  private generateNobles(count: number): Noble[] {
    // 随机选择指定数量的贵族
    return this.shuffle(NOBLES)
      .slice(0, count)
      .map(noble => ({
        ...noble
      }));
  }

  private shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  private handleTakeGems(room: GameRoom, action: Extract<GameAction, { type: 'TAKE_GEMS' }>) {
    const player = room.gameState.players.get(action.playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    if (room.gameState.currentTurn !== action.playerId) {
      throw new Error('Not your turn');
    }

    // 验证宝石选择是否合法
    const selectedGems = Object.entries(action.gems).filter(([_, count]) => count > 0);

    // 验证规则1: 选择3个不同颜色的宝石
    if (selectedGems.length === 3) {
      if (selectedGems.some(([_, count]) => count !== 1)) {
        throw new Error('Can only take 1 of each color when taking 3 different gems');
      }
    }
    // 验证规则2: 选择2个相同颜色的宝石
    else if (selectedGems.length === 1) {
      const [color, count] = selectedGems[0];
      if (count !== 2 || room.gameState.gems[color as keyof Gems] < 4) {
        throw new Error('Must have at least 4 gems to take 2 of the same color');
      }
    } else {
      throw new Error('Invalid gem selection');
    }

    // 验证玩家宝石总数不超过10
    const totalPlayerGems = Object.values(player.gems).reduce((a, b) => a + b, 0);
    const gemsToAdd = Object.values(action.gems).reduce((a, b) => a + b, 0);
    if (totalPlayerGems + gemsToAdd > 10) {
      throw new Error('Cannot hold more than 10 gems');
    }

    // 更新游戏状态
    Object.entries(action.gems).forEach(([color, count]) => {
      const gemColor = color as keyof Gems;
      room.gameState.gems[gemColor] -= count;
      player.gems[gemColor] += count;
    });

    // 更新当前回合
    const playerIndex = room.players.findIndex(p => p.id === action.playerId);
    room.gameState.currentTurn = room.players[(playerIndex + 1) % room.players.length].id;
  }

  private handleBuyCard(room: GameRoom, action: Extract<GameAction, { type: 'BUY_CARD' }>) {
    const player = room.gameState.players.get(action.playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    if (room.gameState.currentTurn !== action.playerId) {
      throw new Error('Not your turn');
    }

    // 找到要购买的卡片
    const card = this.findCard(room.gameState, action.cardId);
    if (!card) {
      throw new Error('Card not found');
    }

    // 计算玩家的卡牌加成
    const cardBonuses = this.calculateCardBonuses(player.cards);

    // 验证玩家是否有足够的资源购买
    if (!this.canPurchaseCard(card, player, cardBonuses)) {
      throw new Error('Not enough resources to purchase card');
    }

    // 处理支付
    this.handlePayment(room.gameState, card, cardBonuses, player);

    // 从展示区或预留区移除卡片
    const isReserved = player.reservedCards.some(c => c.id === card.id);
    if (isReserved) {
      player.reservedCards = player.reservedCards.filter(c => c.id !== card.id);
    } else {
      this.removeAndReplenishCard(room.gameState, card);
    }

    // 添加卡片到玩家手中
    player.cards.push(card);
    player.points += card.points;

    // 更新当前回合
    const playerIndex = room.players.findIndex(p => p.id === action.playerId);
    room.gameState.currentTurn = room.players[(playerIndex + 1) % room.players.length].id;
  }

  private handleReserveCard(room: GameRoom, action: Extract<GameAction, { type: 'RESERVE_CARD' }>) {
    const player = room.gameState.players.get(action.playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    if (room.gameState.currentTurn !== action.playerId) {
      throw new Error('Not your turn');
    }

    if (player.reservedCards.length >= 3) {
      throw new Error('Cannot reserve more than 3 cards');
    }

    // 找到要预留的卡片
    const card = this.findCard(room.gameState, action.cardId);
    if (!card) {
      throw new Error('Card not found');
    }

    // 预留卡片
    player.reservedCards.push(card);

    // 获得一个金色宝石（如果有）
    if (room.gameState.gems.gold > 0) {
      room.gameState.gems.gold--;
      player.gems.gold = (player.gems.gold || 0) + 1;
    }

    // 从展示区移除卡片并补充
    this.removeAndReplenishCard(room.gameState, card);

    // 更新当前回合
    const playerIndex = room.players.findIndex(p => p.id === action.playerId);
    room.gameState.currentTurn = room.players[(playerIndex + 1) % room.players.length].id;
  }

  private findCard(gameState: GameState, cardId: string): Card | null {
    // 在所有可能的位置查找卡片
    const allCards = [
      ...gameState.cards.level1,
      ...gameState.cards.level2,
      ...gameState.cards.level3
    ];

    return allCards.find(c => c.id === parseInt(cardId)) || null;
  }

  private calculateCardBonuses(cards: Card[]): Record<keyof Omit<Gems, 'gold'>, number> {
    return cards.reduce((acc, card) => {
      acc[card.gem] = (acc[card.gem] || 0) + 1;
      return acc;
    }, {} as Record<keyof Omit<Gems, 'gold'>, number>);
  }

  private canPurchaseCard(
    card: Card,
    player: Player,
    cardBonuses: Record<keyof Omit<Gems, 'gold'>, number>
  ): boolean {
    let goldNeeded = 0;

    for (const [gem, cost] of Object.entries(card.cost)) {
      if (!cost) continue;
      const gemType = gem as keyof Omit<Gems, 'gold'>;
      const bonus = cardBonuses[gemType] || 0;
      const available = player.gems[gemType] || 0;
      const needed = Math.max(0, cost - bonus);

      if (available >= needed) {
        continue;
      } else {
        goldNeeded += needed - available;
      }
    }

    return (player.gems.gold || 0) >= goldNeeded;
  }

  private handlePayment(
    gameState: GameState,
    card: Card,
    cardBonuses: Record<keyof Omit<Gems, 'gold'>, number>,
    player: Player
  ): void {
    let goldNeeded = 0;
    const payments: Partial<Record<keyof Gems, number>> = {};

    // 计算每种宝石需要支付的数量
    for (const [gem, cost] of Object.entries(card.cost)) {
      if (!cost) continue;
      const gemType = gem as keyof Omit<Gems, 'gold'>;
      const bonus = cardBonuses[gemType] || 0;
      const available = player.gems[gemType] || 0;
      const needed = Math.max(0, cost - bonus);

      if (available >= needed) {
        payments[gemType] = needed;
      } else {
        payments[gemType] = available;
        goldNeeded += needed - available;
      }
    }

    // 执行支付
    for (const [gem, amount] of Object.entries(payments)) {
      if (!amount) continue;
      const gemType = gem as keyof Gems;
      player.gems[gemType] = (player.gems[gemType] || 0) - amount;
      gameState.gems[gemType] = (gameState.gems[gemType] || 0) + amount;
    }

    // 支付黄金
    if (goldNeeded > 0) {
      player.gems.gold = (player.gems.gold || 0) - goldNeeded;
      gameState.gems.gold = (gameState.gems.gold || 0) + goldNeeded;
    }
  }

  private removeAndReplenishCard(gameState: GameState, card: Card): void {
    let cardList: Card[];
    let deck: Card[];

    switch (card.level) {
      case 1:
        cardList = gameState.cards.level1;
        deck = this.deck1;
        break;
      case 2:
        cardList = gameState.cards.level2;
        deck = this.deck2;
        break;
      case 3:
        cardList = gameState.cards.level3;
        deck = this.deck3;
        break;
      default:
        throw new Error('Invalid card level');
    }

    // 从展示区移除卡片
    const index = cardList.findIndex(c => c.id === card.id);
    if (index !== -1) {
      cardList.splice(index, 1);
      // 如果牌堆还有牌，则补充一张
      if (deck.length > 0) {
        cardList.push(deck.pop()!);
      }
    }
  }

  private checkNobles(room: GameRoom) {
    const currentPlayer = room.gameState.players.get(room.gameState.currentTurn);
    if (!currentPlayer) return;

    // 计算玩家的卡牌加成
    const playerBonuses = currentPlayer.cards.reduce((acc, card) => {
      acc[card.gem] = (acc[card.gem] || 0) + 1;
      return acc;
    }, {} as Record<keyof Omit<Gems, 'gold'>, number>);

    // 检查每个贵族的要求
    room.gameState.nobles = room.gameState.nobles.filter(noble => {
      const canVisit = Object.entries(noble.requirements).every(([color, count]) => {
        return (playerBonuses[color as keyof Omit<Gems, 'gold'>] || 0) >= (count || 0);
      });

      if (canVisit) {
        currentPlayer.nobles.push(noble);
        currentPlayer.points += noble.points;
        return false;
      }
      return true;
    });
  }

  private checkWinCondition(room: GameRoom) {
    const currentPlayer = room.gameState.players.get(room.gameState.currentTurn);
    if (!currentPlayer) return;

    if (currentPlayer.points >= 15) {
      room.status = 'finished';
      room.gameState.winner = currentPlayer.id;
    }
  }
} 