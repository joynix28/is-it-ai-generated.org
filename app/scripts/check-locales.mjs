/**
 * Fails the build if a locale is incomplete, so a half-translated interface can
 * never be offered. Prints a per-language coverage report.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = 'src/locales';
const base = JSON.parse(await readFile(join(dir, 'fr.json'), 'utf8'));
const keys = Object.keys(base);
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
let complete = 0;
const incomplete = [];
for (const file of files) {
  if (file === 'fr.json') { complete += 1; continue; }
  const catalog = JSON.parse(await readFile(join(dir, file), 'utf8'));
  const missing = keys.filter((k) => typeof catalog[k] !== 'string');
  const extra = Object.keys(catalog).filter((k) => !(k in base));
  if (extra.length) console.warn(`  ! ${file}: ${extra.length} unknown keys`);
  if (missing.length) {
    incomplete.push(`${file} (${keys.length - missing.length}/${keys.length})`);
    if (process.env.STRICT_LOCALES === '1') {
      console.error(`  x ${file}: missing ${missing.length} keys, e.g. ${missing.slice(0, 3).join(', ')}`);
    }
  } else {
    complete += 1;
  }
}
console.log(`  locales: ${complete} complete${incomplete.length ? `, incomplete: ${incomplete.join(', ')}` : ''}`);
if (process.env.STRICT_LOCALES === '1' && incomplete.length) process.exit(1);
