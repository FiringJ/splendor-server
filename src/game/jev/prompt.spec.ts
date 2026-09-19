import { Card, GameState, Gems, Player } from '../interfaces/game.interface';
import { listLegalActions } from '../legal-actions';
import { GameService } from '../game.service';
import { buildActionCriteria, buildClassCriteria, buildCompactState } from './prompt';

function gems(partial: Partial<Gems> = {}): Gems {
  return { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0, ...partial };
}

function card(partial: Partial<Card> & Pick<Card, 'id' | 'gem'>): Card {
  return {
    level: 1,
    points: 0,
    cost: {},
    image: 'should-not-leak.png',
    spritePosition: { x: 3, y: 4 },
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
    ...partial,
  };
}

describe('Jev prompt', () => {
  it('sends a compact state without sprites, images, or deck contents', () => {
    const me = player('p1', {
      points: 3,
      gems: gems({ ruby: 2 }),
      cards: [card({ id: 7, gem: 'emerald' })],
      reservedCards: [card({ id: 8, gem: 'sapphire', cost: { onyx: 3 }, points: 1 })],
    });
    const game: GameState = {
      players: new Map([
        [me.id, me],
        ['p2', player('p2', { points: 4, cards: [card({ id: 70, gem: 'ruby' })] })],
      ]),
      currentTurn: 'p1',
      gems: gems({ diamond: 4, sapphire: 4, emerald: 4, ruby: 4, onyx: 4, gold: 5 }),
      cards: {
        level1: [card({ id: 42, gem: 'ruby', points: 1, cost: { diamond: 2 } })],
        level2: [],
        level3: [],
        deck1: [card({ id: 9999, gem: 'onyx', image: 'leak.png' })],
        deck2: [],
        deck3: [],
      },
      nobles: [{
        id: 1,
        points: 3,
        name: 'Hidden Name',
        requirements: { emerald: 3, ruby: 3 },
        image: 'noble.png',
      }],
      winner: null,
      lastRound: false,
      lastRoundStartPlayer: null,
      actions: [],
    };

    const compact = buildCompactState(game, 'p1');
    const encoded = JSON.stringify(compact);

    expect(encoded).not.toContain('spritePosition');
    expect(encoded).not.toContain('should-not-leak');
    expect(encoded).not.toContain('leak.png');
    expect(encoded).not.toContain('noble.png');
    expect(encoded).not.toContain('9999');
    expect(encoded).not.toContain('Hidden Name');
    expect(encoded).toContain('42');
    expect(compact).toMatchObject({
      phase: 'early',
      pointsToWin: 15,
      decks: { level1: 1, level2: 0, level3: 0 },
      you: { points: 3, bonuses: { emerald: 1 } },
    });
    expect((compact.nobles as Array<{ progress: Record<string, string> }>)[0].progress).toEqual({
      emerald: '1/3',
      ruby: '0/3',
    });
    expect(JSON.parse(encoded)).toEqual(compact);
  });

  it('builds choice criteria as a string map, not a list or flattened flags', () => {
    const gameService = new GameService();
    const me = player('p1', { gems: gems({ emerald: 1 }) });
    const game: GameState = {
      players: new Map([[me.id, me]]),
      currentTurn: 'p1',
      gems: gems({ diamond: 4, sapphire: 4, emerald: 4, ruby: 4, onyx: 4, gold: 5 }),
      cards: {
        level1: [card({ id: 1, gem: 'onyx', cost: { emerald: 1 }, points: 1 })],
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
    };
    const legal = listLegalActions(gameService, game, 'p1');
    const classes = buildClassCriteria(legal, game, me);
    const actions = buildActionCriteria(legal);

    expect(Array.isArray(classes)).toBe(false);
    expect(Array.isArray(actions)).toBe(false);
    expect(typeof classes.PURCHASE_CARD).toBe('string');
    expect(typeof classes.TAKE_GEMS).toBe('string');
    expect(classes).not.toHaveProperty('true');
    expect(classes).not.toHaveProperty('false');
    expect(actions.purchase_1).toContain('Buy #1');
    for (const value of Object.values(actions)) {
      expect(typeof value).toBe('string');
    }
  });
});
