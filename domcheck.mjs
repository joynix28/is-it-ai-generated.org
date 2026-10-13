import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = '/tmp/opencode/is-it-ai-generated.org';
const html = readFileSync(join(root, 'public/index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });

def('window', window);
def('document', window.document);
def('location', window.location);
def('history', window.history);
def('localStorage', window.localStorage);
def('navigator', { languages: ['en'], language: 'en', clipboard: { writeText: async () => {} }, sendBeacon: () => true, maxTouchPoints: 0, doNotTrack: null, globalPrivacyControl: false });
def('Option', window.Option);
def('Blob', window.Blob);
def('requestAnimationFrame', (cb) => setTimeout(() => cb(performance.now()), 0));
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
def('matchMedia', window.matchMedia);
window.scrollTo = () => {};
def('fetch', async (url) => {
  const u = String(url);
  if (u.includes('/i18n/index.json')) return new Response(readFileSync(join(root, 'public/i18n/index.json'), 'utf8'), { status: 200 });
  if (u.includes('/i18n/en.json')) return new Response(readFileSync(join(root, 'public/i18n/en.json'), 'utf8'), { status: 200 });
  if (u.includes('/api/stats')) return new Response(JSON.stringify({ viewsToday: 1, views30d: 2, uniques30d: 1, topPages: [] }), { status: 200 });
  throw new Error('unstubbed fetch: ' + u);
});

const errors = [];
const orig = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); orig(...a); };

await import(join(root, 'public/app/main.js'));
await new Promise((r) => setTimeout(r, 800));

const wb = window.document.getElementById('workbench');
const txt = wb?.textContent || '';
const failed = txt.includes('Failed to start');
console.log('ready:', window.document.documentElement.dataset.ready, '| failed:', failed);
if (failed) console.log('message:', txt.slice(txt.indexOf('Failed to start'), txt.indexOf('Failed to start') + 180).split('\n')[0]);
console.log('errors:', errors.slice(0, 4));
process.exit(failed ? 1 : 0);
