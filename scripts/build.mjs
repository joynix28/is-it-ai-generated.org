/**
 * Build step: copies the shared engine and the locale files into `public/` so
 * Cloudflare Pages can serve them as static assets.
 *
 * There is no bundler and no transpilation on purpose: the exact same ESM
 * files that npm consumers import are the ones the browser downloads.
 */
import { cp, mkdir, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

async function copy(src, dest) {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
  console.log(`  ${src.replace(root + '/', '')} -> ${dest.replace(root + '/', '')}`);
}

async function validateLocales() {
  const i18nDir = join(root, 'src', 'i18n');
  if (!existsSync(i18nDir)) return;
  const files = (await readdir(i18nDir)).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const enPath = join(i18nDir, 'en.json');
  if (!existsSync(enPath)) throw new Error('src/i18n/en.json is required');
  const base = JSON.parse(await readFile(enPath, 'utf8'));
  const baseKeys = new Set(Object.keys(base));
  for (const f of files) {
    const data = JSON.parse(await readFile(join(i18nDir, f), 'utf8'));
    const missing = [...baseKeys].filter((k) => !(k in data));
    const extra = Object.keys(data).filter((k) => !baseKeys.has(k));
    if (missing.length) console.warn(`  ! ${f}: ${missing.length} missing keys (falls back to English)`);
    if (extra.length) console.warn(`  ! ${f}: ${extra.length} unknown keys: ${extra.slice(0, 6).join(', ')}`);
  }
  console.log(`  validated ${files.length} locales`);
}

async function writeVersion() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const info = {
    name: pkg.name,
    version: pkg.version,
    built: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || null,
  };
  await mkdir(publicDir, { recursive: true });
  await writeFile(join(publicDir, 'version.json'), JSON.stringify(info, null, 2) + '\n');
}

console.log('Building is-it-ai-generated.org');
await copy(join(root, 'src', 'core'), join(publicDir, 'core'));
await copy(join(root, 'src', 'i18n'), join(publicDir, 'i18n'));
await validateLocales();
await writeVersion();

const model = join(publicDir, 'models', 'community-forensics-int8.onnx');
if (!existsSync(model)) {
  console.warn('\n  ! public/models/community-forensics-int8.onnx is missing.');
  console.warn('  ! The image model will be unavailable. Run: npm run fetch:assets\n');
} else {
  console.log('  image model present');
}
console.log('Done. Deploy `public/` with: wrangler pages deploy public');
