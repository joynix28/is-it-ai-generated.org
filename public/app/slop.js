/** Slop detector tool: named findings with quotes and fixes, plus safe cleanup. */

import { detectSlop, deslop } from '../core/index.js';
import { $, h, icon, clear, renderRing, toast } from './dom.js';
import { t, onLocaleChange } from './i18n.js';
import { track } from './analytics.js';

let lastResult = null;

export function setupSlopTool() {
  const input = $('#slop-input');

  const run = () => {
    if (!input.value.trim()) return;
    lastResult = detectSlop(input.value);
    render(lastResult);
    track('tool', { tool: 'slop' });
  };

  $('#slop-run').addEventListener('click', run);
  $('#slop-clear').addEventListener('click', () => {
    input.value = '';
    $('#slop-result').hidden = true;
    $('#slop-empty').hidden = false;
    $('#slop-cleaned-wrap').hidden = true;
  });
  $('#slop-deslop').addEventListener('click', () => {
    const { text, changes } = deslop(input.value);
    $('#slop-cleaned-wrap').hidden = false;
    $('#slop-cleaned').value = text;
    lastResult = detectSlop(text);
    render(lastResult, changes.length);
    toast(`${changes.length} × ${t('slop.applied')}`);
  });

  onLocaleChange(() => { if (lastResult) render(lastResult); });
}

function render(r, changes = 0) {
  $('#slop-empty').hidden = true;
  $('#slop-result').hidden = false;
  renderRing($('#slop-gauge'), r.score, { color: 'var(--accent)' });

  const v = $('#slop-verdict');
  v.textContent = r.score < 15 ? t('slop.level.none') : r.score < 40 ? t('slop.level.low')
    : r.score < 70 ? t('slop.level.medium') : t('slop.level.high');
  v.className = 'verdict';

  const list = $('#slop-findings');
  clear(list);
  if (!r.findings.length) {
    list.append(h('p', { class: 'hint', text: t('slop.none') }));
    return;
  }
  for (const f of r.findings) {
    const quotes = h('div', { class: 'chips' });
    for (const m of f.matches.slice(0, 6)) {
      quotes.append(h('span', { class: 'chip' }, [h('mark', { text: m.value.trim() })]));
    }
    list.append(h('div', { class: 'finding' }, [
      h('div', { class: 'finding__head' }, [
        h('strong', { text: f.label }),
        h('span', { text: `${f.count} ${t('slop.occurrences')}` }),
      ]),
      h('p', { class: 'finding__hint', text: `${t('slop.hint')}: ${f.hint}` }),
      quotes,
    ]));
  }
  if (changes) list.append(h('p', { class: 'hint', text: `${changes} × ${t('slop.applied')}` }));

  // ai-slop-detect catalogue, reported separately from the pattern score.
  const cat = r.catalog;
  const block = $('#slop-catalog-block');
  if (!cat) { block.hidden = true; return; }
  block.hidden = false;
  const stats = $('#slop-catalog-stats');
  clear(stats);
  const stat = (label, value) => h('div', { class: 'stat' }, [
    h('div', { class: 'stat__label', text: label }),
    h('div', { class: 'stat__value', text: String(value) }),
  ]);
  stats.append(
    stat(t('slop.catalogScore'), `${cat.score}/100`),
    stat(t('slop.catalogVerdict'), cat.verdict.replace('_', ' ').toLowerCase()),
    stat(t('slop.catalogDensity'), cat.stats.density),
    stat(t('slop.catalogKinds'), cat.stats.kinds),
  );
  const chips = $('#slop-catalog-chips');
  clear(chips);
  const seen = new Set();
  for (const hit of cat.hits) {
    if (seen.has(hit.match)) continue;
    seen.add(hit.match);
    chips.append(h('span', { class: 'chip', text: hit.match }));
    if (seen.size > 40) break;
  }
  if (!seen.size) chips.append(h('span', { class: 'chip', text: '—' }));
}
