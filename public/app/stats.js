/** Site statistics tool: reads the anonymous aggregate from /api/stats. */

import { $, h, clear, renderTable } from './dom.js';
import { t } from './i18n.js';
import { isOptedOut, setOptOut } from './analytics.js';

export async function setupStatsTool() {
  const optout = $('#stats-optout');
  const syncButton = () => {
    optout.textContent = isOptedOut() ? 'Enable anonymous statistics' : 'Disable anonymous statistics';
  };
  syncButton();
  optout.addEventListener('click', () => {
    setOptOut(!isOptedOut());
    syncButton();
  });

  const grid = $('#stats-grid');
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    clear(grid);
    const cards = [
      [t('stats.today'), data.viewsToday],
      [t('stats.visits'), data.views30d],
      [t('stats.uniques'), data.uniques30d],
    ];
    for (const [label, value] of cards) {
      grid.append(h('div', { class: 'stat' }, [
        h('div', { class: 'stat-label', text: label }),
        h('div', { class: 'stat-value', text: value == null ? '—' : String(value) }),
      ]));
    }
    renderTable($('#stats-pages'), (data.topPages || []).map((p) => [p.key, p.count]), { head: ['', t('counter.count')] });
    renderTable($('#stats-langs'), (data.topLanguages || []).map((p) => [p.key, p.count]), { head: ['', t('counter.count')] });
    renderTable($('#stats-countries'), (data.topCountries || []).map((p) => [p.key, p.count]), { head: ['', t('counter.count')] });
    renderTable($('#stats-devices'), (data.topDevices || []).map((p) => [p.key, p.count]), { head: ['', t('counter.count')] });
  } catch {
    clear(grid);
    grid.append(h('p', { class: 'note', text: t('common.error') }));
  }
}
