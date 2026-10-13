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

/* ---- Theme ------------------------------------------------------------- */
function initTheme() {
  const stored = localStorage.getItem('isitai.theme');
  if (stored) document.documentElement.dataset.theme = stored;
  $('#theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('isitai.theme', next);
  });
}

/* ---- Tabs -------------------------------------------------------------- */
const TABS = ['text', 'image', 'counter', 'slop', 'compare', 'stats', 'api', 'about'];

function showTab(name, { push = true } = {}) {
  if (!TABS.includes(name)) name = 'text';
  for (const tab of TABS) {
    const btn = $(`#tab-${tab}`);
    const panel = $(`#panel-${tab}`);
    const active = tab === name;
    if (btn) btn.setAttribute('aria-selected', String(active));
    if (panel) panel.hidden = !active;
  }
  if (push && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function initTabs() {
  for (const tab of TABS) {
    const btn = $(`#tab-${tab}`);
    if (btn) btn.addEventListener('click', () => { showTab(tab); track('tab', { tab }); });
  }
  for (const link of $$('[data-tab-link]')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showTab(link.dataset.tabLink);
      track('tab', { tab: link.dataset.tabLink });
    });
  }
  const hash = location.hash.replace('#', '');
  const panelMatch = /^panel-(.+)$/.exec(hash);
  showTab(panelMatch ? panelMatch[1] : (TABS.includes(hash) ? hash : 'text'), { push: false });
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    const m = /^panel-(.+)$/.exec(h);
    showTab(m ? m[1] : h, { push: false });
  });
}

/* ---- Boot -------------------------------------------------------------- */
async function boot() {
  initTheme();
  await initI18n();
  showTab((location.hash.replace('#', '').replace(/^panel-/, '') || 'text'), { push: false });
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
  const main = $('#main');
  if (main) main.insertAdjacentHTML('afterbegin', `<p class="note">Failed to start: ${err.message}</p>`);
});
