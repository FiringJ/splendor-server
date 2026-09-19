import { GameAction } from '../interfaces/game.interface';
import { ClientActionType, DecisionMeta, DecisionOption } from './types';

const CLIENT_ACTION_TYPES = new Set<ClientActionType>([
  'TAKE_GEMS',
  'PURCHASE_CARD',
  'RESERVE_CARD',
  'DISCARD_GEMS',
]);

/**
 * Fill the fields the Splendor client normalizer reads, without dropping the original ones.
 * `labels` maps a choice id (action key or action class) to the fact string sent to Jev.
 */
export function withClientDecisionFields(
  meta: DecisionMeta,
  action: GameAction,
  labels: Record<string, string> = {},
): DecisionMeta {
  const actionType = CLIENT_ACTION_TYPES.has(action.type as ClientActionType)
    ? action.type as ClientActionType
    : undefined;
  const chosenOptionId = meta.actionKey;
  const chosenOptionLabel = labelFor(labels, chosenOptionId);
  const probabilities = meta.probs ?? meta.shadowProbs;
  const options = probabilities ? toOptions(probabilities, labels) : undefined;

  return {
    ...meta,
    ...(meta.model ? { modelId: meta.model } : {}),
    ...(actionType ? { actionType } : {}),
    chosenOptionId,
    chosenOptionLabel,
    ...(options && options.length > 0 ? { options } : {}),
  };
}

function toOptions(probabilities: Record<string, number>, labels: Record<string, string>): DecisionOption[] {
  return Object.entries(probabilities)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
    .map(([id, probability]) => ({
      id,
      label: labelFor(labels, id),
      probability,
    }))
    .sort((a, b) => b.probability - a.probability || a.id.localeCompare(b.id));
}

function labelFor(labels: Record<string, string>, id: string): string {
  const label = labels[id];
  return label && label.trim() ? label : id;
}
