/** Compare two texts: near-duplicate wording, computed locally. */

import { compareTexts } from '../core/index.js';
import { $, h, clear, renderGauge, renderChips, escapeHtml } from './dom.js';
import { track } from './analytics.js';

export function setupCompareTool() {
  $('#compare-run').addEventListener('click', () => {
    const a = $('#compare-a').value;
    const b = $('#compare-b').value;
    if (!a.trim() || !b.trim()) return;
    const r = compareTexts(a, b);
    $('#compare-result').hidden = false;
    renderGauge($('#compare-gauge'), r.similarity, { color: 'var(--accent)' });
    $('#compare-verdict').textContent = `${r.similarity}%`;
    renderChips($('#compare-chips'), r.matchedPhrases.map((p) => `<code>${escapeHtml(p)}</code>`));
    track('tool', { tool: 'compare' });
  });
}
