import { GameAction } from '../interfaces/game.interface';

export type AiEngine = 'jev' | 'heuristic' | 'shadow';

export type DecisionSource = 'jev' | 'heuristic' | 'forced';

export type ClientActionType = 'TAKE_GEMS' | 'PURCHASE_CARD' | 'RESERVE_CARD' | 'DISCARD_GEMS';

/** One bar in the client decision panel. */
export interface DecisionOption {
  id: string;
  label: string;
  probability: number;
}

/**
 * Optional payload on `gameStateUpdate`.
 * Keeps the original fields and also the names `app/lib/game/decisionMeta.ts` normalizes,
 * so the client panel can render without a further client change.
 * `source` is who actually played: Jev, the heuristic fallback, or a forced sole legal move.
 */
export interface DecisionMeta {
  actionKey: string;
  probs?: Record<string, number>;
  model?: string;
  latencyMs: number;
  source: DecisionSource;
  engine: AiEngine;
  fallbackReason?: string;
  /** Set in shadow mode: the action Jev would have played. */
  shadowActionKey?: string;
  shadowProbs?: Record<string, number>;

  modelId?: string;
  actionType?: ClientActionType;
  chosenOptionId?: string;
  chosenOptionLabel?: string;
  options?: DecisionOption[];
}

export interface AiDecision {
  action: GameAction;
  meta: DecisionMeta;
}

export class JevDecisionError extends Error {
  constructor(
    message: string,
    readonly reason: 'timeout' | 'http_error' | 'invalid_response' | 'illegal_choice',
  ) {
    super(message);
    this.name = 'JevDecisionError';
  }
}

export function getAiEngine(): AiEngine {
  const raw = (process.env.AI_ENGINE || 'heuristic').trim().toLowerCase();
  if (raw === 'jev' || raw === 'shadow' || raw === 'heuristic') return raw;
  return 'heuristic';
}

/** Shared budget for the hierarchical Choice calls. Override in tests via env. */
export function decisionTimeoutMs(): number {
  const raw = Number(process.env.JEV_DECISION_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 50) return raw;
  return 2500;
}
