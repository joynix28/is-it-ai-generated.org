/**
 * Boots the real front end inside a simulated DOM and fails if any module
 * throws during setup. This is the test that would have caught the stale-module
 * boot failure (a module binding an element the document no longer has).
 *
 * Requires `npm run build` first (the app imports public/core).
 * Skips cleanly when jsdom is not installed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(root, 'public');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  JSDOM = null;
}

function installGlobals(window) {
  const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  def('window', window);
  def('document', window.document);
  def('location', window.location);
  def('history', window.history);
  def('localStorage', window.localStorage);
  def('Option', window.Option);
  def('Blob', window.Blob);
  def('navigator', {
    languages: ['en'], language: 'en', maxTouchPoints: 0, doNotTrack: null,
    globalPrivacyControl: false, clipboard: { writeText: async () => {} }, sendBeacon: () => true,
  });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  def('matchMedia', window.matchMedia);
  window.scrollTo = () => {};
  def('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0));
}

test('the app boots without errors in a DOM', { skip: !JSDOM && 'jsdom not installed' }, async () => {
  const html = readFileSync(join(publicDir, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  installGlobals(dom.window);

  const locales = new Map();
  locales.set('/i18n/index.json', readFileSync(join(publicDir, 'i18n', 'index.json'), 'utf8'));
  locales.set('/i18n/en.json', readFileSync(join(publicDir, 'i18n', 'en.json'), 'utf8'));
  globalThis.fetch = async (url) => {
    const u = String(url);
    for (const [key, body] of locales) if (u.includes(key)) return new Response(body, { status: 200 });
    if (u.includes('/api/stats')) {
      return new Response(JSON.stringify({ viewsToday: 0, views30d: 0, uniques30d: 0, topPages: [] }), { status: 200 });
    }
    throw new Error(`unstubbed fetch: ${u}`);
  };

  const errors = [];
  const original = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };
  try {
    await import(join(publicDir, 'app', 'main.js'));
    await new Promise((resolve) => setTimeout(resolve, 600));
  } finally {
    console.error = original;
  }

  const doc = dom.window.document;
  assert.equal(doc.documentElement.dataset.ready, 'true', 'the app never finished booting');
  assert.equal(errors.length, 0, `console errors during boot:\n${errors.join('\n')}`);

  // Every tool must have wired itself.
  for (const tab of ['text', 'image', 'counter', 'slop', 'compare', 'stats', 'api', 'about']) {
    assert.ok(doc.getElementById(`tab-${tab}`), `tab ${tab} missing`);
    assert.ok(doc.getElementById(`panel-${tab}`), `panel ${tab} missing`);
  }
  // The i18n pass must have translated the document.
  assert.notEqual(doc.querySelector('[data-i18n="app.name"]').textContent, 'app.name');
});
