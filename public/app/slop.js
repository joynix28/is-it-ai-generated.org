/** Slop detector tool: named findings with quotes and fixes, plus safe cleanup. */

import { detectSlop, deslop } from '../core/index.js';
import { $, h, clear, renderGauge, escapeHtml } from './dom.js';
import { t } from './i18n.js';
import { track } from './analytics.js';

export function setupSlopTool() {
  const input = $('#slop-input');
  const run = () => {
    const text = input.value;
    if (!text.trim()) return;
    const r = detectSlop(text, { language: undefined });
    renderSlop(r, text);
    track('tool', { tool: 'slop' });
  };

  $('#slop-run').addEventListener('click', run);
  $('#slop-clear').addEventListener('click', () => {
    input.value = '';
    $('#slop-result').hidden = true;
    $('#slop-cleaned-wrap').hidden = true;
  });
  $('#slop-deslop').addEventListener('click', () => {
    const { text, changes } = deslop(input.value);
    const wrap = $('#slop-cleaned-wrap');
    wrap.hidden = false;
    $('#slop-cleaned').value = text;
    renderSlop(detectSlop(text), input.value, changes.length);
  });
}

function renderSlop(r, original, changes = 0) {
  $('#slop-result').hidden = false;
  renderGauge($('#slop-gauge'), r.score);
  const v = $('#slop-verdict');
  v.textContent = r.score < 15 ? 'Clean' : r.score < 40 ? 'A little' : r.score < 70 ? 'Noticeable' : 'Heavy';
  v.className = 'verdict';

  const list = $('#slop-findings');
  clear(list);
  if (!r.findings.length) {
    list.append(h('p', { class: 'note', text: t('slop.none') }));
    return;
  }
  for (const f of r.findings) {
    const quotes = f.matches.slice(0, 6).map((m) => `<mark>${escapeHtml(m.value.trim())}</mark>`).join(' ');
    list.append(
      h('div', { class: 'finding' }, [
        h('div', { class: 'finding-head' }, [
          h('strong', { text: f.label }),
          h('span', { text: `${f.count} ${t('slop.occurrences')}` }),
        ]),
        h('p', { class: 'hint', text: `${t('slop.hint')}: ${f.hint}` }),
        h('div', { html: quotes }),
      ]),
    );
  }
  if (changes) {
    list.append(h('p', { class: 'note', text: `${changes} × safe cleanup applied.` }));
  }
}
