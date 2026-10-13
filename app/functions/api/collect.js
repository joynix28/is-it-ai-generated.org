/**
 * POST /api/collect — ingest one anonymous analytics event.
 *
 * Privacy design:
 *   - no cookie, no client identifier, no fingerprint
 *   - the raw IP is never written anywhere
 *   - unique visitors are counted with an HMAC of (day, IP, user agent) and a
 *     server secret; the digest lives one day and is then discarded
 *   - only coarse dimensions are stored: path, UI language, country code,
 *     device class, screen bucket, referrer host
 *   - DNT and Global Privacy Control are honoured on the server too
 */
import { json, preflight, readJson } from '../_lib/http.js';
import { record } from '../_lib/stats.js';

export const onRequestOptions = () => preflight();

const ALLOWED = new Set(['pageview', 'tool', 'tab', 'verdict', 'lang']);

export async function onRequestPost({ request, env }) {
  if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') {
    return json({ ok: true, stored: false, reason: 'opt-out' });
  }

  let body;
  try {
    body = await readJson(request, 4096);
  } catch {
    return json({ ok: true, stored: false });
  }

  const type = String(body.type || 'pageview');
  if (!ALLOWED.has(type)) return json({ ok: true, stored: false, reason: 'ignored' });

  // Only these fields are ever accepted; everything else is dropped.
  const safe = {
    type,
    path: body.path,
    lang: body.lang,
    referrer: body.referrer,
    device: body.device,
    screen: body.screen,
    tool: body.tool,
    verdict: body.verdict,
    tab: body.tab,
  };

  let result = { stored: false, reason: 'no-store' };
  try {
    result = await record(env, safe, request);
  } catch {
    /* a failed beacon must never surface */
  }
  return json({ ok: true, ...result });
}
