# Contributing

Thanks for helping. This project stays small on purpose: no dependencies in the engine, no build step for the front end, no framework.

## Setup

```bash
npm run build   # copy engine + locales into public/
npm run dev     # http://localhost:8788
npm test
```

## Ground rules

- **No dependencies in `src/core/`.** It must run in the browser, Node and Workers. Web APIs only.
- **Keep the engine isomorphic.** If it needs the DOM or `node:fs`, it does not belong in `src/core`.
- **Explain scores, do not obfuscate them.** New signals must be returned as named components with a value and a weight.
- **Privacy is a feature.** Do not add network calls that carry user content, cookies, or identifiers.
- **Write plainly.** The copy in this repo follows the same anti-slop rules the detector checks for: no filler openers, no binary contrasts, no em dashes as a rhythm crutch. See `src/core/slop.js` for the full list.

## Adding a detection signal

1. Add the feature in `src/core/textFeatures.js`.
2. Map it to `[0,1]` and give it a weight in `computeComponents` (`src/core/textDetector.js`), and add it to `DEFAULT_WEIGHTS`.
3. Add a test in `tests/text.test.mjs` that shows it separates human from machine text.
4. Document it in `docs/DETECTION.md`.

## Adding a slop pattern

Add an entry to `SLOP_PATTERNS` in `src/core/slop.js` with an `id`, `category`, `label`, `weight`, `hint` and a regex. Restrict it to languages with `langs` when the wording is language-specific. Add a test.

## Adding a language

1. Copy `src/i18n/en.json` to `src/i18n/<code>.json` and translate the values.
2. Add `{ "code", "name", "native", "rtl" }` to `src/i18n/index.json`.
3. `npm run build` validates keys. Missing ones fall back to English, so partial is fine.

To improve language *detection*, add function words to `STOPWORDS` in `src/core/lexicons.js` (the IDF weighting means shared words count for little) and add a case to `tests/language.test.mjs`.

## Tests

`npm test` runs the Node test runner. Add tests for behaviour, not implementation details. If you change a threshold or a weight, explain the reasoning in the pull request.

## Commit style

Short imperative subject lines (`add burstiness check to sentence scoring`). Explain the why in the body when it is not obvious.

## License

By contributing you agree your work is released under the MIT licence.
