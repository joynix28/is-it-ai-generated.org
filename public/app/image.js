/** AI image detector tool. Fully local: bytes and pixels never leave the page. */

import { analyzeImage } from '../core/index.js';
import { $, h, clear, renderGauge, renderBars, renderChips, renderTable, escapeHtml, scoreColor } from './dom.js';
import { t, onLocaleChange } from './i18n.js';
import { track } from './analytics.js';

let lastResult = null;

export function setupImageTool() {
  const drop = $('#image-drop');
  const file = $('#image-file');
  const preview = $('#image-preview');

  const open = () => file.click();
  drop.addEventListener('click', open);
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  for (const ev of ['dragenter', 'dragover']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('dragover'); });
  }
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f, preview);
  });
  file.addEventListener('change', () => {
    if (file.files?.[0]) handleFile(file.files[0], preview);
  });

  onLocaleChange(() => {
    if (lastResult) renderImageResult(lastResult);
  });
}

async function handleFile(f, preview) {
  if (!f.type.startsWith('image/')) return;
  const buf = new Uint8Array(await f.arrayBuffer());
  preview.hidden = false;
  preview.innerHTML = '';
  const url = URL.createObjectURL(f);
  preview.append(h('img', { src: url, alt: f.name }));
  preview.append(h('p', { class: 'note', text: `${f.name} — ${(f.size / 1024).toFixed(1)} KB` }));

  const { data, width, height } = await pixelsFromBlob(f);
  const result = analyzeImage({ bytes: buf, data, width, height, mime: f.type });
  lastResult = result;
  renderImageResult(result);
  track('tool', { tool: 'image', verdict: result.verdict, format: result.metadata.format });
}

/** Decode a blob into RGBA pixels using a canvas (bounded to 1024px for speed). */
async function pixelsFromBlob(blob) {
  let source;
  if ('createImageBitmap' in window) {
    source = await createImageBitmap(blob);
  } else {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }
  const max = 1024;
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const hh = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, hh);
  const imageData = ctx.getImageData(0, 0, w, hh);
  return { data: imageData.data, width: w, height: hh };
}

function renderImageResult(r) {
  const wrap = $('#image-result');
  wrap.hidden = false;
  renderGauge($('#image-gauge'), r.score);

  const verdictEl = $('#image-verdict');
  verdictEl.textContent = t(`image.verdict.${camel(r.verdict)}`);
  verdictEl.className = `verdict v-${r.verdict}`;

  const kv = $('#image-kv');
  clear(kv);
  const add = (label, value) => kv.append(h('div', {}, [h('dt', { text: label }), h('dd', { text: value })]));
  add(t('common.confidence'), `${Math.round(r.confidence * 100)}%`);
  if (r.dimensions) add(t('image.dimensions'), `${r.dimensions.width} × ${r.dimensions.height}`);

  const m = r.metadata;
  const rows = [
    [t('image.format'), m.format],
    [t('image.camera'), m.camera || t('image.none')],
    [t('image.software'), m.software || t('image.none')],
    [t('image.c2pa'), m.c2pa ? t('image.found') : t('image.absent')],
    [t('image.generators'), m.generatorSignatures.length ? m.generatorSignatures.join(', ') : t('image.none')],
  ];
  renderTable($('#image-metadata'), rows);

  renderBars($('#image-signals'), r.signals.map((s) => ({ id: s.id, label: s.label, value: s.value })));

  const chips = [];
  if (r.hashes) {
    chips.push(`aHash <code>${escapeHtml(r.hashes.aHash)}</code>`);
    chips.push(`dHash <code>${escapeHtml(r.hashes.dHash)}</code>`);
  }
  renderChips($('#image-hashes'), chips);
}

function camel(id) {
  return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
