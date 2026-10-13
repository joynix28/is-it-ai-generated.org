/**
 * Regression suite for Layer 1.
 *
 * The first case is the reason this engine was rewritten: a ChatGPT
 * dissertation in French scored "94 % human". It must now score 90 or above,
 * and the human control must stay low.
 *
 * Run with: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyse } from '../src/analyzer';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

const DISSERTATION = fixture('dissertation-fr.txt');

const HUMAN_CASUAL = [
  'Le train de 7h12 était encore en retard ce matin. J\'ai poiroté vingt minutes sur le quai, sous la flotte, avec un café tiède qui fuyait.',
  'Ma voisine de palier m\'a prêté son parapluie. Elle a soixante-douze ans, elle jure comme un charretier, et elle m\'appelle « petit » alors que j\'en ai quarante.',
  'Je suis arrivé au bureau trempé. Personne n\'a rien remarqué. J\'ai bossé jusqu\'à midi, mangé un sandwich, et je suis reparti.',
].join('\n\n');

test('the ChatGPT dissertation is flagged as AI', () => {
  const r = analyse(DISSERTATION, 'fr');
  assert.ok(r.score >= 90, `expected >= 90, got ${r.score} (${r.band}) — ${r.verdictReason}`);
  assert.equal(r.band, 'ai');
});

test('headings are excluded from the rhythm measurement', () => {
  const r = analyse(DISSERTATION, 'fr');
  // "Introduction", "Conclusion" and the numbered plan lines must not count as
  // short sentences, or the burstiness is inflated and looks human.
  assert.ok(r.stats.paragraphIsomorphism >= 0.75, `isomorphism ${r.stats.paragraphIsomorphism}`);
  assert.ok(r.stats.burstiness < 0.6, `burstiness ${r.stats.burstiness}`);
});

test('the structural signals fire individually', () => {
  const r = analyse(DISSERTATION, 'fr');
  const byId = Object.fromEntries(r.components.map((c) => [c.id, c.value]));
  assert.ok(byId.enumerations! > 0.3, `enumerations ${byId.enumerations}`);
  assert.ok(byId.cliches! > 0.5, `cliches ${byId.cliches}`);
  assert.ok(byId.paragraphIsomorphism! > 0.5, `isomorphism ${byId.paragraphIsomorphism}`);
  assert.ok(byId.rhythm! > 0.4, `rhythm ${byId.rhythm}`);
});

test('most paragraphs are highlighted as AI', () => {
  const r = analyse(DISSERTATION, 'fr');
  const flagged = r.sentences.filter((s) => s.band !== 'human').length;
  assert.ok(flagged / r.sentences.length >= 0.8, `${flagged}/${r.sentences.length} flagged`);
});

test('casual human writing stays low', () => {
  const r = analyse(HUMAN_CASUAL, 'fr');
  assert.ok(r.score < 40, `expected < 40, got ${r.score} (${r.band})`);
});

test('the human control does not trip the structural signals', () => {
  const r = analyse(HUMAN_CASUAL, 'fr');
  assert.ok(r.stats.paragraphIsomorphism < 0.75, `isomorphism ${r.stats.paragraphIsomorphism}`);
  assert.ok(r.stats.connectorRatio < 0.4, `connectors ${r.stats.connectorRatio}`);
});

test('the dossier keeps the promise of the new metrics', () => {
  const r = analyse(DISSERTATION, 'fr');
  assert.ok(r.stats.mattr > 0 && r.stats.mattr <= 1);
  assert.ok(r.stats.shannonTrigram > 0);
  assert.ok(r.stats.hedgesPer100 >= 0);
  assert.equal(r.components.length >= 10, true);
});
