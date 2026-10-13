/** One-off: turn the inline catalogs in src/i18n.ts into JSON files. */
import { readFile, writeFile } from 'node:fs/promises';
const src = await readFile('src/i18n.ts', 'utf8');
const grab = (startMark, endMark) => {
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  return src.slice(start, end);
};
const parse = (block) => {
  const out = {};
  const re = /^\s{2}'([^']+)':\s*'((?:[^'\\]|\\.)*)',\s*$/gm;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  return out;
};
const fr = parse(grab('const fr = {', 'const en: Catalog'));
const en = parse(grab('const en: Catalog', 'const es: Partial<Catalog>'));
await writeFile('src/locales/fr.json', JSON.stringify(fr, null, 2) + '\n');
await writeFile('src/locales/en.json', JSON.stringify(en, null, 2) + '\n');
console.log('fr', Object.keys(fr).length, '| en', Object.keys(en).length);
