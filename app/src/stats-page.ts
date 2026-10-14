import './style.css';
import { initI18n, setLocale, onLocaleChange, translateDom, t } from './i18n';
import { isOptedOut, setOptOut } from './analytics';

const THEME_KEY = 'aitd.theme';

function initTheme(): void {
  const stored = localStorage.getItem(THEME_KEY);
  document.documentElement.dataset.theme = stored
    ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const label = document.getElementById('theme-label');
  const sync = (): void => {
    if (label) label.textContent = t(document.documentElement.dataset.theme === 'dark' ? 'app.theme.toLight' : 'app.theme.toDark');
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

interface Row { key: string; count: number }

function card(label: string, value: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'rounded-md border p-4 hairline';
  const l = document.createElement('div');
  l.className = 'metric-label';
  l.textContent = label;
  const v = document.createElement('div');
  v.className = 'mt-1 font-mono text-xl font-semibold tabular-nums';
  v.textContent = value;
  el.append(l, v);
  return el;
}

function list(container: HTMLElement | null, rows: Row[]): void {
  if (!container) return;
  container.replaceChildren();
  if (!rows.length) {
    const p = document.createElement('p');
    p.className = 'text-label text-zinc-400';
    p.textContent = t('stats.empty');
    container.append(p);
    return;
  }
  const max = Math.max(...rows.map((r) => r.count));
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'flex items-center gap-3 py-1';
    const name = document.createElement('span');
    name.className = 'w-28 shrink-0 truncate font-mono text-label text-zinc-500';
    name.textContent = row.key;
    const track = document.createElement('div');
    track.className = 'h-1.5 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800';
    const fill = document.createElement('div');
    fill.className = 'h-full rounded-full bg-zinc-900 dark:bg-zinc-100';
    fill.style.width = `${Math.round((row.count / max) * 100)}%`;
    track.append(fill);
    const value = document.createElement('span');
    value.className = 'w-12 shrink-0 text-right font-mono text-label tabular-nums';
    value.textContent = String(row.count);
    line.append(name, track, value);
    container.append(line);
  }
}

async function loadStats(): Promise<void> {
  const grid = document.getElementById('stats-grid');
  try {
    const res = await fetch('/api/stats?days=30');
    const data = await res.json();
    if (grid) {
      grid.replaceChildren(
        card(t('stats.today'), String(data.viewsToday ?? 0)),
        card(t('stats.views'), String(data.views30d ?? 0)),
        card(t('stats.uniques'), String(data.uniques30d ?? 0)),
      );
    }
    list(document.getElementById('s-pages'), data.topPages ?? []);
    list(document.getElementById('s-langs'), data.topLanguages ?? []);
    list(document.getElementById('s-countries'), data.topCountries ?? []);
    list(document.getElementById('s-devices'), data.topDevices ?? []);
  } catch {
    if (grid) grid.replaceChildren(card(t('stats.title'), '—'));
  }
}

const optout = document.getElementById('optout');
const syncOpt = (): void => {
  if (optout) optout.textContent = isOptedOut() ? t('stats.optoutOff') : t('stats.optoutOn');
};
optout?.addEventListener('click', () => {
  setOptOut(!isOptedOut());
  syncOpt();
});

const select = document.getElementById('locale-select') as HTMLSelectElement | null;
if (select) {
  initI18n(select);
  select.addEventListener('change', () => {
    setLocale(select.value);
    // The cards are built with t() at load, so rebuild them in the new language.
    void loadStats();
    syncOpt();
  });
}
initTheme();
syncOpt();
translateDom(document);
void loadStats();
