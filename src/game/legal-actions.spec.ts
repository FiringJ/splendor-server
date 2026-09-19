import { Card, GameState, Gems, Noble, Player } from './interfaces/game.interface';
import { GameService } from './game.service';
import {
  MAX_CHOICE_OPTIONS,
  MAX_DISCARD_OPTIONS,
  actionKey,
  isApplicableAction,
  listLegalActions,
} from './legal-actions';

function gems(partial: Partial<Gems> = {}): Gems {
  return {
    diamond: 0,
    sapphire: 0,
    emerald: 0,
    ruby: 0,
    onyx: 0,
    gold: 0,
    ...partial,
  };
}

function card(partial: Partial<Card> & Pick<Card, 'id' | 'gem'>): Card {
  return {
    level: 1,
    points: 0,
    cost: {},
    spritePosition: { x: 0, y: 0 },
    ...partial,
  };
}

function player(id: string, partial: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    gems: gems(),
    cards: [],
    reservedCards: [],
    nobles: [],
    points: 0,
    isAI: true,
    ...partial,
  };
}

function state(players: Player[], partial: Partial<GameState> = {}): GameState {
  return {
    players: new Map(players.map((item) => [item.id, item])),
    currentTurn: players[0].id,
    gems: gems({ diamond: 4, sapphire: 4, emerald: 4, ruby: 4, onyx: 4, gold: 5 }),
    cards: {
      level1: [],
      level2: [],
      level3: [],
      deck1: [],
      deck2: [],
      deck3: [],
    },
    nobles: [],
    winner: null,
    lastRound: false,
    lastRoundStartPlayer: null,
    actions: [],
    ...partial,
  };
}

describe('listLegalActions', () => {
  const gameService = new GameService();

  function listed(game: GameState, playerId = 'p1') {
    return listLegalActions(gameService, game, playerId);
  }

  it('lists doubles and three-color takes, not gold or partial takes', () => {
    const game = state([player('p1')]);
    const actions = listed(game);
    const keys = actions.map((item) => item.key);

    expect(actions.every((item) => item.actionClass === 'TAKE_GEMS')).toBe(true);
    expect(keys).toContain('take_diamond2');
    expect(keys).toContain('take_diamond1_sapphire1_emerald1');
    expect(keys).not.toContain('take_diamond1');
    expect(keys).not.toContain('take_diamond1_sapphire1');
    expect(actions).toHaveLength(15);
    expect(actions.length).toBeLessThanOrEqual(MAX_CHOICE_OPTIONS);

    for (const item of actions) {
      expect(item.fact.length).toBeGreaterThan(0);
      expect(item.key).toBe(actionKey(item.action));
      expect(item.action.type === 'TAKE_GEMS' && item.action.payload.gems.gold).toBeFalsy();
      expect(isApplicableAction(gameService, game, 'p1', item.action)).toBe(true);
    }
  });

  it('refuses a double take unless the bank has at least four', () => {
    const game = state([player('p1')], {
      gems: gems({ diamond: 3, sapphire: 4, emerald: 4, ruby: 4, onyx: 4, gold: 5 }),
    });
    const keys = listed(game).map((item) => item.key);

    expect(keys).not.toContain('take_diamond2');
    expect(keys).toContain('take_sapphire2');
    expect(keys).toContain('take_diamond1_sapphire1_emerald1');
  });

  it('includes affordable purchases, including gold as a wildcard, and skips the rest', () => {
    const cheap = card({ id: 1, gem: 'onyx', cost: { emerald: 1 }, points: 1 });
    const withGold = card({ id: 2, gem: 'ruby', level: 2, cost: { diamond: 2 }, points: 2 });
    const expensive = card({ id: 3, gem: 'sapphire', cost: { ruby: 7 } });
    const me = player('p1', { gems: gems({ emerald: 1, gold: 2 }) });
    const game = state([me], {
      cards: {
        level1: [cheap, expensive],
        level2: [withGold],
        level3: [],
        deck1: [],
        deck2: [],
        deck3: [],
      },
    });

    const purchases = listed(game).filter((item) => item.actionClass === 'PURCHASE_CARD');
    expect(purchases.map((item) => item.key).sort()).toEqual(['purchase_1', 'purchase_2']);
  });

  it('can buy a card that exists only in the player reserve', () => {
    const reserved = card({ id: 8, gem: 'diamond', cost: { sapphire: 1 }, points: 1 });
    const me = player('p1', {
      gems: gems({ sapphire: 1 }),
      reservedCards: [reserved],
    });
    const game = state([me]);
    const keys = listed(game).map((item) => item.key);

    expect(keys).toContain('purchase_8');
    expect(keys).not.toContain('reserve_8');
  });

  it('reserves visible cards and non-empty decks only', () => {
    const visible = card({ id: 11, gem: 'emerald', level: 1 });
    const deckCard = card({ id: 99, gem: 'onyx', level: 2 });
    const game = state([player('p1')], {
      cards: {
        level1: [visible],
        level2: [],
        level3: [],
        deck1: [],
        deck2: [deckCard],
        deck3: [],
      },
    });
    const reserves = listed(game).filter((item) => item.actionClass === 'RESERVE_CARD');

    expect(reserves.map((item) => item.key).sort()).toEqual(['reserve_11', 'reserve_deck_2']);
  });

  it('does not reserve when the player already holds three cards or ten gems', () => {
    const visible = card({ id: 4, gem: 'ruby', cost: { diamond: 5 } });
    const fullReserve = player('p1', {
      reservedCards: [
        card({ id: 21, gem: 'onyx' }),
        card({ id: 22, gem: 'onyx' }),
        card({ id: 23, gem: 'onyx' }),
      ],
    });
    const capped = player('p2', { gems: gems({ diamond: 10 }) });
    const board = {
      level1: [visible],
      level2: [],
      level3: [],
      deck1: [card({ id: 50, gem: 'ruby' })],
      deck2: [],
      deck3: [],
    };

    expect(listed(state([fullReserve], { cards: board })).some((item) => item.actionClass === 'RESERVE_CARD')).toBe(false);

    const cappedState = state([capped], { cards: board, currentTurn: 'p2' });
    expect(listed(cappedState, 'p2').some((item) => item.actionClass === 'RESERVE_CARD')).toBe(false);
  });

  it('while pending discard, lists only exact discards the player can pay', () => {
    const me = player('p1', { gems: gems({ diamond: 6, gold: 5 }) });
    const game = state([me], {
      cards: {
        level1: [card({ id: 1, gem: 'onyx', cost: { diamond: 1 }, points: 1 })],
        level2: [],
        level3: [],
        deck1: [],
        deck2: [],
        deck3: [],
      },
      pendingDiscard: { playerId: 'p1', gemsCount: 1 },
    });
    const actions = listed(game);

    expect(actions.map((item) => item.key).sort()).toEqual(['discard_diamond1', 'discard_gold1']);
    for (const item of actions) {
      expect(item.action.type).toBe('DISCARD_GEMS');
      expect(isApplicableAction(gameService, game, 'p1', item.action)).toBe(true);
    }
    expect(isApplicableAction(gameService, game, 'p1', {
      type: 'TAKE_GEMS',
      playerId: 'p1',
      payload: { gems: { diamond: 1 } },
    })).toBe(false);
  });

  it('caps discard menus', () => {
    const me = player('p1', {
      gems: gems({ diamond: 4, sapphire: 3, emerald: 3, ruby: 2, onyx: 1 }),
    });
    const game = state([me], {
      pendingDiscard: { playerId: 'p1', gemsCount: 3 },
    });
    const actions = listed(game);

    expect(actions).toHaveLength(MAX_DISCARD_OPTIONS);
    for (const item of actions) {
      expect(item.action.type).toBe('DISCARD_GEMS');
      if (item.action.type !== 'DISCARD_GEMS') continue;
      const total = Object.values(item.action.payload.gems).reduce((sum, count) => sum + (count || 0), 0);
      expect(total).toBe(3);
      expect(gameService.canDiscardGems(me, item.action.payload.gems)).toBe(true);
    }
  });

  it('keeps single-gem takes when the player is near the 10 gem cap', () => {
    const me = player('p1', { gems: gems({ diamond: 9 }) });
    const actions = listed(state([me]));
    const keys = actions.map((item) => item.key);

    expect(actions.length).toBeLessThanOrEqual(MAX_CHOICE_OPTIONS);
    expect(keys).toContain('take_diamond1');
    expect(keys).toEqual(expect.arrayContaining([
      'take_diamond2',
      'take_sapphire2',
      'take_emerald2',
      'take_ruby2',
      'take_onyx2',
    ]));
  });

  it('returns nothing when it is not this player turn or the game is over', () => {
    const game = state([player('p1'), player('p2')]);
    expect(listed(game, 'p2')).toEqual([]);
    expect(listed(state([player('p1')], { winner: 'p1' }))).toEqual([]);
  });

  it('applies one action of each class through GameService', () => {
    const buy = card({ id: 1, gem: 'onyx', points: 1, cost: { emerald: 1 } });
    const buyer = player('p1', { gems: gems({ emerald: 1 }) });
    const rival = player('p2');
    const purchaseState = state([buyer, rival], {
      cards: { level1: [buy], level2: [], level3: [], deck1: [], deck2: [], deck3: [] },
    });
    const bought = gameService.handleGameAction(purchaseState, {
      type: 'PURCHASE_CARD',
      playerId: 'p1',
      payload: { cardId: 1 },
    });
    expect(buyer.cards).toHaveLength(1);
    expect(buyer.points).toBe(1);
    expect(bought.currentTurn).toBe('p2');

    const taker = player('p1');
    const taken = gameService.handleGameAction(state([taker, player('p2')]), {
      type: 'TAKE_GEMS',
      playerId: 'p1',
      payload: { gems: { diamond: 2 } },
    });
    expect(taker.gems.diamond).toBe(2);
    expect(taken.gems.diamond).toBe(2);

    const reserver = player('p1');
    const reserved = gameService.handleGameAction(state([reserver], {
      cards: {
        level1: [card({ id: 11, gem: 'emerald' })],
        level2: [],
        level3: [],
        deck1: [],
        deck2: [],
        deck3: [],
      },
    }), {
      type: 'RESERVE_CARD',
      playerId: 'p1',
      payload: { cardId: 11 },
    });
    expect(reserver.reservedCards.map((item) => item.id)).toEqual([11]);
    expect(reserver.gems.gold).toBe(1);
    expect(reserved.gems.gold).toBe(4);

    const discarder = player('p1', { gems: gems({ diamond: 11 }) });
    const discarded = gameService.handleGameAction(state([discarder, player('p2')], {
      pendingDiscard: { playerId: 'p1', gemsCount: 1 },
    }), {
      type: 'DISCARD_GEMS',
      playerId: 'p1',
      payload: { gems: { diamond: 1 } },
    });
    expect(discarder.gems.diamond).toBe(10);
    expect(discarded.pendingDiscard).toBeUndefined();
    expect(discarded.currentTurn).toBe('p2');
  });
});
