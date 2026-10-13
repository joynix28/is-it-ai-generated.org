/**
 * Builds a locale JSON from an ordered array of values.
 * Validates against the French key order, so a missing or extra value fails loudly.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function addLocale(code, values) {
  const fr = JSON.parse(await readFile('src/locales/fr.json', 'utf8'));
  const keys = Object.keys(fr);
  if (values.length !== keys.length) {
    throw new Error(`${code}: ${values.length} values for ${keys.length} keys`);
  }
  const catalog = {};
  keys.forEach((key, i) => { catalog[key] = values[i]; });
  await writeFile(join('src/locales', `${code}.json`), JSON.stringify(catalog, null, 2) + '\n');
  return `${code}: ${values.length} keys`;
}
