/**
 * Anonymous, first-party analytics.
 *
 * What leaves the device: the page path, the interface language, the referrer
 * host, a device class and a coarse screen bucket. No cookie, no identifier, no
 * fingerprint, and never any text or image content.
 *
 * Do Not Track and Global Privacy Control are honoured, and there is a visible
 * opt-out on the statistics page.
 */

const OPT_KEY = 'aitd.analytics';
const ENDPOINT = '/api/collect';

export const isOptedOut = (): boolean =>
  localStorage.getItem(OPT_KEY) === 'off'
  || navigator.doNotTrack === '1'
  || navigator.doNotTrack === 'yes'
  || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

export function setOptOut(value: boolean): void {
  try {
    localStorage.setItem(OPT_KEY, value ? 'off' : 'on');
  } catch {
    /* storage disabled */
  }
}

function deviceClass(): string {
  const w = window.innerWidth;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (w < 640) return touch ? 'phone' : 'narrow';
  if (w < 1024) return touch ? 'tablet' : 'small-desktop';
  return 'desktop';
}

function screenBucket(): string {
  const w = window.innerWidth;
  if (w < 480) return '<480';
  if (w < 768) return '<768';
  if (w < 1280) return '<1280';
  if (w < 1920) return '<1920';
  return '>=1920';
}

function referrerHost(): string {
  try {
    return document.referrer ? new URL(document.referrer).host || 'direct' : 'direct';
  } catch {
    return 'unknown';
  }
}

/** Send one event. Silent on every failure. */
export function track(type: string, props: Record<string, string | number> = {}): void {
  if (isOptedOut()) return;
  const payload = JSON.stringify({
    type,
    path: location.pathname,
    lang: document.documentElement.lang || 'fr',
    referrer: referrerHost(),
    device: deviceClass(),
    screen: screenBucket(),
    ...props,
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  void fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true })
    .catch(() => undefined);
}

export function initAnalytics(): void {
  track('pageview');
}
