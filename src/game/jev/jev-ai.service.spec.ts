import { Card, GameState, Gems, Player } from '../interfaces/game.interface';
import { GameService } from '../game.service';
import { AIService } from '../ai.service';
import { JevAIService } from './jev-ai.service';
import { DecideChoiceParams, OpenRouterClient } from './openrouter-client';
import { JevDecisionError } from './types';

function gems(partial: Partial<Gems> = {}): Gems {
  return { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0, gold: 0, ...partial };
}

function card(partial: Partial<Card> & Pick<Card, 'id' | 'gem'>): Card {
  return { level: 1, points: 0, cost: {}, spritePosition: { x: 0, y: 0 }, ...partial };
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

function board(players: Player[], partial: Partial<GameState> = {}): GameState {
  return {
    players: new Map(players.map((item) => [item.id, item])),
    currentTurn: players[0].id,
    gems: gems({ diamond: 4, sapphire: 4, emerald: 4, ruby: 4, onyx: 4, gold: 5 }),
    cards: { level1: [], level2: [], level3: [], deck1: [], deck2: [], deck3: [] },
    nobles: [],
    winner: null,
    lastRound: false,
    lastRoundStartPlayer: null,
    actions: [],
    ...partial,
  };
}

class FakeClient {
  calls: DecideChoiceParams[] = [];
  handler: (params: DecideChoiceParams) => Promise<{ choice: string; probabilities?: Record<string, number>; model: string }> =
    async () => ({ choice: '', model: 'typesafe/jev-1.13' });

  async decideChoice(params: DecideChoiceParams) {
    this.calls.push(params);
    return this.handler(params);
  }
}

describe('JevAIService', () => {
  const gameService = new GameService();
  const aiService = new AIService(gameService);
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    env = {
      AI_ENGINE: process.env.AI_ENGINE,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      JEV_DECISION_TIMEOUT_MS: process.env.JEV_DECISION_TIMEOUT_MS,
    };
    process.env.JEV_DECISION_TIMEOUT_MS = '200';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function service(client: FakeClient) {
    return new JevAIService(gameService, aiService, client as unknown as OpenRouterClient);
  }

  it('stays on the heuristic when AI_ENGINE=heuristic', async () => {
    process.env.AI_ENGINE = 'heuristic';
    process.env.OPENROUTER_API_KEY = 'sk-test';
    const client = new FakeClient();
    const decision = await service(client).decide(board([player('p1')]), 'p1');

    expect(client.calls).toHaveLength(0);
    expect(decision.meta.engine).toBe('heuristic');
    expect(decision.meta.source).toBe('heuristic');
    expect(decision.meta.fallbackReason).toBeUndefined();
    expect(decision.action.type).toBe('TAKE_GEMS');
  });

  it('falls back when AI_ENGINE=jev but the API key is missing', async () => {
    process.env.AI_ENGINE = 'jev';
    delete process.env.OPENROUTER_API_KEY;
    const client = new FakeClient();
    const decision = await service(client).decide(board([player('p1')]), 'p1');

    expect(client.calls).toHaveLength(0);
    expect(decision.meta.source).toBe('heuristic');
    expect(decision.meta.engine).toBe('jev');
    expect(decision.meta.fallbackReason).toBe('missing_api_key');
    expect(decision.meta.actionType).toBe('TAKE_GEMS');
    expect(decision.meta.chosenOptionId).toBe(decision.meta.actionKey);
    expect(decision.meta.chosenOptionLabel).toContain('Take');
    expect(decision.meta.options).toBeUndefined();
    expect(decision.action.type).toBe('TAKE_GEMS');
  });

  it('forces the only legal action without calling Jev', async () => {
    process.env.AI_ENGINE = 'jev';
    process.env.OPENROUTER_API_KEY = 'sk-test';
    const client = new FakeClient();
    const game = board([player('p1')], {
      gems: gems({ diamond: 1, gold: 5 }),
    });
    const decision = await service(client).decide(game, 'p1');

    expect(client.calls).toHaveLength(0);
    expect(decision.meta.source).toBe('forced');
    expect(decision.meta.actionKey).toBe('take_diamond1');
    expect(decision.action).toMatchObject({
      type: 'TAKE_GEMS',
      payload: { gems: { diamond: 1 } },
    });
  });

  it('asks Jev for an action class, then a concrete legal action', async () => {
    process.env.AI_ENGINE = 'jev';
    process.env.OPENROUTER_API_KEY = 'sk-test';
    const client = new FakeClient();
    client.handler = async (params) => {
      expect(Array.isArray(params.criteria)).toBe(false);
      expect(params.criteria.true).toBeUndefined();
      expect(JSON.stringify(params.state)).not.toContain('spritePosition');
      if (params.questionKey === 'action_class') {
        expect(typeof params.criteria.PURCHASE_CARD).toBe('string');
        expect(typeof params.criteria.TAKE_GEMS).toBe('string');
        return {
          choice: 'PURCHASE_CARD',
          probabilities: { PURCHASE_CARD: 0.8, TAKE_GEMS: 0.2 },
          model: 'typesafe/jev-1.13',
        };
      }
      const key = Object.keys(params.criteria).find((item) => item.startsWith('purchase_'));
      if (!key) throw new Error('expected a purchase option');
      return {
        choice: key,
        probabilities: { [key]: 0.9 },
        model: 'typesafe/jev-1.13-20260917',
      };
    };

    const game = board([player('p1', { gems: gems({ emerald: 1 }) })], {
      cards: {
        level1: [
          card({ id: 1, gem: 'onyx', points: 1, cost: { emerald: 1 } }),
          card({ id: 2, gem: 'ruby', points: 0, cost: { emerald: 1 } }),
        ],
        level2: [],
        level3: [],
        deck1: [],
        deck2: [],
        deck3: [],
      },
    });
    const decision = await service(client).decide(game, 'p1');

    expect(client.calls.map((call) => call.questionKey)).toEqual(['action_class', 'concrete_action']);
    expect(decision.meta.source).toBe('jev');
    expect(decision.meta.engine).toBe('jev');
    expect(decision.meta.model).toBe('typesafe/jev-1.13-20260917');
    expect(decision.meta.actionKey).toBe('purchase_1');
    expect(decision.meta.probs).toEqual({ purchase_1: 0.9 });
    expect(decision.meta.modelId).toBe(decision.meta.model);
    expect(decision.meta.actionType).toBe('PURCHASE_CARD');
    expect(decision.meta.chosenOptionId).toBe('purchase_1');
    expect(decision.meta.chosenOptionLabel).toContain('Buy #1');
    expect(decision.meta.options).toEqual([
      expect.objectContaining({
        id: 'purchase_1',
        probability: 0.9,
      }),
    ]);
    expect(decision.meta.options?.[0].label).toContain('Buy #1');
    expect(decision.action).toMatchObject({ type: 'PURCHASE_CARD', payload: { cardId: 1 } });
  });

  it('falls back when Jev returns an option that was not offered', async () => {
    process.env.AI_ENGINE = 'jev';
    process.env.OPENROUTER_API_KEY = 'sk-test';
    const client = new FakeClient();
    client.handler = async () => ({ choice: 'NOT_A_CLASS', model: 'typesafe/jev-1.13' });

    const game = board([player('p1', { gems: gems({ emerald: 1 }) })], {
      cards: {
        level1: [card({ id: 1, gem: 'onyx', points: 1, cost: { emerald: 1 } })],
        level2: [],
        level3: [],
        deck1: [],
        deck2: [],
        deck3: [],
      },
    });
    const decision = await service(client).decide(game, 'p1');

    expect(decision.meta.source).toBe('heuristic');
    expect(decision.meta.fallbackReason).toBe('illegal_choice');
    expect(decision.action).toMatchObject({ type: 'PURCHASE_CARD', payload: { cardId: 1 } });
  });

  it('falls back when the Decisions call exceeds the timeout', async () => {
    process.env.AI_ENGINE = 'jev';
    process.env.OPENROUTER_API_KEY = 'sk-test';
    const client = new FakeClient();
    client.handler = (params) => new Promise((_resolve, reject) => {
      const abort = () => reject(new JevDecisionError('Jev decision timed out', 'timeout'));
      if (params.signal?.aborted) abort();
      else params.signal?.addEventListener('abort', abort);
    });

    const decision = await service(client).decide(board([player('p1')]), 'p1');

    expect(decision.meta.source).toBe('heuristic');
    expect(decision.meta.engine).toBe('jev');
    expect(decision.meta.fallbackReason).toBe('timeout');
    expect(decision.action.type).toBe('TAKE_GEMS');
    expect(decision.meta.latencyMs).toBeGreaterThanOrEqual(150);
  });

  it('does not let the heuristic take gems while a discard is pending', async () => {
    process.env.AI_ENGINE = 'heuristic';
    delete process.env.OPENROUTER_API_KEY;
    const game = board([player('p1', { gems: gems({ diamond: 11 }) })], {
      pendingDiscard: { playerId: 'p1', gemsCount: 1 },
    });
    const decision = await service(new FakeClient()).decide(game, 'p1');

    expect(decision.action).toMatchObject({
      type: 'DISCARD_GEMS',
      payload: { gems: { diamond: 1 } },
    });
    expect(decision.meta.source).toBe('forced');
    expect(decision.meta.fallbackReason).toBe('heuristic_illegal');
  });

  it('in shadow mode plays the heuristic and records the Jev choice', async () => {
    process.env.AI_ENGINE = 'shadow';
    process.env.OPENROUTER_API_KEY = 'sk-test';
    const client = new FakeClient();
    client.handler = async (params) => {
      if (params.questionKey === 'action_class') {
        return { choice: 'TAKE_GEMS', probabilities: { TAKE_GEMS: 0.7 }, model: 'typesafe/jev-1.13' };
      }
      const key = Object.keys(params.criteria).find((item) => item.startsWith('take_'));
      if (!key) throw new Error('expected a take option');
      return { choice: key, probabilities: { [key]: 0.7 }, model: 'typesafe/jev-1.13' };
    };

    const game = board([player('p1', { gems: gems({ emerald: 1 }) })], {
      cards: {
        level1: [card({ id: 1, gem: 'onyx', points: 1, cost: { emerald: 1 } })],
        level2: [],
        level3: [],
        deck1: [],
        deck2: [],
        deck3: [],
      },
    });
    const decision = await service(client).decide(game, 'p1');

    expect(client.calls.length).toBeGreaterThan(0);
    expect(decision.action).toMatchObject({ type: 'PURCHASE_CARD', payload: { cardId: 1 } });
    expect(decision.meta.source).toBe('heuristic');
    expect(decision.meta.engine).toBe('shadow');
    expect(decision.meta.shadowActionKey?.startsWith('take_')).toBe(true);
    expect(decision.meta.model).toBe('typesafe/jev-1.13');
    expect(decision.meta.modelId).toBe('typesafe/jev-1.13');
    expect(decision.meta.actionType).toBe('PURCHASE_CARD');
    expect(decision.meta.chosenOptionId).toBe(decision.meta.actionKey);
    expect(decision.meta.chosenOptionLabel).toContain('Buy #1');
    expect(decision.meta.options?.[0].id.startsWith('take_')).toBe(true);
    expect(decision.meta.options?.[0].label).toContain('Take');
    expect(decision.meta.probs).toBeUndefined();
    expect(decision.meta.shadowProbs).toEqual(decision.meta.options && {
      [decision.meta.options[0].id]: decision.meta.options[0].probability,
    });
  });
});
