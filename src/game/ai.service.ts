import { Injectable, Logger } from '@nestjs/common';
import { Card, GameAction, GameState, GemType, Noble, Player } from './interfaces/game.interface';
import { GameService } from './game.service';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(private readonly gameService: GameService) { }

  /**
   * 为AI玩家生成下一步动作
   */
  public getNextAction(gameState: GameState, playerId: string): GameAction {
    this.logger.debug(`AI正在计算下一步动作...`);

    const player = gameState.players.get(playerId);
    if (!player) {
      throw new Error('AI玩家未找到');
    }

    const possibleCards = [
      ...gameState.cards.level1,
      ...gameState.cards.level2,
      ...gameState.cards.level3,
      ...player.reservedCards
    ];

    // 1. 检查是否可以购买任何卡牌
    const purchasableCards = possibleCards.filter(card =>
      this.canPurchaseCard(card, player)
    );

    if (purchasableCards.length > 0) {
      // 选择最有价值的卡牌购买
      const bestCard = purchasableCards.reduce((best, card) => {
        const score = this.evaluateCard(card, player);
        return score > best.score ? { card, score } : best;
      }, { card: purchasableCards[0], score: -Infinity });

      return {
        type: 'PURCHASE_CARD',
        playerId: player.id,
        payload: {
          cardId: bestCard.card.id
        }
      };
    }

    // 2. 如果可以预定卡牌，并且有闲置槽位，考虑预定高价值卡牌
    if (player.reservedCards.length < 3) {
      const availableCards = [
        ...gameState.cards.level3,  // 优先考虑高等级卡牌
        ...gameState.cards.level2,
        ...gameState.cards.level1
      ].filter(card => !player.reservedCards.some(rc => rc.id === card.id));

      if (availableCards.length > 0) {
        // 选择最有价值的卡牌预定
        const bestCard = availableCards.reduce((best, card) => {
          const score = this.evaluateCard(card, player);
          return score > best.score ? { card, score } : best;
        }, { card: availableCards[0], score: -Infinity });

        return {
          type: 'RESERVE_CARD',
          playerId: player.id,
          payload: {
            cardId: bestCard.card.id
          }
        };
      }
    }

    // 3. 选择宝石
    const selectedGems = this.selectGems(gameState, player);
    if (Object.keys(selectedGems).length > 0) {
      return {
        type: 'TAKE_GEMS',
        playerId: player.id,
        payload: {
          gems: selectedGems
        }
      };
    }

    // 4. 如果其他操作都不可行，返回空的拿取宝石操作
    this.logger.warn('AI无法找到有效操作，默认结束回合');
    return {
      type: 'TAKE_GEMS',
      playerId: player.id,
      payload: {
        gems: {}
      }
    };
  }

  /**
   * 评估一张卡牌对玩家的价值
   */
  private evaluateCard(card: Card, player: Player): number {
    // 基础分：卡牌胜利点数
    let score = card.points * 3;

    // 根据玩家的宝石资源和发展牌情况，计算卡牌的额外价值
    // 1. 如果这张卡可以帮助玩家获得贵族，增加分数
    const playerCardsByGem = this.countCardsByGemType(player);
    playerCardsByGem[card.gem] = (playerCardsByGem[card.gem] || 0) + 1;

    // 2. 卡牌本身的宝石类型也很重要
    // 如果玩家某种宝石卡牌较少，那么该类型卡牌价值更高
    const currentCardsByGem = this.countCardsByGemType(player);
    const gemTypeScore = 5 - (currentCardsByGem[card.gem] || 0);
    score += gemTypeScore;

    // 3. 如果这张卡的成本和玩家当前的宝石资源匹配度高，增加分数
    const totalCost = Object.values(card.cost).reduce((sum, count) => sum + (count as number), 0);
    if (totalCost > 0) {
      let affordabilityScore = 0;
      for (const [gemType, count] of Object.entries(card.cost)) {
        const playerHas = player.gems[gemType as GemType] || 0;
        if (playerHas >= (count as number)) {
          affordabilityScore += (count as number);
        }
      }
      score += (affordabilityScore / totalCost) * 2;
    }

    return score;
  }

  /**
   * 计算玩家拥有的每种宝石类型的卡牌数量
   */
  private countCardsByGemType(player: Player): Partial<Record<GemType, number>> {
    const result: Partial<Record<GemType, number>> = {};

    for (const card of player.cards) {
      result[card.gem] = (result[card.gem] || 0) + 1;
    }

    return result;
  }

  /**
   * 评估一个贵族对玩家的价值
   */
  private evaluateNoble(noble: Noble, player: Player): number {
    // 基础分：贵族胜利点数
    let score = noble.points;

    // 计算玩家对获得该贵族需要的发展牌的进度
    let totalRequired = 0;
    let playerHas = 0;

    const cardsByGemType = this.countCardsByGemType(player);

    for (const [gemType, count] of Object.entries(noble.requirements)) {
      totalRequired += (count as number);
      playerHas += Math.min((count as number), cardsByGemType[gemType as GemType] || 0);
    }

    // 根据完成度给分
    score += (playerHas / totalRequired) * 5;

    return score;
  }

  /**
   * 获取玩家当前的宝石总数
   */
  private getCurrentGemCount(player: Player): number {
    return Object.values(player.gems).reduce((sum, count) => sum + (count as number), 0);
  }

  /**
   * 为AI玩家选择宝石
   */
  private selectGems(gameState: GameState, player: Player): Partial<Record<GemType, number>> {
    const MAX_GEMS = 10; // 玩家最多持有的宝石数量
    const currentGemCount = this.getCurrentGemCount(player);

    if (currentGemCount >= MAX_GEMS) {
      return {}; // 宝石已满，不能再拿
    }

    // 可拿宝石的数量限制
    const maxGemsToTake = Math.min(3, MAX_GEMS - currentGemCount);

    // 统计游戏中剩余的宝石
    const availableGems: Partial<Record<GemType, number>> = { ...gameState.gems };

    // 策略1：先尝试拿2个同种宝石（如果有4个以上）
    if (maxGemsToTake >= 2) {
      const gemTypesWithFourOrMore = Object.entries(availableGems)
        .filter(([gemType, count]) => gemType !== 'gold' && count && count >= 4)
        .map(([gemType]) => gemType as GemType);

      if (gemTypesWithFourOrMore.length > 0) {
        // 评估哪种宝石最有价值
        const bestGemType = gemTypesWithFourOrMore.reduce((best, gemType) => {
          const value = this.evaluateGemType(gemType, player, gameState);
          return value > best.value ? { type: gemType, value } : best;
        }, { type: gemTypesWithFourOrMore[0], value: -Infinity });

        return { [bestGemType.type]: 2 };
      }
    }

    // 策略2：选择3种不同的宝石
    if (maxGemsToTake >= 3) {
      const availableGemTypes = Object.entries(availableGems)
        .filter(([gemType, count]) => gemType !== 'gold' && count && count > 0)
        .map(([gemType]) => gemType as GemType);

      if (availableGemTypes.length >= 3) {
        // 评估每种宝石的价值
        const ratedGems = availableGemTypes.map(gemType => ({
          type: gemType,
          value: this.evaluateGemType(gemType, player, gameState)
        }));

        // 排序并选择前3种最有价值的宝石
        ratedGems.sort((a, b) => b.value - a.value);
        const selectedGems: Partial<Record<GemType, number>> = {};
        for (let i = 0; i < Math.min(3, ratedGems.length); i++) {
          selectedGems[ratedGems[i].type] = 1;
        }

        return selectedGems;
      }
    }

    // 策略3：选择1-2种不同的宝石
    const availableGemTypes = Object.entries(availableGems)
      .filter(([gemType, count]) => gemType !== 'gold' && count && count > 0)
      .map(([gemType]) => gemType as GemType);

    if (availableGemTypes.length > 0) {
      // 评估每种宝石的价值
      const ratedGems = availableGemTypes.map(gemType => ({
        type: gemType,
        value: this.evaluateGemType(gemType, player, gameState)
      }));

      // 排序并选择最有价值的宝石
      ratedGems.sort((a, b) => b.value - a.value);
      const selectedGems: Partial<Record<GemType, number>> = {};
      for (let i = 0; i < Math.min(maxGemsToTake, ratedGems.length); i++) {
        selectedGems[ratedGems[i].type] = 1;
      }

      return selectedGems;
    }

    return {}; // 没有可拿的宝石
  }

  /**
   * 评估一种宝石类型对玩家的价值
   */
  private evaluateGemType(gemType: GemType, player: Player, gameState: GameState): number {
    // 基础分
    let score = 1;

    // 宝石稀缺性
    const availableCount = gameState.gems[gemType] || 0;
    if (availableCount <= 1) {
      score += 2; // 稀缺宝石更有价值
    }

    // 玩家已有的该类型卡牌数量
    const cardsByGemType = this.countCardsByGemType(player);
    const permanentCount = cardsByGemType[gemType] || 0;
    if (permanentCount < 2) {
      score += (2 - permanentCount) * 0.5; // 鼓励多元化收集
    }

    // 考虑玩家可购买或预定的卡牌
    const possibleCards = [
      ...gameState.cards.level1,
      ...gameState.cards.level2,
      ...gameState.cards.level3
    ];

    for (const card of possibleCards) {
      if (card.cost[gemType]) {
        const needed = card.cost[gemType] as number;
        const playerHas = player.gems[gemType] || 0;

        if (playerHas < needed) {
          // 如果这种宝石是玩家购买卡牌所需的，增加分数
          score += 0.5;

          // 如果只差一点就能购买该卡牌，额外加分
          if (needed - playerHas <= 2) {
            score += 1;
          }
        }
      }
    }

    return score;
  }

  /**
   * 检查玩家是否可以购买卡牌
   */
  private canPurchaseCard(card: Card, player: Player): boolean {
    // 计算玩家拥有的宝石卡牌数量
    const cardsByGemType = this.countCardsByGemType(player);

    for (const [gemType, cost] of Object.entries(card.cost)) {
      const typedGemType = gemType as GemType;
      // 玩家可用的宝石 = 拥有的宝石 + 相同类型的卡牌数量
      const available = (player.gems[typedGemType] || 0) + (cardsByGemType[typedGemType] || 0);
      const shortfall = (cost as number) - available;

      if (shortfall > 0) {
        // 检查是否有足够的金币补足不足
        if ((player.gems.gold || 0) < shortfall) {
          return false;
        }
      }
    }

    return true;
  }
} 