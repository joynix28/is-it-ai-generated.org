/** Word counter / text statistics tool. */

import { countText } from '../core/index.js';
import { $, h, clear, renderTable, debounce } from './dom.js';
import { t, onLocaleChange } from './i18n.js';
import { track } from './analytics.js';

export function setupCounterTool() {
  const input = $('#counter-input');
  const update = debounce(() => {
    renderStats(countText(input.value));
    if (input.value.trim().length > 20) track('tool', { tool: 'counter' });
  }, 150);
  input.addEventListener('input', update);
  onLocaleChange(() => renderStats(countText(input.value)));
}

const stat = (label, value) => h('div', { class: 'stat' }, [
  h('div', { class: 'stat__label', text: label }),
  h('div', { class: 'stat__value', text: String(value) }),
]);

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
    stat(t('counter.gunningFog'), s.readability.gunningFog),
  );

  renderTable(
    $('#counter-keywords'),
    s.keywords.map((k) => [k.word, k.count, `${k.density}%`]),
    { head: [t('counter.word'), t('counter.count'), t('counter.density')] },
  );

  const phrases = $('#counter-phrases');
  clear(phrases);
  const items = [...s.bigrams.slice(0, 8), ...s.trigrams.slice(0, 6)];
  for (const p of items) phrases.append(h('span', { class: 'chip', text: `${p.phrase} ×${p.count}` }));
  if (!items.length) phrases.append(h('span', { class: 'chip', text: '—' }));
}
