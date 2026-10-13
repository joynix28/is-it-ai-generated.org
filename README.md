# Is It AI Generated?

A free AI detector for text and images that runs entirely in the browser. No ads, no accounts, no uploads, no tracking. Your text and images stay on your device.

Live site: **https://is-it-ai-generated.org**

---

## What it does

| Tool | What you get |
| --- | --- |
| **Text detector** | A 0-100 AI index, a verdict, a fingerprint, per-sentence scores and highlighted spans, and the exact phrases that pushed the score up. |
| **Image detector** | Provenance metadata (EXIF, XMP, PNG chunks, C2PA), pixel statistics (frequency spectrum, noise, channel correlation, JPEG blockiness), perceptual hashes. |
| **Word counter** | Words, characters, sentences, paragraphs, syllables, reading and speaking time, keyword and phrase frequency, readability scores. |
| **Slop detector** | 20+ named AI writing patterns with quotes and a suggested fix, plus a safe automatic cleanup. |
| **Compare** | Near-duplicate wording between two passages. |
| **Stats** | Anonymous aggregate usage of the site, stored on Cloudflare KV. |
| **API** | The same engine as a REST endpoint, an npm package and a CLI. |

Nothing is sent anywhere for analysis. The only network request the site makes is the anonymous aggregate counter, which respects Do Not Track and Global Privacy Control and can be turned off.

## How detection works

The text score is an explainable weighted blend of 13 stylometric features and a catalogue of 20+ slop patterns. Nothing is a black box: the response lists every component, its value and its weight, so you can see what moved the score.

Features include:

- **Burstiness** — the coefficient of variation of sentence length. Human writing varies more.
- **AI phrase density** — a curated multilingual list (`delve into`, `a testament to`, `il est important de noter`).
- **Transition and hedge density** — `furthermore`, `moreover`, `it is worth noting`.
- **Personal voice** — first and second person pronouns, contractions.
- **Sentence-start entropy** — how varied the openings are.
- **Paragraph uniformity, repetition, punctuation entropy, em dashes, lexical variety.**

The weights live in `src/core/textDetector.js` (`DEFAULT_WEIGHTS`) and you can override them.

The image score combines provenance metadata with pixel statistics: an FFT of a downscaled grayscale image, Laplacian variance for surface noise, mean RGB channel correlation, edge uniformity, saturation and JPEG blockiness. A matching generator signature (`Stable Diffusion`, `Midjourney`, `DALL·E`, …) or a C2PA manifest pushes the score to the top.

### Be honest about limits

These are heuristic indices, not proof. They measure style, not authorship. Short texts are unreliable. Edited or mixed content fools any detector, including this one. Never use the score as the only evidence in a decision about a person. The full reasoning is in [docs/DETECTION.md](docs/DETECTION.md).

## Privacy

- Text and images are processed in the browser. They are never uploaded.
- No cookies, no local storage identifiers for tracking, no fingerprinting.
- The statistics endpoint counts page views and unique visitors using a daily rotating HMAC of `IP + user agent + date + secret`. The hash lives for one day and is discarded. The raw IP is never written to storage.
- It honours `DNT: 1` and `Sec-GPC: 1`, and there is an opt-out button on the Stats tab.
- See [docs/PRIVACY.md](docs/PRIVACY.md).

## Project layout

```
src/core/          Detection engine (dependency-free ESM, shared by everything)
  textDetector.js  Text scoring and per-sentence analysis
  textFeatures.js  Stylometric feature extraction
  slop.js          AI writing pattern catalogue (no-ai-slop + stop-slop rules)
  langdetect.js    Language identification (~60 languages)
  wordCounter.js   Word and readability statistics
  imageDetector.js Image metadata and pixel forensics
  fft.js, exif.js  FFT and metadata parsers
  lexicons.js      Phrase, stopword and script tables
public/            Static site served by Cloudflare Pages
  app/             Front-end modules (no framework, no bundler)
  core/            Build output copy of src/core
functions/         Cloudflare Pages Functions (the REST API and stats backend)
src/i18n/          UI translations
tests/             Node test runner suite
docs/              Architecture, API, detection, deploy and privacy notes
```

The browser imports the exact same files npm consumers do. `npm run build` copies `src/core` and `src/i18n` into `public/` with no transpilation.

## Use the npm package

```bash
npm install is-it-ai-generated
```

```js
import { detectText, countText, analyzeImage, detectLanguage } from 'is-it-ai-generated';

const report = detectText('Some text to check.');
console.log(report.score, report.verdict, report.confidence);
console.log(report.reasons);          // why the score is what it is
console.log(report.sentences);        // per-sentence scores

countText('Hello world.').words;      // 2
detectLanguage('Bonjour tout le monde').lang; // 'fr'
```

Uses only Web APIs available in Node 18+, browsers and Cloudflare Workers.

## Command line

```bash
echo "text to check" | npx is-it-ai-generated
npx is-it-ai-generated --json article.txt
npx is-it-ai-generated --counter article.txt
npx is-it-ai-generated --image photo.png
```

## REST API

```
POST /api/detect   { text, language?, sensitivity?, sentences? }
POST /api/count    { text, language? }
POST /api/image    { base64, mime? }  or  { data, width, height }
GET  /api/health
GET  /api/stats
```

```bash
curl -s https://is-it-ai-generated.org/api/detect \
  -H 'content-type: application/json' \
  -d '{"text":"Your text here"}' | jq
```

Server-side image analysis is metadata-only: pixel statistics need an image decoder, which the browser has and a Worker does not. Pass raw `data` plus `width` and `height` if you have already decoded the image. Full reference in [docs/API.md](docs/API.md).

## Development

```bash
npm run build     # copy the engine and locales into public/
npm run dev       # local server at http://localhost:8788 with the API emulated
npm test          # node:test suite
```

## Deploy

Cloudflare Pages, with the API and stats as Pages Functions.

```bash
npm install -g wrangler
wrangler login

# One-time: create the KV namespace for statistics and write its id.
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npm run stats:create
wrangler pages secret put STATS_SECRET   # a long random string

npm run build
wrangler pages deploy
```

Custom domain: add `is-it-ai-generated.org` in the Pages project, then create the CNAME the dashboard shows. More detail in [docs/DEPLOY.md](docs/DEPLOY.md).

## Adding a language

The UI needs a translation file; detection already covers about 60 languages.

1. Copy `src/i18n/en.json` to `src/i18n/<code>.json` and translate the values.
2. Add an entry to `src/i18n/index.json`.
3. `npm run build` validates keys and warns about anything missing.

Missing keys fall back to English, so partial translations work.

## License

MIT. Built on the ideas in two open-source writing skills: [no-ai-slop](https://github.com/petergyang/no-ai-slop) and [stop-slop](https://github.com/hardikpandya/stop-slop), both MIT.
