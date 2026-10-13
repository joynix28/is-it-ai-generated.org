/**
 * Weighted catalogue of language-model tells, French and English.
 *
 * `weight` is how strongly a hit points at a language model:
 *   3 = almost never in casual human writing
 *   2 = common in one genre of machine text
 *   1 = a real tell only in density
 *
 * Matching is case-insensitive and diacritic-insensitive, so "à l'ère" and
 * "a l'ere" both match.
 */

export interface Marker {
  phrase: string;
  weight: number;
}

export const MARKERS: readonly Marker[] = [
  // --- French ---------------------------------------------------------------
  { phrase: "il est important de noter", weight: 3 },
  { phrase: "il est important de souligner", weight: 3 },
  { phrase: "il convient de noter", weight: 3 },
  { phrase: "il convient de souligner", weight: 3 },
  { phrase: "il est essentiel de", weight: 2 },
  { phrase: "force est de constater", weight: 3 },
  { phrase: "à l'ère du numérique", weight: 3 },
  { phrase: "à l'ère de", weight: 2 },
  { phrase: "dans un monde où", weight: 3 },
  { phrase: "dans le monde d'aujourd'hui", weight: 3 },
  { phrase: "plongeons dans", weight: 3 },
  { phrase: "nous allons explorer", weight: 2 },
  { phrase: "en conclusion", weight: 2 },
  { phrase: "en résumé", weight: 2 },
  { phrase: "pour résumer", weight: 2 },
  { phrase: "en somme", weight: 2 },
  { phrase: "de surcroît", weight: 3 },
  { phrase: "par ailleurs", weight: 2 },
  { phrase: "en outre", weight: 2 },
  { phrase: "de plus,", weight: 1 },
  { phrase: "en effet", weight: 1 },
  { phrase: "ainsi,", weight: 1 },
  { phrase: "par conséquent", weight: 2 },
  { phrase: "toutefois", weight: 1 },
  { phrase: "néanmoins", weight: 2 },
  { phrase: "joue un rôle crucial", weight: 3 },
  { phrase: "joue un rôle essentiel", weight: 3 },
  { phrase: "un large éventail", weight: 2 },
  { phrase: "un large panel", weight: 2 },
  { phrase: "libérer le potentiel", weight: 3 },
  { phrase: "tirer parti de", weight: 2 },
  { phrase: "témoigne de", weight: 2 },
  { phrase: "en constante évolution", weight: 3 },
  { phrase: "notre voyage", weight: 2 },
  { phrase: "ce voyage", weight: 2 },
  { phrase: "révolutionnaire", weight: 2 },
  { phrase: "incontournable", weight: 2 },
  { phrase: "à la pointe", weight: 2 },
  { phrase: "nuancé", weight: 2 },
  { phrase: "multifacette", weight: 3 },
  { phrase: "crucial", weight: 2 },
  { phrase: "primordial", weight: 2 },
  { phrase: "essentiel", weight: 1 },
  { phrase: "optimal", weight: 1 },
  { phrase: "durable", weight: 1 },
  { phrase: "holistique", weight: 3 },
  { phrase: "synergie", weight: 2 },
  { phrase: "tapisserie", weight: 3 },
  { phrase: "paysage", weight: 1 },
  { phrase: "naviguer dans", weight: 2 },
  { phrase: "les complexités", weight: 2 },
  { phrase: "à noter que", weight: 2 },
  { phrase: "il est à noter", weight: 2 },
  { phrase: "premièrement", weight: 2 },
  { phrase: "deuxièmement", weight: 2 },
  { phrase: "troisièmement", weight: 2 },
  { phrase: "en premier lieu", weight: 2 },
  { phrase: "en second lieu", weight: 2 },
  { phrase: "d'une part", weight: 2 },
  { phrase: "d'autre part", weight: 2 },
  { phrase: "non seulement", weight: 2 },
  { phrase: "mais aussi", weight: 2 },

  // --- English --------------------------------------------------------------
  { phrase: 'it is important to note', weight: 3 },
  { phrase: 'it is worth noting', weight: 3 },
  { phrase: "in today's fast-paced world", weight: 3 },
  { phrase: "in today's digital landscape", weight: 3 },
  { phrase: 'in the realm of', weight: 3 },
  { phrase: 'delve into', weight: 3 },
  { phrase: 'delving into', weight: 3 },
  { phrase: 'a testament to', weight: 3 },
  { phrase: 'navigate the complexities', weight: 3 },
  { phrase: 'unlock the potential', weight: 3 },
  { phrase: 'unleash the potential', weight: 3 },
  { phrase: 'game-changer', weight: 2 },
  { phrase: 'cutting-edge', weight: 2 },
  { phrase: 'state-of-the-art', weight: 2 },
  { phrase: 'embark on', weight: 3 },
  { phrase: "let's dive in", weight: 3 },
  { phrase: 'in conclusion', weight: 2 },
  { phrase: 'in summary', weight: 2 },
  { phrase: 'to summarize', weight: 2 },
  { phrase: 'furthermore', weight: 2 },
  { phrase: 'moreover', weight: 2 },
  { phrase: 'additionally', weight: 2 },
  { phrase: 'consequently', weight: 2 },
  { phrase: 'however, it', weight: 1 },
  { phrase: 'on the other hand', weight: 1 },
  { phrase: 'plays a crucial role', weight: 3 },
  { phrase: 'plays a vital role', weight: 3 },
  { phrase: 'a wide range of', weight: 1 },
  { phrase: 'when it comes to', weight: 1 },
  { phrase: 'not only', weight: 2 },
  { phrase: 'but also', weight: 2 },
  { phrase: 'tapestry', weight: 3 },
  { phrase: 'realm', weight: 2 },
  { phrase: 'pivotal', weight: 2 },
  { phrase: 'underscores', weight: 2 },
  { phrase: 'multifaceted', weight: 3 },
  { phrase: 'holistic', weight: 3 },
  { phrase: 'leverage', weight: 2 },
  { phrase: 'robust', weight: 1 },
  { phrase: 'seamless', weight: 2 },
  { phrase: 'comprehensive', weight: 1 },
  { phrase: 'transformative', weight: 2 },
  { phrase: 'ever-evolving', weight: 3 },
  { phrase: 'ever-changing', weight: 2 },
  { phrase: 'as an ai', weight: 3 },
  { phrase: 'as a large language model', weight: 3 },
  { phrase: 'i cannot fulfill', weight: 3 },
];

/** Formulaic contrast and enumeration structures. */
export const STRUCTURE_PATTERNS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: 'not-only-but-also-fr', re: /\bnon seulement\b[^.!?\n]{1,140}\bmais (?:aussi|également)\b/gi },
  { id: 'not-only-but-also-en', re: /\bnot only\b[^.!?\n]{1,140}\bbut also\b/gi },
  { id: 'dune-part-dautre-part', re: /\b(?:d'une part|d'un côté)\b[^.!?\n]{1,140}\b(?:d'autre part|de l'autre)\b/gi },
  { id: 'on-one-hand-other-hand', re: /\bon the one hand\b[^.!?\n]{1,140}\bon the other hand\b/gi },
  { id: 'firstly-then-finally', re: /\b(?:premièrement|firstly)\b[\s\S]{0,400}\b(?:enfin|finally)\b/gi },
];

/** Fold accents and case so matching is stable across keyboard variants. */
export function fold(input: string): string {
  return input
    .toLowerCase()
    // Typographic apostrophes and quotes are the norm in French prose. Without
    // this, every cliché containing an apostrophe silently fails to match.
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u00B4`]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u00A0\u202F\u2007\u2009]/g, ' ')
    .replace(/[àâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u')
    .replace(/ç/g, 'c')
    // 1:1 only, so string offsets stay valid for highlighting.
    .replace(/œ/g, 'o')
    .replace(/æ/g, 'a');
}
