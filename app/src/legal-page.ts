import './style.css';
import { initI18n, setLocale, onLocaleChange, translateDom, t } from './i18n';

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

const select = document.getElementById('locale-select') as HTMLSelectElement | null;
if (select) {
  initI18n(select);
  select.addEventListener('change', () => {
    setLocale(select.value);
    translateDom(document);
  });
}
initTheme();
translateDom(document);
