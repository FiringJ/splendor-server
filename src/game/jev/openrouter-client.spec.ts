import { DECISIONS_URL, JEV_MODEL, OpenRouterClient } from './openrouter-client';

describe('OpenRouterClient', () => {
  const apiKey = 'sk-test-secret';

  function mockResponse(body: unknown, ok = true, status = 200): Response {
    return {
      ok,
      status,
      json: async () => body,
    } as Response;
  }

  it('posts a Choice question whose criteria is an object map', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({
      model: 'typesafe/jev-1.13-20260917',
      answers: {
        concrete_action: {
          type: 'choice',
          choice: 'purchase_1',
          probabilities: { purchase_1: 0.7, take_diamond2: 0.3 },
          confidence: 0.4,
        },
      },
    }));
    const client = new OpenRouterClient();
    client.fetchImpl = fetchImpl;

    const result = await client.decideChoice({
      apiKey,
      state: { bank: { diamond: 4 } },
      questionKey: 'concrete_action',
      instructions: 'Pick a move',
      criteria: {
        purchase_1: 'Buy the onyx card',
        take_diamond2: 'Take two diamonds',
      },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(DECISIONS_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${apiKey}`);
    expect(init.body).not.toContain(apiKey);

    const body = JSON.parse(init.body);
    expect(body.model).toBe(JEV_MODEL);
    expect(body.questions.concrete_action.type).toBe('choice');
    expect(Array.isArray(body.questions.concrete_action.criteria)).toBe(false);
    expect(body.questions.concrete_action.criteria).toEqual({
      purchase_1: 'Buy the onyx card',
      take_diamond2: 'Take two diamonds',
    });
    expect(body.questions.concrete_action.purchase_1).toBeUndefined();
    expect(body.questions.concrete_action.true).toBeUndefined();

    expect(result).toEqual({
      choice: 'purchase_1',
      probabilities: { purchase_1: 0.7, take_diamond2: 0.3 },
      confidence: 0.4,
      model: 'typesafe/jev-1.13-20260917',
    });
  });

  it('rejects array criteria before calling the network', async () => {
    const fetchImpl = jest.fn();
    const client = new OpenRouterClient();
    client.fetchImpl = fetchImpl;

    await expect(client.decideChoice({
      apiKey,
      state: {},
      questionKey: 'move',
      instructions: 'Pick',
      criteria: ['a', 'b'] as unknown as Record<string, string>,
    })).rejects.toThrow(/object map/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces HTTP failures without throwing the raw key', async () => {
    const client = new OpenRouterClient();
    client.fetchImpl = jest.fn().mockResolvedValue(mockResponse(
      { error: { message: 'criteria must be an object' } },
      false,
      400,
    ));

    await expect(client.decideChoice({
      apiKey,
      state: { note: 'board' },
      questionKey: 'move',
      instructions: 'Pick',
      criteria: { a: 'alpha', b: 'beta' },
    })).rejects.toThrow(/400/);
  });

  it('rejects a payload that has no choice', async () => {
    const client = new OpenRouterClient();
    client.fetchImpl = jest.fn().mockResolvedValue(mockResponse({ answers: {} }));

    await expect(client.decideChoice({
      apiKey,
      state: {},
      questionKey: 'move',
      instructions: 'Pick',
      criteria: { a: 'alpha', b: 'beta' },
    })).rejects.toThrow(/missing choice/);
  });
});
