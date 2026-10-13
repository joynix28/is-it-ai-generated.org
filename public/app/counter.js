/** Word counter / text statistics tool. */

import { countText } from '../core/index.js';
import { $, h, clear, renderTable, debounce } from './dom.js';
import { t, onLocaleChange } from './i18n.js';
import { track } from './analytics.js';

let lastText = '';

export function setupCounterTool() {
  const input = $('#counter-input');
  const update = debounce(() => {
    const stats = countText(input.value);
    renderStats(stats);
    if (input.value.trim().length > 20) track('tool', { tool: 'counter' });
  }, 150);

  input.addEventListener('input', update);
  onLocaleChange(() => renderStats(countText(input.value)));
}

function stat(label, value) {
  return h('div', { class: 'stat' }, [
    h('div', { class: 'stat-label', text: label }),
    h('div', { class: 'stat-value', text: String(value) }),
  ]);
}

function renderStats(s) {
  const counts = $('#counter-stats');
  clear(counts);
  counts.append(
    stat(t('counter.words'), s.words),
    stat(t('counter.characters'), s.characters),
    stat(t('counter.charactersNoSpaces'), s.charactersNoSpaces),
    stat(t('counter.sentences'), s.sentences),
    stat(t('counter.paragraphs'), s.paragraphs),
    stat(t('counter.lines'), s.lines),
    stat(t('counter.uniqueWords'), s.uniqueWords),
    stat(t('counter.syllables'), s.syllables),
    stat(t('counter.avgWordLength'), s.avgWordLength),
    stat(t('counter.avgSentenceLength'), s.avgSentenceLength),
  );

  const time = $('#counter-time');
  clear(time);
  time.append(
    stat(t('counter.readingTime'), s.readingTime),
    stat(t('counter.speakingTime'), s.speakingTime),
  );

  const read = $('#counter-readability');
  clear(read);
  read.append(
    stat(t('counter.flesch'), s.readability.fleschReadingEase),
    stat(t('counter.grade'), s.readability.fleschKincaidGrade),
  );

  renderTable(
    $('#counter-keywords'),
    s.keywords.map((k) => [k.word, k.count, `${k.density}%`]),
    { head: ['', t('counter.count'), t('counter.density')] },
  );

  const phrases = $('#counter-phrases');
  clear(phrases);
  const items = [...s.bigrams.slice(0, 8), ...s.trigrams.slice(0, 6)];
  if (!items.length) {
    phrases.append(h('span', { class: 'chip', text: '—' }));
  } else {
    for (const p of items) phrases.append(h('span', { class: 'chip', text: `${p.phrase} ×${p.count}` }));
  }
}
