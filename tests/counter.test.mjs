import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countText, countWords, estimateSyllables } from '../src/core/index.js';
import { splitSentences, tokenizeWords } from '../src/core/tokenize.js';

test('counts basic English text', () => {
  const s = countText('Hello world. This is a test of the word counter.');
  assert.equal(s.words, 10);
  assert.equal(s.sentences, 2);
  assert.equal(s.paragraphs, 1);
  assert.ok(s.characters > 0);
  assert.ok(s.readingTimeSeconds >= 0);
});

test('counts CJK characters as words', () => {
  assert.equal(countWords('你好世界'), 4);
  const s = countText('你好世界。今天天气很好。');
  assert.equal(s.words, 10);
  assert.equal(s.sentences, 2);
});

test('paragraphs are split on blank lines', () => {
  const s = countText('One.\n\nTwo.\n\nThree.');
  assert.equal(s.paragraphs, 3);
});

test('keywords exclude stopwords', () => {
  const s = countText('The quick brown fox jumps over the lazy dog. The fox runs fast.', { language: 'en' });
  assert.ok(s.keywords.some((k) => k.word === 'fox'));
  assert.ok(!s.keywords.some((k) => k.word === 'the'));
});

test('syllable estimate is sane', () => {
  assert.equal(estimateSyllables('a'), 1);
  assert.ok(estimateSyllables('banana') >= 2);
  assert.ok(estimateSyllables('strength') >= 1);
});

test('sentence splitting handles abbreviations', () => {
  const s = splitSentences('Dr. Smith went to Washington. He arrived at 3.14 p.m. sharp.');
  assert.equal(s.length, 2, JSON.stringify(s.map((x) => x.text)));
});

test('tokenizer keeps offsets and unicode', () => {
  const words = tokenizeWords('Café déjà-vu don\u2019t 你好');
  assert.equal(words[0].word, 'Café');
  assert.ok(words.some((w) => w.word === "don\u2019t"));
  assert.ok(words.some((w) => w.word === '你好'));
});

test('readability is only flagged supported for English', () => {
  assert.equal(countText('hello there friend', { language: 'en' }).readability.languageSupported, true);
  assert.equal(countText('bonjour mon ami', { language: 'fr' }).readability.languageSupported, false);
});
