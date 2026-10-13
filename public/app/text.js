/** AI text detector tool. */

import { detectText, countText, LANGUAGE_NAMES } from '../core/index.js';
import { $, h, clear, renderGauge, renderBars, renderChips, downloadJSON, copyText, debounce, escapeHtml, scoreColor } from './dom.js';
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

const el = {
  input: () => $('#text-input'),
  result: () => $('#text-result'),
  inlineCount: () => $('#text-inline-count'),
  highlight: () => $('#text-highlight'),
};

function pickSample(kind) {
  const fr = getLocale() === 'fr';
  return fr ? SAMPLES[kind][1] : SAMPLES[kind][0];
}

function populateLangSelect() {
  const sel = $('#text-lang');
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
  const input = el.input();
  const n = input.value ? countText(input.value).words : 0;
  el.inlineCount().textContent = n ? `${n} ${t('common.words')}` : '';
}

function run() {
  const input = el.input();
  const text = input.value;
  if (!text.trim()) return;
  const langSel = $('#text-lang').value;
  const sensitivity = Number($('#text-sensitivity').value);
  const r = detectText(text, {
    language: langSel === 'auto' ? undefined : langSel,
    sensitivity,
    includeSentences: true,
  });
  lastResult = r;
  lastText = text;
  renderTextResult(r, el.highlight().checked, text);
  track('tool', { tool: 'text', verdict: r.verdict, lang: r.language });
}

export function setupTextTool() {
  const input = el.input();
  populateLangSelect();

  $('#text-run').addEventListener('click', run);
  input.addEventListener('input', debounce(() => {
    refreshCount();
    if (input.value.trim().length > 40) run();
  }, 400));
  input.addEventListener('blur', refreshCount);

  $('#text-clear').addEventListener('click', () => {
    input.value = '';
    el.result().hidden = true;
    el.inlineCount().textContent = '';
    input.focus();
  });
  $('#text-sample').addEventListener('click', () => {
    input.value = pickSample(Math.random() < 0.5 ? 'ai' : 'human');
    refreshCount();
    run();
  });
  el.highlight().addEventListener('change', () => {
    if (lastResult) renderTextResult(lastResult, el.highlight().checked, lastText);
  });
  $('#text-download').addEventListener('click', () => {
    if (lastResult) downloadJSON(lastResult, `ai-report-${lastResult.fingerprint}.json`);
  });
  $('#text-copy').addEventListener('click', async (e) => {
    if (!lastResult) return;
    const ok = await copyText(JSON.stringify(lastResult, null, 2));
    e.target.textContent = ok ? t('common.copied') : t('common.error');
    setTimeout(() => { e.target.textContent = t('common.copy'); }, 1400);
  });

  // Locale changes only re-render; listeners are bound once.
  onLocaleChange(() => {
    populateLangSelect();
    refreshCount();
    if (lastResult) renderTextResult(lastResult, el.highlight().checked, lastText);
  });
}

function renderTextResult(r, highlight, originalText = '') {
  const result = el.result();
  result.hidden = false;
  renderGauge($('#text-gauge'), r.score);

  const verdictEl = $('#text-verdict');
  verdictEl.textContent = t(`verdict.${camel(r.verdict)}`);
  verdictEl.className = `verdict v-${r.verdict}`;
  $('#text-verdict-desc').textContent = t(`verdictDesc.${camel(r.verdict)}`);
  $('#text-confidence').textContent = `${Math.round(r.confidence * 100)}%`;
  $('#text-detected-lang').textContent =
    `${r.languageName || r.language}${r.languageConfidence ? ` (${Math.round(r.languageConfidence * 100)}%)` : ''}`;
  $('#text-fingerprint').textContent = r.fingerprint;

  const annotated = $('#text-annotated');
  if (highlight && r.sentences.length) {
    annotated.hidden = false;
    let html = '';
    let cursor = 0;
    for (const s of r.sentences) {
      html += escapeHtml(originalText.slice(cursor, s.start));
      const color = s.score >= 60 ? 'var(--bad)' : s.score >= 40 ? 'var(--warn)' : 'var(--good)';
      const bg = s.score >= 60 ? 'color-mix(in srgb, var(--bad) 28%, transparent)'
        : s.score >= 40 ? 'color-mix(in srgb, var(--warn) 28%, transparent)'
          : 'transparent';
      html += `<span class="mark" style="box-shadow: inset 0 -0.8em 0 ${bg}" title="${Math.round(s.score)}/100">${escapeHtml(s.text)}</span>`;
      cursor = s.end;
    }
    html += escapeHtml(originalText.slice(cursor));
    annotated.innerHTML = html;
  } else {
    annotated.hidden = true;
  }

  renderBars($('#text-reasons'), r.reasons.map((x) => ({ id: x.id, label: t(x.label), value: x.value })));

  renderChips($('#text-phrases'), (r.aiPhrases || []).map((p) => `<code>${escapeHtml(p.phrase)}</code> ×${p.count}`));

  const list = $('#text-sentences');
  clear(list);
  for (const s of r.sentences) {
    list.append(
      h('li', {}, [
        h('span', { class: 's-score', style: { color: scoreColor(s.score) }, text: String(s.score) }),
        h('span', { text: s.text }),
      ]),
    );
  }
}

function camel(id) {
  return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
