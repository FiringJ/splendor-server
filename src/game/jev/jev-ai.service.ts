import { Injectable, Logger } from '@nestjs/common';
import { GameAction, GameState } from '../interfaces/game.interface';
import { GameService } from '../game.service';
import { AIService } from '../ai.service';
import {
  ActionClass,
  LegalAction,
  actionKey,
  isApplicableAction,
  listLegalActions,
} from '../legal-actions';
import { OpenRouterClient } from './openrouter-client';
import { ACTION_INSTRUCTIONS, CLASS_INSTRUCTIONS, buildActionCriteria, buildClassCriteria, buildCompactState } from './prompt';
import { AiDecision, AiEngine, JevDecisionError, decisionTimeoutMs, getAiEngine } from './types';

/**
 * Picks an AI move. Rules stay in GameService: Jev only chooses among enumerated legal actions.
 * Timeout, HTTP errors, a missing key, or an illegal choice fall back to AIService.
 */
@Injectable()
export class JevAIService {
  private readonly logger = new Logger(JevAIService.name);

  constructor(
    private readonly gameService: GameService,
    private readonly aiService: AIService,
    private readonly openRouter: OpenRouterClient,
  ) {}

  async decide(state: GameState, playerId: string): Promise<AiDecision> {
    try {
      const decision = await this.decideInner(state, playerId);
      const shadow = decision.meta.shadowActionKey ? ` shadow=${decision.meta.shadowActionKey}` : '';
      const fallback = decision.meta.fallbackReason ? ` fallback=${decision.meta.fallbackReason}` : '';
      const model = decision.meta.model ? ` model=${decision.meta.model}` : '';
      this.logger.log(
        `AI ${decision.meta.engine} -> ${decision.meta.actionKey} source=${decision.meta.source} latency=${decision.meta.latencyMs}ms${model}${fallback}${shadow}`,
      );
      const probs = decision.meta.probs ?? decision.meta.shadowProbs;
      if (probs) {
        this.logger.log(`Jev probabilities: ${JSON.stringify(probs)}`);
      }
      return decision;
    } catch (error) {
      this.logger.error(`AI decide failed: ${error instanceof Error ? error.message : error}`);
      return this.fromHeuristic(state, playerId, Date.now(), getAiEngine(), 'error');
    }
  }

  /** Synchronous heuristic (or first legal move). Used when a Jev pick is stale after await. */
  heuristicDecision(state: GameState, playerId: string, reason?: string): AiDecision {
    return this.fromHeuristic(state, playerId, Date.now(), getAiEngine(), reason);
  }

  private async decideInner(state: GameState, playerId: string): Promise<AiDecision> {
    const started = Date.now();
    const engine = getAiEngine();

    if (engine === 'heuristic') {
      return this.fromHeuristic(state, playerId, started, engine);
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      this.logger.warn('OPENROUTER_API_KEY is not set; using heuristic AI');
      return this.fromHeuristic(state, playerId, started, engine, 'missing_api_key');
    }

    const legal = listLegalActions(this.gameService, state, playerId);
    if (legal.length === 0) {
      return this.fromHeuristic(state, playerId, started, engine, 'no_legal_actions');
    }
    if (legal.length === 1) {
      const only = this.forced(legal[0], started, engine);
      return engine === 'shadow'
        ? { ...only, meta: { ...only.meta, engine: 'shadow' } }
        : only;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), decisionTimeoutMs());
    try {
      const jevDecision = await this.chooseWithJev(
        state,
        playerId,
        legal,
        apiKey,
        started,
        controller.signal,
        engine,
      );
      if (engine === 'shadow') {
        const played = this.fromHeuristic(state, playerId, started, 'shadow');
        this.logger.log(`Shadow compare jev=${jevDecision.meta.actionKey} heuristic=${played.meta.actionKey}`);
        return {
          action: played.action,
          meta: {
            ...played.meta,
            engine: 'shadow',
            latencyMs: Date.now() - started,
            model: jevDecision.meta.model,
            shadowActionKey: jevDecision.meta.actionKey,
            shadowProbs: jevDecision.meta.probs,
          },
        };
      }
      return jevDecision;
    } catch (error) {
      const reason = this.failureReason(error, controller.signal.aborted);
      this.logger.warn(`Jev decision failed (${reason}): ${error instanceof Error ? error.message : error}`);
      return this.fromHeuristic(state, playerId, started, engine, reason);
    } finally {
      clearTimeout(timer);
    }
  }

  private async chooseWithJev(
    state: GameState,
    playerId: string,
    legal: LegalAction[],
    apiKey: string,
    started: number,
    signal: AbortSignal,
    engine: AiEngine,
  ): Promise<AiDecision> {
    const player = state.players.get(playerId);
    if (!player) {
      throw new JevDecisionError('AI player missing', 'illegal_choice');
    }

    const compact = buildCompactState(state, playerId);
    const groups = groupByClass(legal);
    let candidates = legal;
    let model: string | undefined;
    let classProbs: Record<string, number> | undefined;

    if (groups.size > 1) {
      const classResult = await this.openRouter.decideChoice({
        apiKey,
        state: compact,
        questionKey: 'action_class',
        instructions: CLASS_INSTRUCTIONS,
        criteria: buildClassCriteria(legal, state, player),
        signal,
      });
      model = classResult.model;
      classProbs = classResult.probabilities;
      const chosen = groups.get(classResult.choice as ActionClass);
      if (!chosen || chosen.length === 0) {
        throw new JevDecisionError(`Illegal action class ${classResult.choice}`, 'illegal_choice');
      }
      candidates = chosen;
    }

    if (candidates.length === 1) {
      return {
        action: candidates[0].action,
        meta: {
          actionKey: candidates[0].key,
          probs: classProbs,
          model,
          latencyMs: Date.now() - started,
          source: groups.size > 1 ? 'jev' : 'forced',
          engine,
        },
      };
    }

    const actionResult = await this.openRouter.decideChoice({
      apiKey,
      state: compact,
      questionKey: 'concrete_action',
      instructions: ACTION_INSTRUCTIONS,
      criteria: buildActionCriteria(candidates),
      signal,
    });
    const selected = candidates.find((item) => item.key === actionResult.choice);
    if (!selected || !isApplicableAction(this.gameService, state, playerId, selected.action)) {
      throw new JevDecisionError(`Illegal action ${actionResult.choice}`, 'illegal_choice');
    }

    return {
      action: selected.action,
      meta: {
        actionKey: selected.key,
        probs: actionResult.probabilities,
        model: actionResult.model || model,
        latencyMs: Date.now() - started,
        source: 'jev',
        engine,
      },
    };
  }

  private fromHeuristic(
    state: GameState,
    playerId: string,
    started: number,
    engine: AiEngine,
    reason?: string,
  ): AiDecision {
    const legal = listLegalActions(this.gameService, state, playerId);
    let action: GameAction | undefined;
    try {
      action = this.aiService.getNextAction(state, playerId);
    } catch (error) {
      this.logger.warn(`Heuristic AI failed: ${error instanceof Error ? error.message : error}`);
    }

    if (action && isApplicableAction(this.gameService, state, playerId, action)) {
      return {
        action,
        meta: {
          actionKey: actionKey(action),
          latencyMs: Date.now() - started,
          source: 'heuristic',
          engine,
          ...(reason ? { fallbackReason: reason } : {}),
        },
      };
    }

    if (legal.length > 0) {
      return {
        action: legal[0].action,
        meta: {
          actionKey: legal[0].key,
          latencyMs: Date.now() - started,
          source: 'forced',
          engine,
          fallbackReason: reason ? `${reason};heuristic_illegal` : 'heuristic_illegal',
        },
      };
    }

    throw new Error('No legal AI action');
  }

  private forced(legal: LegalAction, started: number, engine: AiEngine): AiDecision {
    return {
      action: legal.action,
      meta: {
        actionKey: legal.key,
        latencyMs: Date.now() - started,
        source: 'forced',
        engine,
      },
    };
  }

  private failureReason(error: unknown, aborted: boolean): string {
    if (aborted) return 'timeout';
    if (error instanceof JevDecisionError) return error.reason;
    if (error instanceof Error && error.name === 'AbortError') return 'timeout';
    return 'error';
  }
}

function groupByClass(actions: LegalAction[]): Map<ActionClass, LegalAction[]> {
  const groups = new Map<ActionClass, LegalAction[]>();
  for (const action of actions) {
    const list = groups.get(action.actionClass) ?? [];
    list.push(action);
    groups.set(action.actionClass, list);
  }
  return groups;
}
