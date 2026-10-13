/**
 * Internationalisation.
 *
 * The interface ships only complete locales. Every catalog is validated at load
 * against the French source, and a locale that misses a key is not offered in
 * the picker, so a half-translated interface can never appear.
 *
 * `t()` falls back French -> humanised key. It never prints a raw key such as
 * "text.editor.title", which is what a naive i18n layer does.
 *
 * To add a language: copy `fr`, translate the values, add it to LOCALES. Nothing
 * else to wire.
 */

export type LocaleCode = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';

/** French is the source of truth: every other catalog is checked against it. */
const fr = {
  'app.name': 'Détecteur IA',
  'app.tagline': 'Texte, empreinte de modèle et forensique d\u2019image',
  'app.local': '100 % local',
  'app.theme.toLight': 'Clair',
  'app.theme.toDark': 'Sombre',
  'app.theme.label': 'Changer de thème',

  'tabs.text': 'Analyse de texte',
  'tabs.image': 'Inspection d\u2019image',

  'editor.label': 'Éditeur',
  'editor.paste': 'Coller',
  'editor.clear': 'Effacer',
  'editor.sampleAi': 'Texte généré par IA',
  'editor.sampleHuman': 'Texte écrit par un humain',
  'editor.sampleTampered': 'Texte truqué (caractères cachés)',
  'editor.placeholder': 'Collez ou tapez un texte. L\u2019analyse démarre à la frappe.',
  'editor.words': 'mots',
  'editor.chars': 'caractères',
  'editor.sentences': 'phrases',
  'editor.layer1': 'Couche 1',
  'editor.ms': 'ms',
  'editor.clipboardDenied': 'Le presse-papiers est inaccessible. Utilisez Ctrl+V.',

  'score.title': 'Probabilité IA',
  'score.humanSuffix': 'donc {n} % humain',
  'score.mixedSuffix': 'signal ambigu',
  'score.aiSuffix': '{n} % IA',
  'score.gauge': 'Jauge de probabilité IA',
  'score.confidence': 'Confiance',
  'score.waiting': 'En attente de texte.',
  'score.analysing': 'Analyse en cours…',

  'band.human': 'Humain',
  'band.mixed': 'Mixte',
  'band.ai': 'IA',
  'band.none': '—',

  'sub.title': 'Décomposition',
  'sub.syntax': 'Régularité syntaxique',
  'sub.syntaxHint': 'Variation du rythme des phrases (burstiness inversée)',
  'sub.lexical': 'Prévisibilité lexicale',
  'sub.lexicalHint': 'Richesse du vocabulaire et répétitions de n-grammes',
  'sub.markers': 'Marqueurs & tics LLM',
  'sub.markersHint': 'Densité de tournures typiques des modèles',
  'sub.forensic': 'Intégrité des caractères',
  'sub.forensicHint': 'Caractères invisibles et homoglyphes',

  'fingerprint.title': 'Empreinte modèle',
  'fingerprint.indeterminate': 'indéterminé',
  'fingerprint.disclaimer': 'Tendances statistiques, pas une attribution. Les fournisseurs publient plusieurs modèles, les styles se recouvrent, et un texte court ne permet aucun classement fiable.',
  'fingerprint.gap': 'Écart avec le deuxième profil : {n} pts.',

  'forensic.title': 'Anomalies détectées',
  'markers.title': 'Tournures repérées',

  'signals.title': 'Signaux du moteur',
  'measures.title': 'Mesures',
  'measures.sentences': 'Phrases',
  'measures.paragraphs': 'Paragraphes',
  'measures.unique': 'Mots uniques',
  'measures.ttr': 'Type/token',
  'measures.mean': 'Long. moyenne',
  'measures.std': 'Écart-type',
  'measures.burst': 'Burstiness',
  'measures.ternary': 'Structures ternaires',
  'measures.mattr': 'MATTR-50',
  'measures.shannon': 'Entropie trigrammes',
  'measures.compression': 'Compression deflate',
  'measures.enum': 'Phrases à énumération',
  'measures.conn': 'Connecteurs en tête',
  'measures.iso': 'Paragraphes isomorphes',

  'model.title': 'Couche 2 · modèle neuronal',
  'model.inactive': 'inactif',
  'model.loading': 'chargement',
  'model.ready': 'prêt',
  'model.active': 'actif',
  'model.unavailable': 'indisponible',
  'model.note': 'Classifieur ONNX quantifié exécuté dans un Web Worker. Téléchargé depuis le CDN à la première analyse, puis mis en cache. Modèle anglophone : la couche 1 reste la référence pour le français.',
  'model.unavailableNote': 'Couche 2 indisponible : {reason}. La couche 1 continue de fonctionner, l\u2019outil reste complet.',
  'model.class': 'Classe du modèle',
  'model.latency': 'Latence',
  'model.downloading': 'Téléchargement',
  'model.initialising': 'Initialisation',

  'privacy.title': '100 % exécution locale — vérifiable en mode avion',
  'privacy.body': 'Votre texte et vos images ne sont jamais envoyés à un serveur. Couche 1 en TypeScript pur, couche 2 dans un Web Worker, forensique d\u2019image via FileReader et Canvas. Aucun cookie, aucun identifiant, aucune requête analytique. La seule requête sortante est le téléchargement du modèle depuis le CDN, une fois, puis mis en cache.',

  'footnote': 'Aucun détecteur n\u2019est infaillible. Un texte formel écrit par un humain peut ressortir comme IA, et un texte retouché à la main peut passer pour humain. Le score est un indice, jamais une preuve.',

  'image.label': 'Image',
  'image.modeOriginal': 'Vue originale',
  'image.modeHeat': 'Carte des artefacts',
  'image.dropStrong': 'Déposez une image ici',
  'image.dropHint': 'ou cliquez pour parcourir, ou collez avec Ctrl+V',
  'image.formats': 'JPEG · PNG · WebP · AVIF',
  'image.opacity': 'Opacité artefacts',
  'image.waiting': 'En attente d\u2019image.',
  'image.notImage': 'Ce fichier n\u2019est pas une image.',
  'image.failed': 'Échec de l\u2019analyse : {reason}',

  'image.verdict': 'Verdict',
  'image.c2pa': 'C2PA / Content Credentials',
  'image.c2pa.ai': 'Génération IA certifiée par signature C2PA',
  'image.c2pa.present': 'Manifeste C2PA présent',
  'image.c2pa.absent': 'Aucun manifeste C2PA',
  'image.c2pa.absentDetail': 'Les métadonnées ont été supprimées ou n\u2019ont jamais existé.',
  'image.findings': 'Constats',
  'image.pixels': 'Analyse matricielle',
  'image.pxUniformity': 'Uniformité du bruit (blocs 8×8)',
  'image.pxLaplacian': 'Variance laplacienne (σ)',
  'image.pxChroma': 'Aberration chromatique',
  'image.pxEdges': 'Densité de contours',
  'image.pxSample': 'Échantillon analysé',
  'image.pxBenford': 'Benford DCT — conformité',
  'image.pxBenfordKl': 'Benford DCT — KL (bits)',
  'image.pxBenfordSmall': 'échantillon trop petit',
  'image.benfordChart': 'Chiffres significatifs (observé vs Benford)',
  'image.metadata': 'Métadonnées extraites',
  'image.scope': 'Portée',
  'image.scopeBody': 'Un manifeste C2PA signé ou une signature de générateur dans le binaire sont des preuves. L\u2019analyse de pixels ne l\u2019est pas : elle donne une tendance, et un recadrage ou une recompression l\u2019efface. Rien ne quitte votre navigateur.',

  'imgVerdict.ai': 'IA',
  'imgVerdict.likelyAi': 'Probable IA',
  'imgVerdict.unsure': 'Incertain',
  'imgVerdict.likelyReal': 'Probable réelle',
  'imgVerdict.real': 'Réelle',
  'imgVerdict.unknown': 'Indéterminé',

  'imgEv.c2paAi': 'Signature C2PA déclarant une génération IA',
  'imgEv.c2pa': 'Manifeste C2PA présent',
  'imgEv.signature': 'Signature de générateur : {name}',
  'imgEv.camera': 'Métadonnées optiques présentes',
  'imgEv.noMetadata': 'Aucune métadonnée',
  'imgEv.noMetadataDetail': 'EXIF et Content Credentials absents. Les plateformes les suppriment presque toujours, ce n\u2019est donc pas une preuve.',
  'imgEv.geometry': 'Géométrie caractéristique des modèles de diffusion',
  'imgEv.benford': 'Loi de Benford non respectée sur la DCT 8×8',
  'imgEv.benfordDetail': 'KL = {kl} bits sur {n} coefficients — signal contesté, jamais décisif seul.',
  'imgEv.pixelsOnly': 'Métadonnées absentes : analyse de pixels seule',
  'imgEv.pixelsOnlyDetail': 'Sans EXIF ni C2PA, seules les statistiques de pixels sont disponibles. Elles indiquent une tendance et ne permettent pas de conclure.',

  'error.csp': 'Une ressource a été bloquée par la politique de sécurité.',
  'editor.samplePlaceholder': 'Exemple…',
  'reason.forensics': 'Caractères invisibles ou homoglyphes détectés',
  'reason.isomorphism': 'Paragraphes calibrés : tous font 2 à 4 phrases de longueur presque identique',
  'reason.connectors': 'Structure dialectique synthétique : connecteurs en tête de paragraphe',
  'reason.enumerations': 'Énumérations systématiques de trois éléments ou plus',
  'reason.rhythm': 'Rythme uniforme et tournures typiques des modèles',
  'reason.mixed': 'Signaux mitigés, typiques d’un texte retouché',
  'reason.human': 'Variation naturelle du rythme et du vocabulaire',
  'sig.rhythm': 'Rythme plat (burstiness filtrée)',
  'sig.isomorphism': 'Isomorphisme des paragraphes',
  'sig.paragraphUniformity': 'Uniformité des paragraphes',
  'sig.enumerations': 'Énumérations systématiques',
  'sig.connectors': 'Connecteurs en tête de paragraphe',
  'sig.discourse': 'Marqueurs de discours (Pourtant, Cependant, Ainsi…)',
  'sig.cliches': 'Clichés de dissertation',
  'sig.hedges': 'Verbes de prudence',
  'sig.lexicalVariety': 'Richesse lexicale (TTR)',
  'sig.repetition': 'Répétitions de n-grammes',
  'sig.llmMarkers': 'Densité de tournures LLM',
  'sig.ternary': 'Structures dialectiques',
  'sigDetail.cv': 'CV = {cv}',
  'sigDetail.rhythm': 'CV = {cv} sur {n} phrases de prose',
  'sigDetail.isomorphism': '{n} % des paragraphes font 2 à 4 phrases',
  'sigDetail.enum': '{n} % des phrases, {total} au total',
  'sigDetail.connectors': '{n} % des paragraphes',
  'sigDetail.occurrences': '{n} occurrences',
  'sigDetail.ttr': 'TTR = {ttr}, MATTR-50 = {mattr}',
  'sigDetail.ternary': '{n} détectées',
  'sReason.enumeration': 'Énumération de 3 éléments ou plus',
  'sReason.cliche': 'Cliché de dissertation typique d’un LLM',
  'sReason.connector': 'Connecteur logique scolaire en tête de phrase',
  'sReason.marker': 'Tic de langage IA : « {phrase} »',
  'sReason.hedge': 'Verbe de prudence (« {word} »)',
  'sReason.deviation': 'Longueur très proche de la moyenne ({n} mots)',
  'sReason.noVoice': 'Aucune marque de voix personnelle',
  'sReason.weak': 'Signaux faibles mais cumulés',
  'sReason.varied': 'Rythme et vocabulaire variés',
  'fp.noteShort': 'Moins de 120 mots : classement indicatif, à prendre avec des pincettes.',
  'fp.notePunctuation': 'Ponctuation expressive détectée : signe plutôt humain.',
  'fp.noteVoice': 'Voix personnelle marquée : les modèles restent plus impersonnels par défaut.',
  'fp.none': 'Échantillon trop court pour classer.',
};

type Catalog = typeof fr;

const en: Catalog = {
  'app.name': 'AI Detector',
  'app.tagline': 'Text, model fingerprint and image forensics',
  'app.local': '100% local',
  'app.theme.toLight': 'Light',
  'app.theme.toDark': 'Dark',
  'app.theme.label': 'Switch theme',

  'tabs.text': 'Text analysis',
  'tabs.image': 'Image inspection',

  'editor.label': 'Editor',
  'editor.paste': 'Paste',
  'editor.clear': 'Clear',
  'editor.sampleAi': 'AI-generated text',
  'editor.sampleHuman': 'Human-written text',
  'editor.sampleTampered': 'Tampered text (hidden characters)',
  'editor.placeholder': 'Paste or type text. Analysis starts as you type.',
  'editor.words': 'words',
  'editor.chars': 'characters',
  'editor.sentences': 'sentences',
  'editor.layer1': 'Layer 1',
  'editor.ms': 'ms',
  'editor.clipboardDenied': 'The clipboard is unavailable. Use Ctrl+V.',

  'score.title': 'AI probability',
  'score.humanSuffix': 'so {n}% human',
  'score.mixedSuffix': 'ambiguous signal',
  'score.aiSuffix': '{n}% AI',
  'score.gauge': 'AI probability gauge',
  'score.confidence': 'Confidence',
  'score.waiting': 'Waiting for text.',
  'score.analysing': 'Analysing…',

  'band.human': 'Human',
  'band.mixed': 'Mixed',
  'band.ai': 'AI',
  'band.none': '—',

  'sub.title': 'Breakdown',
  'sub.syntax': 'Syntactic regularity',
  'sub.syntaxHint': 'Sentence rhythm variation (inverted burstiness)',
  'sub.lexical': 'Lexical predictability',
  'sub.lexicalHint': 'Vocabulary richness and n-gram repetition',
  'sub.markers': 'LLM markers & tells',
  'sub.markersHint': 'Density of phrasings typical of models',
  'sub.forensic': 'Character integrity',
  'sub.forensicHint': 'Invisible characters and homoglyphs',

  'fingerprint.title': 'Model fingerprint',
  'fingerprint.indeterminate': 'indeterminate',
  'fingerprint.disclaimer': 'Statistical tendencies, not attribution. Vendors ship several models, styles overlap, and a short text cannot be ranked reliably.',
  'fingerprint.gap': 'Gap with the runner-up: {n} pts.',

  'forensic.title': 'Detected anomalies',
  'markers.title': 'Phrasings found',

  'signals.title': 'Engine signals',
  'measures.title': 'Measurements',
  'measures.sentences': 'Sentences',
  'measures.paragraphs': 'Paragraphs',
  'measures.unique': 'Unique words',
  'measures.ttr': 'Type/token',
  'measures.mean': 'Mean length',
  'measures.std': 'Std deviation',
  'measures.burst': 'Burstiness',
  'measures.ternary': 'Ternary structures',
  'measures.mattr': 'MATTR-50',
  'measures.shannon': 'Trigram entropy',
  'measures.compression': 'Deflate compression',
  'measures.enum': 'Sentences with enumerations',
  'measures.conn': 'Leading connectors',
  'measures.iso': 'Isomorphic paragraphs',

  'model.title': 'Layer 2 · neural model',
  'model.inactive': 'idle',
  'model.loading': 'loading',
  'model.ready': 'ready',
  'model.active': 'active',
  'model.unavailable': 'unavailable',
  'model.note': 'Quantised ONNX classifier running in a Web Worker. Downloaded from the CDN on first analysis, then cached. English-centric model: Layer 1 remains the reference for other languages.',
  'model.unavailableNote': 'Layer 2 unavailable: {reason}. Layer 1 keeps working, the tool stays complete.',
  'model.class': 'Model class',
  'model.latency': 'Latency',
  'model.downloading': 'Downloading',
  'model.initialising': 'Initialising',

  'privacy.title': '100% local execution — verifiable in airplane mode',
  'privacy.body': 'Your text and images are never sent to a server. Layer 1 is pure TypeScript, layer 2 runs in a Web Worker, image forensics uses FileReader and Canvas. No cookies, no identifiers, no analytics. The only outbound request is the one-time model download from the CDN, then cached.',

  'footnote': 'No detector is infallible. Formal human writing can come back as AI, and hand-edited AI text can pass as human. The score is a hint, never proof.',

  'image.label': 'Image',
  'image.modeOriginal': 'Original view',
  'image.modeHeat': 'Artefact map',
  'image.dropStrong': 'Drop an image here',
  'image.dropHint': 'or click to browse, or paste with Ctrl+V',
  'image.formats': 'JPEG · PNG · WebP · AVIF',
  'image.opacity': 'Artefact opacity',
  'image.waiting': 'Waiting for an image.',
  'image.notImage': 'That file is not an image.',
  'image.failed': 'Analysis failed: {reason}',

  'image.verdict': 'Verdict',
  'image.c2pa': 'C2PA / Content Credentials',
  'image.c2pa.ai': 'AI generation certified by C2PA signature',
  'image.c2pa.present': 'C2PA manifest present',
  'image.c2pa.absent': 'No C2PA manifest',
  'image.c2pa.absentDetail': 'The metadata was stripped, or never existed.',
  'image.findings': 'Findings',
  'image.pixels': 'Matrix analysis',
  'image.pxUniformity': 'Noise uniformity (8×8 blocks)',
  'image.pxLaplacian': 'Laplacian variance (σ)',
  'image.pxChroma': 'Chromatic aberration',
  'image.pxEdges': 'Edge density',
  'image.pxSample': 'Sample analysed',
  'image.pxBenford': 'Benford DCT — conformity',
  'image.pxBenfordKl': 'Benford DCT — KL (bits)',
  'image.pxBenfordSmall': 'sample too small',
  'image.benfordChart': 'Leading digits (observed vs Benford)',
  'image.metadata': 'Extracted metadata',
  'image.scope': 'Scope',
  'image.scopeBody': 'A signed C2PA manifest or a generator signature in the binary is evidence. Pixel analysis is not: it shows a tendency, and a crop or a re-encode erases it. Nothing leaves your browser.',

  'imgVerdict.ai': 'AI',
  'imgVerdict.likelyAi': 'Likely AI',
  'imgVerdict.unsure': 'Unsure',
  'imgVerdict.likelyReal': 'Likely real',
  'imgVerdict.real': 'Real',
  'imgVerdict.unknown': 'Indeterminate',

  'imgEv.c2paAi': 'C2PA signature declaring AI generation',
  'imgEv.c2pa': 'C2PA manifest present',
  'imgEv.signature': 'Generator signature: {name}',
  'imgEv.camera': 'Optical metadata present',
  'imgEv.noMetadata': 'No metadata',
  'imgEv.noMetadataDetail': 'EXIF and Content Credentials are missing. Platforms almost always strip them, so this is not evidence.',
  'imgEv.geometry': 'Geometry typical of diffusion models',
  'imgEv.benford': 'Benford\u2019s law violated on the 8×8 DCT',
  'imgEv.benfordDetail': 'KL = {kl} bits over {n} coefficients — contested signal, never decisive alone.',
  'imgEv.pixelsOnly': 'No metadata: pixel analysis only',
  'imgEv.pixelsOnlyDetail': 'Without EXIF or C2PA only pixel statistics are available. They show a tendency and cannot conclude.',

  'error.csp': 'A resource was blocked by the security policy.',
  'editor.samplePlaceholder': 'Sample…',
  'reason.forensics': 'Invisible characters or homoglyphs detected',
  'reason.isomorphism': 'Calibrated paragraphs: all 2 to 4 sentences of near-identical length',
  'reason.connectors': 'Synthetic dialectical structure: connectives opening each paragraph',
  'reason.enumerations': 'Systematic enumerations of three or more items',
  'reason.rhythm': 'Even rhythm and phrasings typical of models',
  'reason.mixed': 'Mixed signals, typical of edited text',
  'reason.human': 'Natural variation in rhythm and vocabulary',
  'sig.rhythm': 'Flat rhythm (filtered burstiness)',
  'sig.isomorphism': 'Paragraph isomorphism',
  'sig.paragraphUniformity': 'Paragraph uniformity',
  'sig.enumerations': 'Systematic enumerations',
  'sig.connectors': 'Paragraph-opening connectives',
  'sig.discourse': 'Discourse markers (However, Moreover, Thus…)',
  'sig.cliches': 'Dissertation clichés',
  'sig.hedges': 'Hedging verbs',
  'sig.lexicalVariety': 'Lexical richness (TTR)',
  'sig.repetition': 'N-gram repetition',
  'sig.llmMarkers': 'LLM phrasing density',
  'sig.ternary': 'Dialectical structures',
  'sigDetail.cv': 'CV = {cv}',
  'sigDetail.rhythm': 'CV = {cv} over {n} prose sentences',
  'sigDetail.isomorphism': '{n}% of paragraphs are 2 to 4 sentences',
  'sigDetail.enum': '{n}% of sentences, {total} in total',
  'sigDetail.connectors': '{n}% of paragraphs',
  'sigDetail.occurrences': '{n} occurrences',
  'sigDetail.ttr': 'TTR = {ttr}, MATTR-50 = {mattr}',
  'sigDetail.ternary': '{n} detected',
  'sReason.enumeration': 'Enumeration of 3 or more items',
  'sReason.cliche': 'Dissertation cliché typical of an LLM',
  'sReason.connector': 'Schoolbook connective at the start of the sentence',
  'sReason.marker': 'AI phrasing: \u201c{phrase}\u201d',
  'sReason.hedge': 'Hedging verb (\u201c{word}\u201d)',
  'sReason.deviation': 'Length very close to the average ({n} words)',
  'sReason.noVoice': 'No personal voice',
  'sReason.weak': 'Weak but cumulative signals',
  'sReason.varied': 'Varied rhythm and vocabulary',
  'fp.noteShort': 'Under 120 words: indicative ranking, take it with a pinch of salt.',
  'fp.notePunctuation': 'Expressive punctuation detected: a rather human sign.',
  'fp.noteVoice': 'Strong personal voice: models stay more impersonal by default.',
  'fp.none': 'Sample too short to rank.',
};

const es: Partial<Catalog> = {
  'app.name': 'Detector de IA',
  'app.tagline': 'Texto, huella de modelo y análisis forense de imagen',
  'app.local': '100 % local',
  'app.theme.toLight': 'Claro',
  'app.theme.toDark': 'Oscuro',
  'app.theme.label': 'Cambiar tema',
  'tabs.text': 'Análisis de texto',
  'tabs.image': 'Inspección de imagen',
  'editor.label': 'Editor',
  'editor.paste': 'Pegar',
  'editor.clear': 'Borrar',
  'editor.sampleAi': 'Texto IA',
  'editor.sampleHuman': 'Texto humano',
  'editor.sampleTampered': 'Texto manipulado',
  'editor.placeholder': 'Pega o escribe un texto. El análisis empieza mientras escribes.',
  'score.title': 'Probabilidad de IA',
  'score.waiting': 'Esperando texto.',
  'score.confidence': 'Confianza',
  'band.human': 'Humano',
  'band.mixed': 'Mixto',
  'band.ai': 'IA',
  'privacy.title': '100 % ejecución local — verificable en modo avión',
  'image.verdict': 'Veredicto',
  'image.waiting': 'Esperando una imagen.',
};

const de: Partial<Catalog> = {
  'app.name': 'KI-Detektor',
  'app.tagline': 'Text, Modell-Fingerabdruck und Bildforensik',
  'app.local': '100 % lokal',
  'app.theme.toLight': 'Hell',
  'app.theme.toDark': 'Dunkel',
  'app.theme.label': 'Design wechseln',
  'tabs.text': 'Textanalyse',
  'tabs.image': 'Bildprüfung',
  'editor.label': 'Editor',
  'editor.paste': 'Einfügen',
  'editor.clear': 'Leeren',
  'editor.sampleAi': 'KI-Text',
  'editor.sampleHuman': 'Menschlicher Text',
  'editor.sampleTampered': 'Manipulierter Text',
  'editor.placeholder': 'Text einfügen oder tippen. Die Analyse läuft beim Tippen.',
  'score.title': 'KI-Wahrscheinlichkeit',
  'score.waiting': 'Warte auf Text.',
  'score.confidence': 'Sicherheit',
  'band.human': 'Mensch',
  'band.mixed': 'Gemischt',
  'band.ai': 'KI',
  'privacy.title': '100 % lokale Ausführung — im Flugmodus überprüfbar',
  'image.verdict': 'Urteil',
  'image.waiting': 'Warte auf ein Bild.',
};

const it: Partial<Catalog> = {
  'app.name': 'Rilevatore IA',
  'tabs.text': 'Analisi del testo',
  'tabs.image': 'Ispezione immagine',
  'editor.label': 'Editor',
  'editor.paste': 'Incolla',
  'editor.clear': 'Cancella',
  'score.title': 'Probabilità IA',
  'band.human': 'Umano',
  'band.mixed': 'Misto',
  'band.ai': 'IA',
  'image.verdict': 'Verdetto',
};

const pt: Partial<Catalog> = {
  'app.name': 'Detetor de IA',
  'tabs.text': 'Análise de texto',
  'tabs.image': 'Inspeção de imagem',
  'editor.label': 'Editor',
  'editor.paste': 'Colar',
  'editor.clear': 'Limpar',
  'score.title': 'Probabilidade de IA',
  'band.human': 'Humano',
  'band.mixed': 'Misto',
  'band.ai': 'IA',
  'image.verdict': 'Veredito',
};

const CANDIDATES: Record<LocaleCode, Partial<Catalog>> = { fr, en, es, de, it, pt };

const NATIVE: Record<LocaleCode, string> = {
  fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português',
};

/** A locale is offered only when it covers the whole French key set. */
function isComplete(catalog: Partial<Catalog>): catalog is Catalog {
  return (Object.keys(fr) as Array<keyof Catalog>).every((key) => typeof catalog[key] === 'string');
}

const COMPLETE = (Object.keys(CANDIDATES) as LocaleCode[]).filter((code) => isComplete(CANDIDATES[code]));

const CATALOGS: Partial<Record<LocaleCode, Catalog>> = {};
for (const code of COMPLETE) CATALOGS[code] = CANDIDATES[code] as Catalog;

let current: LocaleCode = 'fr';

/** Last-resort label, so a raw key never reaches the screen. */
function humanise(key: string): string {
  const tail = key.split('.').pop() ?? key;
  const spaced = tail.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const lookup = key as keyof Catalog;
  const value = CATALOGS[current]?.[lookup] ?? fr[lookup] ?? humanise(key);
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export function getLocale(): LocaleCode {
  return current;
}

export function availableLocales(): Array<{ code: LocaleCode; native: string }> {
  return COMPLETE.map((code) => ({ code, native: NATIVE[code] }));
}

function detect(): LocaleCode {
  const stored = (() => {
    try {
      const value = localStorage.getItem('aitd.locale');
      return value && COMPLETE.includes(value as LocaleCode) ? (value as LocaleCode) : null;
    } catch {
      return null;
    }
  })();
  if (stored) return stored;

  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = String(tag ?? '').toLowerCase().split('-')[0] as LocaleCode;
    if (COMPLETE.includes(base)) return base;
  }

  // Fall back to the browser locale string and the referring site's language.
  const ua = navigator.userAgent.toLowerCase();
  const fromUa = /(?:^|[ ;(])([a-z]{2})[-_][a-z]{2}/.exec(ua)?.[1] as LocaleCode | undefined;
  if (fromUa && COMPLETE.includes(fromUa)) return fromUa;

  try {
    const host = document.referrer ? new URL(document.referrer).hostname : '';
    const tld = /\.([a-z]{2})(?:\.|$)/.exec(host)?.[1] as LocaleCode | undefined;
    if (tld && COMPLETE.includes(tld)) return tld;
  } catch {
    /* malformed referrer */
  }

  return 'fr';
}

/** Translate every element carrying data-i18n / data-i18n-attr. */
export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n as keyof Catalog | undefined;
    if (key) node.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((node) => {
    for (const pair of (node.dataset.i18nAttr ?? '').split(',')) {
      const [attr, key] = pair.split(':').map((v) => v.trim());
      if (attr && key) node.setAttribute(attr, t(key as keyof Catalog));
    }
  });
}

/**
 * Reverse index: exact French string -> key.
 *
 * The interface was written in French, so instead of rewriting every template
 * we translate the DOM by matching its text nodes against the French catalog.
 * Ambiguous values (several keys with the same French string) are dropped, so a
 * match is never guesswork. Anything unmatched is left untouched.
 */
const FR_TO_KEY = (() => {
  const index = new Map<string, keyof Catalog>();
  const ambiguous = new Set<string>();
  for (const [key, value] of Object.entries(fr) as Array<[keyof Catalog, string]>) {
    if (!value || value.includes('{')) continue;
    const existing = index.get(value);
    if (existing && existing !== key) ambiguous.add(value);
    else index.set(value, key);
  }
  for (const value of ambiguous) index.delete(value);
  return index;
})();

/** Translate static text in place. Textareas, inputs and code are skipped. */
export function translateDom(root: ParentNode = document): void {
  if (current === 'fr') return;
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  for (const textNode of nodes) {
    const parent = textNode.parentElement;
    if (!parent) continue;
    const tag = parent.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'CODE' || tag === 'OPTION') continue;
    if (parent.closest('#editor, #tip, #highlight-layer, #components-list, #fingerprint-notes')) continue;
    const trimmed = textNode.nodeValue?.trim() ?? '';
    if (!trimmed) continue;
    const key = FR_TO_KEY.get(trimmed);
    if (!key) continue;
    const translated = t(key);
    const leading = textNode.nodeValue!.match(/^\s*/)?.[0] ?? '';
    const trailing = textNode.nodeValue!.match(/\s*$/)?.[0] ?? '';
    textNode.nodeValue = `${leading}${translated}${trailing}`;
  }
}

const listeners = new Set<() => void>();

export function onLocaleChange(fn: () => void): void {
  listeners.add(fn);
}

export function setLocale(code: LocaleCode): void {
  if (!COMPLETE.includes(code)) return;
  current = code;
  document.documentElement.lang = code;
  try {
    localStorage.setItem('aitd.locale', code);
  } catch {
    /* storage disabled: the choice simply does not persist */
  }
  applyTranslations();
  translateDom(document);
  for (const fn of listeners) fn();
}

/** Fill the header picker and translate the initial paint. */
export function initI18n(select: HTMLSelectElement): LocaleCode {
  current = detect();
  document.documentElement.lang = current;
  select.replaceChildren();
  for (const { code, native } of availableLocales()) {
    select.append(new Option(native, code));
  }
  select.value = current;
  applyTranslations();
  translateDom(document);
  return current;
}
