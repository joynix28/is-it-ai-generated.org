/**
 * AI "slop" detector.
 *
 * Implements the writing patterns catalogued by the open-source skills
 *   - no-ai-slop  (github.com/petergyang/no-ai-slop, MIT)
 *   - stop-slop   (github.com/hardikpandya/stop-slop, MIT)
 *
 * Two outputs:
 *   detectSlop(text)  -> named findings with exact offsets (evidence, not a guess)
 *   slopScore(text)   -> 0..100 density metric merged into the AI detector
 *
 * The point of showing *named patterns with quotes* instead of a black-box
 * verdict is that a reader can check every claim.
 */

import { splitSentences, tokenizeWords, countWords } from './tokenize.js';
import { clamp, mapLinear } from './math.js';

/** Helper: iterate a global regex without state leaking between calls. */
function matchAll(re, text) {
  const out = [];
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m;
  while ((m = rx.exec(text)) !== null) {
    out.push({ value: m[0], start: m.index, end: m.index + m[0].length });
    if (m.index === rx.lastIndex) rx.lastIndex += 1;
    if (out.length > 500) break;
  }
  return out;
}

/**
 * Pattern catalogue. `weight` (0..3) drives how strongly a hit contributes to
 * the score; `hint` is shown to the user as a concrete fix.
 */
export const SLOP_PATTERNS = [
  // ---- Structural ---------------------------------------------------------
  {
    id: 'binary-contrast',
    category: 'structure',
    label: 'Binary contrast',
    weight: 2.5,
    hint: 'State the second half directly and drop the "not X" setup.',
    re: /\b(?:is|are|was|were)\s+not\s+(?:the\s+)?(?:problem|issue|point|question|answer|goal|reason)\b|\b(?:isn['\u2019]?t|aren['\u2019]?t|wasn['\u2019]?t)\s+the\s+(?:problem|issue|point|question|answer|goal|reason)\b|\bthe\s+(?:problem|issue|point|question|answer|goal|reason)\s+isn['\u2019]?t\b|\bit['\u2019]?s\s+not\s+(?:about|just|only)\b/gi,
    langs: ['en'],
  },
  {
    id: 'not-x-but-y',
    category: 'structure',
    label: 'Not X but Y',
    weight: 2,
    hint: 'Keep only the "but Y" part.',
    re: /\bnot\s+(?:just\s+|only\s+|simply\s+)?[\w\s'\u2019,-]{1,45}?\bbut\s+(?:also\s+)?/gi,
    langs: ['en'],
  },
  {
    id: 'negative-listing',
    category: 'structure',
    label: 'Negative listing',
    weight: 2.5,
    hint: 'Say what it is. Skip the list of what it is not.',
    re: /\bNot\s+(?:a|an|the|just)\b[^.!?\n]{0,80}[.!?]\s+Not\s+(?:a|an|the|just)\b/gi,
    langs: ['en'],
  },
  {
    id: 'dramatic-fragmentation',
    category: 'structure',
    label: 'Dramatic fragmentation',
    weight: 2.5,
    hint: 'Merge the fragments into one complete sentence.',
    re: /\b(?:That['\u2019]?s\s+it\.\s*That['\u2019]?s\s+(?:the|all)\b|Period\.\s|Full stop\.\s)/gi,
    langs: ['en'],
  },
  {
    id: 'rhetorical-setup',
    category: 'structure',
    label: 'Rhetorical setup',
    weight: 2.5,
    hint: 'Delete the setup and open with the claim.',
    re: /\b(?:what\s+if\s+i\s+told\s+you|think\s+about\s+it[:,]|picture\s+this[:,]|imagine\s+this[:,]|here['\u2019]?s\s+what\s+i\s+mean|and\s+that['\u2019]?s\s+okay\b)/gi,
    langs: ['en'],
  },
  {
    id: 'colon-reveal',
    category: 'structure',
    label: 'Colon reveal',
    weight: 1.5,
    hint: 'Turn the colon reveal into a plain sentence.',
    re: /(?<![:\d])\b[a-zA-Z][a-zA-Z\s'\u2019-]{2,48}:\s+[a-z][a-z]{2,}/g,
    langs: ['en'],
  },
  {
    id: 'superficial-analysis',
    category: 'structure',
    label: 'Superficial analysis',
    weight: 2,
    hint: 'Replace the trailing "-ing" clause with a concrete consequence.',
    re: /,\s+(?:highlighting|underscoring|reflecting|showcasing|emphasizing|demonstrating|signaling|illustrating|reinforcing|cementing|paving\s+the\s+way|solidifying|marking|ushering)\b/gi,
    langs: ['en'],
  },

  // ---- Phrases ------------------------------------------------------------
  {
    id: 'throat-clearing',
    category: 'phrase',
    label: 'Throat-clearing opener',
    weight: 2.5,
    hint: 'Cut the opener and state the point.',
    re: /\b(?:here['\u2019]?s\s+(?:the\s+thing|what|why|this|that|how|where)|the\s+uncomfortable\s+truth\s+is|the\s+truth\s+is|the\s+reality\s+is|let\s+me\s+be\s+clear|i['\u2019]?ll\s+be\s+honest|i['\u2019]?ll\s+say\s+it\s+again|it\s+turns\s+out\s+that|can\s+we\s+talk\s+about)\b/gi,
    langs: ['en'],
  },
  {
    id: 'faux-insight',
    category: 'phrase',
    label: 'Faux-insight setup',
    weight: 3,
    hint: 'Drop the "nobody tells you" frame and make the claim stand alone.',
    re: /\b(?:what\s+nobody\s+tells\s+you|what\s+most\s+people\s+(?:get\s+wrong|miss|don['\u2019]?t)|the\s+part\s+(?:everyone|most\s+people)\s+(?:misses|skips)|(?:few|most)\s+people\s+don['\u2019]?t\s+realize|here['\u2019]?s\s+what\s+nobody)\b/gi,
    langs: ['en'],
  },
  {
    id: 'emphasis-crutch',
    category: 'phrase',
    label: 'Emphasis crutch',
    weight: 1.5,
    hint: 'Delete it. The sentence is fine without it.',
    re: /\b(?:let\s+that\s+sink\s+in|make\s+no\s+mistake|this\s+matters\s+because|here['\u2019]?s\s+why\s+that\s+matters|full\s+stop\.?|period\.?\s*$)/gim,
    langs: ['en'],
  },
  {
    id: 'importance-puffery',
    category: 'phrase',
    label: 'Importance puffery',
    weight: 2.5,
    hint: 'State the fact; let the reader judge the significance.',
    re: /\b(?:a?\s*testament\s+to|stands?\s+as\s+a\s+testament|marks?\s+a\s+(?:pivotal|significant|defining|major)\s+moment|plays?\s+a\s+(?:vital|crucial|key|pivotal|significant)\s+role|solidifies?\s+(?:its|his|her|their)\s+position|underscores?\s+the\s+significance|(?:is|are)\s+a\s+game[- ]?changer|marks?\s+a\s+milestone)\b/gi,
  },
  {
    id: 'weasel-attribution',
    category: 'phrase',
    label: 'Weasel attribution',
    weight: 2,
    hint: 'Name the source, or cut the claim.',
    re: /\b(?:experts\s+agree|studies\s+show|research\s+(?:shows|suggests)|scientists\s+say|many\s+argue|widely\s+regarded\s+as|it\s+is\s+believed|some\s+say|according\s+to\s+experts|industry\s+reports)\b/gi,
    langs: ['en'],
  },
  {
    id: 'meta-commentary',
    category: 'phrase',
    label: 'Meta-commentary',
    weight: 2,
    hint: 'Delete the aside about the writing itself.',
    re: /\b(?:hint:|plot\s+twist:|spoiler:|you\s+already\s+know\s+this|but\s+that['\u2019]?s\s+another\s+post|a\s+feature,?\s+not\s+a\s+bug|the\s+rest\s+of\s+this\s+essay|let\s+me\s+walk\s+you\s+through|in\s+this\s+section,?\s+we|as\s+we['\u2019]?ll\s+see|i\s+want\s+to\s+explore|in\s+this\s+article)\b/gi,
    langs: ['en'],
  },
  {
    id: 'vague-declarative',
    category: 'phrase',
    label: 'Vague declarative',
    weight: 2,
    hint: 'Name the specific thing instead of announcing importance.',
    re: /\b(?:the\s+(?:reasons|implications|stakes|consequences|details)\s+are\s+(?:structural|significant|high|real|clear)|stakes\s+are\s+high|more\s+nuanced\s+than\s+that)\b/gi,
    langs: ['en'],
  },
  {
    id: 'filler-phrase',
    category: 'phrase',
    label: 'Filler phrase',
    weight: 1.5,
    hint: 'Cut it or replace with the concrete point.',
    re: /\b(?:at\s+the\s+end\s+of\s+the\s+day|when\s+it\s+comes\s+to|in\s+today['\u2019]?s|in\s+a\s+world\s+where|it['\u2019]?s\s+worth\s+noting|it\s+is\s+important\s+to\s+note|at\s+its\s+core|in\s+terms\s+of|with\s+regard\s+to|in\s+order\s+to|going\s+forward|let['\u2019]?s\s+dive)\b/gi,
    langs: ['en'],
  },
  {
    id: 'business-jargon',
    category: 'phrase',
    label: 'Business jargon',
    weight: 1.5,
    hint: 'Use the plain-language alternative.',
    re: /\b(?:delve|unpack|lean\s+into|game[- ]?changer|double\s+down|deep\s+dive|take\s+a\s+step\s+back|circle\s+back|on\s+the\s+same\s+page|paradigm\s+shift|leverage|utilize|facilitate|empower|streamline|robust|cutting[- ]edge|seamless|elevate|embark|supercharge|harness|ever[- ]evolving|tapestry|beacon|multifaceted|meticulous|intricate|paramount|transformative|holistic|pivotal|myriad|foster)\b/gi,
  },

  // ---- Sentence mechanics -------------------------------------------------
  {
    id: 'adverbs',
    category: 'mechanics',
    label: 'Empty adverb',
    weight: 0.4,
    hint: 'Cut unless the adverb carries real emphasis or uncertainty.',
    re: /\b(?:really|literally|genuinely|honestly|simply|deeply|truly|fundamentally|inherently|inevitably|interestingly|importantly|crucially|basically|essentially)\b/gi,
    langs: ['en'],
  },
  {
    id: 'lazy-extremes',
    category: 'mechanics',
    label: 'Lazy extreme',
    weight: 0.7,
    hint: 'Replace the sweeping word with a specific number or case.',
    re: /\b(?:everyone|everybody|nobody|always|never)\b/gi,
    langs: ['en'],
  },
  {
    id: 'em-dash',
    category: 'mechanics',
    label: 'Em dash',
    weight: 0.6,
    hint: 'Most em dashes read better as a comma, period or parenthesis.',
    re: /[\u2014]|(?<=\s)--(?=\s)/g,
  },

  // ---- Romance / other languages -----------------------------------------
  {
    id: 'throat-clearing-fr',
    category: 'phrase',
    label: 'Formule d\u2019annonce (FR)',
    weight: 2.5,
    hint: 'Supprimez l\u2019annonce et donnez directement l\u2019idée.',
    re: /\b(?:il\s+est\s+important\s+de\s+noter|il\s+convient\s+de\s+noter|force\s+est\s+de\s+constater|en\s+conclusion|en\s+r[ée]sum[ée]|dans\s+le\s+monde\s+d['\u2019]?aujourd['\u2019]?hui)\b/gi,
    langs: ['fr'],
  },
  {
    id: 'throat-clearing-es',
    category: 'phrase',
    label: 'Anuncio vacío (ES)',
    weight: 2.5,
    hint: 'Quita el anuncio y da la idea directamente.',
    re: /\b(?:es\s+importante\s+(?:se[ñn]alar|notar|destacar)|cabe\s+destacar|en\s+conclusi[óo]n|en\s+resumen|en\s+el\s+mundo\s+actual)\b/gi,
    langs: ['es'],
  },
  {
    id: 'throat-clearing-de',
    category: 'phrase',
    label: 'Ankündigung (DE)',
    weight: 2.5,
    hint: 'Streich die Ankündigung, nenne direkt den Punkt.',
    re: /\b(?:es\s+ist\s+wichtig\s+zu\s+beachten|zusammenfassend\s+l[äa]sst\s+sich\s+sagen|dar[üu]ber\s+hinaus|in\s+der\s+heutigen)\b/gi,
    langs: ['de'],
  },
];

/**
 * Run the catalogue over a text.
 * @param {string} text
 * @param {{language?: string}} [opts]
 * @returns {{score:number, findings:Array, counts:Object, total:number}}
 */
export function detectSlop(text, opts = {}) {
  const src = text || '';
  const lang = opts.language || 'en';
  const findings = [];
  const counts = {};
  let total = 0;

  for (const pat of SLOP_PATTERNS) {
    if (pat.langs && !pat.langs.includes(lang)) continue;
    const matches = matchAll(pat.re, src);
    if (!matches.length) continue;
    counts[pat.id] = matches.length;
    total += matches.length * pat.weight;
    findings.push({
      id: pat.id,
      category: pat.category,
      label: pat.label,
      hint: pat.hint,
      weight: pat.weight,
      count: matches.length,
      matches: matches.slice(0, 25),
    });
  }

  findings.sort((a, b) => b.count * b.weight - a.count * a.weight);

  const words = Math.max(1, countWords(src));
  // Density per 100 words, squashed.
  const density = (total / words) * 100;
  const score = clamp(mapLinear(density, 0, 12, 0, 100), 0, 100);

  return { score: Math.round(score), findings, counts, total };
}

/** Convenience wrapper returning just the 0..100 density metric. */
export function slopScore(text, opts) {
  return detectSlop(text, opts).score;
}

/**
 * Conservative automatic clean-up. Only removes phrases that are always safe
 * to delete, then tidies whitespace. Returns the new text plus a change log so
 * nothing is silent.
 */
export function deslop(text) {
  let out = text || '';
  const changes = [];
  const safe = [
    /\bhere['\u2019]?s\s+the\s+thing[:,]?\s*/gi,
    /\blet\s+that\s+sink\s+in\.?\s*/gi,
    /\bmake\s+no\s+mistake[:,]?\s*/gi,
    /\bit['\u2019]?s\s+worth\s+noting\s+that\s+/gi,
    /\bit\s+is\s+important\s+to\s+note\s+that\s+/gi,
    /\bat\s+the\s+end\s+of\s+the\s+day[:,]?\s*/gi,
    /\bin\s+conclusion[:,]?\s*/gi,
    /\bin\s+summary[:,]?\s*/gi,
  ];
  for (const re of safe) {
    const before = out;
    out = out.replace(re, '');
    if (out !== before) changes.push({ pattern: re.source, removed: true });
  }
  // Capitalise the first letter of each sentence-ish chunk and collapse spaces.
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  out = out.replace(/(^|[.!?\n]\s*)([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase());
  return { text: out.trim(), changes };
}
