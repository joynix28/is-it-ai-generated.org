/**
 * POST /api/count
 * Body: { text: string, language?: string }
 * Returns word/character/readability statistics.
 */
import { countText } from '../../src/core/index.js';
import { json, error, preflight, readJson, rateLimit } from '../_lib/http.js';

export const onRequestOptions = () => preflight();

export async function onRequestPost({ request }) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) return error('rate limit exceeded', 429);

  let body;
  try {
    body = await readJson(request, 200 * 1024);
  } catch (err) {
    return error(err.message || 'invalid json', 413);
  }

  const text = typeof body.text === 'string' ? body.text : '';
  if (!text) return error('field "text" is required', 422);

  return json({
    ok: true,
    ...countText(text, { language: body.language && body.language !== 'auto' ? String(body.language) : undefined }),
  });
}
