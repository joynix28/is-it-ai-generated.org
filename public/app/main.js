/** App bootstrap: theme, tabs, i18n, tools, analytics. */

import { $, $$ } from './dom.js';
import { initI18n, getLocale } from './i18n.js';
import { initAnalytics, track } from './analytics.js';
import { setupTextTool } from './text.js';
import { setupImageTool } from './image.js';
import { setupCounterTool } from './counter.js';
import { setupSlopTool } from './slop.js';
import { setupCompareTool } from './compare.js';
import { setupStatsTool } from './stats.js';

const TABS = ['text', 'image', 'counter', 'slop', 'compare', 'stats', 'api', 'about'];
const THEME_KEY = 'isitai.theme';

/* ---- Theme: explicit, persisted, honours the system default first. ------- */
function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  document.documentElement.dataset.theme = stored
    || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

  $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  });
}

/* ---- Tabs. --------------------------------------------------------------- */
function showTab(name, { push = true } = {}) {
  if (!TABS.includes(name)) name = 'text';
  for (const tab of TABS) {
    const btn = $(`#tab-${tab}`);
    const panel = $(`#panel-${tab}`);
    if (btn) btn.setAttribute('aria-selected', String(tab === name));
    if (panel) panel.hidden = tab !== name;
  }
  if (push && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function tabFromHash() {
  const raw = location.hash.replace('#', '');
  const m = /^panel-(.+)$/.exec(raw);
  return m ? m[1] : raw;
}

function initTabs() {
  for (const tab of TABS) {
    const btn = $(`#tab-${tab}`);
    if (btn) {
      btn.addEventListener('click', () => { showTab(tab); track('tab', { tab }); });
      btn.addEventListener('keydown', (e) => {
        const i = TABS.indexOf(tab);
        if (e.key === 'ArrowRight') { e.preventDefault(); const n = TABS[(i + 1) % TABS.length]; showTab(n); $(`#tab-${n}`).focus(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); const n = TABS[(i - 1 + TABS.length) % TABS.length]; showTab(n); $(`#tab-${n}`).focus(); }
      });
    }
  }
  for (const link of $$('[data-tab-link]')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showTab(link.dataset.tabLink);
      track('tab', { tab: link.dataset.tabLink });
    });
  }
  window.addEventListener('hashchange', () => showTab(tabFromHash(), { push: false }));
}

async function boot() {
  initTheme();
  await initI18n();
  showTab(TABS.includes(tabFromHash()) ? tabFromHash() : 'text', { push: false });
  initTabs();
  setupTextTool();
  setupImageTool();
  setupCounterTool();
  setupSlopTool();
  setupCompareTool();
  await setupStatsTool();
  initAnalytics();
  document.documentElement.dataset.ready = 'true';
  track('boot', { locale: getLocale() });
}

boot().catch((err) => {
  console.error(err);
  const main = $('#workbench');
  if (main) main.prepend(Object.assign(document.createElement('p'), { className: 'note', textContent: `Failed to start: ${err.message}` }));
});
