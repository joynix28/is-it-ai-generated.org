# Credits and licences

Everything third-party this project uses, with its licence. Nothing here is
vendored as source; all of it is a dependency, a model, or a published idea.

## Runtime dependencies

| Component | Licence | Used for |
| --- | --- | --- |
| [@huggingface/transformers](https://github.com/huggingface/transformers.js) | Apache-2.0 | runs the image/text ONNX classifiers in the Web Worker |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | MIT | WebAssembly backend behind Transformers.js |

## Models

| Model | Licence | Used for |
| --- | --- | --- |
| [onnx-community/Qwen2.5-0.5B](https://huggingface.co/onnx-community/Qwen2.5-0.5B) | Apache-2.0 | ONNX conversion the language-model juror loads |
| [Qwen/Qwen2.5-0.5B](https://huggingface.co/Qwen/Qwen2.5-0.5B) | Apache-2.0 | base model of the conversion above |

The model is downloaded from the Hugging Face CDN at run time, once, and cached
by the browser. It is not redistributed here, and it only runs when the reader
asks for the language-model juror. The earlier e5-small classifier was removed
after it was measured against human Wikipedia; see the commit history.

## Detector references

These projects shaped the design. No line of their code is copied: the ideas and
the standards behind them are, and the reading is reimplemented here from the
specification. All four are MIT.

| Project | Licence | What it informed |
| --- | --- | --- |
| [lynote-ai/ai-image-detector](https://github.com/lynote-ai/ai-image-detector) | MIT | the image side: a detector is one signal, not proof; the generator-signature catalogue |
| [pablocaeg/sloptotal](https://github.com/pablocaeg/sloptotal) | MIT | the ensemble: many independent engines, one calibrated reading |
| [cpeoples/ai-watermark-detector](https://github.com/cpeoples/ai-watermark-detector) | MIT | the provenance/watermark split, C2PA verification, the SynthID-family schemes |
| [YiCQi/AITextJury](https://github.com/YiCQi/AITextJury) | MIT | the jury itself: independent jurors, calibration, honest consensus |

## SynthID-era detectors, reviewed

Five more repositories were reviewed for the image side. Each is listed with its
licence and with what was actually taken, because "MIT" on a repository does not
mean every file inside it is MIT, and a repository with no licence may not be
reused at all.

| Project | Licence | Status |
| --- | --- | --- |
| [Rinne414/SynthID-detector](https://github.com/Rinne414/SynthID-detector) | MIT | **Used.** Its `ai_detector/` is a CLIP ViT-L/14 linear probe, validated held out (AUC 0.998; 0.0 % missed AI; 1.8 % false positives; 0.97–1.00 across *unseen* generators). The probe's own artefact, `model.npz` (1024 coefficients, an intercept, a threshold), is embedded in `src/imageProbe.ts`, and the method is reimplemented. Its watermark-template detector is **not** used: the author documents it as non-generalizing ("detected 0 of 33 held-out AI images", self-correlation). |
| [aloshdenny/reverse-SynthID](https://github.com/aloshdenny/reverse-SynthID) | reverse-SynthID Research License v1.0 (non-commercial) | **Not used.** Cited as the reference on SynthID's spectral watermark. Its licence restricts use to non-commercial purposes and its artefacts are watermark-removal oriented, so nothing is taken. |
| [Parths-29/SynthID-Detector](https://github.com/Parths-29/SynthID-Detector) | MIT | **Not used.** Server-side (FastAPI/Next.js/ResNet50) and it redistributes the non-commercial artefact above. Cited only. |
| [chaitanya-link/synthetic-identity-cluster-detector](https://github.com/chaitanya-link/synthetic-identity-cluster-detector) | none | **Not used.** No licence, so no reuse. Cited only. |
| [GumpenaPrathima/CIFAKE-…](https://github.com/GumpenaPrathima/CIFAKE-Image-Classification-and-Explainable-Identification-of-AI-Generated-Synthetic-Images) | none | **Not used.** No licence, and a CIFAKE-style classifier is 32×32 and generator-specific, which the era of this project has moved past. Cited only. |

### The image probe, and how it runs

The learned probe runs. `src/imageProbe.ts` holds the published 1024 coefficients,
the intercept and the threshold; `tests/imageProbe.test.ts` proves the embedded
weights are byte-for-byte the published ones (first values, sum, norm). The panel
is opt-in: a button downloads the encoder once (~293 MB, cached), shows real
progress, and reports a probability. It never overrides a declared provenance,
and an unproven model is never allowed to accuse on its own.

The naive path did not work, and that is why this needed one extra step. The
probe was trained on timm's `vit_large_patch14_clip_224.openai` features: the
1024-d pooled CLS output *before* CLIP's visual projection. Every browser-ready
ONNX export of that encoder (Xenova, onnx-community; verified by reading the
graphs' output names) exposes only `image_embeds`, the 768-d *projected* vector.
Feeding 768 numbers to a 1024-weight probe returns a plausible, silently wrong
number, so the encoder was rebuilt instead: the pooled tensor is exposed as
`pooler_output` by graph surgery on the quantised export — **no retraining, no
weight change** — and published, MIT, at
[`joynix28/clip-vit-large-patch14-pooler`](https://huggingface.co/joynix28/clip-vit-large-patch14-pooler).

Measured on the converted encoder before shipping: a Flux image scored 0.992 (AI),
while eleven real photographs scored 0.023 to 0.605 — eight below the 0.458
threshold by a wide margin, one above it, and the two charts in a Stable Diffusion
sample set (out of the probe's photo domain) below it. The author's own
out-of-family caveat applies: the probe was trained on GPT-Image and Nano Banana,
and other generators are "unverified". On the browser path, end to end: 293 MB
download, ~30 s initialisation, ~35 s inference on one WASM thread, 99 % AI on the
Flux image, no console error.


## Standards

| Standard | Used for |
| --- | --- |
| IPTC [digital source type](https://cv.iptc.org/newscodes/digitalsourcetype/) | `trainedAlgorithmicMedia` and friends: the controlled vocabulary Google, Meta, OpenAI and Adobe write |
| [C2PA](https://c2pa.org/specifications/) / Content Credentials | provenance manifests; JUMBF parsing written from the specification |
| Unicode UTS #39 | confusable-character folding |


## Build tooling (development only)

Vite (MIT) · TypeScript (Apache-2.0) · Tailwind CSS (MIT) · PostCSS (MIT) ·
autoprefixer (MIT) · tsx (MIT) · Node's built-in test runner.

## Algorithms and published work

| Idea | Source | Notes |
| --- | --- | --- |
| Burstiness (sentence-length variation) | standard stylometry | implemented from the definition, no code taken |
| MATTR, moving-average type-token ratio | Covington & McFall (2010), *Computational Linguistics* | implemented from the paper |
| Shannon entropy | Shannon (1948) | implemented directly |
| Compression entropy / NCD | the ZipPy / Kolmogorov-complexity line of work | implemented on the native `CompressionStream` API |
| Benford's law over the 8×8 DCT | image-forensics literature | DCT-II written from the definition; the signal is contested and weighted accordingly |
| C2PA / Content Credentials | [c2pa-rs](https://github.com/contentauth/c2pa-rs) (MIT / Apache-2.0) and the C2PA specification | the JUMBF/CBOR/EXIF parsing here is original code written against the specification |
| GLTR, token-rank predictability | [GLTR](https://github.com/HendrikStrobelt/detector-detector) (MIT) | **not implemented**. It needs token-level logits from a causal model; we do not fake it |
| Confusable characters | Unicode UTS #39 | a subset is embedded by hand |

## Writing-style catalogues

The French and English "dissertation clichés" and phrasing lists were assembled
for this project. Two open-source writing skills informed the catalogue design
earlier in the project's history:

- [no-ai-slop](https://github.com/petergyang/no-ai-slop) — MIT
- [stop-slop](https://github.com/hardikpandya/stop-slop) — MIT

## Design

The token values (colour ramps, spacing scale) were informed by publicly
documented design systems. No design asset, font file or illustration from any
third party is redistributed. Fonts are resolved from the operating system; no
webfont is downloaded.
