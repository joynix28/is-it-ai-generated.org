/**
 * Downloads the two large binaries the image model needs, into public/:
 *
 *   public/models/community-forensics-int8.onnx   23 MB  (MIT)
 *     buildborderless/CommunityForensics-DeepfakeDet-ViT
 *     upstream weights: OwensLab/commfor-model-384
 *   public/vendor/ort/ort.wasm.mjs              0.6 MB  (MIT, onnxruntime-web)
 *   public/vendor/ort/ort-wasm-simd-threaded.wasm 14 MB (MIT, onnxruntime-web)
 *
 * They are not committed: they are fetched here and verified by hash/version,
 * so the repository stays readable and the provenance is explicit.
 *
 * Run: npm run fetch:assets
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ORT_VERSION = '1.30.0';
const CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;

const ASSETS = [
  {
    dest: 'public/models/community-forensics-int8.onnx',
    url: 'https://huggingface.co/buildborderless/CommunityForensics-DeepfakeDet-ViT/resolve/main/onnx/model_int8.onnx',
    sha256: '968f113f1107d58bfc73444b6e87020e2d541780ad43b7a1ac3e3b18b86c2bbd',
    bytes: 23028026,
  },
  { dest: 'public/vendor/ort/ort.wasm.mjs', url: `${CDN}/ort.wasm.mjs` },
  { dest: 'public/vendor/ort/ort-wasm-simd-threaded.mjs', url: `${CDN}/ort-wasm-simd-threaded.mjs` },
  { dest: 'public/vendor/ort/ort-wasm-simd-threaded.wasm', url: `${CDN}/ort-wasm-simd-threaded.wasm` },
];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

let failed = 0;
for (const asset of ASSETS) {
  const dest = join(root, asset.dest);
  if (await exists(dest)) {
    if (asset.sha256) {
      const { readFile } = await import('node:fs/promises');
      const hash = createHash('sha256').update(await readFile(dest)).digest('hex');
      if (hash === asset.sha256) { console.log(`ok   ${asset.dest} (cached, hash verified)`); continue; }
      console.log(`---- ${asset.dest} hash mismatch, re-downloading`);
    } else {
      console.log(`ok   ${asset.dest} (cached)`);
      continue;
    }
  }
  process.stdout.write(`get  ${asset.dest} … `);
  const res = await fetch(asset.url);
  if (!res.ok) { console.log(`FAILED ${res.status}`); failed += 1; continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  if (asset.sha256) {
    const hash = createHash('sha256').update(buf).digest('hex');
    if (hash !== asset.sha256) { console.log(`FAILED hash ${hash}`); failed += 1; continue; }
  }
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log(`${(buf.length / 1024 / 1024).toFixed(1)} MB`);
}

if (failed) {
  console.error(`\n${failed} asset(s) failed. The image model will be unavailable until this succeeds.`);
  process.exit(1);
}
console.log('\nAssets ready. The image model runs fully on-device.');
