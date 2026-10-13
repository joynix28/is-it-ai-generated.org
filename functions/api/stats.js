/** GET /api/stats — anonymous aggregate summary. */
import { json, preflight } from '../_lib/http.js';
import { summary } from '../_lib/stats.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const data = await summary(env, days);
  return json(data, { cacheControl: 'public, max-age=300' });
}
