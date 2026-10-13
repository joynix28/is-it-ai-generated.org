/**
 * Anonymous aggregate storage in Workers KV.
 *
 * One JSON document per day, updated read-modify-write. KV has no atomic
 * increment, so concurrent writes can undercount; documented rather than hidden.
 */

const DIM_LIMIT = 200;
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const docKey = (d) => `day:${d}`;

const clean = (value, max = 64) =>
  String(value ?? '').slice(0, max).replace(/[^\w\-./: ]/g, '') || 'unknown';

function bump(obj, key, by = 1) {
  if (!key) return;
  if (!(key in obj) && Object.keys(obj).length >= DIM_LIMIT) return;
  obj[key] = (obj[key] || 0) + by;
}

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function record(env, payload, request) {
  if (!env || !env.STATS) return { stored: false, reason: 'no-store' };
  const secret = env.STATS_SECRET || 'ai-text-detector-default-salt';
  const today = day();
  const key = docKey(today);

  const current = (await env.STATS.get(key, 'json')) || { views: 0, uniques: 0 };
  for (const dim of ['events', 'paths', 'languages', 'countries', 'devices', 'referrers', 'screens']) {
    current[dim] ||= {};
  }
  current.views ||= 0;
  current.uniques ||= 0;

  const type = clean(payload.type, 24);
  bump(current.events, type);

  if (type === 'pageview') {
    current.views += 1;
    bump(current.paths, clean(payload.path));
    bump(current.languages, clean(payload.lang, 12));
    bump(current.devices, clean(payload.device, 24));
    bump(current.screens, clean(payload.screen, 12));
    bump(current.referrers, clean(payload.referrer, 64));
    bump(current.countries, clean(request.headers.get('cf-ipcountry'), 8));

    const ip = request.headers.get('cf-connecting-ip');
    if (ip) {
      const ua = request.headers.get('user-agent') || '';
      const hash = await hmac(secret, `${today}|${ip}|${ua}`);
      const uvKey = `uv:${today}:${hash}`;
      if (!(await env.STATS.get(uvKey))) {
        current.uniques += 1;
        await env.STATS.put(uvKey, '1', { expirationTtl: 172800 });
      }
    }
  }

  await env.STATS.put(key, JSON.stringify(current));
  return { stored: true };
}

export async function summary(env, days = 30, topN = 12) {
  const empty = {
    available: false, viewsToday: 0, views30d: 0, uniques30d: 0, events: {},
    topPages: [], topLanguages: [], topCountries: [], topDevices: [], topReferrers: [], days: [],
  };
  if (!env || !env.STATS) return empty;

  const keys = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(day(d));
  }

  const docs = await Promise.all(keys.map((k) => env.STATS.get(docKey(k), 'json')));
  const merged = { viewsToday: 0, views30d: 0, uniques30d: 0, events: {}, paths: {}, languages: {}, countries: {}, devices: {}, referrers: {} };
  const series = [];

  docs.forEach((doc, i) => {
    if (!doc) { series.push({ day: keys[i], views: 0, uniques: 0 }); return; }
    if (i === 0) merged.viewsToday = doc.views || 0;
    merged.views30d += doc.views || 0;
    merged.uniques30d += doc.uniques || 0;
    series.push({ day: keys[i], views: doc.views || 0, uniques: doc.uniques || 0 });
    for (const dim of ['events', 'paths', 'languages', 'countries', 'devices', 'referrers']) {
      for (const [k, v] of Object.entries(doc[dim] || {})) merged[dim][k] = (merged[dim][k] || 0) + v;
    }
  });

  const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([key, count]) => ({ key, count }));

  return {
    available: true,
    viewsToday: merged.viewsToday,
    views30d: merged.views30d,
    uniques30d: merged.uniques30d,
    events: merged.events,
    topPages: top(merged.paths),
    topLanguages: top(merged.languages),
    topCountries: top(merged.countries),
    topDevices: top(merged.devices),
    topReferrers: top(merged.referrers),
    days: series.reverse(),
    generatedAt: new Date().toISOString(),
  };
}
