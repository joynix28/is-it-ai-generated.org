/**
 * POST /api/image
 *
 * Server-side image analysis covers provenance metadata only (EXIF, XMP,
 * PNG chunks, C2PA). Pixel statistics need a decoder, so they run in the
 * browser instead; pass them here as { data, width, height } if you have them.
 *
 * Body (JSON):
 *   { base64: "<image bytes base64>", mime?: string }
 *   { data: number[], width: number, height: number }   // RGBA pixels
 */
import { analyzeImage } from '../../src/core/index.js';
import { json, error, preflight, readJson, rateLimit } from '../_lib/http.js';

export const onRequestOptions = () => preflight();

function base64ToBytes(b64) {
  const clean = b64.replace(/^data:[^,]+,/, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function onRequestPost({ request }) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return error('rate limit exceeded', 429);

  let body;
  try {
    body = await readJson(request, 8 * 1024 * 1024);
  } catch (err) {
    return error(err.message || 'invalid json', 413);
  }

  let bytes;
  if (body.data && body.width && body.height) {
    const report = analyzeImage({
      bytes: typeof body.base64 === 'string' ? base64ToBytes(body.base64) : undefined,
      mime: body.mime,
      data: Uint8ClampedArray.from(body.data),
      width: Number(body.width),
      height: Number(body.height),
    });
    return json({ ok: true, ...report });
  }

  if (typeof body.base64 === 'string') {
    try {
      bytes = base64ToBytes(body.base64);
    } catch {
      return error('invalid base64', 422);
    }
  } else {
    return error('provide "base64" (and optionally pixels)', 422);
  }

  const report = analyzeImage({ bytes, mime: body.mime });
  return json({
    ok: true,
    ...report,
    note: 'Server-side analysis is metadata-only. Pixel statistics run in the browser.',
  });
}
