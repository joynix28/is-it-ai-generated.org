/** AI text detector tool. */

import { detectText, countText, LANGUAGE_NAMES } from '../core/index.js';
import {
  $, h, icon, clear, renderRing, renderBars, renderChips, downloadJSON,
  copyText, debounce, toast, scoreColor,
} from './dom.js';
import { t, onLocaleChange, getLocale } from './i18n.js';
import { track } from './analytics.js';

const SAMPLES = {
  ai: [
    "In today's fast-paced world, it is important to note that leveraging cutting-edge solutions plays a crucial role in modern organizations. Furthermore, a comprehensive approach facilitates robust outcomes across a wide range of use cases. Moreover, teams must navigate the complexities of an ever-evolving landscape while maintaining alignment. In conclusion, embracing innovation stands as a testament to organizational maturity. Additionally, a seamless integration strategy underscores the significance of holistic thinking.",
    "À l'ère du numérique, il est important de noter que les solutions innovantes jouent un rôle crucial dans les organisations modernes. De plus, une approche globale facilite des résultats robustes. Par ailleurs, les équipes doivent naviguer dans la complexité d'un environnement en constante évolution. En conclusion, l'innovation témoigne de la maturité de l'organisation.",
  ],
  human: [
    "honestly i still can't believe we shipped that. the deploy broke twice, the tests were flaky, and i spent tuesday night on a call with the vendor arguing about a certificate. my coworker kept saying it was DNS. it wasn't. anyway it works now. i'm going to sleep for a week.",
    "Bonjour, je voulais te dire que le déploiement a encore planté hier soir. J'ai passé la soirée à déboguer avec Léa, et au final c'était un problème de certificat. Bref, ça marche maintenant. Je vais dormir.",
  ],
};

let lastResult = null;
let lastText = '';

const el = (id) => document.getElementById(id);
const pickSample = (kind) => (getLocale() === 'fr' ? SAMPLES[kind][1] : SAMPLES[kind][0]);

function populateLangSelect() {
  const sel = el('text-lang');
  if (!sel) return;
  const previous = sel.value;
  sel.innerHTML = '';
  sel.append(new Option(t('common.auto'), 'auto'));
  for (const [code, name] of Object.entries(LANGUAGE_NAMES).sort((a, b) => a[1].localeCompare(b[1]))) {
    sel.append(new Option(name, code));
  }
  if (previous) sel.value = previous;
}

function refreshCount() {
  const n = countText(el('text-input').value).words;
  el('text-inline-count').textContent = n ? `${n} ${t('common.words')}` : '';
}

function run() {
  const input = el('text-input');
  const text = input.value;
  if (!text.trim()) return;
  const lang = el('text-lang').value;
  const r = detectText(text, {
    language: lang === 'auto' ? undefined : lang,
    sensitivity: Number(el('text-sensitivity').value),
    includeSentences: true,
  });
  lastResult = r;
  lastText = text;
  render(r, el('text-highlight').checked, text);
  track('tool', { tool: 'text', verdict: r.verdict, lang: r.language });
}

export function setupTextTool() {
  const input = el('text-input');
  populateLangSelect();

  el('text-run').addEventListener('click', run);
  input.addEventListener('input', debounce(() => {
    refreshCount();
    if (input.value.trim().length > 40) run();
  }, 400));
  input.addEventListener('blur', refreshCount);
  el('text-clear').addEventListener('click', () => {
    input.value = '';
    el('text-result').hidden = true;
    el('text-empty').hidden = false;
    el('text-inline-count').textContent = '';
    input.focus();
  });
  el('text-sample').addEventListener('click', () => {
    input.value = pickSample(Math.random() < 0.5 ? 'ai' : 'human');
    refreshCount();
    run();
  });
  el('text-highlight').addEventListener('change', () => {
    if (lastResult) render(lastResult, el('text-highlight').checked, lastText);
  });
  el('text-download').addEventListener('click', () => {
    if (lastResult) downloadJSON(lastResult, `ai-report-${lastResult.fingerprint}.json`);
  });
  el('text-copy').addEventListener('click', async () => {
    if (!lastResult) return;
    const ok = await copyText(JSON.stringify(lastResult, null, 2));
    toast(ok ? t('common.copied') : t('common.error'), ok ? 'info' : 'error');
  });

  onLocaleChange(() => {
    populateLangSelect();
    refreshCount();
    if (lastResult) render(lastResult, el('text-highlight').checked, lastText);
  });
}

function render(r, highlight, originalText) {
  el('text-empty').hidden = true;
  el('text-result').hidden = false;

  renderRing(el('text-gauge'), r.score);

  const verdict = el('text-verdict');
  verdict.textContent = t(`verdict.${camel(r.verdict)}`);
  verdict.className = `verdict v-${r.verdict}`;
  el('text-verdict-desc').textContent = t(`verdictDesc.${camel(r.verdict)}`);
  el('text-confidence').textContent = `${Math.round(r.confidence * 100)}%`;
  el('text-detected-lang').textContent =
    `${r.languageName || r.language}${r.languageConfidence ? ` (${Math.round(r.languageConfidence * 100)}%)` : ''}`;
  el('text-fingerprint').textContent = r.fingerprint;

  renderEvidence(r);

  renderBars(el('text-reasons'), r.reasons.map((x) => ({ id: x.id, label: t(x.label), value: x.value })));

  const phrases = r.aiPhrases || [];
  el('text-phrases-block').hidden = phrases.length === 0;
  renderChips(el('text-phrases'), phrases.map((p) => ({ code: p.phrase, suffix: `×${p.count}` })));

  renderAnnotated(r, highlight, originalText);

  const list = el('text-sentences');
  clear(list);
  el('text-sentences-block').hidden = r.sentences.length === 0;
  for (const s of r.sentences) {
    list.append(
      h('li', {}, [
        h('span', { class: 'sentences__score', style: { color: scoreColor(s.score) }, text: String(s.score) }),
        h('span', { text: s.text }),
      ]),
    );
  }
}

/** Evidence cards: Unicode forensics and the watermark module. */
function renderEvidence(r) {
  const box = el('text-evidence');
  clear(box);
  const u = r.modules.unicode;

  if (u.hiddenMessage) {
    box.append(evidenceCard('high', 'unicode', t('unicode.hidden'), t('unicode.hiddenDetail'), [u.hiddenMessage]));
  }
  for (const f of u.findings) {
    if (f.id === 'unicode-tags') continue;
    const level = f.severity === 'high' ? 'high' : f.severity === 'medium' ? 'medium' : 'low';
    const samples = (f.sample || []).filter((s) => s && s.char).map((s) => s.code || JSON.stringify(s));
    box.append(evidenceCard(level, 'unicode', f.label, `${f.count}`, samples));
  }

  const wm = r.modules.watermark;
  if (wm.available) {
    const detected = wm.verdict === 'watermarked' || wm.verdict === 'likely-watermarked';
    box.append(evidenceCard(detected ? 'high' : 'low', 'watermark',
      t('watermark.title'),
      `${t('watermark.verdict')}: ${wm.verdict} · z=${wm.z} · p=${wm.pValue}`, []));
  } else if (wm.reason === 'no-key') {
    box.append(evidenceCard('low', 'watermark', t('watermark.title'), t('watermark.noKey'), []));
  }

  if (!box.childElementCount) {
    box.append(evidenceCard('low', 'check', t('evidence.none'), t('evidence.noneDetail'), []));
  }
}

function evidenceCard(level, iconName, title, detail, items) {
  const body = h('div', {}, [
    h('p', { class: 'evidence__title', text: title }),
    detail ? h('p', { class: 'evidence__detail', text: detail }) : null,
  ]);
  if (items && items.length) {
    const ul = h('ul', { class: 'evidence__list' });
    for (const it of items.slice(0, 8)) ul.append(h('li', { class: 'mono', text: String(it) }));
    body.append(ul);
  }
  return h('div', { class: 'evidence__item', dataset: { level } }, [
    h('span', { class: 'evidence__icon' }, [icon(iconName)]),
    body,
  ]);
}

/** Sentence highlighting without innerHTML. */
function renderAnnotated(r, highlight, originalText) {
  const box = el('text-annotated');
  const block = el('text-annotated-block');
  clear(box);
  if (!highlight || !r.sentences.length) {
    block.hidden = true;
    return;
  }
  block.hidden = false;
  let cursor = 0;
  for (const s of r.sentences) {
    if (s.start > cursor) box.append(document.createTextNode(originalText.slice(cursor, s.start)));
    const cls = s.score >= 60 ? 'mark mark--high' : s.score >= 40 ? 'mark mark--mid' : 'mark mark--low';
    const span = h('span', { class: cls, text: s.text });
    span.title = `${Math.round(s.score)}/100`;
    box.append(span);
    cursor = s.end;
  }
  if (cursor < originalText.length) box.append(document.createTextNode(originalText.slice(cursor)));
}

const camel = (id) => id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
