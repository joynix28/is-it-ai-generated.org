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
| [onnx-community/e5-small-lora-ai-generated-detector-ONNX](https://huggingface.co/onnx-community/e5-small-lora-ai-generated-detector-ONNX) | follows the base model | Layer 2 text classifier |
| [MayZhou/e5-small-lora-ai-generated-detector](https://huggingface.co/MayZhou/e5-small-lora-ai-generated-detector) | MIT | base model of the ONNX conversion above |

The model is downloaded from the Hugging Face CDN at run time and cached by the
browser. It is not redistributed here.

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
