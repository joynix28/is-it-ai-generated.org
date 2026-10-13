/** Compare two texts: near-duplicate wording, computed locally. */

import { compareTexts } from '../core/index.js';
import { $, h, clear, renderRing, renderChips, toast } from './dom.js';
import { t } from './i18n.js';
import { track } from './analytics.js';

export function setupCompareTool() {
  $('#compare-run').addEventListener('click', () => {
    const a = $('#compare-a').value;
    const b = $('#compare-b').value;
    if (!a.trim() || !b.trim()) {
      toast(t('compare.needBoth'), 'error');
      return;
    }
    const r = compareTexts(a, b);
    $('#compare-empty').hidden = true;
    $('#compare-result').hidden = false;
    renderRing($('#compare-gauge'), r.similarity, { color: 'var(--accent)' });
    $('#compare-verdict').textContent = `${r.similarity}%`;
    renderChips($('#compare-chips'), r.matchedPhrases.map((p) => ({ code: p })));
    track('tool', { tool: 'compare' });
  });
}
