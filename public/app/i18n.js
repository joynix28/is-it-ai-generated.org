/** Internationalisation: lazy-loaded JSON catalogs with English fallback. */

import { $, $$ } from './dom.js';

const STORAGE_KEY = 'isitai.lang';
let supported = [];
let catalog = {};
let fallback = {};
let current = 'en';
let currentMeta = { code: 'en', native: 'English', rtl: false };
const listeners = new Set();

/** Choose the best locale from URL, storage, then device settings. */
function pickLocale() {
  const codes = new Set(supported.map((s) => s.code));
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl && codes.has(fromUrl.toLowerCase())) return fromUrl.toLowerCase();

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && codes.has(stored)) return stored;

  const device = [...(navigator.languages || []), navigator.language].filter(Boolean);
  for (const tag of device) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (codes.has(base)) return base;
  }
  return 'en';
}

async function loadCatalog(code) {
  try {
    const res = await fetch(`/i18n/${code}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return {};
  }
}

/** Initialise catalogs and apply the detected language. */
export async function initI18n() {
  [supported, fallback] = await Promise.all([
    fetch('/i18n/index.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    loadCatalog('en'),
  ]);
  if (!supported.length) supported = [{ code: 'en', native: 'English', rtl: false }];

  const select = $('#lang-select');
  if (select) {
    select.innerHTML = '';
    for (const s of supported) {
      select.append(new Option(s.native, s.code));
    }
    select.addEventListener('change', () => setLocale(select.value, { persist: true }));
  }

  await setLocale(pickLocale(), { persist: false });
  return current;
}

/** Switch language. */
export async function setLocale(code, opts = {}) {
  const meta = supported.find((s) => s.code === code) || supported[0] || { code: 'en', native: 'English', rtl: false };
  current = meta.code;
  currentMeta = meta;
  catalog = current === 'en' ? fallback : await loadCatalog(current);
  if (opts.persist) localStorage.setItem(STORAGE_KEY, current);

  const select = $('#lang-select');
  if (select && select.value !== current) select.value = current;

  document.documentElement.lang = current;
  document.documentElement.dir = meta.rtl ? 'rtl' : 'ltr';
  applyTranslations();
  for (const fn of listeners) {
    try { fn(current); } catch (err) { console.error(err); }
  }
}

/** Translate a key with optional {placeholder} substitution. */
export function t(key, vars) {
  let value = catalog[key] ?? fallback[key] ?? key;
  if (vars && typeof value === 'string') {
    value = value.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  }
  return value;
}

/** Apply data-i18n / data-i18n-attr attributes across the DOM. */
export function applyTranslations(root = document) {
  for (const el of $$('[data-i18n]', root)) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of $$('[data-i18n-attr]', root)) {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getLocale = () => current;
export const getSupported = () => supported;
export const isRTL = () => Boolean(currentMeta.rtl);
