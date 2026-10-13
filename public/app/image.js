/** AI image tool: provenance (C2PA + metadata) and an optional on-device model. */

import { analyzeImage } from '../core/index.js';
import { classifyImage, loadClassifier, MODEL_INFO, classifierReady } from './classifier.js';
import { $, h, icon, on, clear, renderRing, renderChips, renderTable, toast } from './dom.js';
import { t, onLocaleChange } from './i18n.js';
import { track } from './analytics.js';

let current = null; // { input, result, img }

export function setupImageTool() {
  const drop = $('#image-drop');
  const file = $('#image-file');

  const open = () => file.click();
  on(drop, 'click', open);
  on(drop, 'keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  for (const ev of ['dragenter', 'dragover']) {
    on(drop, ev, (e) => { e.preventDefault(); drop.classList.add('is-active'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    on(drop, ev, (e) => { e.preventDefault(); drop.classList.remove('is-active'); });
  }
  on(drop, 'drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });
  on(file, 'change', () => {
    if (file.files?.[0]) handleFile(file.files[0]);
  });

  on('#image-model', 'click', runModel);

  onLocaleChange(() => { if (current) render(current.result); });
}

async function handleFile(f) {
  if (!f.type.startsWith('image/')) {
    toast(t('image.notImage'), 'error');
    return;
  }
  const bytes = new Uint8Array(await f.arrayBuffer());

  const preview = $('#image-preview');
  preview.hidden = false;
  clear(preview);
  const url = URL.createObjectURL(f);
  const img = h('img', { src: url, alt: f.name });
  preview.append(img);
  preview.append(h('p', { class: 'hint', text: `${f.name} · ${(f.size / 1024).toFixed(1)} KB` }));
  await img.decode?.().catch(() => {});

  const pixels = await pixelsFromImage(img);
  const input = { bytes, ...pixels, mime: f.type };
  const result = analyzeImage(input);
  current = { input, result, img };
  render(result);
  $('#image-model-status').textContent = classifierReady() ? t('model.loaded') : t('model.hint');
  track('tool', { tool: 'image', verdict: result.verdict, format: result.metadata.format });
}

async function pixelsFromImage(img) {
  const max = 1024;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const hh = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, hh);
  return { data: ctx.getImageData(0, 0, w, hh).data, width: w, height: hh };
}

async function runModel() {
  if (!current) return;
  const status = $('#image-model-status');
  const btn = $('#image-model');
  const bar = $('#image-model-progress');
  btn.disabled = true;
  bar.hidden = false;
  bar.value = 0;
  try {
    await loadClassifier((p) => {
      if (p.phase === 'model' && p.total) {
        bar.value = Math.round((p.loaded / p.total) * 100);
        status.textContent = `${t('model.downloading')} ${Math.round((p.loaded / p.total) * 100)}%`;
      } else if (p.phase === 'init') {
        status.textContent = t('model.initialising');
      } else {
        status.textContent = t('model.runtime');
      }
    });
    status.textContent = t('model.running');
    bar.hidden = true;
    const model = await classifyImage(current.img, { views: 'both' });
    current.result = analyzeImage(current.input, { model });
    render(current.result);
    status.textContent = `${t('model.done')} · p=${(model.pAI * 100).toFixed(1)}%`;
    track('tool', { tool: 'image-model', verdict: model.verdict });
  } catch (err) {
    status.textContent = `${t('common.error')}: ${err.message}`;
    toast(t('model.failed'), 'error');
  } finally {
    btn.disabled = false;
    bar.hidden = true;
  }
}

function render(r) {
  $('#image-empty').hidden = true;
  $('#image-result').hidden = false;
  renderRing($('#image-gauge'), r.score, { color: r.score == null ? 'var(--text-4)' : undefined });

  const verdict = $('#image-verdict');
  verdict.textContent = t(`image.verdict.${camel(r.verdict)}`);
  verdict.className = `verdict v-${r.verdict}`;
  $('#image-verdict-desc').textContent = t(`image.verdictDesc.${camel(r.verdict)}`);

  const kv = $('#image-kv');
  clear(kv);
  const add = (label, value) => { if (value != null && value !== '') kv.append(h('div', {}, [h('dt', { text: label }), h('dd', { text: value })])); };
  add(t('image.source'), t(`image.sourceName.${camel(r.source)}`));
  if (r.score != null) add(t('common.confidence'), `${Math.round(r.confidence * 100)}%`);
  if (r.dimensions) add(t('image.dimensions'), `${r.dimensions.width} × ${r.dimensions.height}`);
  add(t('image.format'), r.metadata.format);
  if (r.model) add(t('model.probability'), `${(r.model.pAI * 100).toFixed(1)}%`);

  renderEvidence(r);
  renderC2pa(r.c2pa);

  const m = r.metadata;
  renderTable($('#image-metadata'), [
    [t('image.camera'), m.camera || t('image.none')],
    [t('image.software'), m.software || t('image.none')],
    [t('image.generators'), m.generatorSignatures.length ? m.generatorSignatures.join(', ') : t('image.none')],
    [t('image.exifFields'), m.fields.length ? m.fields.join(', ') : t('image.none')],
  ]);

  const surfaceBlock = $('#image-surface-block');
  if (r.surface) {
    surfaceBlock.hidden = false;
    renderTable($('#image-surface'), [
      [t('surface.hf'), r.surface.highFrequencyRatio],
      [t('surface.laplacian'), r.surface.laplacianVariance],
      [t('surface.channels'), r.surface.channelCorrelation],
      [t('surface.edges'), r.surface.edgeMagnitude],
      [t('surface.saturation'), r.surface.saturation],
      [t('surface.blockiness'), r.surface.blockiness],
    ]);
  } else {
    surfaceBlock.hidden = true;
  }

  const chips = [];
  if (r.hashes) {
    chips.push({ code: 'aHash', suffix: r.hashes.aHash });
    chips.push({ code: 'dHash', suffix: r.hashes.dHash });
  }
  renderChips($('#image-hashes'), chips);

  if (r.nextStep) $('#image-model-status').textContent = t('model.hint');
}

function renderEvidence(r) {
  const box = $('#image-evidence');
  clear(box);
  const iconFor = { high: 'alert', good: 'check', info: 'c2pa', warn: 'alert' };
  for (const e of r.evidence) {
    box.append(h('div', { class: 'evidence__item', dataset: { level: e.level } }, [
      h('span', { class: 'evidence__icon' }, [icon(iconFor[e.level] || 'info')]),
      h('div', {}, [
        h('p', { class: 'evidence__title', text: e.label }),
        e.detail ? h('p', { class: 'evidence__detail', text: e.detail }) : null,
      ]),
    ]));
  }
  if (r.model) {
    box.append(h('div', { class: 'evidence__item', dataset: { level: r.model.pAI >= 0.65 ? 'high' : 'info' } }, [
      h('span', { class: 'evidence__icon' }, [icon('image')]),
      h('div', {}, [
        h('p', { class: 'evidence__title', text: t('model.title') }),
        h('p', { class: 'evidence__detail', text: `${MODEL_INFO.arch} · ${MODEL_INFO.license} · ${t('model.views')}: ${r.model.views.join(' + ')}` }),
      ]),
    ]));
  }
}

function renderC2pa(c2pa) {
  const box = $('#image-c2pa');
  clear(box);
  if (!c2pa || !c2pa.present) {
    box.append(h('div', { class: 'evidence__item', dataset: { level: 'info' } }, [
      h('span', { class: 'evidence__icon' }, [icon('c2pa')]),
      h('div', {}, [
        h('p', { class: 'evidence__title', text: t('c2pa.absent') }),
        h('p', { class: 'evidence__detail', text: t('c2pa.absentDetail') }),
      ]),
    ]));
    return;
  }
  const body = h('div', {}, [
    h('p', { class: 'evidence__title', text: c2pa.aiGenerated ? t('c2pa.aiDeclared') : t('c2pa.present') }),
    h('p', { class: 'evidence__detail', text: `${t('c2pa.generator')}: ${c2pa.claimGenerator || '—'}` }),
  ]);
  const ul = h('ul', { class: 'evidence__list' });
  const row = (k, v) => { if (v) ul.append(h('li', { text: `${k}: ${v}` })); };
  row(t('c2pa.issuer'), c2pa.issuer);
  row(t('c2pa.signer'), c2pa.signer);
  row(t('c2pa.algorithm'), c2pa.algorithm);
  row(t('c2pa.container'), c2pa.container);
  if (c2pa.digitalSourceTypes?.length) row(t('c2pa.sourceTypes'), c2pa.digitalSourceTypes.join(', '));
  if (c2pa.actions?.length) row(t('c2pa.actions'), c2pa.actions.map((a) => a.action).join(', '));
  if (c2pa.signaturePresent) row(t('c2pa.signature'), t('c2pa.signaturePresent', { n: c2pa.chainLength }));
  body.append(ul);
  box.append(h('div', { class: 'evidence__item', dataset: { level: c2pa.aiGenerated ? 'high' : 'info' } }, [
    h('span', { class: 'evidence__icon' }, [icon('c2pa')]),
    body,
  ]));
}

const camel = (id) => String(id).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
