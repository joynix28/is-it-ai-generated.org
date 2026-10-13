import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * Creates (or reuses) the KV namespace used for anonymous statistics and
 * writes its id into wrangler.toml. Requires CLOUDFLARE_API_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID in the environment.
 */
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const TITLE = process.env.KV_TITLE || 'is-it-ai-generated-stats';

if (!ACCOUNT || !TOKEN) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN first.');
  process.exit(1);
}

const api = (path, init) =>
  fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...(init?.headers || {}) },
  }).then((r) => r.json());

const list = await api('/storage/kv/namespaces');
const existing = (list.result || []).find((n) => n.title === TITLE);
let id = existing?.id;

if (!id) {
  const created = await api('/storage/kv/namespaces', { method: 'POST', body: JSON.stringify({ title: TITLE }) });
  if (!created.success) {
    console.error('Failed to create namespace:', JSON.stringify(created.errors));
    process.exit(1);
  }
  id = created.result.id;
  console.log(`Created KV namespace "${TITLE}" -> ${id}`);
} else {
  console.log(`Using existing KV namespace "${TITLE}" -> ${id}`);
}

const tomlPath = new URL('../wrangler.toml', import.meta.url);
let toml = existsSync(tomlPath) ? await readFile(tomlPath, 'utf8') : '';
if (/id = "[^"]*"/.test(toml)) {
  toml = toml.replace(/(binding = "STATS"\nid = ")[^"]*(")/, `$1${id}$2`);
} else {
  toml += `\n[[kv_namespaces]]\nbinding = "STATS"\nid = "${id}"\n`;
}
await writeFile(tomlPath, toml);

const devVars = new URL('../.dev.vars', import.meta.url);
if (!existsSync(devVars)) {
  await writeFile(devVars, `STATS_SECRET=${randomBytes(32).toString('hex')}\n`);
  console.log('Wrote .dev.vars with a fresh STATS_SECRET');
}
