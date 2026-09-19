import { withClientDecisionFields } from './decision-meta';
import { DecisionMeta } from './types';

describe('withClientDecisionFields', () => {
  const action = {
    type: 'PURCHASE_CARD' as const,
    playerId: 'p1',
    payload: { cardId: 1 },
  };

  it('keeps the original fields and adds the client panel shape', () => {
    const meta: DecisionMeta = {
      actionKey: 'purchase_1',
      probs: { purchase_2: 0.25, purchase_1: 0.75 },
      model: 'typesafe/jev-1.13',
      latencyMs: 420,
      source: 'jev',
      engine: 'jev',
    };

    const published = withClientDecisionFields(meta, action, {
      purchase_1: 'Buy #1 L1 onyx 1pt',
      purchase_2: 'Buy #2 L1 ruby 0pt',
    });

    expect(published.actionKey).toBe('purchase_1');
    expect(published.probs).toEqual({ purchase_2: 0.25, purchase_1: 0.75 });
    expect(published.model).toBe('typesafe/jev-1.13');
    expect(published.engine).toBe('jev');
    expect(published.source).toBe('jev');
    expect(published.latencyMs).toBe(420);

    expect(published.modelId).toBe('typesafe/jev-1.13');
    expect(published.actionType).toBe('PURCHASE_CARD');
    expect(published.chosenOptionId).toBe('purchase_1');
    expect(published.chosenOptionLabel).toBe('Buy #1 L1 onyx 1pt');
    expect(published.options).toEqual([
      { id: 'purchase_1', label: 'Buy #1 L1 onyx 1pt', probability: 0.75 },
      { id: 'purchase_2', label: 'Buy #2 L1 ruby 0pt', probability: 0.25 },
    ]);
  });

  it('uses shadow probabilities when the played move has no probs map', () => {
    const published = withClientDecisionFields({
      actionKey: 'purchase_1',
      latencyMs: 10,
      source: 'heuristic',
      engine: 'shadow',
      model: 'typesafe/jev-1.13',
      shadowActionKey: 'take_diamond2',
      shadowProbs: { take_diamond2: 0.7 },
    }, action, {
      purchase_1: 'Buy #1',
      take_diamond2: 'Take diamond2 (double)',
    });

    expect(published.chosenOptionId).toBe('purchase_1');
    expect(published.chosenOptionLabel).toBe('Buy #1');
    expect(published.modelId).toBe(published.model);
    expect(published.options).toEqual([
      { id: 'take_diamond2', label: 'Take diamond2 (double)', probability: 0.7 },
    ]);
  });

  it('omits options and modelId when the move was forced', () => {
    const published = withClientDecisionFields({
      actionKey: 'discard_diamond1',
      latencyMs: 0,
      source: 'forced',
      engine: 'heuristic',
      fallbackReason: 'heuristic_illegal',
    }, {
      type: 'DISCARD_GEMS',
      payload: { gems: { diamond: 1 } },
    }, {
      discard_diamond1: 'Discard diamond1 to return to 10 gems',
    });

    expect(published.actionType).toBe('DISCARD_GEMS');
    expect(published.chosenOptionLabel).toBe('Discard diamond1 to return to 10 gems');
    expect(published.fallbackReason).toBe('heuristic_illegal');
    expect(published.options).toBeUndefined();
    expect(published.modelId).toBeUndefined();
  });
});
