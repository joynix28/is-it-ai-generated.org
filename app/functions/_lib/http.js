/** Shared HTTP helpers for the Pages Functions. */

const CORS = {
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
    },
  });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export async function readJson(request, maxBytes = 4096) {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('payload too large');
  return text ? JSON.parse(text) : {};
}
