import './style.css';

/**
 * Interface controller.
 *
 * Responsibilities:
 *   - run Layer 1 on every keystroke (debounced) and paint the results
 *   - mirror the editor in a highlight overlay (metrically identical, inert)
 *   - explain a sentence on hover, and select it on click
 *   - drive the Layer 2 worker, streaming its readings as they arrive
 *   - theme, privacy disclosure, counters
 *
 * No framework: direct DOM, nodes built with textContent, never innerHTML.
 */

import { analyse } from './analyzer';
import { splitSentences } from './segments';
import { fingerprint, FINGERPRINT_DISCLAIMER } from './modelFingerprinter';
import { analyseImageFile, type ImageVerdict } from './imageAnalyzer';
import { compressionEntropy } from './compression';
import { initI18n, setLocale, onLocaleChange, translateDom, t, getLocale } from './i18n';
import { track, initAnalytics } from './analytics';
import type { AnalysisResult, Band, SentenceScore, WorkerRequest, WorkerResponse } from './types';

const MODEL_ID = 'onnx-community/e5-small-lora-ai-generated-detector-ONNX';
const GAUGE_CELLS = 40;
const MAX_CHUNKS = 6;
const CHUNK_CHARS = 1200;
const MODEL_TRIGGER_CHARS = 300;

/* ------------------------------------------------------------------ DOM */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

const editor = el<HTMLTextAreaElement>('editor');
const layer = el<HTMLDivElement>('highlight-layer');
const tip = el<HTMLDivElement>('tip');
const gauge = el<HTMLDivElement>('gauge');

const ui = {
  score: el<HTMLSpanElement>('score-value'),
  bandBadge: el<HTMLSpanElement>('band-badge'),
  reason: el<HTMLParagraphElement>('verdict-reason'),
  confidence: el<HTMLSpanElement>('confidence'),
  words: el<HTMLSpanElement>('count-words'),
  chars: el<HTMLSpanElement>('count-chars'),
  sentences: el<HTMLSpanElement>('count-sentences'),
  layer1Ms: el<HTMLSpanElement>('layer1-ms'),
  subSyntax: el<HTMLSpanElement>('sub-syntax'),
  subLexical: el<HTMLSpanElement>('sub-lexical'),
  subMarkers: el<HTMLSpanElement>('sub-markers'),
  subForensic: el<HTMLSpanElement>('sub-forensic'),
  barSyntax: el<HTMLDivElement>('bar-syntax'),
  barLexical: el<HTMLDivElement>('bar-lexical'),
  barMarkers: el<HTMLDivElement>('bar-markers'),
  barForensic: el<HTMLDivElement>('bar-forensic'),
  forensicPanel: el<HTMLDivElement>('forensic-panel'),
  forensicList: el<HTMLUListElement>('forensic-list'),
  markersPanel: el<HTMLDivElement>('markers-panel'),
  markersList: el<HTMLDivElement>('markers-list'),
  statSentences: el<HTMLElement>('stat-sentences'),
  statParagraphs: el<HTMLElement>('stat-paragraphs'),
  statUnique: el<HTMLElement>('stat-unique'),
  statTtr: el<HTMLElement>('stat-ttr'),
  statMean: el<HTMLElement>('stat-mean'),
  statStd: el<HTMLElement>('stat-std'),
  statBurst: el<HTMLElement>('stat-burst'),
  statTernary: el<HTMLElement>('stat-ternary'),
  modelState: el<HTMLSpanElement>('model-state'),
  modelNote: el<HTMLParagraphElement>('model-note'),
  modelProgressWrap: el<HTMLDivElement>('model-progress-wrap'),
  modelProgress: el<HTMLDivElement>('model-progress'),
  modelProgressLabel: el<HTMLParagraphElement>('model-progress-label'),
  modelResult: el<HTMLDivElement>('model-result'),
  modelScore: el<HTMLSpanElement>('model-score'),
  scoreComplement: el<HTMLSpanElement>('score-complement'),
  componentsList: el<HTMLUListElement>('components-list'),
  mesMattr: el<HTMLElement>('mes-mattr'),
  mesShannon: el<HTMLElement>('mes-shannon'),
  mesCompression: el<HTMLElement>('mes-compression'),
  mesEnum: el<HTMLElement>('mes-enum'),
  mesConn: el<HTMLElement>('mes-conn'),
  mesIso: el<HTMLElement>('mes-iso'),
  pxBenford: el<HTMLElement>('px-benford'),
  pxBenfordKl: el<HTMLElement>('px-benford-kl'),
  benfordChart: el<HTMLDivElement>('benford-chart'),
  benfordBars: el<HTMLDivElement>('benford-bars'),
};

const BAND_KEY = { human: 'band.human', mixed: 'band.mixed', ai: 'band.ai' } as const;

/* -------------------------------------------------------------- examples */

const EXAMPLES: Record<string, { ai: string; human: string }> = {
  fr: {
    ai: "À l'ère du numérique, il est important de noter que les solutions innovantes jouent un rôle crucial dans les organisations modernes.\n\nDe plus, une approche globale facilite des résultats robustes et mesurables. Par ailleurs, les équipes doivent naviguer dans les complexités d'un environnement en constante évolution.\n\nEn conclusion, l'innovation témoigne de la maturité de l'organisation et ouvre la voie à un avenir prometteur.",
    human: "Le train de 7h12 était encore en retard ce matin. J'ai poiroté vingt minutes sur le quai, sous la flotte, avec un café tiède qui fuyait.\n\nMa voisine de palier m'a prêté son parapluie. Elle a soixante-douze ans, elle jure comme un charretier, et elle m'appelle « petit » alors que j'en ai quarante.\n\nJe suis arrivé au bureau trempé. Personne n'a rien remarqué.",
  },
  en: {
    ai: "In today's fast-paced world, it is important to note that leveraging cutting-edge solutions plays a crucial role in modern organizations.\n\nFurthermore, a comprehensive approach facilitates robust and measurable outcomes. Moreover, teams must navigate the complexities of an ever-evolving environment.\n\nIn conclusion, embracing innovation is a testament to organizational maturity and paves the way for a promising future.",
    human: "The 7:12 train was late again this morning. I stood on the platform for twenty minutes in the rain with a lukewarm coffee leaking through the cup.\n\nMy neighbour lent me her umbrella. She is seventy-two, swears like a trooper, and calls me kid even though I am forty.\n\nI got to the office soaked. Nobody noticed.",
  },
  es: {
    ai: "En la era digital, es importante señalar que las soluciones innovadoras desempeñan un papel crucial en las organizaciones modernas.\n\nAdemás, un enfoque integral facilita resultados sólidos y medibles. Asimismo, los equipos deben navegar por las complejidades de un entorno en constante evolución.\n\nEn conclusión, la innovación es un testimonio de la madurez de la organización.",
    human: "El tren de las 7:12 volvía a llegar tarde. Esperé veinte minutos en el andén, bajo la lluvia, con un café tibio que se salía del vaso.\n\nMi vecina me dejó su paraguas. Tiene setenta y dos años, blasfema como un carretero y me llama «chaval» aunque tengo cuarenta.\n\nLlegué a la oficina empapado. Nadie se dio cuenta.",
  },
  de: {
    ai: "In der digitalen Ära ist es wichtig zu beachten, dass innovative Lösungen eine entscheidende Rolle in modernen Organisationen spielen.\n\nDarüber hinaus ermöglicht ein ganzheitlicher Ansatz robuste und messbare Ergebnisse. Zudem müssen Teams die Komplexität eines sich ständig wandelnden Umfelds bewältigen.\n\nZusammenfassend ist Innovation ein Beleg für die Reife der Organisation.",
    human: "Der Zug um 7:12 hatte wieder Verspätung. Ich stand zwanzig Minuten im Regen auf dem Bahnsteig, mit einem lauwarmen Kaffee, der durch den Becher lief.\n\nMeine Nachbarin hat mir ihren Schirm geliehen. Sie ist zweiundsiebzig, flucht wie ein Kutscher und nennt mich «Kleiner», obwohl ich vierzig bin.\n\nIm Büro war ich durchnässt. Es hat niemand gemerkt.",
  },
  it: {
    ai: "Nell'era digitale, è importante notare che le soluzioni innovative svolgono un ruolo cruciale nelle organizzazioni moderne.\n\nInoltre, un approccio globale facilita risultati solidi e misurabili. Le squadre devono inoltre affrontare le complessità di un ambiente in continua evoluzione.\n\nIn conclusione, l'innovazione testimonia la maturità dell'organizzazione.",
    human: "Il treno delle 7:12 era di nuovo in ritardo. Ho aspettato venti minuti sul binario, sotto la pioggia, con un caffè tiepido che perdeva dal bicchiere.\n\nLa vicina mi ha prestato l'ombrello. Ha settantadue anni, impreca come un carrettiere e mi chiama «ragazzo» anche se ne ho quaranta.\n\nSono arrivato in ufficio fradicio. Nessuno se n'è accorto.",
  },
  pt: {
    ai: "Na era digital, é importante notar que as soluções inovadoras desempenham um papel crucial nas organizações modernas.\n\nAlém disso, uma abordagem abrangente facilita resultados sólidos e mensuráveis. As equipas devem ainda navegar pelas complexidades de um ambiente em constante evolução.\n\nEm conclusão, a inovação é um testemunho da maturidade da organização.",
    human: "O comboio das 7h12 voltou a atrasar-se. Fiquei vinte minutos na plataforma, à chuva, com um café morno a escapar do copo.\n\nA vizinha emprestou-me o guarda-chuva. Tem setenta e dois anos, pragueja como um carroceiro e chama-me «miúdo» apesar de eu ter quarenta.\n\nCheguei ao escritório encharcado. Ninguém reparou.",
  },
  nl: {
    ai: "In het digitale tijdperk is het belangrijk op te merken dat innovatieve oplossingen een cruciale rol spelen in moderne organisaties.\n\nBovendien maakt een holistische aanpak robuuste en meetbare resultaten mogelijk. Teams moeten bovendien de complexiteit van een voortdurend veranderende omgeving het hoofd bieden.\n\nSamenvattend getuigt innovatie van de volwassenheid van de organisatie.",
    human: "De trein van 7.12 was weer te laat. Ik stond twintig minuten in de regen op het perron met een lauwe koffie die door de beker lekte.\n\nMijn buurvrouw leende me haar paraplu. Ze is tweeënzeventig, vloekt als een ketellapper en noemt me «jochie», ook al ben ik veertig.\n\nIk kwam doorweekt op kantoor. Niemand merkte het.",
  },
  ru: {
    ai: "В цифровую эпоху важно отметить, что инновационные решения играют ключевую роль в современных организациях.\n\nКроме того, комплексный подход обеспечивает устойчивые и измеримые результаты. Командам также приходится преодолевать сложности постоянно меняющейся среды.\n\nВ заключение, инновации свидетельствуют о зрелости организации.",
    human: "Поезд в 7:12 снова опоздал. Я двадцать минут стоял на платформе под дождём с тёплым кофе, который протекал через стакан.\n\nСоседка дала мне свой зонт. Ей семьдесят два, она ругается как извозчик и зовёт меня «малой», хотя мне сорок.\n\nВ офис я пришёл мокрый насквозь. Никто не заметил.",
  },
  zh: {
    ai: "在数字时代，值得注意的是，创新解决方案在现代组织中发挥着关键作用。\n\n此外，全面的方法有助于实现稳健且可衡量的成果。团队还必须应对不断变化的环境所带来的复杂性。\n\n总之，创新体现了组织的成熟度。",
    human: "7 点 12 分那班车又晚点了。我在站台上淋着雨等了二十分钟，手里的咖啡还是温的，杯子却在漏。\n\n邻居把伞借给了我。她七十二岁，骂起人来毫不客气，还管我叫「小孩」，可我都四十了。\n\n我浑身湿透地到了办公室。谁也没发现。",
  },
  ar: {
    ai: "في العصر الرقمي، من المهم ملاحظة أن الحلول المبتكرة تلعب دوراً محورياً في المؤسسات الحديثة.\n\nعلاوة على ذلك، يسهّل النهج الشامل تحقيق نتائج متينة وقابلة للقياس. كما يتعيّن على الفرق التعامل مع تعقيدات بيئة متغيرة باستمرار.\n\nوفي الختام، يُعدّ الابتكار دليلاً على نضج المؤسسة.",
    human: "تأخّر قطار السابعة والربع صباحاً مرة أخرى. انتظرت عشرين دقيقة على الرصيف تحت المطر، وفي يدي فنجان قهوة فاتر يتسرّب.\n\nأعارتني جارتي مظلّتها. عمرها اثنتان وسبعون، وتشتم شتماً قبيحاً، وتناديني «يا صغير» وأنا في الأربعين.\n\nوصلت المكتب مبلَّلاً تماماً. ولم يلاحظ أحد.",
  },
};

const EXAMPLE_FALLBACK = EXAMPLES.en!;

function buildTampered(locale: string): string {
  const base = (EXAMPLES[locale] ?? EXAMPLE_FALLBACK).ai;
  const cyrillic: Record<string, string> = { o: 'о', e: 'е', a: 'а', c: 'с', p: 'р', x: 'х', y: 'у' };
  // Insert a zero-width space every few characters, and swap some letters for
  // Cyrillic homoglyphs, exactly as a "humaniser" tool would.
  let out = '';
  let count = 0;
  for (const char of base) {
    const swapped = cyrillic[char.toLowerCase()];
    out += swapped && count % 7 === 3 ? swapped : char;
    out += '\u200B';
    count += 1;
  }
  return out;
}



/* ---------------------------------------------------------------- state */

let result: AnalysisResult | null = null;
let analyseTimer: number | undefined;
let modelRequestId = 0;
let modelHasRun = false;

/* ------------------------------------------------------------- rendering */

function renderGaugeCells(): void {
  gauge.replaceChildren();
  for (let i = 0; i < GAUGE_CELLS; i += 1) {
    const cell = document.createElement('span');
    cell.className = 'gauge__cell';
    gauge.append(cell);
  }
}

function paintGauge(score: number, band: Band): void {
  const filled = Math.round((score / 100) * GAUGE_CELLS);
  [...gauge.children].forEach((cell, index) => {
    const node = cell as HTMLElement;
    node.className = index < filled ? `gauge__cell gauge__cell--${band}` : 'gauge__cell';
  });
}

function setBar(bar: HTMLElement, label: HTMLElement, value: number): void {
  const pct = Math.round(value * 100);
  bar.style.width = `${pct}%`;
  label.textContent = `${pct} %`;
}

function renderOverlay(text: string, sentences: SentenceScore[]): void {
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const sentence of sentences) {
    if (sentence.start > cursor) fragment.append(document.createTextNode(text.slice(cursor, sentence.start)));
    const span = document.createElement('span');
    span.className = `hl hl--${sentence.band}`;
    span.dataset.start = String(sentence.start);
    span.dataset.end = String(sentence.end);
    span.textContent = sentence.text;
    fragment.append(span);
    cursor = sentence.end;
  }
  if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
  layer.replaceChildren(fragment);
}

function renderForensics(res: AnalysisResult): void {
  const findings = res.forensics.findings.filter((f) => !f.legitimate && f.count > 0);
  ui.forensicPanel.classList.toggle('hidden', findings.length === 0);
  ui.forensicList.replaceChildren();
  for (const finding of findings) {
    const li = document.createElement('li');
    const head = document.createElement('div');
    head.className = 'flex items-baseline justify-between gap-3';
    const title = document.createElement('span');
    title.className = 'text-label text-rose-700 dark:text-rose-300';
    title.textContent = finding.label;
    const count = document.createElement('span');
    count.className = 'font-mono text-label font-semibold text-rose-700 dark:text-rose-300';
    count.textContent = `×${finding.count}`;
    head.append(title, count);
    li.append(head);

    if (finding.samples.length) {
      const codes = document.createElement('p');
      codes.className = 'mt-1 font-mono text-[11px] leading-relaxed text-zinc-500';
      codes.textContent = finding.samples
        .map((s) => `${s.code}${s.note ? ` (${s.note})` : ''}`)
        .join('  ·  ');
      li.append(codes);
    }
    ui.forensicList.append(li);
  }
}

function renderMarkers(res: AnalysisResult): void {
  ui.markersPanel.classList.toggle('hidden', res.markers.length === 0);
  ui.markersList.replaceChildren();
  for (const marker of res.markers) {
    const chip = document.createElement('span');
    chip.className = 'rounded-[3px] border px-1.5 py-0.5 text-[11px] hairline text-zinc-600 dark:text-zinc-400';
    chip.textContent = `${marker.phrase} ×${marker.count}`;
    ui.markersList.append(chip);
  }
}

function renderStats(res: AnalysisResult): void {
  const s = res.stats;
  ui.words.textContent = String(s.words);
  ui.chars.textContent = String(s.characters);
  ui.sentences.textContent = String(s.sentences);
  ui.statSentences.textContent = String(s.sentences);
  ui.statParagraphs.textContent = String(s.paragraphs);
  ui.statUnique.textContent = String(s.uniqueWords);
  ui.statTtr.textContent = s.typeTokenRatio.toFixed(3);
  ui.statMean.textContent = s.meanSentenceWords.toFixed(1);
  ui.statStd.textContent = s.stdSentenceWords.toFixed(1);
  ui.statBurst.textContent = s.burstiness.toFixed(3);
  ui.statTernary.textContent = String(res.ternaryStructures);
  ui.mesMattr.textContent = res.stats.mattr.toFixed(3);
  ui.mesShannon.textContent = `${res.stats.shannonTrigram.toFixed(2)} bits`;
  ui.mesEnum.textContent = `${Math.round(res.stats.enumerationRatio * 100)} %`;
  ui.mesConn.textContent = `${Math.round(res.stats.connectorRatio * 100)} %`;
  ui.mesIso.textContent = `${Math.round(res.stats.paragraphIsomorphism * 100)} %`;

  // Every signal, with its weight, so the reasoning can be checked.
  ui.componentsList.replaceChildren();
  const sorted = [...res.components].sort((a, b) => b.value * b.weight - a.value * a.weight);
  for (const component of sorted) {
    const li = document.createElement('li');
    const head = document.createElement('div');
    head.className = 'flex items-baseline justify-between gap-3 text-label';
    const label = document.createElement('span');
    label.className = 'truncate text-zinc-600 dark:text-zinc-400';
    label.textContent = t(component.label);
    const value = document.createElement('span');
    value.className = 'font-mono font-semibold tabular-nums';
    value.textContent = `${Math.round(component.value * 100)} %`;
    head.append(label, value);
    const bar = document.createElement('div');
    bar.className = 'bar mt-1';
    const fill = document.createElement('div');
    fill.className = 'bar__fill';
    fill.style.width = `${Math.round(component.value * 100)}%`;
    bar.append(fill);
    li.append(head, bar);
    if (component.detail) {
      const detail = document.createElement('p');
      detail.className = 'mt-0.5 font-mono text-[11px] leading-tight text-zinc-400';
      detail.textContent = t(component.detail.key, component.detail.params);
      li.append(detail);
    }
    ui.componentsList.append(li);
  }
}

function render(res: AnalysisResult): void {
  ui.score.textContent = String(res.score);
  // A bare "4 %" reads as a failure when the answer is "human". State the
  // reading in both directions.
  ui.scoreComplement.textContent = res.band === 'human'
    ? t('score.humanSuffix', { n: 100 - res.score })
    : res.band === 'mixed'
      ? t('score.mixedSuffix')
      : t('score.aiSuffix', { n: res.score });
  ui.bandBadge.textContent = t(BAND_KEY[res.band]);
  ui.bandBadge.className = `rounded-[3px] border px-1.5 py-0.5 text-micro font-semibold uppercase tracking-[0.08em] hairline ${
    res.band === 'ai'
      ? 'text-rose-700 dark:text-rose-300'
      : res.band === 'mixed'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-sage-600 dark:text-sage-200'
  }`;
  ui.reason.textContent = t(res.verdictReason.key, res.verdictReason.params);
  ui.confidence.textContent = `${res.confidence} %`;

  paintGauge(res.score, res.band);
  setBar(ui.barSyntax, ui.subSyntax, res.subScores.syntacticRegularity);
  setBar(ui.barLexical, ui.subLexical, res.subScores.lexicalPredictability);
  setBar(ui.barMarkers, ui.subMarkers, res.subScores.llmMarkers);
  setBar(ui.barForensic, ui.subForensic, res.subScores.characterIntegrity);

  renderForensics(res);
  renderMarkers(res);
  renderStats(res);
  renderFingerprint(editor.value);
  renderOverlay(editor.value, res.sentences);
  if (res.stats.words >= 40) track('tool', { tool: 'text', verdict: res.band, lang: getLocale() });
  renderFaq();
translateDom(document);
initAnalytics();
}

/* --------------------------------------------------------------- analyse */

let compressionToken = 0;

/**
 * Compression entropy is asynchronous (CompressionStream), so it augments the
 * reading once it lands instead of blocking Layer 1.
 */
async function updateCompression(text: string): Promise<void> {
  const token = (compressionToken += 1);
  const report = await compressionEntropy(text);
  if (token !== compressionToken) return;
  ui.mesCompression.textContent = report.available
    ? `${report.ratio.toFixed(3)} · corr. ${report.corrected.toFixed(3)}`
    : '—';
}

function runAnalysis(): void {
  const text = editor.value;
  const started = performance.now();
  const locale = navigator.language || 'fr';

  if (!text.trim()) {
    result = null;
    layer.replaceChildren();
    ui.score.textContent = '0';
    ui.reason.textContent = 'En attente de texte.';
    paintGauge(0, 'human');
    setBar(ui.barSyntax, ui.subSyntax, 0);
    setBar(ui.barLexical, ui.subLexical, 0);
    setBar(ui.barMarkers, ui.subMarkers, 0);
    setBar(ui.barForensic, ui.subForensic, 0);
    ui.forensicPanel.classList.add('hidden');
    ui.markersPanel.classList.add('hidden');
    ui.words.textContent = '0';
    ui.chars.textContent = '0';
    ui.sentences.textContent = '0';
    ui.layer1Ms.textContent = '0';
    ui.mesCompression.textContent = '—';
    ui.componentsList.replaceChildren();
    compressionToken += 1;
    return;
  }

  const res = analyse(text, locale);
  result = res;
  render(res);
  ui.layer1Ms.textContent = (performance.now() - started).toFixed(1);
  void updateCompression(text);

  if (text.length >= MODEL_TRIGGER_CHARS) void ensureModel(text);
}

/* -------------------------------------------------------------- layer 2 */

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.type === 'progress') {
        ui.modelProgressWrap.classList.remove('hidden');
        ui.modelProgress.style.width = `${data.progress}%`;
        ui.modelProgressLabel.textContent = `${data.phase === 'download' ? 'Téléchargement' : 'Initialisation'} — ${data.progress} %${data.file ? ` · ${data.file}` : ''}`;
        ui.modelState.textContent = 'chargement';
      } else if (data.type === 'ready') {
        ui.modelState.textContent = 'prêt';
        ui.modelProgressWrap.classList.add('hidden');
      } else if (data.type === 'done') {
        ui.modelResult.classList.remove('hidden');
        ui.modelResult.classList.add('flex');
        ui.modelScore.textContent = `${Math.round(data.result.score * 100)} % IA · ${data.result.ms} ms`;
        ui.modelState.textContent = 'actif';
      } else if (data.type === 'error') {
        ui.modelState.textContent = 'indisponible';
        ui.modelNote.textContent = `Couche 2 indisponible : ${data.message}. La couche 1 continue de fonctionner, l'outil reste complet.`;
        ui.modelProgressWrap.classList.add('hidden');
      }
    });
  }
  return worker;
}

function chunkText(text: string): string[] {
  const sentences = splitSentences(text, navigator.language || 'fr');
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.text.length > CHUNK_CHARS && current) {
      chunks.push(current);
      current = '';
    }
    current += `${sentence.text} `;
    if (chunks.length >= MAX_CHUNKS) break;
  }
  if (current && chunks.length < MAX_CHUNKS) chunks.push(current);
  return chunks.length ? chunks : [text.slice(0, CHUNK_CHARS)];
}

async function ensureModel(text: string): Promise<void> {
  const w = getWorker();
  if (!modelHasRun) {
    modelHasRun = true;
    ui.modelState.textContent = 'chargement';
    const loadMessage: WorkerRequest = { type: 'load', modelId: MODEL_ID };
    w.postMessage(loadMessage);
  }
  const request: WorkerRequest = { type: 'classify', id: (modelRequestId += 1), modelId: MODEL_ID, chunks: chunkText(text) };
  w.postMessage(request);
}

/* ----------------------------------------------------------- interaction */

editor.addEventListener('input', () => {
  window.clearTimeout(analyseTimer);
  analyseTimer = window.setTimeout(runAnalysis, 120);
});

editor.addEventListener('scroll', () => {
  layer.scrollTop = editor.scrollTop;
  layer.scrollLeft = editor.scrollLeft;
});

/** Character offset under the pointer, if the engine can tell us. */
function offsetFromPoint(x: number, y: number): number | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };

  const range = doc.caretRangeFromPoint?.(x, y);
  if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
    // The overlay and the textarea share offsets, so a hit on either is usable.
    const parent = range.startContainer.parentElement;
    if (parent?.dataset.start !== undefined) {
      return Number(parent.dataset.start) + range.startOffset;
    }
  }

  const position = doc.caretPositionFromPoint?.(x, y);
  if (position && position.offsetNode.nodeType === Node.TEXT_NODE) {
    const parent = (position.offsetNode as Text).parentElement;
    if (parent?.dataset.start !== undefined) return Number(parent.dataset.start) + position.offset;
  }
  return null;
}

function sentenceAt(offset: number): SentenceScore | null {
  if (!result) return null;
  return result.sentences.find((s) => offset >= s.start && offset < s.end) ?? null;
}

editor.addEventListener('mousemove', (event) => {
  if (!result) return;
  const rect = editor.getBoundingClientRect();
  const offset = offsetFromPoint(event.clientX, event.clientY);
  const sentence = offset === null ? null : sentenceAt(offset);

  if (!sentence) {
    tip.hidden = true;
    return;
  }

  tip.replaceChildren();
  const head = document.createElement('div');
  head.className = 'flex items-baseline justify-between gap-3';
  const score = document.createElement('span');
  score.className = `tip__score ${
    sentence.band === 'ai' ? 'text-rose-600 dark:text-rose-300'
      : sentence.band === 'mixed' ? 'text-amber-600 dark:text-amber-300'
        : 'text-sage-600 dark:text-sage-200'
  }`;
  score.textContent = `${sentence.score} % IA`;
  const label = document.createElement('span');
  label.className = 'text-zinc-400';
  label.textContent = `${sentence.words} mots`;
  head.append(score, label);
  tip.append(head);

  const list = document.createElement('ul');
  list.className = 'mt-1 space-y-0.5';
  for (const reason of sentence.reasons) {
    const li = document.createElement('li');
    li.textContent = `· ${t(reason.key, reason.params)}`;
    list.append(li);
  }
  tip.append(list);

  const top = event.clientY - rect.top + 18;
  const left = Math.min(Math.max(event.clientX - rect.left + 12, 8), Math.max(8, rect.width - 260));
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
  tip.hidden = false;
});

editor.addEventListener('mouseleave', () => {
  tip.hidden = true;
});

editor.addEventListener('click', (event) => {
  if (!result) return;
  const offset = offsetFromPoint(event.clientX, event.clientY);
  const sentence = offset === null ? null : sentenceAt(offset);
  if (!sentence) return;
  editor.focus();
  editor.setSelectionRange(sentence.start, sentence.end);
});

/* ---------------------------------------------------------------- actions */

el<HTMLButtonElement>('btn-paste').addEventListener('click', () => {
  void navigator.clipboard
    .readText()
    .then((text) => {
      if (!text) return;
      editor.value = text;
      runAnalysis();
    })
    .catch(() => {
      ui.reason.textContent = 'Le presse-papiers est inaccessible. Utilisez Ctrl+V.';
    });
});

el<HTMLButtonElement>('btn-clear').addEventListener('click', () => {
  editor.value = '';
  runAnalysis();
  editor.focus();
});

const sampleSelect = el<HTMLSelectElement>('sample-select');
sampleSelect.addEventListener('change', () => {
  const choice = sampleSelect.value;
  if (!choice) return;
  const pack = EXAMPLES[getLocale()] ?? EXAMPLE_FALLBACK;
  editor.value = choice === 'ai' ? pack.ai : choice === 'human' ? pack.human : buildTampered(getLocale());
  runAnalysis();
  sampleSelect.value = '';
});

/* ------------------------------------------------------------------ theme */

const themeToggle = el<HTMLButtonElement>('theme-toggle');
const themeLabel = el<HTMLSpanElement>('theme-label');

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
  themeLabel.textContent = theme === 'dark' ? 'Clair' : 'Sombre';
  try {
    localStorage.setItem('aitd.theme', theme);
  } catch {
    /* storage disabled: the theme simply does not persist */
  }
}

const storedTheme = ((): 'light' | 'dark' | null => {
  try {
    const value = localStorage.getItem('aitd.theme');
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
})();

applyTheme(storedTheme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

/* ---------------------------------------------------------------- privacy */

const privacyToggle = el<HTMLButtonElement>('privacy-toggle');
const privacyBody = el<HTMLDivElement>('privacy-body');
const privacyCaret = el<HTMLSpanElement>('privacy-caret');

privacyToggle.addEventListener('click', () => {
  const open = privacyBody.classList.toggle('hidden');
  privacyToggle.setAttribute('aria-expanded', String(!open));
  privacyCaret.textContent = open ? '+' : '−';
});

/* ------------------------------------------------------------------- boot */

renderGaugeCells();
runAnalysis();
editor.focus();

/* ============================================================================
 * Model fingerprinting
 * ========================================================================== */

function renderFingerprint(text: string): void {
  const res = fingerprint(text);
  const bars = el<HTMLDivElement>('fingerprint-bars');
  const top = el<HTMLSpanElement>('fingerprint-top');
  const notes = el<HTMLParagraphElement>('fingerprint-notes');

  top.textContent = res.inconclusive
    ? 'indéterminé'
    : (res.profiles.find((p) => p.id === res.top)?.label ?? '—').split(' · ')[0]!;

  bars.replaceChildren();
  for (const profile of res.profiles) {
    const row = document.createElement('div');

    const head = document.createElement('div');
    head.className = 'flex items-baseline justify-between gap-3 text-label';
    const label = document.createElement('span');
    label.className = 'truncate text-zinc-600 dark:text-zinc-400';
    label.textContent = profile.label;
    const value = document.createElement('span');
    value.className = 'font-mono font-semibold tabular-nums';
    value.textContent = `${Math.round(profile.score * 100)} %`;
    head.append(label, value);

    const bar = document.createElement('div');
    bar.className = 'bar mt-1.5';
    const fill = document.createElement('div');
    fill.className = 'bar__fill';
    fill.style.width = `${Math.round(profile.score * 100)}%`;
    bar.append(fill);
    row.append(head, bar);

    if (profile.evidence.length) {
      const why = document.createElement('p');
      why.className = 'mt-1 text-[11px] leading-tight text-zinc-400';
      why.textContent = profile.evidence.slice(0, 2).join(' · ');
      row.append(why);
    }
    bars.append(row);
  }

  const firstNote = res.notes.length ? ` ${t(res.notes[0]!)}` : '';
  notes.textContent = res.inconclusive
    ? `${t(FINGERPRINT_DISCLAIMER)} ${firstNote || t('fp.none')}`
    : `${t(FINGERPRINT_DISCLAIMER)} ${t('fingerprint.gap', { n: Math.round(res.separation * 100) })}${firstNote}`;
}

/* ============================================================================
 * Image inspection
 * ========================================================================== */

const imgPane = el<HTMLDivElement>('pane-image');
const textPane = el<HTMLDivElement>('pane-text');
const tabText = el<HTMLButtonElement>('tab-text');
const tabImage = el<HTMLButtonElement>('tab-image');

const img = {
  dropzone: el<HTMLDivElement>('img-dropzone'),
  input: el<HTMLInputElement>('img-input'),
  empty: el<HTMLDivElement>('img-empty'),
  loaded: el<HTMLDivElement>('img-loaded'),
  footer: el<HTMLDivElement>('img-footer'),
  canvas: el<HTMLCanvasElement>('img-canvas'),
  heat: el<HTMLCanvasElement>('img-heat'),
  opacity: el<HTMLInputElement>('img-opacity'),
  modeOriginal: el<HTMLButtonElement>('img-mode-original'),
  modeHeat: el<HTMLButtonElement>('img-mode-heat'),
  info: el<HTMLSpanElement>('img-info'),
  ms: el<HTMLSpanElement>('img-ms'),
  score: el<HTMLSpanElement>('img-score'),
  gauge: el<HTMLDivElement>('img-gauge'),
  badge: el<HTMLSpanElement>('img-verdict-badge'),
  reason: el<HTMLParagraphElement>('img-verdict-reason'),
  c2pa: el<HTMLDivElement>('img-c2pa'),
  evidencePanel: el<HTMLDivElement>('img-evidence-panel'),
  evidence: el<HTMLUListElement>('img-evidence'),
  pixelsPanel: el<HTMLDivElement>('img-pixels-panel'),
  metadataPanel: el<HTMLDivElement>('img-metadata-panel'),
  metadata: el<HTMLElement>('img-metadata'),
  pxUniformity: el<HTMLElement>('px-uniformity'),
  pxLap: el<HTMLElement>('px-lap'),
  pxChroma: el<HTMLElement>('px-chroma'),
  pxEdges: el<HTMLElement>('px-edges'),
  pxSample: el<HTMLElement>('px-sample'),
};

const IMG_BADGE: Record<ImageVerdict, { label: string; cls: string }> = {
  ai: { label: 'IA', cls: 'text-rose-700 dark:text-rose-300' },
  'likely-ai': { label: 'Probable IA', cls: 'text-rose-700 dark:text-rose-300' },
  unsure: { label: 'Incertain', cls: 'text-amber-700 dark:text-amber-300' },
  'likely-real': { label: 'Probable réelle', cls: 'text-sage-600 dark:text-sage-200' },
  real: { label: 'Réelle', cls: 'text-sage-600 dark:text-sage-200' },
  unknown: { label: 'Indéterminé', cls: 'text-zinc-500' },
};

function imageGaugeCells(): void {
  img.gauge.replaceChildren();
  for (let i = 0; i < GAUGE_CELLS; i += 1) {
    const cell = document.createElement('span');
    cell.className = 'gauge__cell';
    img.gauge.append(cell);
  }
}

function paintImageGauge(score: number, verdict: ImageVerdict): void {
  const bandName: Band = verdict === 'ai' || verdict === 'likely-ai' ? 'ai' : verdict === 'unsure' ? 'mixed' : 'human';
  const filled = Math.round((score / 100) * GAUGE_CELLS);
  [...img.gauge.children].forEach((cell, index) => {
    const node = cell as HTMLElement;
    node.className = index < filled ? `gauge__cell gauge__cell--${bandName}` : 'gauge__cell';
  });
}

function drawImage(bitmap: ImageBitmap | HTMLImageElement, res: Awaited<ReturnType<typeof analyseImageFile>>): void {
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  img.canvas.width = w;
  img.canvas.height = h;
  img.canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);

  if (res.pixels) {
    img.heat.width = res.pixels.heatmap.width;
    img.heat.height = res.pixels.heatmap.height;
    img.heat.getContext('2d')?.drawImage(res.pixels.heatmap, 0, 0);
  }
}

function renderImage(res: Awaited<ReturnType<typeof analyseImageFile>>): void {
  img.empty.classList.add('hidden');
  img.loaded.classList.remove('hidden');
  img.footer.classList.remove('hidden');
  img.footer.classList.add('flex');

  const badge = IMG_BADGE[res.verdict];
  img.badge.textContent = badge.label;
  img.badge.className = `rounded-[3px] border px-1.5 py-0.5 text-micro font-semibold uppercase tracking-[0.08em] hairline ${badge.cls}`;
  img.score.textContent = String(res.score);
  paintImageGauge(res.score, res.verdict);
  img.reason.textContent = res.evidence.length
    ? res.evidence[0]!.label
    : 'Aucun signal fort. Analyse de pixels seule.';

  img.info.textContent = `${res.format.toUpperCase()} · ${res.width ?? '?'}×${res.height ?? '?'} · ${(res.bytes / 1024).toFixed(1)} KB`;
  img.ms.textContent = `${res.ms} ms`;

  // C2PA block
  img.c2pa.replaceChildren();
  const c2paBox = document.createElement('div');
  c2paBox.className = 'flex items-start gap-2';
  const dot = document.createElement('span');
  dot.className = `mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
    res.c2pa.aiDeclared ? 'bg-rose-500' : res.c2pa.present ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'
  }`;
  const c2paText = document.createElement('div');
  const c2paTitle = document.createElement('p');
  c2paTitle.className = 'text-body font-medium';
  c2paTitle.textContent = res.c2pa.aiDeclared
    ? 'Génération IA certifiée par signature C2PA'
    : res.c2pa.present
      ? 'Manifeste C2PA présent'
      : 'Aucun manifeste C2PA';
  const c2paDetail = document.createElement('p');
  c2paDetail.className = 'mt-0.5 font-mono text-[11px] text-zinc-500';
  c2paDetail.textContent = res.c2pa.present
    ? `${res.c2pa.container ?? '?'} · ${res.c2pa.manifestBytes} octets${res.c2pa.issuers.length ? ` · ${res.c2pa.issuers.join(', ')}` : ''}`
    : 'Les métadonnées ont été supprimées ou n’ont jamais existé.';
  c2paText.append(c2paTitle, c2paDetail);
  c2paBox.append(dot, c2paText);
  img.c2pa.append(c2paBox);

  // Evidence
  img.evidencePanel.classList.toggle('hidden', res.evidence.length === 0);
  img.evidence.replaceChildren();
  for (const item of res.evidence) {
    const li = document.createElement('li');
    li.className = 'flex items-start gap-2';
    const mark = document.createElement('span');
    mark.className = `mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
      item.level === 'high' ? 'bg-rose-500' : item.level === 'good' ? 'bg-sage-600' : item.level === 'warn' ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'
    }`;
    const body = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'text-label font-medium';
    title.textContent = item.label;
    body.append(title);
    if (item.detail) {
      const detail = document.createElement('p');
      detail.className = 'mt-0.5 break-words font-mono text-[11px] leading-tight text-zinc-500';
      detail.textContent = item.detail;
      body.append(detail);
    }
    li.append(mark, body);
    img.evidence.append(li);
  }

  // Pixels
  const p = res.pixels;
  img.pixelsPanel.classList.toggle('hidden', !p);
  if (p) {
    img.pxUniformity.textContent = p.blockUniformity.toFixed(3);
    img.pxLap.textContent = p.laplacianStd.toFixed(2);
    img.pxChroma.textContent = p.chromaticAberration.toFixed(3);
    img.pxEdges.textContent = p.edgeDensity.toFixed(4);
    img.pxSample.textContent = `${p.sampleWidth}×${p.sampleHeight}`;
  }

  // Benford / DCT
  const b = res.pixels?.benford ?? null;
  ui.pxBenford.textContent = b ? `${Math.round(b.conformity * 100)} %` : 'échantillon trop petit';
  ui.pxBenfordKl.textContent = b ? b.kl.toFixed(3) : '—';
  ui.benfordChart.classList.toggle('hidden', !b);
  ui.benfordBars.replaceChildren();
  if (b) {
    for (let d = 1; d <= 9; d += 1) {
      const observed = b.observed[d - 1] ?? 0;
      const expected = b.expected[d - 1] ?? 0;
      const row = document.createElement('div');
      row.className = 'grid grid-cols-[1.2rem_1fr_5.5rem] items-center gap-2';
      const digit = document.createElement('span');
      digit.className = 'font-mono text-[11px] text-zinc-500';
      digit.textContent = String(d);
      const track = document.createElement('div');
      track.className = 'bar';
      const fill = document.createElement('div');
      fill.className = 'bar__fill';
      fill.style.width = `${Math.min(100, (observed / 0.35) * 100)}%`;
      track.append(fill);
      const values = document.createElement('span');
      values.className = 'text-right font-mono text-[11px] tabular-nums text-zinc-500';
      values.textContent = `${(observed * 100).toFixed(1)} / ${(expected * 100).toFixed(1)}`;
      row.append(digit, track, values);
      ui.benfordBars.append(row);
    }
  }

  // Metadata table
  img.metadataPanel.classList.toggle('hidden', res.rawMetadata.length === 0);
  img.metadata.replaceChildren();
  for (const row of res.rawMetadata) {
    const tr = document.createElement('tr');
    tr.className = 'border-b last:border-0 hairline';
    const th = document.createElement('th');
    th.scope = 'row';
    th.className = 'w-2/5 py-1.5 pr-3 align-top text-label font-normal text-zinc-500';
    th.textContent = row.key;
    const td = document.createElement('td');
    td.className = 'break-words py-1.5 align-top font-mono text-[11px] text-zinc-700 dark:text-zinc-300';
    td.textContent = row.value;
    tr.append(th, td);
    img.metadata.append(tr);
  }
}

let lastImage: Awaited<ReturnType<typeof analyseImageFile>> | null = null;
let imageMode: 'original' | 'heat' = 'original';

function applyImageMode(): void {
  const heat = imageMode === 'heat';
  img.modeOriginal.setAttribute('aria-pressed', String(!heat));
  img.modeHeat.setAttribute('aria-pressed', String(heat));
  img.heat.style.opacity = heat ? String(Number(img.opacity.value) / 100) : '0';
}

img.modeOriginal.addEventListener('click', () => { imageMode = 'original'; applyImageMode(); });
img.modeHeat.addEventListener('click', () => { imageMode = 'heat'; applyImageMode(); });
img.opacity.addEventListener('input', () => { if (imageMode === 'heat') applyImageMode(); });

let imageBusy = false;

async function handleImageFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/') || imageBusy) {
    img.reason.textContent = 'Ce fichier n’est pas une image.';
    return;
  }
  imageBusy = true;
  img.reason.textContent = 'Analyse en cours…';
  try {
    const res = await analyseImageFile(file);
    // The binary result stands on its own: a file we cannot decode (corrupt,
    // exotic container, no pixel data) still has metadata worth reporting.
    try {
      const bitmap = 'createImageBitmap' in window
        ? await createImageBitmap(file)
        : await new Promise<HTMLImageElement>((resolve, reject) => {
          const node = new Image();
          node.onload = () => resolve(node);
          node.onerror = reject;
          node.src = URL.createObjectURL(file);
        });
      drawImage(bitmap, res);
    } catch {
      img.canvas.width = 0;
      img.canvas.height = 0;
      img.heat.width = 0;
      img.heat.height = 0;
    }
    lastImage = res;
    renderImage(res);
    applyImageMode();
  } catch (error) {
    img.reason.textContent = `Échec de l’analyse : ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    imageBusy = false;
  }
}

// Clear the current image without reloading the page.
document.getElementById('img-reset')?.addEventListener('click', () => {
  lastImage = null;
  img.loaded.classList.add('hidden');
  img.footer.classList.add('hidden');
  img.footer.classList.remove('flex');
  img.empty.classList.remove('hidden');
  img.canvas.width = 0;
  img.canvas.height = 0;
  img.heat.width = 0;
  img.heat.height = 0;
  img.input.value = '';
  img.reason.textContent = t('image.waiting');
});

img.dropzone.addEventListener('click', () => img.input.click());
// A visible control, in case the dashed zone is not read as a button.
document.getElementById('img-browse')?.addEventListener('click', (event) => {
  event.stopPropagation();
  img.input.click();
});
img.dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    img.input.click();
  }
});
img.input.addEventListener('change', () => {
  const file = img.input.files?.[0];
  if (file) void handleImageFile(file);
});
for (const type of ['dragenter', 'dragover'] as const) {
  img.dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    img.dropzone.classList.add('border-zinc-900');
  });
}
for (const type of ['dragleave', 'drop'] as const) {
  img.dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    img.dropzone.classList.remove('border-zinc-900');
  });
}
img.dropzone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) void handleImageFile(file);
});
document.addEventListener('paste', (event) => {
  if (imageMode !== 'original' && textPane.classList.contains('hidden') === false) return;
  const item = [...(event.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  const file = item.getAsFile();
  if (file) {
    showTab('image');
    void handleImageFile(file);
  }
});

/* ------------------------------------------------------------------ tabs */

function showTab(which: 'text' | 'image'): void {
  const isText = which === 'text';
  tabText.setAttribute('aria-selected', String(isText));
  tabImage.setAttribute('aria-selected', String(!isText));
  textPane.classList.toggle('hidden', !isText);
  textPane.classList.toggle('grid', isText);
  imgPane.classList.toggle('hidden', isText);
  imgPane.classList.toggle('grid', !isText);
}

tabText.addEventListener('click', () => showTab('text'));
tabImage.addEventListener('click', () => showTab('image'));

renderGaugeCells();
imageGaugeCells();
applyImageMode();

/* ------------------------------------------------------------------- faq */

interface FaqItem { q: string; a: string }

const faqModules = import.meta.glob<{ default: FaqItem[] }>('./faq/*.json', { eager: true });
const FAQS: Record<string, FaqItem[]> = {};
for (const [path, mod] of Object.entries(faqModules)) {
  FAQS[path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '')] = mod.default;
}

/** Plain-language FAQ. Falls back to English, then French, then nothing. */
function renderFaq(): void {
  const list = document.getElementById('faq-list');
  if (!list) return;
  // Never leak English into another language: if the FAQ is not translated yet,
  // the disclaimer above (translated everywhere) explains it and the list stays
  // empty. Silence beats the wrong language.
  const items = FAQS[getLocale()] ?? [];
  list.replaceChildren();
  if (!items.length) return;
  for (const item of items) {
    const details = document.createElement('details');
    details.className = 'group py-1';
    const summary = document.createElement('summary');
    summary.className = 'cursor-pointer list-none py-3 pr-8 text-body font-medium marker:content-none';
    summary.textContent = item.q;
    const answer = document.createElement('p');
    answer.className = 'max-w-2xl pb-4 pr-8 text-body leading-relaxed text-zinc-600 dark:text-zinc-400';
    answer.textContent = item.a;
    details.append(summary, answer);
    list.append(details);
  }
}

/* --------------------------------------------------------------- locale */

const localeSelect = el<HTMLSelectElement>('locale-select');
initI18n(localeSelect);
localeSelect.addEventListener('change', () => {
  setLocale(localeSelect.value);
  if (result) render(result);
  if (lastImage) renderImage(lastImage);
  renderFaq();
  translateDom(document);
});
// The theme button label changes with the language too.
onLocaleChange(() => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
});
renderFaq();
translateDom(document);
initAnalytics();
