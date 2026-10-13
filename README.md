# Détecteur IA

Application 100 % locale : aucun texte, aucune image et aucune donnée ne quitte le navigateur. Pas de compte, pas de publicité, pas d'analytique.

Tout le code vit dans [`app/`](app/).

## Modules

**Analyse de texte** — moteur statistique en TypeScript pur, sous 10 ms : burstiness (rythme des phrases) calculée après filtrage des titres, isomorphisme des paragraphes, énumérations systématiques, clichés de dissertation (FR/EN), verbes de prudence, richesse lexicale (TTR, MATTR-50), entropie de Shannon des trigrammes, entropie de compression (`CompressionStream`), et forensique des caractères (invisibles, homoglyphes). Chaque signal est affiché avec sa valeur et son poids.

**Empreinte de modèle** — correspondance relative OpenAI / Google / Anthropic / Meta. Classement indicatif, jamais une attribution.

**Inspection d'image** — C2PA/JUMBF, EXIF, chunks PNG/WebP, signatures de générateurs, bruit laplacien, aberration chromatique, loi de Benford sur la DCT-II 8×8 (KL-divergence), et carte des hautes fréquences. Sans provenance, le verdict ne dépasse jamais « incertain ».

## Développement

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm test         # tests de non-régression
npm run build    # typecheck strict + build dans dist/
```

## Déploiement

Cloudflare Pages. Commande de build `npm run build`, dossier de sortie `dist`. `app/public/_headers` applique COOP/COEP (SharedArrayBuffer pour le Web Worker ONNX) et une CSP stricte sans `unsafe-inline`.

## Licence

MIT.
