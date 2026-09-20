import { getCorsOrigins } from './cors-origins';

describe('getCorsOrigins', () => {
  const original = process.env.CLIENT_ORIGIN;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CLIENT_ORIGIN;
    } else {
      process.env.CLIENT_ORIGIN = original;
    }
  });

  it('includes production, localhost, and a *.fly.dev pattern', () => {
    delete process.env.CLIENT_ORIGIN;
    const origins = getCorsOrigins();

    expect(origins).toEqual(
      expect.arrayContaining([
        'https://www.splendor.uno',
        'http://localhost:3000',
      ]),
    );
    const flyPattern = origins.find((o) => o instanceof RegExp);
    expect(flyPattern).toBeInstanceOf(RegExp);
    expect((flyPattern as RegExp).test('https://splendor-client.fly.dev')).toBe(
      true,
    );
    expect((flyPattern as RegExp).test('https://evil.com')).toBe(false);
  });

  it('appends CLIENT_ORIGIN comma-separated values', () => {
    process.env.CLIENT_ORIGIN =
      'https://preview.example.com, http://localhost:5173';
    const origins = getCorsOrigins();

    expect(origins).toEqual(
      expect.arrayContaining([
        'https://preview.example.com',
        'http://localhost:5173',
      ]),
    );
  });
});
