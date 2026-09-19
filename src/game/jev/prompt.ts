import { Card, GameState, GemType, Noble, Player } from '../interfaces/game.interface';
import { ActionClass, LegalAction, cardBonuses, countGems } from '../legal-actions';

export const CLASS_INSTRUCTIONS =
  'Choose the Splendor action class that best moves this player toward 15 points. Only the listed options are legal.';

export const ACTION_INSTRUCTIONS =
  'Choose the best legal Splendor action for this player. Only the listed options are legal. Prefer points, noble progress, and gems you can actually spend.';

export function buildCompactState(state: GameState, playerId: string): Record<string, unknown> {
  const player = state.players.get(playerId);
  const bonuses = player ? cardBonuses(player) : undefined;

  return {
    phase: player ? gamePhase(player) : 'early',
    pointsToWin: 15,
    pendingDiscard: state.pendingDiscard?.playerId === playerId
      ? state.pendingDiscard.gemsCount
      : null,
    you: player ? {
      points: player.points,
      gems: { ...player.gems },
      bonuses,
      reservedCount: player.reservedCards.length,
      cardCount: player.cards.length,
    } : null,
    bank: { ...state.gems },
    decks: {
      level1: state.cards.deck1.length,
      level2: state.cards.deck2.length,
      level3: state.cards.deck3.length,
    },
    visibleCards: [
      ...state.cards.level1,
      ...state.cards.level2,
      ...state.cards.level3,
    ].map((card) => compactCard(card)),
    reservedCards: (player?.reservedCards ?? []).map((card) => compactCard(card, true)),
    nobles: state.nobles.map((noble) => compactNoble(noble, bonuses)),
    opponents: Array.from(state.players.values())
      .filter((other) => other.id !== playerId)
      .map((other) => ({
        points: other.points,
        bonuses: cardBonuses(other),
        gemTotal: countGems(other.gems),
        reservedCount: other.reservedCards.length,
        cardCount: other.cards.length,
      })),
  };
}

export function buildClassCriteria(
  legal: LegalAction[],
  state: GameState,
  player: Player,
): Record<string, string> {
  const groups = new Map<ActionClass, LegalAction[]>();
  for (const item of legal) {
    const list = groups.get(item.actionClass) ?? [];
    list.push(item);
    groups.set(item.actionClass, list);
  }

  const criteria: Record<string, string> = {};
  for (const [actionClass, items] of groups) {
    criteria[actionClass] = classFact(actionClass, items, state, player);
  }
  return criteria;
}

export function buildActionCriteria(actions: LegalAction[]): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const action of actions) {
    criteria[action.key] = action.fact;
  }
  return criteria;
}

function classFact(
  actionClass: ActionClass,
  items: LegalAction[],
  state: GameState,
  player: Player,
): string {
  const score = `${player.points}/15 points`;
  switch (actionClass) {
    case 'PURCHASE_CARD':
      return `${items.length} cards you can buy now. ${score}. Buying scores immediately and can attract a noble.`;
    case 'RESERVE_CARD':
      return `${items.length} reserve options, ${player.reservedCards.length}/3 slots used, bank gold ${state.gems.gold}. ${score}.`;
    case 'TAKE_GEMS':
      return `${items.length} legal gem takes. You hold ${countGems(player.gems)} gems. ${score}.`;
    case 'DISCARD_GEMS':
      return `Must discard ${state.pendingDiscard?.gemsCount ?? 0} gems down to 10. ${items.length} ways.`;
    default:
      return `${items.length} options. ${score}.`;
  }
}

function compactCard(card: Card, reserved = false): Record<string, unknown> {
  return {
    id: card.id,
    level: card.level,
    points: card.points,
    gem: card.gem,
    cost: { ...card.cost },
    ...(reserved ? { reserved: true } : {}),
  };
}

function compactNoble(noble: Noble, bonuses?: Record<GemType, number>): Record<string, unknown> {
  const progress: Record<string, string> = {};
  for (const [gem, required] of Object.entries(noble.requirements)) {
    if (!required) continue;
    const have = bonuses?.[gem as GemType] || 0;
    progress[gem] = `${have}/${required}`;
  }
  return {
    id: noble.id,
    points: noble.points,
    requirements: { ...noble.requirements },
    progress,
  };
}

function gamePhase(player: Player): 'early' | 'mid' | 'late' {
  if (player.points >= 10 || player.cards.length >= 5) return 'late';
  if (player.cards.length >= 2) return 'mid';
  return 'early';
}
