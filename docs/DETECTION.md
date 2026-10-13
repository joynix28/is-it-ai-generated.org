# Detection model

This page explains what the numbers mean and where they stop being trustworthy.

## The text index

The score is a heuristic blend of stylometric features and named writing patterns. It answers "how much does this read like a language model's default style", not "who wrote it".

### Features and how they map to the score

Each feature is mapped to `[0,1]` where 1 means "more machine-like", then combined as a weighted mean.

| Feature | Weight | Machine-like direction |
| --- | --- | --- |
| AI phrase density (per 100 words) | 2.0 | higher |
| Slop pattern density | 1.4 | higher |
| Burstiness (CV of sentence length) | 1.5 | lower |
| Transition density | 1.2 | higher |
| Sentence-start entropy | 1.0 | lower |
| Personal pronoun rate | 1.0 | lower |
| Trigram repetition | 0.9 | higher |
| Paragraph length uniformity | 0.8 | lower |
| Hedge density | 0.8 | higher |
| Contraction rate | 0.8 | lower |
| Em dash density | 0.7 | higher |
| Punctuation entropy | 0.5 | lower |
| Lexical variety (TTR) | 0.4 | higher |

Weights are in `DEFAULT_WEIGHTS` in `src/core/textDetector.js`.

### Calibration

```
base  = weighted mean of components
score = logistic((base - 0.5) × 6 × sensitivity) × 100
```

`sensitivity` (0.5 to 2) steepens or flattens the curve. Texts under 25 words are pulled toward 50 because short samples carry little signal.

### Verdict bands

| Score | Verdict |
| --- | --- |
| 0-19 | Human |
| 20-39 | Likely human |
| 40-59 | Uncertain |
| 60-79 | Likely AI |
| 80-100 | AI-generated |

### Confidence

Confidence falls with word count (`15 → 220` words maps to `0.25 → 1`) and with language-detection uncertainty. A 300-word confident answer is worth far more than a confident-looking 20-word one.

## The slop catalogue

`src/core/slop.js` implements the patterns from two open-source skills, no-ai-slop and stop-slop: binary contrasts, throat-clearing openers, faux-insight setups, colon reveals, dramatic fragmentation, superficial analysis, importance puffery, weasel attribution, business jargon, empty adverbs, em dashes and more. Each hit carries a label, a quote and a fix, so the finding is checkable.

The catalogue contributes to the AI score *and* is surfaced on its own tab.

## The image index

Two layers.

**Provenance.** EXIF (make, model, software, dates), XMP, PNG text chunks, and C2PA / Content Credentials. A signature from a known generator, or a C2PA manifest with no camera, pins the score near the top. A camera tag pulls it down hard.

**Pixels.** For a downscaled grayscale image:

- High-frequency energy ratio from a 2D FFT.
- Laplacian variance, a surface-noise and sharpness proxy.
- Mean pairwise RGB channel correlation.
- Mean Sobel edge magnitude.
- Saturation, and JPEG blockiness from 8×8 boundary gradients.

These are statistical tendencies, not proof. Heavy denoising, resizing, or a second-generation re-upload erases most of them.

## Where it is wrong

- **Formal human writing** scores higher: academic prose, legal text, and non-native English all look "even".
- **Edited AI text** scores lower: a human pass adds the variance and personal voice the model lacked.
- **Short text** is close to noise.
- **Poetry, lists, code, tables** break sentence and feature assumptions.
- **Compressed or re-encoded images** lose the pixel signals that matter.

Treat the score as one signal among several. The tool shows its reasoning precisely so you can weigh it yourself.
