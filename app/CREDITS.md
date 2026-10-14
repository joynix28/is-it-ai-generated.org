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
