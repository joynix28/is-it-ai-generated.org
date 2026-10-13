/** GET /api/health — liveness and version. */
import { VERSION } from '../../src/core/index.js';
import { json, preflight } from '../_lib/http.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    name: 'is-it-ai-generated',
    version: VERSION,
    statsStore: Boolean(env && env.STATS),
    time: new Date().toISOString(),
  }, { cacheControl: 'public, max-age=60' });
}
