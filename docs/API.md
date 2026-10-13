# REST API

Base URL: `https://is-it-ai-generated.org`

All endpoints are CORS-enabled (`Access-Control-Allow-Origin: *`) and rate-limited by IP. The in-isolate limiter is not durable across edge nodes, so treat it as a courtesy limit, not a quota.

## POST /api/detect

Analyse text for AI signals.

**Request**

```json
{
  "text": "string, required, max 100000 characters",
  "language": "auto | en | fr | ... (optional, default auto)",
  "sensitivity": "number 0.5-2.5 (optional, default 1)",
  "sentences": "boolean (optional, default true)"
}
```

**Example**

```bash
curl -s https://is-it-ai-generated.org/api/detect \
  -H 'content-type: application/json' \
  -d '{"text":"In today'"'"'s fast-paced world, it is important to note that leveraging cutting-edge solutions plays a crucial role."}'
```

**Response**

```json
{
  "ok": true,
  "score": 82,
  "verdict": "ai",
  "confidence": 0.71,
  "language": "en",
  "languageName": "English",
  "languageConfidence": 0.9,
  "fingerprint": "a1b2c3d4e5f60718",
  "wordCount": 21,
  "reasons": [{ "id": "aiPhrases", "label": "features.aiPhrases", "value": 1, "weight": 2, "impact": 2 }],
  "aiPhrases": [{ "phrase": "it is important to note", "count": 1, "weight": 3 }],
  "slop": { "score": 100, "findings": [] },
  "counts": { "words": 21, "sentences": 1, "characters": 140 },
  "sentences": [{ "text": "…", "start": 0, "end": 139, "score": 82, "verdict": "ai" }],
  "disclaimer": "…"
}
```

Status codes: `200` ok, `422` missing text, `413` payload or text too large, `429` rate limited.

## POST /api/count

Word, character, readability and keyword statistics for a text.

```bash
curl -s https://is-it-ai-generated.org/api/count \
  -H 'content-type: application/json' \
  -d '{"text":"Hello world. This is a test."}'
```

Returns `words`, `characters`, `charactersNoSpaces`, `sentences`, `paragraphs`, `lines`, `syllables`, `uniqueWords`, `avgWordLength`, `avgSentenceLength`, `readingTime`, `speakingTime`, `keywords`, `bigrams`, `trigrams` and `readability` (`fleschReadingEase`, `fleschKincaidGrade`, `gunningFog`).

## POST /api/image

Image provenance analysis.

```json
{ "base64": "<raw image bytes, base64>", "mime": "image/png" }
```

or, with pixels you have already decoded:

```json
{ "data": [r,g,b,a, ...], "width": 256, "height": 256 }
```

```bash
curl -s https://is-it-ai-generated.org/api/image \
  -H 'content-type: application/json' \
  -d "{\"base64\":\"$(base64 -w0 photo.png)\"}"
```

Server-side analysis is metadata-only. Pixel statistics need an image decoder, which browsers have and Workers do not; pass `data`/`width`/`height` to get them server-side.

Response includes `score`, `verdict`, `confidence`, `metadata` (format, camera, software, generator signatures, C2PA, EXIF fields), `signals` and `hashes` when pixels were provided.

## GET /api/health

```json
{ "ok": true, "name": "is-it-ai-generated", "version": "0.1.0", "statsStore": true }
```

## GET /api/stats

Anonymous aggregate usage. Query `?days=30` (1-90).

```json
{
  "available": true,
  "viewsToday": 42,
  "views30d": 1200,
  "uniques30d": 800,
  "topPages": [{ "key": "/", "count": 900 }],
  "topLanguages": [{ "key": "fr", "count": 300 }],
  "topCountries": [{ "key": "FR", "count": 400 }],
  "topDevices": [{ "key": "desktop", "count": 700 }],
  "days": [{ "day": "2026-10-13", "views": 42, "uniques": 30 }]
}
```

## POST /api/collect

Internal endpoint for the anonymous counter. Accepts `{ type, path, lang, referrer, device, screen, tool, verdict, tab }`; discards anything else. Returns `{ "ok": true, "stored": true }`. Send `DNT: 1` or `Sec-GPC: 1` to opt out server-side.

## Node and browser parity

The REST responses come from the same `src/core` modules the browser uses, so a report fetched from the API matches what the site would compute locally.
