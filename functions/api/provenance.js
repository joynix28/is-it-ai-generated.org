/**
 * POST /api/provenance
 *
 * Combines three provenance checks on one file:
 *   1. Local C2PA parse (always).
 *   2. Local SynthID/C2PA report from our own parser.
 *   3. OpenAI Content Provenance API, when OPENAI_API_KEY is configured.
 *
 * Body: { base64: "<image or audio bytes>", mime?: string }
 *
 * The OpenAI key never reaches the browser: it is a Pages secret read here.
 */
import { analyzeC2pa, c2paSummary, detectFormat } from '../../src/core/index.js';
import { json, error, preflight, readJson, rateLimit } from '../_lib/http.js';

export const onRequestOptions = () => preflight();

function base64ToBytes(b64) {
  const clean = String(b64).replace(/^data:[^,]+,/, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function onRequestPost({ request, env }) {
  const rl = rateLimit(request, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) return error('rate limit exceeded', 429);

  let body;
  try {
    body = await readJson(request, 12 * 1024 * 1024);
  } catch (err) {
    return error(err.message || 'invalid json', 413);
  }
  if (typeof body.base64 !== 'string') return error('field "base64" is required', 422);

  let bytes;
  try {
    bytes = base64ToBytes(body.base64);
  } catch {
    return error('invalid base64', 422);
  }
  if (bytes.length > 50 * 1024 * 1024) return error('file too large (max 50 MiB)', 413);

  const format = detectFormat(bytes);
  const local = c2paSummary(analyzeC2pa(bytes, format));

  const out = {
    ok: true,
    format,
    size: bytes.length,
    local,
    openai: { configured: false, available: false },
    synthid: {
      available: false,
      reason: 'needs-decoder',
      note: 'SynthID and Stable Signature need a neural decoder; the browser cannot run Google\'s (undistributed) model. OpenAI\'s API checks SynthID server-side when a key is configured.',
    },
  };

  const key = env && env.OPENAI_API_KEY;
  if (!key) {
    out.openai = {
      configured: false,
      available: false,
      note: 'Set the OPENAI_API_KEY secret on this Pages project to run OpenAI content provenance checks server-side.',
      docs: 'https://developers.openai.com/api/docs/guides/content-provenance',
    };
    return json(out);
  }

  try {
    const mime = body.mime || (format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'application/octet-stream');
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mime }), `upload.${format}`);
    const res = await fetch('https://api.openai.com/v1/content_provenance_checks', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    out.openai = {
      configured: true,
      available: res.ok,
      status: res.status,
      results: data.results || null,
      error: res.ok ? null : data.error || { message: 'request failed' },
    };
  } catch (err) {
    out.openai = { configured: true, available: false, error: { message: err.message } };
  }

  if (Array.isArray(out.openai.results)) {
    const hit = out.openai.results.find((r) => r.outcome === 'detected');
    out.synthid = hit
      ? { available: true, outcome: 'detected', type: hit.type, model: hit.model || null, generatedAt: hit.generated_at || null }
      : { available: true, outcome: 'not_detected' };
  }

  return json(out);
}
