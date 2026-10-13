/**
 * Node usage examples.
 *   node examples/node-usage.mjs
 */
import { detectText, countText, detectLanguage, detectSlop, compareTexts, analyzeImage } from '../src/core/index.js';

const sample = `In today's fast-paced world, it is important to note that leveraging cutting-edge solutions plays a crucial role in modern organizations. Furthermore, a comprehensive approach facilitates robust outcomes.`;

const report = detectText(sample);
console.log('score      ', report.score);
console.log('verdict    ', report.verdict);
console.log('confidence ', report.confidence);
console.log('language   ', report.language, `(${report.languageName})`);
console.log('fingerprint', report.fingerprint);
console.log('phrases    ', report.aiPhrases.map((p) => p.phrase).join(', '));
console.log('reasons    ', report.reasons.map((r) => `${r.id}=${r.value}`).join(' '));
console.log('sentences  ', report.sentences.map((s) => s.score));

console.log('\n--- word counter ---');
const stats = countText(sample);
console.log('words', stats.words, 'sentences', stats.sentences, 'reading', stats.readingTime);
console.log('keywords', stats.keywords.slice(0, 5).map((k) => k.word).join(', '));

console.log('\n--- language ---');
for (const text of ['Bonjour tout le monde', 'Hola a todos', 'こんにちは', 'Привет всем']) {
  const r = detectLanguage(text);
  console.log(`${r.lang} (${Math.round(r.confidence * 100)}%)  ${text}`);
}

console.log('\n--- slop ---');
const slop = detectSlop(sample);
console.log('density', slop.score);
for (const f of slop.findings.slice(0, 4)) console.log(` - ${f.label}: ${f.count} -> ${f.hint}`);

console.log('\n--- compare ---');
console.log(compareTexts('the quick brown fox jumps over the lazy dog', 'the quick brown fox leaps over the lazy dog').similarity + '%');

console.log('\n--- image (metadata only, no bytes) ---');
console.log(analyzeImage({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }).metadata);
