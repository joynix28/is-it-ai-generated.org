/**
 * POST /api/detect
 * Body: { text: string, language?: string, sensitivity?: number, sentences?: boolean }
 * Returns the same report the browser computes, built by the same module.
 */
import { detectText } from '../../src/core/index.js';
import { json, error, preflight, readJson, rateLimit } from '../_lib/http.js';

export const onRequestOptions = () => preflight();

export async function onRequestPost({ request, env }) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) return error('rate limit exceeded', 429);

  let body;
  try {
    body = await readJson(request, 200 * 1024);
  } catch (err) {
    return error(err.message || 'invalid json', 413);
  }

  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) return error('field "text" is required', 422);
  if (text.length > 100_000) return error('text too long (max 100000 characters)', 413);

  const report = detectText(text, {
    language: body.language && body.language !== 'auto' ? String(body.language) : undefined,
    sensitivity: Number.isFinite(body.sensitivity) ? body.sensitivity : 1,
    includeSentences: body.sentences !== false,
  });

  return json({
    ok: true,
    score: report.score,
    verdict: report.verdict,
    confidence: report.confidence,
    language: report.language,
    languageName: report.languageName,
    languageConfidence: report.languageConfidence,
    fingerprint: report.fingerprint,
    wordCount: report.wordCount,
    reasons: report.reasons,
    aiPhrases: report.aiPhrases,
    slop: { score: report.slop.score, findings: report.slop.findings },
    counts: report.counts,
    sentences: report.sentences,
    disclaimer: report.disclaimer,
  });
}
