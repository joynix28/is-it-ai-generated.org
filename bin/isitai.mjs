#!/usr/bin/env node
/**
 * isitai — command line AI text detector.
 *
 * Usage:
 *   isitai file.txt
 *   echo "text" | isitai
 *   isitai --json file.txt
 *   isitai --counter file.txt
 *   isitai --image photo.png        (metadata-only analysis)
 */
import { readFile } from 'node:fs/promises';
import { detectText, countText, analyzeImage } from '../src/core/index.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const files = args.filter((a) => !a.startsWith('--'));

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const imageMode = flags.has('--image');
  let input = '';
  if (files.length) {
    const buf = await readFile(files[0]);
    if (imageMode) {
      const report = analyzeImage({ bytes: new Uint8Array(buf) });
      if (flags.has('--json')) return console.log(JSON.stringify(report, null, 2));
      console.log(`File:     ${files[0]}`);
      console.log(`Score:    ${report.score}/100 (${report.verdict})`);
      console.log(`Format:   ${report.metadata.format}`);
      console.log(`Camera:   ${report.metadata.camera || 'none'}`);
      console.log(`Software: ${report.metadata.software || 'none'}`);
      console.log(`C2PA:     ${report.metadata.c2pa ? 'present' : 'absent'}`);
      if (report.metadata.generatorSignatures.length) {
        console.log(`Generators: ${report.metadata.generatorSignatures.join(', ')}`);
      }
      console.log(`\n${report.disclaimer}`);
      return;
    }
    input = buf.toString('utf8');
  } else {
    input = await readStdin();
  }

  input = input.trim();
  if (!input) {
    console.error('No input. Pass a file or pipe text on stdin.');
    process.exit(1);
  }

  if (flags.has('--counter')) {
    const stats = countText(input);
    if (flags.has('--json')) return console.log(JSON.stringify(stats, null, 2));
    console.log(`Words:        ${stats.words}`);
    console.log(`Characters:   ${stats.characters}`);
    console.log(`Sentences:    ${stats.sentences}`);
    console.log(`Paragraphs:   ${stats.paragraphs}`);
    console.log(`Syllables:    ${stats.syllables}`);
    console.log(`Reading time: ${stats.readingTime}`);
    console.log(`Keywords:     ${stats.keywords.slice(0, 10).map((k) => k.word).join(', ')}`);
    return;
  }

  const report = detectText(input, { includeSentences: flags.has('--sentences') });
  if (flags.has('--json')) return console.log(JSON.stringify(report, null, 2));

  const bar = '█'.repeat(Math.round(report.score / 5)).padEnd(20, '░');
  console.log('');
  console.log(`  ${bar}  ${report.score}/100`);
  console.log(`  Verdict:    ${report.verdict}`);
  console.log(`  Confidence: ${Math.round(report.confidence * 100)}%`);
  console.log(`  Language:   ${report.language} (${report.languageName})`);
  console.log(`  Words:      ${report.wordCount}`);
  console.log(`  Slop:       ${report.slop.score}/100`);
  console.log(`  Fingerprint:${report.fingerprint}`);
  if (report.aiPhrases.length) {
    console.log(`  AI phrases: ${report.aiPhrases.map((p) => p.phrase).join(', ')}`);
  }
  if (report.sentences.length && flags.has('--sentences')) {
    console.log('\n  Sentences:');
    for (const s of report.sentences) console.log(`   [${String(s.score).padStart(3)}] ${s.text}`);
  }
  console.log(`\n  ${report.disclaimer}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
