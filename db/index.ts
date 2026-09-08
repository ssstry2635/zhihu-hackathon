import { env } from 'cloudflare:workers';
export function getDb() {
  if (!env.DB) throw new Error('DATABASE_UNAVAILABLE');
  return env.DB;
}
export { env };
