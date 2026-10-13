/**
 * POST /api/collect — ingest one anonymous analytics event.
 * Also accepts navigator.sendBeacon payloads (content-type may be text/plain).
 */
import { json, preflight, readJson } from '../_lib/http.js';
import { record } from '../_lib/stats.js';

export const onRequestOptions = () => preflight();

const ALLOWED_TYPES = new Set(['pageview', 'tool', 'tab', 'boot', 'verdict']);

export async function onRequestPost({ request, env }) {
  // Respect the privacy signals even if the client is misbehaving.
  if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') {
    return json({ ok: true, stored: false, reason: 'opt-out' });
  }

  let body;
  try {
    body = await readJson(request, 8 * 1024);
  } catch {
    return json({ ok: true, stored: false });
  }

  const type = String(body.type || 'pageview');
  if (!ALLOWED_TYPES.has(type)) return json({ ok: true, stored: false, reason: 'ignored' });

  // Explicitly strip anything that could be personal data.
  const safe = {
    type,
    path: typeof body.path === 'string' ? body.path.slice(0, 128) : undefined,
    lang: typeof body.lang === 'string' ? body.lang.slice(0, 12) : undefined,
    referrer: typeof body.referrer === 'string' ? body.referrer.slice(0, 64) : undefined,
    device: typeof body.device === 'string' ? body.device.slice(0, 24) : undefined,
    screen: typeof body.screen === 'string' ? body.screen.slice(0, 12) : undefined,
    tool: typeof body.tool === 'string' ? body.tool.slice(0, 24) : undefined,
    verdict: typeof body.verdict === 'string' ? body.verdict.slice(0, 24) : undefined,
    tab: typeof body.tab === 'string' ? body.tab.slice(0, 24) : undefined,
  };

  let result = { stored: false, reason: 'no-store' };
  try {
    result = await record(env, safe, request);
  } catch {
    // Never fail the beacon.
  }
  return json({ ok: true, ...result }, { cacheControl: 'no-store' });
}
