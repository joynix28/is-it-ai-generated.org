# Détecteur IA — texte, empreinte de modèle et forensique d'image

Application 100 % locale : aucun texte, aucune image et aucune donnée ne quitte le navigateur. Pas de compte, pas de publicité, pas d'analytique.

## Ce que fait l'outil

**Analyse de texte** — moteur statistique en TypeScript pur, sous 10 ms :
- burstiness (variation du rythme des phrases) calculée **après filtrage des titres** ;
- isomorphisme des paragraphes (part de paragraphes de 2 à 4 phrases) ;
- uniformité des paragraphes ;
- énumérations systématiques de 3 éléments ou plus ;
- connecteurs de discours et clichés de dissertation (FR/EN) ;
- verbes de prudence (« peut », « constitue », « demeure ») ;
- richesse lexicale (TTR, MATTR-50), entropie de Shannon des trigrammes ;
- entropie de compression (`CompressionStream('deflate-raw')`) ;
- forensique des caractères : invisibles, homoglyphes, scripts mixtes.

Chaque signal est affiché avec sa valeur, son poids et son détail : la note est explicable, pas une boîte noire.

**Empreinte de modèle** — correspondance relative OpenAI / Google / Anthropic / Meta à partir de tendances mesurables. C'est un classement indicatif, pas une attribution.

**Inspection d'image** — C2PA/JUMBF, EXIF, chunks PNG/WebP, signatures de générateurs (Stable Diffusion, ComfyUI, Midjourney, FLUX, DALL·E, Imagen, Meta AI, Firefly…), analyse du bruit par Laplacien, aberration chromatique, et loi de Benford sur la DCT-II 8×8 (KL-divergence). Sans provenance, le verdict ne dépasse jamais « incertain ».

## Développement

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests de non-régression
npm run build      # typecheck strict + build dans dist/
npm run preview
```

## Déploiement (Cloudflare Pages)

Commande de build : `npm run build` · Dossier de sortie : `dist`.

`public/_headers` applique COOP/COEP (SharedArrayBuffer pour le Web Worker du modèle ONNX) et une CSP stricte sans `unsafe-inline`.

## Limites, dites franchement

- Le moteur français attrape les dissertations générées, mais aucun détecteur n'est infaillible : un texte formel écrit par un humain peut remonter.
- Le modèle neuronal de la couche 2 est anglophone ; il est affiché séparément et **n'écrase jamais** le score français.
- La loi de Benford DCT est un signal contesté : petit poids, jamais décisif.
- L'analyse de pixels ne permet pas de conclure sans métadonnées.

## Licence

MIT.
