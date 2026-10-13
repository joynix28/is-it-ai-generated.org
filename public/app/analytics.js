/**
 * Privacy-first, first-party analytics.
 *
 * What leaves the device: a page path, the UI language, the referrer host, a
 * coarse screen-size bucket and the device class. Nothing else. No cookies, no
 * identifiers, no text or image content, ever.
 *
 * Respects Do Not Track and Global Privacy Control, and can be turned off.
 */

const OPT_KEY = 'isitai.analytics';
const ENDPOINT = '/api/collect';

const optedOut = () =>
  localStorage.getItem(OPT_KEY) === 'off' ||
  navigator.doNotTrack === '1' ||
  navigator.doNotTrack === 'yes' ||
  navigator.globalPrivacyControl === true;

export function isOptedOut() {
  return optedOut();
}

export function setOptOut(value) {
  localStorage.setItem(OPT_KEY, value ? 'off' : 'on');
}

function deviceClass() {
  const w = window.innerWidth;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (w < 640) return touch ? 'phone' : 'narrow';
  if (w < 1024) return touch ? 'tablet' : 'small-desktop';
  return 'desktop';
}

function screenBucket() {
  const w = window.innerWidth;
  if (w < 480) return '<480';
  if (w < 768) return '<768';
  if (w < 1280) return '<1280';
  if (w < 1920) return '<1920';
  return '>=1920';
}

function referrerHost() {
  try {
    return document.referrer ? new URL(document.referrer).host || 'direct' : 'direct';
  } catch {
    return 'unknown';
  }
}

/**
 * Send one event.
 * @param {string} type - e.g. "pageview", "tool", "verdict"
 * @param {Record<string, string|number>} [props]
 */
export function track(type, props = {}) {
  if (optedOut()) return;
  const payload = {
    type,
    path: location.pathname,
    lang: document.documentElement.lang || 'en',
    referrer: referrerHost(),
    device: deviceClass(),
    screen: screenBucket(),
    ...props,
  };
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch { /* fall through to fetch */ }
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function initAnalytics() {
  track('pageview');
  let last = location.pathname;
  window.addEventListener('popstate', () => {
    if (location.pathname !== last) {
      last = location.pathname;
      track('pageview');
    }
  });
}
