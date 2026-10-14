/**
 * Post-build prerender.
 *
 * The app renders its content in JavaScript, which is fine for people but bad
 * for crawlers that do not execute JS, and most AI crawlers do not. An audit of
 * the deployed site showed the FAQ page carrying 45 words of raw text and the
 * legal page 31, because every answer lived in a JSON catalog fetched at run
 * time.
 *
 * This step writes the French content straight into the built HTML. The client
 * replaces it on load, so visitors see their own language; crawlers see the full
 * text either way.
 *
 * Run after `vite build`.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const LOCALES = 'src/locales';
const FAQ = 'src/faq';

const escape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fr = JSON.parse(await readFile(join(LOCALES, 'fr.json'), 'utf8'));

/** Fill every empty element carrying data-i18n with the French string. */
async function fillI18n(file) {
  if (!existsSync(file)) return 0;
  let html = await readFile(file, 'utf8');
  let filled = 0;
  html = html.replace(
    /<(p|span|h1|h2|h3|li|div)([^>]*data-i18n="([^"]+)"[^>]*)><\/\1>/g,
    (whole, tag, attrs, key) => {
      const value = fr[key];
      if (!value) return whole;
      filled += 1;
      return `<${tag}${attrs}>${escape(value)}</${tag}>`;
    },
  );
  await writeFile(file, html);
  return filled;
}

/** Expand the empty citability placeholder into the full answer block. */
async function fillCitability(file) {
  let html = await readFile(file, 'utf8');
  const answer = fr['hero.answer'];
  if (!answer) return 0;
  const before = html;
  html = html.replace(
    /<p([^>]*data-i18n="hero\.answer"[^>]*)>[^<]*<\/p>/,
    `<p$1>${escape(answer)}</p>`,
  );
  if (html === before) return 0;
  await writeFile(file, html);
  return 1;
}

/** Write the whole FAQ into the FAQ page so crawlers see all 55 answers. */
async function prerenderFaq(file, code = 'fr') {
  if (!existsSync(file)) return 0;
  const path = join(FAQ, `${code}.json`);
  if (!existsSync(path)) return 0;
  const items = JSON.parse(await readFile(path, 'utf8'));
  let html = await readFile(file, 'utf8');
  const body = items
    .map(
      (it) =>
        `<details class="faq-item"><summary>${escape(it.q)}</summary><p class="faq-answer">${escape(it.a)}</p></details>`,
    )
    .join('');
  const before = html;
  html = html.replace(
    /<div id="faq-list"[^>]*><\/div>/,
    `<div id="faq-list" class="mt-8 border-t hairline">${body}</div>`,
  );
  if (html === before) return 0;
  await writeFile(file, html);
  return items.length;
}

let total = 0;
total += await fillI18n(join(DIST, 'faq', 'index.html'));
total += await fillI18n(join(DIST, 'legal', 'index.html'));
total += await fillI18n(join(DIST, 'stats', 'index.html'));
total += await fillI18n(join(DIST, 'index.html'));
total += await fillCitability(join(DIST, 'index.html'));
total += await fillCitability(join(DIST, 'faq', 'index.html'));
total += await fillCitability(join(DIST, 'legal', 'index.html'));
const faqCount = await prerenderFaq(join(DIST, 'faq', 'index.html'));

console.log(`  prerender: ${total} strings, ${faqCount} FAQ entries written into the HTML`);
