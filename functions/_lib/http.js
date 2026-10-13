/** Shared HTTP helpers for the Pages Functions API. */

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cacheControl || 'no-store',
      ...CORS,
      ...(init.headers || {}),
    },
  });
}

export function error(message, status = 400) {
  return json({ ok: false, error: message }, { status });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Read and size-limit a JSON body. */
export async function readJson(request, maxBytes = 256 * 1024) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len && len > maxBytes) throw new Error('payload too large');
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('payload too large');
  if (!text) return {};
  return JSON.parse(text);
}

/** Best-effort client IP (Cloudflare always sets CF-Connecting-IP). */
export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '0.0.0.0';
}

/**
 * Very small in-isolate rate limiter. Not durable across edge nodes, but it
 * stops trivial abuse of the public API without storing anything.
 */
const buckets = new Map();
export function rateLimit(request, { limit = 60, windowMs = 60_000, key } = {}) {
  const id = key || clientIp(request);
  const now = Date.now();
  const b = buckets.get(id);
  if (!b || now > b.reset) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  b.count += 1;
  if (b.count > limit) return { ok: false, remaining: 0, retryAfter: Math.ceil((b.reset - now) / 1000) };
  return { ok: true, remaining: limit - b.count };
}

export const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};
