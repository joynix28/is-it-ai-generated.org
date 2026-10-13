/** AI text detector tool. */

import { detectText, countText, LANGUAGE_NAMES, VERDICTS } from '../core/index.js';
import { $, h, clear, renderGauge, renderBars, renderChips, downloadJSON, copyText, debounce, escapeHtml, scoreColor } from './dom.js';
import { t, onLocaleChange, getLocale } from './i18n.js';
import { track } from './analytics.js';

const SAMPLES = {
  ai: [
    "In today's fast-paced world, it is important to note that leveraging cutting-edge solutions plays a crucial role in modern organizations. Furthermore, a comprehensive approach facilitates robust outcomes across a wide range of use cases. Moreover, teams must navigate the complexities of an ever-evolving landscape while maintaining alignment. In conclusion, embracing innovation stands as a testament to organizational maturity. Additionally, a seamless integration strategy underscores the significance of holistic thinking. Overall, when it comes to sustainable growth, organizations should delve into data-driven decision making and unlock the potential of their people.",
    "À l'ère du numérique, il est important de noter que les solutions innovantes jouent un rôle crucial dans les organisations modernes. De plus, une approche globale facilite des résultats robustes. Par ailleurs, les équipes doivent naviguer dans la complexité d'un environnement en constante évolution. En conclusion, l'innovation témoigne de la maturité de l'organisation.",
  ],
  human: [
    "honestly i still can't believe we shipped that. the deploy broke twice, the tests were flaky, and i spent tuesday night on a call with the vendor arguing about a certificate. my coworker kept saying it was DNS. it wasn't. anyway it works now. i'm going to sleep for a week.",
    "Bonjour, je voulais te dire que le déploiement a encore planté hier soir. J'ai passé la soirée à déboguer avec Léa, et au final c'était un problème de certificat. Bref, ça marche maintenant. Je vais dormir.",
  ],
};

let lastResult = null;
let lastText = '';
let langSelectReady = false;

function pickSample(kind) {
  const fr = getLocale() === 'fr';
  return fr ? SAMPLES[kind][1] : SAMPLES[kind][0];
}

export function setupTextTool() {
  const input = $('#text-input');
  const runBtn = $('#text-run');
  const result = $('#text-result');
  const inlineCount = $('#text-inline-count');

  // Populate the language selector once.
  if (!langSelectReady) {
    const sel = $('#text-lang');
    sel.innerHTML = '';
    sel.append(new Option(t('common.auto'), 'auto'));
    for (const [code, name] of Object.entries(LANGUAGE_NAMES).sort((a, b) => a[1].localeCompare(b[1]))) {
      sel.append(new Option(name, code));
    }
    langSelectReady = true;
  }

  const refreshCount = () => {
    const n = countText(input.value).words;
    inlineCount.textContent = n ? `${n} ${t('common.words')}` : '';
  };

  const run = () => {
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
    renderTextResult(r, $('#text-highlight').checked, text);
    track('tool', { tool: 'text', verdict: r.verdict, lang: r.language });
  };

  runBtn.addEventListener('click', run);
  input.addEventListener('input', debounce(() => { refreshCount(); if (input.value.trim().length > 40) run(); }, 400));
  $('#text-clear').addEventListener('click', () => {
    input.value = '';
    result.hidden = true;
    inlineCount.textContent = '';
    input.focus();
  });
  $('#text-sample').addEventListener('click', () => {
    input.value = pickSample(Math.random() < 0.5 ? 'ai' : 'human');
    refreshCount();
    run();
  });
  $('#text-highlight').addEventListener('change', () => {
    if (lastResult) renderTextResult(lastResult, $('#text-highlight').checked, lastText);
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

  onLocaleChange(() => {
    langSelectReady = false;
    setupTextTool();
    refreshCount();
    if (lastResult) renderTextResult(lastResult, $('#text-highlight').checked, lastText);
  });
}

function renderTextResult(r, highlight, originalText = '') {
  const result = $('#text-result');
  result.hidden = false;
  renderGauge($('#text-gauge'), r.score);

  const verdictEl = $('#text-verdict');
  verdictEl.textContent = t(`verdict.${camel(r.verdict)}`);
  verdictEl.className = `verdict v-${r.verdict}`;
  $('#text-verdict-desc').textContent = t(`verdictDesc.${camel(r.verdict)}`);
  $('#text-confidence').textContent = `${Math.round(r.confidence * 100)}%`;
  $('#text-detected-lang').textContent = `${r.languageName || r.language}${r.languageConfidence ? ` (${Math.round(r.languageConfidence * 100)}%)` : ''}`;
  $('#text-fingerprint').textContent = r.fingerprint;

  // Annotated text with per-sentence highlights.
  const annotated = $('#text-annotated');
  if (highlight && r.sentences.length) {
    annotated.hidden = false;
    let html = '';
    let cursor = 0;
    for (const s of r.sentences) {
      html += escapeHtml(originalText.slice(cursor, s.start));
      const color = s.score >= 60 ? 'var(--bad)' : s.score >= 40 ? 'var(--warn)' : 'transparent';
      const title = `${Math.round(s.score)}/100`;
      html += `<span class="mark" style="box-shadow: inset 0 -0.7em 0 color-mix(in srgb, ${color} 30%, transparent); color:${s.score >= 40 ? color : 'inherit'}" title="${title}" data-score="${Math.round(s.score)}">${escapeHtml(s.text)}</span>`;
      cursor = s.end;
    }
    annotated.innerHTML = html;
  } else {
    annotated.hidden = true;
  }

  renderBars($('#text-reasons'), r.reasons.map((x) => ({ id: x.id, label: t(x.label), value: x.value })));

  const phrases = r.aiPhrases || [];
  renderChips($('#text-phrases'), phrases.map((p) => `<code>${escapeHtml(p.phrase)}</code> ×${p.count}`));

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
