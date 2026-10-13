/** Shared types. Strictly typed, no `any` anywhere. */

export type Band = 'human' | 'mixed' | 'ai';

export interface SubScores {
  /** 1 = machine-flat sentence rhythm. */
  syntacticRegularity: number;
  /** 1 = words are unsurprising and the vocabulary recycles. */
  lexicalPredictability: number;
  /** 1 = density of known LLM tics and formulaic structures. */
  llmMarkers: number;
  /** 1 = invisible characters or homoglyph substitution present. */
  characterIntegrity: number;
}

export interface Msg {
  key: string;
  params?: Record<string, string | number>;
}

export interface SentenceFlags {
  enumeration: boolean;
  hedging: boolean;
  connector: boolean;
  cliche: boolean;
}

export interface SentenceScore {
  text: string;
  start: number;
  end: number;
  words: number;
  score: number;
  band: Band;
  reasons: Msg[];
  flags: SentenceFlags;
}

export interface ForensicSample {
  char: string;
  code: string;
  index: number;
  note?: string;
}

export interface ForensicFinding {
  id: string;
  label: string;
  count: number;
  legitimate: boolean;
  samples: ForensicSample[];
}

export interface ForensicsResult {
  score: number;
  invisibleCount: number;
  homoglyphCount: number;
  mixedScriptWords: string[];
  findings: ForensicFinding[];
  /** Text with invisible characters removed and confusables folded to Latin. */
  cleanedText: string;
}

export interface MarkerHit {
  phrase: string;
  count: number;
  weight: number;
}

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  uniqueWords: number;
  typeTokenRatio: number;
  mattr: number;
  shannonTrigram: number;
  meanSentenceWords: number;
  stdSentenceWords: number;
  burstiness: number;
  enumerationRatio: number;
  connectorRatio: number;
  paragraphIsomorphism: number;
  hedgesPer100: number;
}

export interface ScoredComponent {
  id: string;
  /** i18n key. */
  label: string;
  value: number;
  weight: number;
  /** i18n key plus params, or null. */
  detail: Msg | null;
}

export interface AnalysisResult {
  score: number;
  band: Band;
  confidence: number;
  subScores: SubScores;
  stats: TextStats;
  sentences: SentenceScore[];
  markers: MarkerHit[];
  ternaryStructures: number;
  forensics: ForensicsResult;
  verdictReason: Msg;
  components: ScoredComponent[];
}

export interface ModelChunkResult {
  index: number;
  label: string;
  score: number;
  text: string;
}

export interface ModelResult {
  label: string;
  score: number;
  chunks: ModelChunkResult[];
  modelId: string;
  ms: number;
}

export type WorkerRequest =
  | { type: 'load'; modelId: string }
  | { type: 'classify'; id: number; modelId: string; chunks: string[] };

export type WorkerResponse =
  | { type: 'progress'; phase: 'download' | 'init'; file?: string; progress: number; loaded?: number; total?: number }
  | { type: 'ready'; modelId: string }
  | { type: 'chunk'; id: number; result: ModelChunkResult }
  | { type: 'done'; id: number; result: Omit<ModelResult, 'modelId'> }
  | { type: 'error'; message: string };
