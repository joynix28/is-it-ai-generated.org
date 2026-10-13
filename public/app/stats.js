/** Site statistics tool: reads the anonymous aggregate from /api/stats. */

import { $, h, clear, renderTable } from './dom.js';
import { t } from './i18n.js';
import { isOptedOut, setOptOut } from './analytics.js';

export async function setupStatsTool() {
  const optout = $('#stats-optout');
  const sync = () => {
    optout.textContent = isOptedOut() ? t('stats.optoutOff') : t('stats.optoutOn');
  };
  sync();
  optout.addEventListener('click', () => { setOptOut(!isOptedOut()); sync(); });

  const grid = $('#stats-grid');
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    clear(grid);
    for (const [label, value] of [
      [t('stats.today'), data.viewsToday],
      [t('stats.visits'), data.views30d],
      [t('stats.uniques'), data.uniques30d],
    ]) {
      grid.append(h('div', { class: 'stat' }, [
        h('div', { class: 'stat__label', text: label }),
        h('div', { class: 'stat__value', text: value == null ? '—' : String(value) }),
      ]));
    }
    const pairs = (rows) => rows.map((p) => [p.key, p.count]);
    renderTable($('#stats-pages'), pairs(data.topPages || []), { head: ['', t('counter.count')] });
    renderTable($('#stats-langs'), pairs(data.topLanguages || []), { head: ['', t('counter.count')] });
    renderTable($('#stats-countries'), pairs(data.topCountries || []), { head: ['', t('counter.count')] });
    renderTable($('#stats-devices'), pairs(data.topDevices || []), { head: ['', t('counter.count')] });
  } catch {
    clear(grid);
    grid.append(h('p', { class: 'hint', text: t('common.error') }));
  }
}
