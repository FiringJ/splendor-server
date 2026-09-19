import { Injectable } from '@nestjs/common';
import { JevDecisionError } from './types';

export const JEV_MODEL = 'typesafe/jev-1.13';
export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';

export interface DecideChoiceParams {
  apiKey: string;
  state: unknown;
  questionKey: string;
  instructions: string;
  criteria: Record<string, string>;
  signal?: AbortSignal;
}

export interface ChoiceResult {
  choice: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  model: string;
}

/**
 * OpenRouter Decisions API.
 * Choice `criteria` must be an object map of option key → fact string.
 * Flattening those keys beside `type` (or sending a string array) returns HTTP 400.
 */
@Injectable()
export class OpenRouterClient {
  /** Overridable in tests. Not a constructor arg — Nest would try to inject `fetch`. */
  fetchImpl: typeof fetch = (input, init) => fetch(input, init);

  async decideChoice(params: DecideChoiceParams): Promise<ChoiceResult> {
    this.assertCriteriaMap(params.criteria);

    const body = {
      model: JEV_MODEL,
      state: params.state,
      questions: {
        [params.questionKey]: {
          type: 'choice' as const,
          instructions: params.instructions,
          criteria: params.criteria,
        },
      },
    };

    let response: Response;
    try {
      response = await this.fetchImpl(DECISIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: params.signal,
      });
    } catch (error) {
      if (params.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new JevDecisionError('Jev decision timed out', 'timeout');
      }
      const message = error instanceof Error ? error.message : 'OpenRouter request failed';
      throw new JevDecisionError(message, 'http_error');
    }

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new JevDecisionError(
        `OpenRouter decisions failed (${response.status})${detail ? `: ${detail}` : ''}`,
        'http_error',
      );
    }

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      throw new JevDecisionError('Decisions response was not JSON', 'invalid_response');
    }

    const answer = payload?.answers?.[params.questionKey];
    if (!answer || typeof answer.choice !== 'string' || answer.choice.length === 0) {
      throw new JevDecisionError('Decisions response missing choice', 'invalid_response');
    }

    const probabilities = isStringNumberMap(answer.probabilities) ? answer.probabilities : undefined;
    return {
      choice: answer.choice.trim(),
      probabilities,
      confidence: typeof answer.confidence === 'number' ? answer.confidence : undefined,
      model: typeof payload.model === 'string' ? payload.model : JEV_MODEL,
    };
  }

  private assertCriteriaMap(criteria: Record<string, string>): void {
    if (criteria === null || typeof criteria !== 'object' || Array.isArray(criteria)) {
      throw new JevDecisionError('Choice criteria must be an object map', 'invalid_response');
    }
    for (const [key, value] of Object.entries(criteria)) {
      if (!key || typeof value !== 'string') {
        throw new JevDecisionError('Choice criteria values must be strings', 'invalid_response');
      }
    }
  }
}

function isStringNumberMap(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((item) => typeof item === 'number');
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const message = body?.error?.message || body?.message;
    return typeof message === 'string' ? message.slice(0, 300) : '';
  } catch {
    return '';
  }
}
