/**
 * Internationalisation.
 *
 * Catalogs live as JSON in `src/locales/`. They are picked up automatically, so
 * adding a language is dropping a file: no code to touch. `scripts/check-locales.mjs`
 * reports coverage at build time.
 *
 * Only locales that cover the whole French key set are offered in the picker.
 * That is the guarantee that a half-translated interface cannot appear, which is
 * what happened when a locale was served with English leaking through.
 *
 * `t()` falls back French, then to a humanised key. A raw key such as
 * "text.editor.title" can never reach the screen.
 */

type Catalog = Record<string, string>;

const modules = import.meta.glob<{ default: Catalog }>('./locales/*.json', { eager: true });

const CATALOGS: Record<string, Catalog> = {};
for (const [path, mod] of Object.entries(modules)) {
  const code = path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');
  CATALOGS[code] = mod.default;
}

const SOURCE = 'fr';
const fr: Catalog = CATALOGS[SOURCE] ?? {};

/** Display name per locale, in its own language. */
const NATIVE: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  ru: 'Русский',
  uk: 'Українська',
  pl: 'Polski',
  tr: 'Türkçe',
  ar: 'العربية',
  fa: 'فارسی',
  hi: 'हिन्दी',
  ur: 'اردو',
  bn: 'বাংলা',
  id: 'Bahasa Indonesia',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  sw: 'Kiswahili',
  mr: 'मराठी',
  te: 'తెలుగు',
  ta: 'தமிழ்',
  ro: 'Română',
  cs: 'Čeština',
  sv: 'Svenska',
  da: 'Dansk',
  fi: 'Suomi',
  no: 'Norsk',
  el: 'Ελληνικά',
  he: 'עברית',
  hu: 'Magyar',
  sk: 'Slovenčina',
  bg: 'Български',
  hr: 'Hrvatski',
  sr: 'Српски',
  sl: 'Slovenščina',
  lt: 'Lietuvių',
  lv: 'Latviešu',
  et: 'Eesti',
  is: 'Íslenska',
  ms: 'Bahasa Melayu',
  tl: 'Filipino',
  af: 'Afrikaans',
  ca: 'Català',
  gl: 'Galego',
  eu: 'Euskara',
  cy: 'Cymraeg',
  sq: 'Shqip',
  mk: 'Македонски',
  be: 'Беларуская',
  ka: 'ქართული',
  hy: 'Հայերեն',
  az: 'Azərbaycanca',
  kk: 'Қазақша',
  uz: 'Oʻzbekcha',
  ne: 'नेपाली',
  si: 'සිංහල',
  km: 'ខ្មែរ',
  lo: 'ລາວ',
  my: 'မြန်မာ',
  am: 'አማርኛ',
  ta_: 'தமிழ்',
};

const SOURCE_KEYS = Object.keys(fr);

/** A locale is offered only when it covers the whole French key set. */
const isComplete = (catalog: Catalog | undefined): catalog is Catalog =>
  Boolean(catalog) && SOURCE_KEYS.every((key) => typeof catalog![key] === 'string');

const COMPLETE: string[] = Object.keys(CATALOGS)
  .filter((code) => isComplete(CATALOGS[code]))
  .sort((a, b) => (a === SOURCE ? -1 : b === SOURCE ? 1 : a.localeCompare(b)));

let current: string = SOURCE;

/** Last-resort label, so a raw key never reaches the screen. */
function humanise(key: string): string {
  const tail = key.split('.').pop() ?? key;
  const spaced = tail.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const value = CATALOGS[current]?.[key] ?? fr[key] ?? humanise(key);
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export const getLocale = (): string => current;

export const availableLocales = (): Array<{ code: string; native: string }> =>
  COMPLETE.map((code) => ({ code, native: NATIVE[code] ?? code }));

/** Coverage report, useful in the console and in tests. */
export const localeCoverage = (): { code: string; complete: boolean; filled: number; total: number }[] =>
  Object.keys(CATALOGS).map((code) => {
    const filled = SOURCE_KEYS.filter((k) => typeof CATALOGS[code]![k] === 'string').length;
    return { code, complete: isComplete(CATALOGS[code]), filled, total: SOURCE_KEYS.length };
  });

function detect(): string {
  const stored = (() => {
    try {
      const value = localStorage.getItem('aitd.locale');
      return value && COMPLETE.includes(value) ? value : null;
    } catch {
      return null;
    }
  })();
  if (stored) return stored;

  const fromTag = (tag: string | undefined | null): string | null => {
    const base = String(tag ?? '').toLowerCase().split('-')[0];
    return COMPLETE.includes(base) ? base : null;
  };

  for (const tag of navigator.languages ?? [navigator.language]) {
    const hit = fromTag(tag);
    if (hit) return hit;
  }

  // Browser locale string, then the referring site's country code.
  const fromUa = fromTag(/(?:^|[ ;(])([a-z]{2})(?:[-_][a-z]{2})?/i.exec(navigator.userAgent)?.[1]);
  if (fromUa) return fromUa;

  try {
    const host = document.referrer ? new URL(document.referrer).hostname : '';
    const fromReferer = fromTag(/\.([a-z]{2})(?:\.|$)/.exec(host)?.[1]);
    if (fromReferer) return fromReferer;
  } catch {
    /* malformed referrer */
  }

  return SOURCE;
}

/** Translate every element carrying data-i18n / data-i18n-attr. */
export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    if (key) node.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((node) => {
    for (const pair of (node.dataset.i18nAttr ?? '').split(',')) {
      const [attr, key] = pair.split(':').map((v) => v.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    }
  });
}

/**
 * Reverse index: exact French string -> key.
 *
 * The templates were written in French, so instead of rewriting every one we
 * translate the DOM by matching its text nodes against the French catalog.
 * Ambiguous values (several keys sharing a French string) are dropped, so a
 * match is never guesswork. Anything unmatched is left as it is.
 */
const FR_TO_KEY = (() => {
  const index = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const [key, value] of Object.entries(fr)) {
    if (!value || value.includes('{')) continue;
    const existing = index.get(value);
    if (existing && existing !== key) ambiguous.add(value);
    else index.set(value, key);
  }
  for (const value of ambiguous) index.delete(value);
  return index;
})();

/** Translate static text in place. Code, options and live regions are skipped. */
export function translateDom(root: ParentNode = document): void {
  if (current === SOURCE) return;
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  for (const textNode of nodes) {
    const parent = textNode.parentElement;
    if (!parent) continue;
    const tag = parent.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'CODE' || tag === 'OPTION') continue;
    if (parent.closest('#editor, #tip, #highlight-layer, #components-list, #fingerprint-notes')) continue;
    const trimmed = textNode.nodeValue?.trim() ?? '';
    if (!trimmed) continue;
    const key = FR_TO_KEY.get(trimmed);
    if (!key) continue;
    const leading = textNode.nodeValue!.match(/^\s*/)?.[0] ?? '';
    const trailing = textNode.nodeValue!.match(/\s*$/)?.[0] ?? '';
    textNode.nodeValue = `${leading}${t(key)}${trailing}`;
  }
}

const listeners = new Set<() => void>();

export function onLocaleChange(fn: () => void): void {
  listeners.add(fn);
}

export function setLocale(code: string): void {
  if (!COMPLETE.includes(code)) return;
  current = code;
  document.documentElement.lang = code;
  document.documentElement.dir = ['ar', 'fa', 'ur', 'he'].includes(code) ? 'rtl' : 'ltr';
  try {
    localStorage.setItem('aitd.locale', code);
  } catch {
    /* storage disabled: the choice simply does not persist */
  }
  applyTranslations();
  translateDom(document);
  for (const fn of listeners) fn();
}

/** Fill the header picker and translate the initial paint. */
export function initI18n(select: HTMLSelectElement): string {
  current = detect();
  document.documentElement.lang = current;
  document.documentElement.dir = ['ar', 'fa', 'ur', 'he'].includes(current) ? 'rtl' : 'ltr';
  select.replaceChildren();
  for (const { code, native } of availableLocales()) {
    select.append(new Option(native, code));
  }
  select.value = current;
  applyTranslations();
  translateDom(document);
  return current;
}
