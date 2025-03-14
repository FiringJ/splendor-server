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

    // ===== 游戏阶段判断 =====
    const isEarlyGame = player.cards.length < 2;
    const isMidGame = player.cards.length >= 2 && player.cards.length < 5;
    const isLateGame = player.points >= 10 || player.cards.length >= 5;
    this.logger.debug(`游戏阶段: ${isEarlyGame ? '早期' : isMidGame ? '中期' : '后期'}`);

    // ===== 获取基本游戏信息 =====
    const availableNobles = this.findAvailableNobles(gameState);
    const possibleCards = [
      ...gameState.cards.level1,
      ...gameState.cards.level2,
      ...gameState.cards.level3,
      ...player.reservedCards
    ];

    // ===== 策略1: 检查是否可以购买贵族所需的关键卡牌 =====
    const nobleTargets = this.analyzeNobleStrategy(gameState, player, availableNobles);
    if (nobleTargets.length > 0) {
      // 找出能够直接购买的贵族目标卡牌
      const purchasableNobleCards = possibleCards.filter(card =>
        this.gameService.canPurchaseCard(card, player) &&
        nobleTargets.some(target => target.neededGems.includes(card.gem))
      );

      if (purchasableNobleCards.length > 0) {
        // 选择最有价值的卡牌购买（优先考虑优惠最大/积分最高的卡牌）
        const bestNobleCard = purchasableNobleCards.reduce((best, card) => {
          const score = this.evaluateCardForNobleStrategy(card, nobleTargets);
          return score > best.score ? { card, score } : best;
        }, { card: purchasableNobleCards[0], score: -Infinity });

        this.logger.debug(`选择购买贵族目标卡牌: ${bestNobleCard.card.id}, 评分: ${bestNobleCard.score}`);
        return {
          type: 'PURCHASE_CARD',
          playerId: player.id,
          payload: {
            cardId: bestNobleCard.card.id
          }
        };
      }
    }

    // ===== 策略2: 检查是否可以购买任何高价值卡牌 =====
    const purchasableCards = possibleCards.filter(card =>
      this.gameService.canPurchaseCard(card, player)
    );

    if (purchasableCards.length > 0) {
      // 根据当前游戏状态评估每张卡的价值
      const scoredCards = purchasableCards.map(card => ({
        card,
        score: this.evaluateCard(card, player, gameState)
      }));

      // 按得分排序，选择得分最高的卡牌
      scoredCards.sort((a, b) => b.score - a.score);
      this.logger.debug(`最佳购买卡牌评分: ${scoredCards[0].score}, ID: ${scoredCards[0].card.id}`);

      return {
        type: 'PURCHASE_CARD',
        playerId: player.id,
        payload: {
          cardId: scoredCards[0].card.id
        }
      };
    }

    // ===== 评估选择宝石的价值 =====
    const selectedGems = this.selectGemsStrategically(gameState, player, nobleTargets);
    const gemSelectionValue = this.evaluateGemSelectionValue(gameState, player, nobleTargets, selectedGems);
    this.logger.debug(`选择宝石的评估价值: ${gemSelectionValue}`);

    // ===== 策略3: 考虑预定高价值卡牌 vs 选择宝石 =====
    if (player.reservedCards.length < 3) {
      // 首先计算玩家距离获取各个贵族还需要哪些宝石卡
      const nobleStrategies = this.getNobleStrategies(gameState, player);

      // 根据玩家当前资源和潜在价值评估可见卡牌
      const availableCards = [
        ...gameState.cards.level3,  // 优先考虑高等级卡牌
        ...gameState.cards.level2,
        ...gameState.cards.level1
      ].filter(card => !player.reservedCards.some(rc => rc.id === card.id));

      if (availableCards.length > 0) {
        // 评估每张卡的预留价值
        const scoredReservableCards = availableCards.map(card => ({
          card,
          score: this.evaluateCardForReservation(card, player, nobleStrategies, gameState)
        }));

        // 按得分排序，选择得分最高的卡牌
        scoredReservableCards.sort((a, b) => b.score - a.score);
        const bestReservation = scoredReservableCards[0];

        this.logger.debug(`最佳预留卡牌评分: ${bestReservation.score}, ID: ${bestReservation.card.id}, 等级: ${bestReservation.card.level}`);

        // 设置预留阈值，根据游戏阶段和已预留卡牌数量调整
        let reserveThreshold = isEarlyGame ? 8 : isMidGame ? 5 : 3;
        // 已有预留卡越多，预留新卡的阈值越高
        reserveThreshold += player.reservedCards.length * 1.5;

        this.logger.debug(`预留卡牌阈值: ${reserveThreshold}, 已预留卡牌数: ${player.reservedCards.length}`);

        // 比较预留卡牌和选择宝石的价值
        if (bestReservation.score > gemSelectionValue && bestReservation.score > reserveThreshold) {
          this.logger.debug(`决定预留特定卡牌: ${bestReservation.card.id}, 预留评分(${bestReservation.score}) > 宝石评分(${gemSelectionValue})`);
          return {
            type: 'RESERVE_CARD',
            playerId: player.id,
            payload: {
              cardId: bestReservation.card.id
            }
          };
        }
        // 考虑从牌堆预留，条件更严格
        else if (
          gameState.cards.deck3.length > 0 &&
          player.gems.gold < 3 &&
          !isEarlyGame &&
          gemSelectionValue < 4 &&
          player.reservedCards.length < 2  // 最多只从牌堆预留1张，保留灵活性
        ) {
          this.logger.debug(`决定从牌堆预留卡牌, 宝石评分较低: ${gemSelectionValue}`);
          return {
            type: 'RESERVE_CARD',
            playerId: player.id,
            payload: {
              cardId: -1,
              level: 3
            }
          };
        }
        // 其他情况选择宝石
        else {
          this.logger.debug(`选择拿取宝石而非预留卡牌, 宝石评分(${gemSelectionValue}) >= 预留评分(${bestReservation.score}) 或 预留评分低于阈值(${reserveThreshold})`);
        }
      }
    }

    // ===== 策略4: 选择宝石 =====
    if (Object.keys(selectedGems).length > 0) {
      this.logger.debug(`执行选择宝石策略: ${JSON.stringify(selectedGems)}`);
      return {
        type: 'TAKE_GEMS',
        playerId: player.id,
        payload: {
          gems: selectedGems
        }
      };
    }

    // 如果其他操作都不可行，返回默认的宝石选择策略
    this.logger.debug(`执行默认宝石选择策略`);
    return this.getDefaultGemSelection(gameState, player);
  }

  /**
   * 分析哪些贵族是玩家可以追求的目标
   */
  private analyzeNobleStrategy(gameState: GameState, player: Player, availableNobles: Noble[]): NobleTarget[] {
    // 计算玩家当前拥有的宝石卡数量
    const cardsByGemType = this.countCardsByGemType(player);

    return availableNobles.map(noble => {
      // 计算还需要获得哪些类型的宝石卡
      const neededGems: GemType[] = [];
      let totalNeeded = 0;

      Object.entries(noble.requirements).forEach(([gemType, required]) => {
        const playerHas = cardsByGemType[gemType as GemType] || 0;
        const stillNeeded = Math.max(0, (required || 0) - playerHas);

        if (stillNeeded > 0) {
          // 对于每个缺少的卡，添加相应的宝石类型
          for (let i = 0; i < stillNeeded; i++) {
            neededGems.push(gemType as GemType);
          }
          totalNeeded += stillNeeded;
        }
      });

      // 计算完成度百分比
      const totalRequired = Object.values(noble.requirements).reduce((sum, count) => sum + (count || 0), 0);
      const completionPercentage = (totalRequired - totalNeeded) / totalRequired;

      return {
        noble,
        neededGems,
        totalNeeded,
        completionPercentage
      };
    }).filter(target => target.completionPercentage > 0.3) // 只关注那些已经至少完成30%的贵族
      .sort((a, b) => b.completionPercentage - a.completionPercentage); // 按完成度排序
  }

  /**
   * 评估一张卡牌对于贵族策略的价值
   */
  private evaluateCardForNobleStrategy(card: Card, nobleTargets: NobleTarget[]): number {
    let score = card.points * 2; // 基础分数是卡牌的胜利点数

    // 对于每个贵族目标，如果卡牌提供的宝石符合需求，增加分数
    for (const target of nobleTargets) {
      const neededCount = target.neededGems.filter(gem => gem === card.gem).length;
      if (neededCount > 0) {
        // 卡牌对达成贵族的贡献度，越接近完成的贵族权重越高
        score += neededCount * 3 * target.completionPercentage;
      }
    }

    return score;
  }

  /**
   * 根据贵族需求战略性地选择宝石
   */
  private selectGemsStrategically(gameState: GameState, player: Player, nobleTargets: NobleTarget[]): Partial<Record<GemType, number>> {
    const MAX_GEMS = 10;
    const currentGemCount = this.getCurrentGemCount(player);

    if (currentGemCount >= MAX_GEMS) {
      return {}; // 宝石已满，不能再拿
    }

    // 可拿宝石的数量限制
    const maxGemsToTake = Math.min(3, MAX_GEMS - currentGemCount);

    // 统计游戏中剩余的宝石
    const availableGems: Partial<Record<GemType, number>> = { ...gameState.gems };

    // 根据贵族目标计算每种宝石的需求优先级
    const gemPriorities: Record<GemType, number> = {
      diamond: 0,
      sapphire: 0,
      emerald: 0,
      ruby: 0,
      onyx: 0,
      gold: 0 // 黄金不能直接获取
    };

    // 基于贵族目标调整宝石优先级
    if (nobleTargets.length > 0) {
      for (const target of nobleTargets) {
        // 统计每种宝石在当前贵族目标中的需求数量
        const gemCounts: Record<string, number> = {};
        for (const gem of target.neededGems) {
          gemCounts[gem] = (gemCounts[gem] || 0) + 1;
        }

        // 根据需求和完成度调整优先级
        for (const [gem, count] of Object.entries(gemCounts)) {
          gemPriorities[gem as GemType] += count * (1 + target.completionPercentage);
        }
      }
    }

    // 考虑可购买卡牌所需的宝石
    const purchasableSoon = this.findAlmostPurchasableCards(gameState, player);
    for (const { card, missing } of purchasableSoon) {
      for (const [gemType, count] of Object.entries(missing)) {
        if (count > 0) {
          gemPriorities[gemType as GemType] += count * (1 + card.points * 0.5);
        }
      }
    }

    // 尝试获取两个同色宝石
    if (maxGemsToTake >= 2) {
      // 找出可以拿2个的宝石类型
      const gemTypesForDoublePickup = (Object.keys(availableGems) as GemType[])
        .filter(gemType => gemType !== 'gold' && (availableGems[gemType] || 0) >= 4)
        .sort((a, b) => gemPriorities[b] - gemPriorities[a]);

      if (gemTypesForDoublePickup.length > 0 && gemPriorities[gemTypesForDoublePickup[0]] > 1) {
        return { [gemTypesForDoublePickup[0]]: 2 };
      }
    }

    // 尝试获取三种不同的宝石
    if (maxGemsToTake >= 3) {
      // 按优先级排序宝石类型
      const availableGemTypes = (Object.keys(availableGems) as GemType[])
        .filter(gemType => gemType !== 'gold' && (availableGems[gemType] || 0) > 0)
        .sort((a, b) => gemPriorities[b] - gemPriorities[a]);

      if (availableGemTypes.length >= 3) {
        const selectedGems: Partial<Record<GemType, number>> = {};
        for (let i = 0; i < 3; i++) {
          selectedGems[availableGemTypes[i]] = 1;
        }
        return selectedGems;
      }
    }

    // 如果不能获取3种不同的宝石，就拿尽可能多的高优先级宝石
    const availableGemTypes = (Object.keys(availableGems) as GemType[])
      .filter(gemType => gemType !== 'gold' && (availableGems[gemType] || 0) > 0)
      .sort((a, b) => gemPriorities[b] - gemPriorities[a]);

    if (availableGemTypes.length > 0) {
      const selectedGems: Partial<Record<GemType, number>> = {};
      for (let i = 0; i < Math.min(maxGemsToTake, availableGemTypes.length); i++) {
        selectedGems[availableGemTypes[i]] = 1;
      }
      return selectedGems;
    }

    return {};
  }

  /**
   * 查找那些再获得几个宝石就能购买的卡牌
   */
  private findAlmostPurchasableCards(gameState: GameState, player: Player): { card: Card; missing: Record<GemType, number> }[] {
    const THRESHOLD = 3; // 最多还差3个宝石就认为是"即将可购买"
    const visibleCards = [
      ...gameState.cards.level1,
      ...gameState.cards.level2,
      ...gameState.cards.level3,
      ...player.reservedCards
    ];

    const result: { card: Card; missing: Record<GemType, number> }[] = [];

    // 计算玩家拥有的资源
    const permanentGems = this.countCardsByGemType(player);

    for (const card of visibleCards) {
      const missing: Record<GemType, number> = {
        diamond: 0,
        sapphire: 0,
        emerald: 0,
        ruby: 0,
        onyx: 0,
        gold: 0
      };

      let totalMissing = 0;

      // 计算每种宝石还差多少
      for (const [gemType, required] of Object.entries(card.cost)) {
        const type = gemType as GemType;
        const permanent = permanentGems[type] || 0;
        const gems = player.gems[type] || 0;
        const totalAvailable = permanent + gems;

        if ((required || 0) > totalAvailable) {
          const missingAmount = (required || 0) - totalAvailable;
          missing[type] = missingAmount;
          totalMissing += missingAmount;
        }
      }

      // 考虑黄金的使用
      const availableGold = player.gems.gold || 0;
      if (totalMissing <= availableGold + THRESHOLD) {
        result.push({ card, missing });
      }
    }

    // 根据实际缺少的宝石数量和卡牌点数排序
    result.sort((a, b) => {
      const missingA = Object.values(a.missing).reduce((sum, count) => sum + count, 0);
      const missingB = Object.values(b.missing).reduce((sum, count) => sum + count, 0);

      // 首先按照缺少的宝石数量排序
      if (missingA !== missingB) {
        return missingA - missingB;
      }

      // 如果缺少的宝石数量相同，按照点数排序
      return b.card.points - a.card.points;
    });

    return result;
  }

  /**
   * 获取针对每个贵族的获取策略
   */
  private getNobleStrategies(gameState: GameState, player: Player): NobleStrategy[] {
    // 计算玩家拥有的宝石卡
    const cardsByGemType = this.countCardsByGemType(player);

    return gameState.nobles.map(noble => {
      const gemCounts: Record<GemType, { required: number; have: number }> = {
        diamond: { required: 0, have: cardsByGemType.diamond || 0 },
        sapphire: { required: 0, have: cardsByGemType.sapphire || 0 },
        emerald: { required: 0, have: cardsByGemType.emerald || 0 },
        ruby: { required: 0, have: cardsByGemType.ruby || 0 },
        onyx: { required: 0, have: cardsByGemType.onyx || 0 },
        gold: { required: 0, have: 0 } // 黄金卡不存在
      };

      let totalRequired = 0;
      let totalHave = 0;

      // 统计要求和已有的宝石卡
      for (const [gemType, count] of Object.entries(noble.requirements)) {
        if (!count) continue;

        const type = gemType as GemType;
        gemCounts[type].required = count;
        totalRequired += count;
        totalHave += Math.min(count, gemCounts[type].have);
      }

      const completion = totalHave / totalRequired;
      return {
        noble,
        gemCounts,
        completion,
        priority: completion > 0.5 ? "high" : completion > 0.3 ? "medium" : "low"
      };
    });
  }

  /**
   * 评估一张卡牌对玩家的整体价值
   */
  private evaluateCard(card: Card, player: Player, gameState: GameState): number {
    // 基础分：卡牌胜利点数，比重最高
    let score = card.points * 4;

    // 考虑卡牌提供的宝石类型的稀缺性
    const cardsByGem = this.countCardsByGemType(player);
    const cardGemScore = 3 - Math.min(3, cardsByGem[card.gem] || 0);
    score += cardGemScore;

    // 考虑对贵族的贡献
    const nobles = gameState.nobles;
    for (const noble of nobles) {
      for (const [gemType, required] of Object.entries(noble.requirements)) {
        if (!required) continue;
        if (gemType === card.gem) {
          const currentCount = (cardsByGem[gemType as GemType] || 0);
          // 如果这张卡能让我们更接近贵族要求
          if (currentCount < required) {
            // 接近贵族的完成对分数的贡献
            const contribution = (currentCount + 1) / required;
            score += noble.points * contribution * 0.7;
          }
        }
      }
    }

    // 卡牌的购买成本也是考虑因素，成本越低越好
    const totalCost = Object.values(card.cost).reduce((sum, count) => sum + (count || 0), 0);
    score += Math.max(0, 10 - totalCost) * 0.3;

    // 如果是预留卡，稍微提高优先级
    if (player.reservedCards.some(rc => rc.id === card.id)) {
      score += 1;
    }

    return score;
  }

  /**
   * 评估预留一张卡牌的价值
   */
  private evaluateCardForReservation(card: Card, player: Player, nobleStrategies: NobleStrategy[], gameState: GameState): number {
    // 基础分：卡牌胜利点数
    let score = card.points * 2;

    // 游戏阶段判断
    const isEarlyGame = player.cards.length < 2;
    const isMidGame = player.cards.length >= 2 && player.cards.length < 5;
    const isLateGame = player.points >= 10;

    // 在游戏初期大幅降低预留评分，鼓励先拿宝石
    if (isEarlyGame) {
      score -= 3;
      this.logger.debug(`游戏初期，降低预留评分: -3`);
    }

    // 考虑游戏后期更偏向于高点数卡
    if (isLateGame) {
      score += card.points * 0.5; // 后期更看重点数
      this.logger.debug(`游戏后期，增加高点数卡评分: +${card.points * 0.5}`);
    }

    // 如果是稀缺的宝石类型，增加分数
    const cardsByGemType = this.countCardsByGemType(player);
    const scarcityBonus = 3 - Math.min(3, cardsByGemType[card.gem] || 0);
    score += scarcityBonus;

    if (scarcityBonus > 0) {
      this.logger.debug(`稀缺宝石类型(${card.gem})加分: +${scarcityBonus}`);
    }

    // 对贵族策略的贡献
    let nobleContribution = 0;
    for (const strategy of nobleStrategies) {
      if (strategy.priority === "high" || strategy.priority === "medium") {
        if (strategy.gemCounts[card.gem].required > strategy.gemCounts[card.gem].have) {
          // 如果这张卡有助于获得高优先级的贵族
          const strategyBonus = 2 * (strategy.priority === "high" ? 1.5 : 1);
          nobleContribution += strategyBonus;
          this.logger.debug(`贵族策略贡献(${strategy.noble.name})加分: +${strategyBonus}`);
        }
      }
    }
    score += nobleContribution;

    // 如果这张卡能够阻碍对手获得贵族，增加分数 (简单估计其他玩家的牌)
    let blockingScore = 0;
    const otherPlayers = Array.from(gameState.players.values()).filter(p => p.id !== player.id);
    for (const otherPlayer of otherPlayers) {
      const otherCardsByGem = this.countCardsByGemType(otherPlayer);

      for (const noble of gameState.nobles) {
        let isCloseToNoble = true;
        let isCardCritical = false;

        for (const [gemType, required] of Object.entries(noble.requirements)) {
          if (!required) continue;

          const otherPlayerHas = otherCardsByGem[gemType as GemType] || 0;
          // 检查对手是否接近获得这个贵族
          if (otherPlayerHas < required - 1) {
            isCloseToNoble = false;
            break;
          }

          // 检查这张卡是否是对手获得贵族的关键
          if (card.gem === gemType as GemType && otherPlayerHas === required - 1) {
            isCardCritical = true;
          }
        }

        if (isCloseToNoble && isCardCritical) {
          blockingScore += 3; // 如果这张卡可以阻碍对手获得贵族，大幅增加分数
          this.logger.debug(`阻碍对手获得贵族加分: +3`);
        }
      }
    }
    score += blockingScore;

    // 考虑卡牌的获取难度，如果很快就能获取，那么预留的价值较低
    const { missingSoon, expectedTurns } = this.estimateCardAcquisition(card, player, gameState);

    if (missingSoon) {
      // 如果很快就能获取，预留价值下降
      const acquisitionPenalty = Math.max(0, 5 - expectedTurns);
      score -= acquisitionPenalty;
      this.logger.debug(`卡牌易于快速获取，减分: -${acquisitionPenalty}`);
    } else if (expectedTurns > 3) {
      // 如果短期内无法获取，且卡牌价值高，预留价值增加
      const acquisitionBonus = Math.min(3, card.points);
      score += acquisitionBonus;
      this.logger.debug(`卡牌获取困难，增加预留价值: +${acquisitionBonus}`);
    }

    // 如果预留会导致超过宝石上限，降低分数
    const currentGemCount = this.getCurrentGemCount(player);
    if (currentGemCount >= 9) { // 算上黄金就会达到10个
      score -= 2;
      this.logger.debug(`预留会导致宝石超限，减分: -2`);
    }

    this.logger.debug(`卡牌ID: ${card.id}, 等级: ${card.level}, 最终预留评分: ${score}`);
    return score;
  }

  /**
   * 估计获取一张卡牌需要的回合数
   */
  private estimateCardAcquisition(card: Card, player: Player, gameState: GameState): { missingSoon: boolean; expectedTurns: number } {
    // 计算永久宝石
    const permanentGems = this.countCardsByGemType(player);
    let missingGems: Record<string, number> = {};
    let totalMissing = 0;

    // 计算缺少的宝石
    for (const [gemType, required] of Object.entries(card.cost)) {
      if (!required) continue;

      const type = gemType as GemType;
      const permanent = permanentGems[type] || 0;
      const gems = player.gems[type] || 0;
      const totalAvailable = permanent + gems;

      if (required > totalAvailable) {
        const missing = required - totalAvailable;
        missingGems[type] = missing;
        totalMissing += missing;
      }
    }

    // 考虑黄金的使用
    const availableGold = player.gems.gold || 0;
    totalMissing = Math.max(0, totalMissing - availableGold);

    // 估计每回合能获取的宝石数量（简化版，平均每回合2个宝石）
    const turnsNeeded = Math.ceil(totalMissing / 2);

    return {
      missingSoon: turnsNeeded <= 2, // 2回合内可获取
      expectedTurns: turnsNeeded
    };
  }

  /**
   * 获取默认的宝石选择策略
   */
  private getDefaultGemSelection(gameState: GameState, player: Player): GameAction {
    // 简单地选择3种最多的宝石
    const availableGems = (Object.keys(gameState.gems) as GemType[])
      .filter(gemType => gemType !== 'gold' && (gameState.gems[gemType] || 0) > 0)
      .sort((a, b) => (gameState.gems[b] || 0) - (gameState.gems[a] || 0));

    const selectedGems: Partial<Record<GemType, number>> = {};
    for (let i = 0; i < Math.min(3, availableGems.length); i++) {
      selectedGems[availableGems[i]] = 1;
    }

    return {
      type: 'TAKE_GEMS',
      playerId: player.id,
      payload: {
        gems: selectedGems
      }
    };
  }

  /**
   * 辅助方法：获取可用的贵族
   */
  private findAvailableNobles(gameState: GameState): Noble[] {
    return gameState.nobles;
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
   * 获取玩家当前的宝石总数
   */
  private getCurrentGemCount(player: Player): number {
    return Object.values(player.gems).reduce((sum, count) => sum + (count || 0), 0);
  }

  /**
   * 评估选择宝石的价值
   * 考虑多种因素来确定当前选择宝石的价值有多高
   */
  private evaluateGemSelectionValue(
    gameState: GameState,
    player: Player,
    nobleTargets: NobleTarget[],
    selectedGems: Partial<Record<GemType, number>>
  ): number {
    // 基础分值
    let value = 5; // 选择宝石的基础价值

    // 游戏阶段因素
    const isEarlyGame = player.cards.length < 2;
    const isMidGame = player.cards.length >= 2 && player.cards.length < 5;

    // 早期阶段选择宝石更有价值
    if (isEarlyGame) {
      value += 3;
      this.logger.debug(`游戏早期，选择宝石价值增加: +3`);
    }

    // 宝石数量因素
    const gemCount = Object.values(selectedGems).reduce((sum, count) => sum + count, 0);
    value += gemCount * 0.8; // 能拿到的宝石越多越好
    this.logger.debug(`可选宝石数量(${gemCount})加分: +${gemCount * 0.8}`);

    // 考虑宝石对购买预留卡的价值
    if (player.reservedCards.length > 0) {
      let reservedCardBenefit = 0;

      for (const card of player.reservedCards) {
        // 计算这些宝石能减少购买预留卡所需的回合数
        let benefitForCard = 0;
        for (const [gemType, count] of Object.entries(selectedGems)) {
          const required = card.cost[gemType as GemType] || 0;
          const playerHas = player.gems[gemType as GemType] || 0;

          if (required > playerHas) {
            // 如果这种宝石是预留卡所需的
            benefitForCard += Math.min(count, required - playerHas) * 1.2;
          }
        }
        reservedCardBenefit = Math.max(reservedCardBenefit, benefitForCard);
      }

      value += reservedCardBenefit;
      this.logger.debug(`宝石对购买预留卡的价值加分: +${reservedCardBenefit}`);
    }

    // 考虑宝石对接近贵族的价值
    if (nobleTargets.length > 0) {
      let nobleBenefit = 0;

      for (const target of nobleTargets) {
        // 找出购买贵族所需的关键卡牌，看这些宝石是否有助于购买
        const cardsToNoble = [
          ...gameState.cards.level1,
          ...gameState.cards.level2,
          ...gameState.cards.level3
        ].filter(card => target.neededGems.includes(card.gem));

        for (const card of cardsToNoble) {
          let benefitForCard = 0;
          for (const [gemType, count] of Object.entries(selectedGems)) {
            const required = card.cost[gemType as GemType] || 0;
            const playerHas = player.gems[gemType as GemType] || 0;

            if (required > playerHas) {
              // 如果这种宝石是贵族卡所需的
              benefitForCard += Math.min(count, required - playerHas) * target.completionPercentage;
            }
          }
          nobleBenefit += benefitForCard;
        }
      }

      value += nobleBenefit;
      this.logger.debug(`宝石对接近贵族的价值加分: +${nobleBenefit}`);
    }

    // 考虑宝石的稀缺性
    for (const [gemType, count] of Object.entries(selectedGems)) {
      const availableInGame = gameState.gems[gemType as GemType] || 0;
      // 剩余量少的宝石价值更高
      const scarcityBonus = 4 - Math.min(4, availableInGame - count);
      if (scarcityBonus > 0) {
        value += scarcityBonus * 0.4;
        this.logger.debug(`宝石稀缺性(${gemType})加分: +${scarcityBonus * 0.4}`);
      }
    }

    // 如果玩家宝石接近上限，价值降低
    const currentGemCount = this.getCurrentGemCount(player);
    const gemCapacityPenalty = Math.max(0, currentGemCount + gemCount - 8) * 2;
    if (gemCapacityPenalty > 0) {
      value -= gemCapacityPenalty;
      this.logger.debug(`宝石接近上限惩罚: -${gemCapacityPenalty}`);
    }

    return value;
  }
}

// 辅助类型：贵族获取目标
interface NobleTarget {
  noble: Noble;
  neededGems: GemType[];  // 所需要的宝石类型
  totalNeeded: number;    // 总共还需要多少卡
  completionPercentage: number; // 完成度百分比
}

// 辅助类型：针对每个贵族的策略
interface NobleStrategy {
  noble: Noble;
  gemCounts: Record<GemType, { required: number; have: number }>;
  completion: number; // 完成度
  priority: "high" | "medium" | "low"; // 优先级
} 
