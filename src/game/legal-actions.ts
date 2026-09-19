import { Card, GameAction, GameState, GemType, Player } from './interfaces/game.interface';
import { GameService } from './game.service';

export const COLOR_GEMS: GemType[] = ['diamond', 'sapphire', 'emerald', 'ruby', 'onyx'];
export const ALL_GEMS: GemType[] = [...COLOR_GEMS, 'gold'];

/** Jev Choice stays reliable at a few dozen options; keep each menu under this. */
export const MAX_CHOICE_OPTIONS = 24;
export const MAX_DISCARD_OPTIONS = 15;

export type ActionClass = 'TAKE_GEMS' | 'PURCHASE_CARD' | 'RESERVE_CARD' | 'DISCARD_GEMS';

export interface LegalAction {
  key: string;
  actionClass: ActionClass;
  action: GameAction;
  fact: string;
}

export function countGems(gems: Partial<Record<GemType, number>>): number {
  return Object.values(gems).reduce((sum, count) => sum + (count || 0), 0);
}

export function cardBonuses(player: Player): Record<GemType, number> {
  const bonuses = emptyGemRecord();
  for (const card of player.cards) {
    bonuses[card.gem] += 1;
  }
  return bonuses;
}

export function gemSignature(gems: Partial<Record<GemType, number>>): string {
  return ALL_GEMS
    .filter((gem) => (gems[gem] || 0) > 0)
    .map((gem) => `${gem}${gems[gem]}`)
    .join('_');
}

export function actionKey(action: GameAction): string {
  switch (action.type) {
    case 'TAKE_GEMS':
      return `take_${gemSignature(action.payload.gems)}`;
    case 'PURCHASE_CARD':
      return `purchase_${action.payload.cardId}`;
    case 'RESERVE_CARD':
      return action.payload.cardId === -1
        ? `reserve_deck_${action.payload.level ?? 0}`
        : `reserve_${action.payload.cardId}`;
    case 'DISCARD_GEMS':
      return `discard_${gemSignature(action.payload.gems)}`;
    default:
      return action.type.toLowerCase();
  }
}

/**
 * Enumerate actions GameService will accept for this player.
 * TAKE_GEMS is pruned (doubles + triples, or a scored cap near the 10-gem limit).
 * DISCARD_GEMS is the only class while pendingDiscard is set.
 */
export function listLegalActions(
  gameService: GameService,
  state: GameState,
  playerId: string,
): LegalAction[] {
  const player = state.players.get(playerId);
  if (!player || state.winner || state.currentTurn !== playerId) {
    return [];
  }

  if (state.pendingDiscard?.playerId === playerId) {
    return listDiscards(gameService, state, player);
  }

  return [
    ...listPurchases(gameService, state, player),
    ...listReserves(gameService, state, player),
    ...listTakes(gameService, state, player),
  ];
}

export function isApplicableAction(
  gameService: GameService,
  state: GameState,
  playerId: string,
  action: GameAction,
): boolean {
  const player = state.players.get(playerId);
  if (!player || state.currentTurn !== playerId || !action) return false;

  if (state.pendingDiscard?.playerId === playerId) {
    return action.type === 'DISCARD_GEMS'
      && gameService.canDiscardGems(player, action.payload.gems);
  }

  if (action.type === 'DISCARD_GEMS' || action.type === 'START_GAME' || action.type === 'RESTART_GAME') {
    return false;
  }

  return gameService.isActionLegal(state, action);
}

function listPurchases(gameService: GameService, state: GameState, player: Player): LegalAction[] {
  const board = [...state.cards.level1, ...state.cards.level2, ...state.cards.level3];
  const cards = [
    ...board.map((card) => ({ card, reserved: false })),
    ...player.reservedCards.map((card) => ({ card, reserved: true })),
  ];

  const actions: LegalAction[] = [];
  for (const { card, reserved } of cards) {
    if (!gameService.canPurchaseCard(card, player)) continue;
    const action: GameAction = {
      type: 'PURCHASE_CARD',
      playerId: player.id,
      payload: { cardId: card.id },
    };
    actions.push({
      key: actionKey(action),
      actionClass: 'PURCHASE_CARD',
      action,
      fact: `Buy #${card.id} L${card.level} ${card.gem} ${card.points}pt cost ${costText(card.cost)}${reserved ? ' from reserve' : ''}`,
    });
  }
  return actions.sort((a, b) => a.key.localeCompare(b.key));
}

function listReserves(gameService: GameService, state: GameState, player: Player): LegalAction[] {
  if (!gameService.canReserveCard(player)) return [];

  const actions: LegalAction[] = [];
  const board = [...state.cards.level1, ...state.cards.level2, ...state.cards.level3];
  for (const card of board) {
    const action: GameAction = {
      type: 'RESERVE_CARD',
      playerId: player.id,
      payload: { cardId: card.id },
    };
    actions.push({
      key: actionKey(action),
      actionClass: 'RESERVE_CARD',
      action,
      fact: `Reserve #${card.id} L${card.level} ${card.gem} ${card.points}pt cost ${costText(card.cost)}; gold bank ${state.gems.gold}`,
    });
  }

  const decks: Array<[number, Card[]]> = [
    [1, state.cards.deck1],
    [2, state.cards.deck2],
    [3, state.cards.deck3],
  ];
  for (const [level, deck] of decks) {
    if (deck.length === 0) continue;
    const action: GameAction = {
      type: 'RESERVE_CARD',
      playerId: player.id,
      payload: { cardId: -1, level },
    };
    actions.push({
      key: actionKey(action),
      actionClass: 'RESERVE_CARD',
      action,
      fact: `Reserve blind L${level} deck (${deck.length} left); gold bank ${state.gems.gold}`,
    });
  }

  return actions.sort((a, b) => a.key.localeCompare(b.key));
}

function listTakes(gameService: GameService, state: GameState, player: Player): LegalAction[] {
  const available = COLOR_GEMS.filter((color) => (state.gems[color] || 0) > 0);
  const candidates: LegalAction[] = [];

  for (const color of COLOR_GEMS) {
    pushTake(gameService, state, player, { [color]: 2 }, candidates);
  }
  for (let size = 1; size <= 3; size++) {
    for (const combo of combinations(available, size)) {
      const gems: Partial<Record<GemType, number>> = {};
      for (const color of combo) gems[color] = 1;
      pushTake(gameService, state, player, gems, candidates);
    }
  }

  return pruneTakes(candidates, player, state);
}

function listDiscards(gameService: GameService, state: GameState, player: Player): LegalAction[] {
  const need = state.pendingDiscard?.gemsCount ?? 0;
  if (need <= 0) return [];

  const demand = gemDemand(state, player);
  const ranked = enumerateExactDiscards(player, need)
    .filter((gems) => gameService.canDiscardGems(player, gems))
    .map((gems) => ({ gems, score: scoreDiscard(gems, demand) }))
    .sort((a, b) => b.score - a.score || gemSignature(a.gems).localeCompare(gemSignature(b.gems)))
    .slice(0, MAX_DISCARD_OPTIONS);

  return ranked.map(({ gems }) => {
    const action: GameAction = {
      type: 'DISCARD_GEMS',
      playerId: player.id,
      payload: { gems },
    };
    return {
      key: actionKey(action),
      actionClass: 'DISCARD_GEMS' as const,
      action,
      fact: `Discard ${gemSignature(gems).replace(/_/g, ' ')} to return to 10 gems`,
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

function pushTake(
  gameService: GameService,
  state: GameState,
  player: Player,
  gems: Partial<Record<GemType, number>>,
  into: LegalAction[],
): void {
  if (gems.gold) return;
  if (!gameService.canTakeGems(gems, state)) return;
  const action: GameAction = {
    type: 'TAKE_GEMS',
    playerId: player.id,
    payload: { gems },
  };
  const key = actionKey(action);
  if (into.some((item) => item.key === key)) return;
  const kind = takeKind(gems);
  into.push({
    key,
    actionClass: 'TAKE_GEMS',
    action,
    fact: `Take ${gemSignature(gems).replace(/_/g, ' ')} (${kind})`,
  });
}

/**
 * Full 3-different + all doubles is at most 15. Smaller takes are kept when fewer
 * than 3 colors exist, or when the player is close to the 10-gem discard line.
 */
function pruneTakes(actions: LegalAction[], player: Player, state: GameState): LegalAction[] {
  const colorsAvailable = COLOR_GEMS.filter((color) => (state.gems[color] || 0) > 0).length;
  const nearCap = countGems(player.gems) >= 8;
  const doubles = actions.filter(isDoubleTake);
  const triples = actions.filter(isTripleTake);

  if (!nearCap && colorsAvailable >= 3) {
    return sortByKey([...doubles, ...triples]);
  }

  const must = [...doubles];
  if (nearCap) must.push(...actions.filter(isSingleTake));
  const mustKeys = new Set(must.map((action) => action.key));
  const demand = gemDemand(state, player);
  const rest = actions
    .filter((action) => !mustKeys.has(action.key))
    .sort((a, b) => scoreTake(b, demand) - scoreTake(a, demand) || a.key.localeCompare(b.key));

  return sortByKey([...must, ...rest].slice(0, MAX_CHOICE_OPTIONS));
}

function enumerateExactDiscards(player: Player, count: number): Partial<Record<GemType, number>>[] {
  const results: Partial<Record<GemType, number>>[] = [];
  const current: Partial<Record<GemType, number>> = {};

  const walk = (index: number, remaining: number) => {
    if (results.length >= 4000) return;
    if (remaining === 0) {
      results.push({ ...current });
      return;
    }
    if (index >= ALL_GEMS.length) return;

    const color = ALL_GEMS[index];
    const max = Math.min(player.gems[color] || 0, remaining);
    for (let amount = 0; amount <= max; amount++) {
      if (amount > 0) current[color] = amount;
      else delete current[color];
      walk(index + 1, remaining - amount);
    }
    delete current[color];
  };

  walk(0, count);
  return results;
}

function gemDemand(state: GameState, player: Player): Record<GemType, number> {
  const demand = emptyGemRecord();
  const bonuses = cardBonuses(player);
  const cards = [
    ...state.cards.level1,
    ...state.cards.level2,
    ...state.cards.level3,
    ...player.reservedCards,
  ];

  for (const card of cards) {
    let shortfall = 0;
    const missing: Partial<Record<GemType, number>> = {};
    for (const [gem, required] of Object.entries(card.cost)) {
      const type = gem as GemType;
      const have = (bonuses[type] || 0) + (player.gems[type] || 0);
      const miss = Math.max(0, (required || 0) - have);
      if (miss > 0) {
        missing[type] = miss;
        shortfall += miss;
      }
    }
    shortfall = Math.max(0, shortfall - (player.gems.gold || 0));
    if (shortfall <= 0 || shortfall > 4) continue;
    const weight = (1 + card.points) / shortfall;
    for (const [gem, miss] of Object.entries(missing)) {
      demand[gem as GemType] += (miss || 0) * weight;
    }
  }

  for (const noble of state.nobles) {
    for (const [gem, required] of Object.entries(noble.requirements)) {
      const type = gem as GemType;
      const miss = Math.max(0, (required || 0) - (bonuses[type] || 0));
      if (miss > 0 && miss <= 3) demand[type] += miss;
    }
  }

  return demand;
}

function scoreTake(action: LegalAction, demand: Record<GemType, number>): number {
  if (action.action.type !== 'TAKE_GEMS') return 0;
  let score = 0;
  let count = 0;
  for (const [gem, amount] of Object.entries(action.action.payload.gems)) {
    const n = amount || 0;
    count += n;
    score += n * (demand[gem as GemType] || 0);
  }
  return score + count * 0.2;
}

function scoreDiscard(gems: Partial<Record<GemType, number>>, demand: Record<GemType, number>): number {
  let score = 0;
  for (const [gem, amount] of Object.entries(gems)) {
    const n = amount || 0;
    const keepValue = (demand[gem as GemType] || 0) + (gem === 'gold' ? 2 : 0);
    score -= n * (1 + keepValue);
  }
  return score;
}

function takeKind(gems: Partial<Record<GemType, number>>): string {
  const counts = Object.values(gems).filter((amount) => (amount || 0) > 0) as number[];
  const max = Math.max(...counts);
  if (max === 2) return 'double';
  if (counts.length === 3) return 'three different';
  if (counts.length === 2) return 'two different';
  return 'single';
}

function takeAmounts(action: LegalAction): number[] {
  if (action.action.type !== 'TAKE_GEMS') return [];
  return Object.values(action.action.payload.gems).filter((amount): amount is number => !!amount && amount > 0);
}

function isDoubleTake(action: LegalAction): boolean {
  const counts = takeAmounts(action);
  return counts.length === 1 && counts[0] === 2;
}

function isTripleTake(action: LegalAction): boolean {
  const counts = takeAmounts(action);
  return counts.length === 3 && counts.every((amount) => amount === 1);
}

function isSingleTake(action: LegalAction): boolean {
  const counts = takeAmounts(action);
  return counts.length === 1 && counts[0] === 1;
}

function sortByKey(actions: LegalAction[]): LegalAction[] {
  return [...actions].sort((a, b) => a.key.localeCompare(b.key));
}

function costText(cost: Card['cost']): string {
  const parts = ALL_GEMS
    .filter((gem) => (cost[gem] || 0) > 0)
    .map((gem) => `${gem[0]}${cost[gem]}`);
  return parts.join('') || 'free';
}

function emptyGemRecord(): Record<GemType, number> {
  return { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0 };
}

function combinations<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (acc.length === size) {
      out.push([...acc]);
      return;
    }
    for (let index = start; index < items.length; index++) {
      acc.push(items[index]);
      walk(index + 1, acc);
      acc.pop();
    }
  };
  if (size > 0) walk(0, []);
  return out;
}
