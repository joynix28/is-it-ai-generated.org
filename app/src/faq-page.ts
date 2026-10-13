import './style.css';
import { initI18n, setLocale, onLocaleChange, translateDom, t, getLocale } from './i18n';

interface FaqItem { q: string; a: string }

const modules = import.meta.glob<{ default: FaqItem[] }>('./faq/*.json', { eager: true });
const FAQS: Record<string, FaqItem[]> = {};
for (const [path, mod] of Object.entries(modules)) {
  FAQS[path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '')] = mod.default;
}

const THEME_KEY = 'aitd.theme';

function initTheme(): void {
  const stored = localStorage.getItem(THEME_KEY);
  document.documentElement.dataset.theme = stored
    ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const label = document.getElementById('theme-label');
  const sync = (): void => {
    const dark = document.documentElement.dataset.theme === 'dark';
    if (label) label.textContent = t(dark ? 'app.theme.toLight' : 'app.theme.toDark');
  };
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    sync();
  });
  onLocaleChange(sync);
  sync();
}

/** Render the FAQ for the current locale, or explain that it is not translated yet. */
function renderFaq(): void {
  const list = document.getElementById('faq-list');
  const note = document.getElementById('faq-note');
  if (!list) return;
  const items = FAQS[getLocale()] ?? [];
  list.replaceChildren();
  if (note) note.hidden = items.length > 0;
  for (const item of items) {
    const details = document.createElement('details');
    details.className = 'group py-1';
    const summary = document.createElement('summary');
    summary.className = 'cursor-pointer list-none py-3 pr-8 text-body font-medium marker:content-none';
    summary.textContent = item.q;
    const answer = document.createElement('p');
    answer.className = 'max-w-[68ch] pb-4 pr-8 text-body leading-relaxed text-zinc-600 dark:text-zinc-400';
    answer.textContent = item.a;
    details.append(summary, answer);
    list.append(details);
  }
}

const select = document.getElementById('locale-select') as HTMLSelectElement | null;
if (select) {
  initI18n(select);
  select.addEventListener('change', () => {
    setLocale(select.value);
    renderFaq();
    translateDom(document);
  });
}
initTheme();
renderFaq();
translateDom(document);
