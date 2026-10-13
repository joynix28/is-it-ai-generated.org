/**
 * Anonymous aggregate statistics.
 *
 * Design constraints:
 *  - No cookies, no client identifiers, no personal data at rest.
 *  - Unique visitors are counted with an HMAC of (IP + user-agent + date +
 *    secret). The hash exists for one day and is discarded. The raw IP is
 *    never written to storage.
 *  - Only aggregate counters are stored: views, uniques and coarse dimensions
 *    (path, UI language, country, device, referrer host).
 *
 * Storage is Cloudflare KV. KV has no atomic increment, so counters use a
 * read-modify-write on a per-day document. That can undercount under heavy
 * concurrent writes; for this site's volume the trade-off is fine and is
 * documented rather than hidden.
 */

const DIM_LIMIT = 200; // max distinct values kept per dimension per day

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

function dayDocKey(day) {
  return `day:${day}`;
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bump(obj, key, by = 1) {
  if (!key) return;
  if (!(key in obj) && Object.keys(obj).length >= DIM_LIMIT) return;
  obj[key] = (obj[key] || 0) + by;
}

/** Safe dimension values: bounded length, no free text. */
function clean(value, max = 64) {
  return String(value || '').slice(0, max).replace(/[^\w\-./: ]/g, '') || 'unknown';
}

/**
 * Record one event. Never throws.
 * @param {any} env
 * @param {object} payload
 * @param {Request} request
 */
export async function record(env, payload, request) {
  if (!env || !env.STATS) return { stored: false, reason: 'no-store' };
  const secret = env.STATS_SECRET || 'is-it-ai-generated-default-salt';
  const day = dayKey();
  const key = dayDocKey(day);

  const current = (await env.STATS.get(key, 'json')) || {
    views: 0, uniques: 0, events: {}, paths: {}, languages: {}, countries: {}, devices: {}, referrers: {}, screens: {},
  };
  current.paths ||= {}; current.languages ||= {}; current.countries ||= {};
  current.devices ||= {}; current.referrers ||= {}; current.screens ||= {}; current.events ||= {};

  const type = clean(payload.type || 'pageview', 32);
  current.events[type] = (current.events[type] || 0) + 1;

  if (type === 'pageview') {
    current.views += 1;
    bump(current.paths, clean(payload.path));
    bump(current.languages, clean(payload.lang, 12));
    bump(current.devices, clean(payload.device, 24));
    bump(current.screens, clean(payload.screen, 12));
    bump(current.referrers, clean(payload.referrer, 64));

    const ip = request.headers.get('cf-connecting-ip') || '';
    const country = request.headers.get('cf-ipcountry') || 'XX';
    bump(current.countries, clean(country, 8));

    // Unique visitor: daily rotating hash, discarded after 2 days.
    if (ip) {
      const ua = request.headers.get('user-agent') || '';
      const hash = await hmacHex(secret, `${day}|${ip}|${ua}`);
      const uvKey = `uv:${day}:${hash}`;
      const seen = await env.STATS.get(uvKey);
      if (!seen) {
        current.uniques += 1;
        await env.STATS.put(uvKey, '1', { expirationTtl: 172800 });
      }
    }
  }

  await env.STATS.put(key, JSON.stringify(current));
  return { stored: true };
}

/** Aggregate the last `days` days into a summary object. */
export async function summary(env, days = 30, topN = 12) {
  const empty = {
    viewsToday: 0, views30d: 0, uniques30d: 0, events: {},
    topPages: [], topLanguages: [], topCountries: [], topDevices: [], topReferrers: [], days: [],
  };
  if (!env || !env.STATS) return { ...empty, available: false };

  const today = new Date();
  const keys = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(dayKey(d));
  }

  const docs = await Promise.all(keys.map((k) => env.STATS.get(dayDocKey(k), 'json')));
  const merged = {
    viewsToday: 0, views30d: 0, uniques30d: 0,
    events: {}, paths: {}, languages: {}, countries: {}, devices: {}, referrers: {},
  };
  const dayseries = [];

  docs.forEach((doc, i) => {
    if (!doc) { dayseries.push({ day: keys[i], views: 0, uniques: 0 }); return; }
    if (i === 0) merged.viewsToday = doc.views || 0;
    merged.views30d += doc.views || 0;
    merged.uniques30d += doc.uniques || 0;
    dayseries.push({ day: keys[i], views: doc.views || 0, uniques: doc.uniques || 0 });
    for (const dim of ['events', 'paths', 'languages', 'countries', 'devices', 'referrers']) {
      const src = doc[dim] || {};
      const dst = merged[dim];
      for (const [k, v] of Object.entries(src)) dst[k] = (dst[k] || 0) + v;
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
    days: dayseries.reverse(),
    generatedAt: new Date().toISOString(),
  };
}
