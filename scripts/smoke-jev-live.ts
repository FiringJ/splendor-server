/**
 * Live OpenRouter Jev smoke.
 * Run after `pnpm build`: node dist/scripts/smoke-jev-live.js
 *
 * Missing OPENROUTER_API_KEY prints LIVE_SKIPPED and exits 0.
 * Does not read or write secrets into the repo.
 */
import { Card, GameState, Gems, Player } from '../src/game/interfaces/game.interface';
import { GameService } from '../src/game/game.service';
import { AIService } from '../src/game/ai.service';
import { actionKey, isApplicableAction, listLegalActions } from '../src/game/legal-actions';
import { JevAIService } from '../src/game/jev/jev-ai.service';
import { OpenRouterClient } from '../src/game/jev/openrouter-client';
import { DecisionMeta } from '../src/game/jev/types';

const PLAYER_ID = 'p1';

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

/** Two purchases plus several takes, so Jev must choose among more than one legal action. */
function minimalState(): GameState {
  const ai = player(PLAYER_ID, { gems: gems({ emerald: 1 }) });
  return {
    players: new Map([[ai.id, ai]]),
    currentTurn: ai.id,
    gems: gems({ diamond: 4, sapphire: 4, emerald: 4, ruby: 4, onyx: 4, gold: 5 }),
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
    nobles: [],
    winner: null,
    lastRound: false,
    lastRoundStartPlayer: null,
    actions: [],
  };
}

function sampleMeta(meta: DecisionMeta): Record<string, unknown> {
  return {
    source: meta.source,
    engine: meta.engine,
    model: meta.model,
    modelId: meta.modelId,
    actionType: meta.actionType,
    actionKey: meta.actionKey,
    chosenOptionId: meta.chosenOptionId,
    chosenOptionLabel: meta.chosenOptionLabel,
    latencyMs: meta.latencyMs,
    fallbackReason: meta.fallbackReason,
    probs: meta.probs,
    options: meta.options,
  };
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/sk-or-[A-Za-z0-9_-]+/g, '[redacted]')
      .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/api[_-]?key|authorization|secret|token/i.test(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = redact(item);
      }
    }
    return out;
  }
  return value;
}

function missingFields(meta: DecisionMeta): string[] {
  const missing: string[] = [];
  if (!meta.source) missing.push('source');
  if (!meta.modelId && !meta.model) missing.push('modelId|model');
  if (!meta.actionType) missing.push('actionType');
  if (!meta.chosenOptionId) missing.push('chosenOptionId');
  if (!meta.options && !meta.probs) missing.push('options|probs');
  return missing;
}

function fail(payload: unknown): never {
  console.log('FAIL');
  console.log(JSON.stringify(redact(payload), null, 2));
  process.exit(1);
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.log('LIVE_SKIPPED');
    console.log('OPENROUTER_API_KEY is not set; live Jev smoke skipped');
    process.exit(0);
  }

  process.env.AI_ENGINE = 'jev';
  process.env.JEV_DECISION_TIMEOUT_MS = process.env.JEV_DECISION_TIMEOUT_MS && Number(process.env.JEV_DECISION_TIMEOUT_MS) >= 5000
    ? process.env.JEV_DECISION_TIMEOUT_MS
    : '60000';

  const state = minimalState();
  const gameService = new GameService();
  const service = new JevAIService(gameService, new AIService(gameService), new OpenRouterClient());
  const legal = listLegalActions(gameService, state, PLAYER_ID);
  if (legal.length < 2) {
    fail({ error: 'fixture has fewer than 2 legal actions', legalCount: legal.length });
  }

  const decision = await service.decide(state, PLAYER_ID);
  const playedKey = actionKey(decision.action);
  const legalAction = isApplicableAction(gameService, state, PLAYER_ID, decision.action)
    && legal.some((item) => item.key === playedKey);
  const missing = missingFields(decision.meta);
  const sample = sampleMeta(decision.meta);

  if (!legalAction || missing.length > 0 || decision.meta.source !== 'jev') {
    fail({
      error: decision.meta.source === 'jev'
        ? 'decision did not satisfy live Jev assertions'
        : `expected source=jev, got ${decision.meta.source}`,
      legalAction,
      playedKey,
      missing,
      legalCount: legal.length,
      decisionMeta: sample,
    });
  }

  console.log('PASS');
  console.log(JSON.stringify({ decisionMeta: redact(sample) }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fail({ error: message });
});
