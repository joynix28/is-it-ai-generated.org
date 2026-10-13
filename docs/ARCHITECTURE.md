# Architecture

## One engine, three runtimes

`src/core/` is plain ESM with no dependencies and no `node:` imports. The same files run in a browser, in Node 18+ and in a Cloudflare Worker. That is deliberate: the number you see in the browser is computed by the same code the API uses, so the two can never drift.

```
        src/core/  (pure ESM, zero deps)
        /     |     \
  public/app   bin/     functions/
  (browser)   (Node)   (Workers)
```

There is no bundler and no transpilation. `npm run build` copies `src/core` to `public/core` and `src/i18n` to `public/i18n`. What npm consumers `import` is byte-for-byte what the browser downloads.

## Modules

| Module | Responsibility |
| --- | --- |
| `tokenize.js` | Sentence splitting with abbreviation handling, Unicode word tokenizer, CJK-aware word counting. |
| `textFeatures.js` | Document and sentence feature extraction. |
| `textDetector.js` | Weighted scoring, calibration, verdicts, per-sentence analysis, fingerprints, two-text comparison. |
| `slop.js` | Catalogue of AI writing patterns, `detectSlop`, `deslop`. |
| `langdetect.js` | Script detection, IDF-weighted function-word scoring, device/header hints. |
| `wordCounter.js` | Counts, syllables, reading time, keywords, n-grams, readability. |
| `imageDetector.js` | Metadata plus pixel signals, perceptual hashes. |
| `fft.js` | Radix-2 FFT and 2D magnitude spectrum. |
| `exif.js` | JPEG/EXIF/XMP and PNG chunk parsing, generator and C2PA signatures. |
| `lexicons.js` | Phrase lists, function words for ~60 languages, script ranges. |
| `math.js` | Clamping, linear maps, entropy, correlation, logistic. |

## Request flow (browser)

1. `app/main.js` boots: theme, i18n, tabs, then each tool.
2. A tool imports the engine through `public/core/index.js` and calls it on the main thread. Analysis of a few thousand words takes milliseconds, so there is no worker yet.
3. The image tool decodes the file with `createImageBitmap` and a canvas capped at 1024px, then passes raw pixels to `analyzeImage`.
4. `app/analytics.js` sends one anonymous beacon per page view and per tool use. It never sends content.

## Request flow (server)

Cloudflare Pages serves `public/` as static assets. `_routes.json` sends only `/api/*` to the Functions router, so static requests never wake a Worker.

```
POST /api/detect -> functions/api/detect.js -> src/core/detectText
POST /api/collect -> functions/api/collect.js -> functions/_lib/stats.js -> KV
```

Functions are bundled by wrangler with esbuild. Imports reach back into `src/core/`, which keeps the API on the same engine.

## Scoring

The document score is a weighted mean of feature-derived components, each mapped to `[0,1]`:

```
base   = Σ(value_i × weight_i) / Σ(weight_i)
score  = logistic((base - 0.5) × 6 × sensitivity) × 100
```

Short inputs are pulled toward 50 because the evidence is thin, and confidence falls with word count and language uncertainty. Per-sentence scores blend local features with the document score, leaning on the document for sentences under six words. Everything is in `textDetector.js`; nothing is hidden in a model file.

## Statistics storage

KV has no atomic increment, so a day is one JSON document updated read-modify-write. Under heavy concurrent writes this can undercount. The trade-off is documented rather than hidden; the alternative (Durable Objects) is not on the free plan. Unique visitors use a per-day `uv:<day>:<hash>` key with a two-day TTL.

## Performance

- Text: linear in length. A 10,000-word document scores in well under a hundred milliseconds.
- Image: FFT runs on a grayscale image of at most 256×256, independent of the original size.
- No frameworks, no web fonts, no third-party scripts. The page ships a handful of ES modules.
