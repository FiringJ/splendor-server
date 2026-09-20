/**
 * Shared CORS / Socket.IO allowed origins.
 *
 * Defaults keep production + local client. Temporary Fly client previews are
 * allowed via `*.fly.dev`. Extra origins come from `CLIENT_ORIGIN`
 * (comma-separated), e.g. `https://my-app.fly.dev,https://staging.example.com`.
 */
const DEFAULT_ORIGINS = [
  'https://www.splendor.uno',
  'http://localhost:3000',
] as const;

/** Matches any https/http origin on *.fly.dev (temporary Fly client deploys). */
const FLY_DEV_ORIGIN = /^https?:\/\/([a-z0-9-]+\.)*fly\.dev$/i;

export function getCorsOrigins(): (string | RegExp)[] {
  const fromEnv = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return [...DEFAULT_ORIGINS, ...fromEnv, FLY_DEV_ORIGIN];
}
