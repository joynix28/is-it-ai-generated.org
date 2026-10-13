/** AI image detector tool: C2PA, metadata, pixels, and optional OpenAI provenance. */

import { analyzeImage } from '../core/index.js';
import { $, h, icon, clear, renderRing, renderBars, renderChips, renderTable, toast } from './dom.js';
import { t, onLocaleChange } from './i18n.js';
import { track } from './analytics.js';

let lastResult = null;
let lastFile = null;

export function setupImageTool() {
  const drop = $('#image-drop');
  const file = $('#image-file');

  const open = () => file.click();
  drop.addEventListener('click', open);
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  for (const ev of ['dragenter', 'dragover']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-active'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-active'); });
  }
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });
  file.addEventListener('change', () => {
    if (file.files?.[0]) handleFile(file.files[0]);
  });

  $('#image-provenance').addEventListener('click', runProvenance);

  onLocaleChange(() => { if (lastResult) render(lastResult); });
}

async function handleFile(f) {
  if (!f.type.startsWith('image/')) {
    toast(t('image.notImage'), 'error');
    return;
  }
  lastFile = f;
  const buf = new Uint8Array(await f.arrayBuffer());

  const preview = $('#image-preview');
  preview.hidden = false;
  clear(preview);
  const url = URL.createObjectURL(f);
  preview.append(h('img', { src: url, alt: f.name }));
  preview.append(h('p', { class: 'hint', text: `${f.name} · ${(f.size / 1024).toFixed(1)} KB` }));

  const pixels = await pixelsFromBlob(f);
  const result = analyzeImage({ bytes: buf, ...pixels, mime: f.type });
  lastResult = result;
  render(result);
  track('tool', { tool: 'image', verdict: result.verdict, format: result.metadata.format });
}

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

function render(r) {
  $('#image-empty').hidden = true;
  $('#image-result').hidden = false;
  renderRing($('#image-gauge'), r.score);

  const verdict = $('#image-verdict');
  verdict.textContent = t(`image.verdict.${camel(r.verdict)}`);
  verdict.className = `verdict v-${r.verdict}`;

  const kv = $('#image-kv');
  clear(kv);
  const add = (label, value) => kv.append(h('div', {}, [h('dt', { text: label }), h('dd', { text: value })]));
  add(t('common.confidence'), `${Math.round(r.confidence * 100)}%`);
  if (r.dimensions) add(t('image.dimensions'), `${r.dimensions.width} × ${r.dimensions.height}`);
  add(t('image.format'), r.metadata.format);

  renderC2pa(r.c2pa);

  const m = r.metadata;
  renderTable($('#image-metadata'), [
    [t('image.camera'), m.camera || t('image.none')],
    [t('image.software'), m.software || t('image.none')],
    [t('image.generators'), m.generatorSignatures.length ? m.generatorSignatures.join(', ') : t('image.none')],
    [t('image.exifFields'), m.fields.length ? m.fields.join(', ') : t('image.none')],
  ]);

  renderBars($('#image-signals'), r.signals.map((s) => ({ id: s.id, label: s.label, value: s.value })));

  const chips = [];
  if (r.hashes) {
    chips.push({ code: 'aHash', suffix: r.hashes.aHash });
    chips.push({ code: 'dHash', suffix: r.hashes.dHash });
  }
  renderChips($('#image-hashes'), chips);
  $('#image-provenance-status').textContent = '';
}

function renderC2pa(c2pa) {
  const box = $('#image-c2pa');
  clear(box);
  if (!c2pa || !c2pa.present) {
    box.append(h('div', { class: 'evidence__item', dataset: { level: 'low' } }, [
      h('span', { class: 'evidence__icon' }, [icon('c2pa')]),
      h('div', {}, [
        h('p', { class: 'evidence__title', text: t('c2pa.absent') }),
        h('p', { class: 'evidence__detail', text: t('c2pa.absentDetail') }),
      ]),
    ]));
    return;
  }
  const level = c2pa.aiGenerated ? 'high' : 'low';
  const body = h('div', {}, [
    h('p', { class: 'evidence__title', text: c2pa.aiGenerated ? t('c2pa.aiDeclared') : t('c2pa.present') }),
    h('p', { class: 'evidence__detail', text: `${t('c2pa.generator')}: ${c2pa.claimGenerator || '—'}` }),
  ]);
  const dl = h('ul', { class: 'evidence__list' });
  const row = (k, v) => { if (v) dl.append(h('li', { text: `${k}: ${v}` })); };
  row(t('c2pa.issuer'), c2pa.issuer);
  row(t('c2pa.signer'), c2pa.signer);
  row(t('c2pa.algorithm'), c2pa.algorithm);
  row(t('c2pa.container'), c2pa.container);
  if (c2pa.digitalSourceTypes?.length) row(t('c2pa.sourceTypes'), c2pa.digitalSourceTypes.join(', '));
  if (c2pa.actions?.length) {
    row(t('c2pa.actions'), c2pa.actions.map((a) => `${a.action}${a.softwareAgent ? ` (${a.softwareAgent})` : ''}`).join(', '));
  }
  if (c2pa.assertions?.length) row(t('c2pa.assertions'), c2pa.assertions.join(', '));
  if (c2pa.signaturePresent) row(t('c2pa.signature'), t('c2pa.signaturePresent', { n: c2pa.chainLength }));
  body.append(dl);
  box.append(h('div', { class: 'evidence__item', dataset: { level } }, [
    h('span', { class: 'evidence__icon' }, [icon('c2pa')]),
    body,
  ]));
}

async function runProvenance() {
  if (!lastFile) return;
  const status = $('#image-provenance-status');
  const btn = $('#image-provenance');
  btn.disabled = true;
  status.textContent = t('provenance.running');
  try {
    const buf = new Uint8Array(await lastFile.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buf.length; i += 1) binary += String.fromCharCode(buf[i]);
    const res = await fetch('/api/provenance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base64: btoa(binary), mime: lastFile.type }),
    });
    const data = await res.json();
    const o = data.openai || {};
    if (!o.configured) {
      status.textContent = t('provenance.notConfigured');
    } else if (!o.available) {
      status.textContent = `${t('common.error')}: ${o.error?.message || o.status}`;
    } else {
      const hit = (o.results || []).find((x) => x.outcome === 'detected');
      status.textContent = hit
        ? `${t('provenance.detected')}: ${hit.type}${hit.model ? ` · ${hit.model}` : ''}`
        : t('provenance.notDetected');
    }
  } catch (err) {
    status.textContent = `${t('common.error')}: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

const camel = (id) => id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
