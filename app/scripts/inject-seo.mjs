/**
 * One-off: inject SEO/GEO head tags and JSON-LD into the four pages.
 * Kept as a file rather than a heredoc so the JSON stays readable.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://is-it-generated-by-ai.org';
const LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ar'];
const ORG = `${SITE}/#organization`;
const APP = `${SITE}/#software`;
const WEBSITE = `${SITE}/#website`;

const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': ORG,
      name: 'Is It AI Generated?',
      url: `${SITE}/`,
      logo: { '@type': 'ImageObject', url: `${SITE}/icon.svg`, width: 64, height: 64 },
      sameAs: ['https://github.com/joynix28/is-it-ai-generated.org', 'https://discord.gg/rueWrg9X'],
    },
    {
      '@type': 'WebSite',
      '@id': WEBSITE,
      url: `${SITE}/`,
      name: 'Is It AI Generated?',
      inLanguage: LANGS,
      publisher: { '@id': ORG },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': APP,
      name: 'Is It AI Generated?',
      alternateName: 'Détecteur IA',
      applicationCategory: 'UtilitiesApplication',
      applicationSubCategory: 'AI content detector',
      operatingSystem: 'Any modern web browser',
      browserRequirements: 'Requires JavaScript',
      url: `${SITE}/`,
      description:
        'Free, ad-free detector for AI-written text and AI-generated images. Runs entirely in the browser: nothing is uploaded, and ten interface languages are supported.',
      inLanguage: LANGS,
      isAccessibleForFree: true,
      license: 'https://opensource.org/license/mit',
      softwareVersion: '0.1.0',
      screenshot: `${SITE}/icon.svg`,
      featureList: [
        'Per-sentence AI index with the evidence behind it',
        'Invisible-character and homoglyph detection',
        'C2PA Content Credentials and pixel forensics for images',
        'Word counter and readability statistics',
        'Works offline after the first visit',
        'No account, no cookie, no tracking',
      ],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      author: { '@id': ORG },
      publisher: { '@id': ORG },
    },
  ],
};

const alternates = (path) => {
  const lines = LANGS.map((code) => {
    const href = `${SITE}${path}${code === 'fr' ? '' : `?lang=${code}`}`;
    return `    <link rel="alternate" hreflang="${code}" href="${href}" />`;
  });
  lines.push(`    <link rel="alternate" hreflang="x-default" href="${SITE}${path}" />`);
  return lines.join('\n');
};

const ld = (obj) => `    <script type="application/ld+json">${JSON.stringify(obj)}</script>`;

const head = ({ path, title, desc, crumb, extra, noindex }) => {
  const url = `${SITE}${path}`;
  const parts = [
    `    <title>${title}</title>`,
    `    <meta name="description" content="${desc}" />`,
    `    <meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}" />`,
    `    <link rel="canonical" href="${url}" />`,
    '    <meta property="og:type" content="website" />',
    '    <meta property="og:site_name" content="Is It AI Generated?" />',
    `    <meta property="og:title" content="${title}" />`,
    `    <meta property="og:description" content="${desc}" />`,
    `    <meta property="og:url" content="${url}" />`,
    `    <meta property="og:image" content="${SITE}/icon.svg" />`,
    '    <meta property="og:locale" content="fr_FR" />',
    '    <meta name="twitter:card" content="summary" />',
    `    <meta name="twitter:title" content="${title}" />`,
    `    <meta name="twitter:description" content="${desc}" />`,
    `    <meta name="twitter:image" content="${SITE}/icon.svg" />`,
    '    <link rel="icon" href="/icon.svg" type="image/svg+xml" />',
    '    <link rel="apple-touch-icon" href="/icon.svg" />',
    alternates(path),
  ];
  if (crumb) {
    parts.push(ld({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: crumb, item: url },
      ],
    }));
  }
  if (extra) parts.push(ld(extra));
  return parts.join('\n');
};

const VIEWPORT = '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />';

function patch(file, opts) {
  let s = readFileSync(file, 'utf8');
  s = s.replace(/\n\s*<title>[\s\S]*?<\/title>/, '');
  s = s.replace(/\n\s*<meta name="description"[^>]*\/>/, '');
  s = s.replace(/\n\s*<meta name="robots"[^>]*\/>/, '');
  s = s.replace(/\n\s*<link rel="icon"[^>]*\/>/, '');
  if (!s.includes(VIEWPORT.trim())) {
    s = s.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n${VIEWPORT}`);
  }
  if (!s.includes(VIEWPORT)) throw new Error(`viewport anchor missing in ${file}`);
  s = s.replace(VIEWPORT, `${VIEWPORT}\n${head(opts)}`);
  writeFileSync(file, s);
  console.log('SEO ->', file);
}

patch('index.html', {
  path: '/',
  title: 'AI Text & Image Detector — Free, Private, 10 Languages',
  desc: 'Free AI detector for text and images. Per-sentence AI index, invisible-character scan, C2PA provenance. Runs in your browser: nothing is uploaded.',
  extra: graph,
});

patch('faq/index.html', {
  path: '/faq/',
  title: 'Frequently asked questions — AI Detector',
  desc: '55 plain-language answers about AI detection: reliability, privacy, homework, teachers, images, C2PA and languages.',
  crumb: 'FAQ',
});

patch('legal/index.html', {
  path: '/legal/',
  title: 'Legal notice — AI Detector',
  desc: 'Publisher, host, personal data, source code and contact. No data is collected, transmitted or stored.',
  crumb: 'Legal notice',
});

patch('stats/index.html', {
  path: '/stats/',
  title: 'Anonymous statistics — AI Detector',
  desc: 'Aggregate, anonymous usage of the site: visits, languages, countries, devices. No cookie, no identifier, no personal data.',
  noindex: true,
});

// Citability block on the home page, above the fold.
{
  const file = 'index.html';
  let s = readFileSync(file, 'utf8');
  if (!s.includes('hero.answer')) {
    s = s.replace(
      '<h1 class="text-2xl font-semibold',
      '<p class="mt-4 max-w-[68ch] text-body leading-relaxed text-zinc-600 dark:text-zinc-400" data-i18n="hero.answer">Réponse courte : personne ne peut affirmer avec certitude qui a écrit un texte.</p>\n      <h1 class="text-2xl font-semibold',
    );
    writeFileSync(file, s);
    console.log('citability block ->', file);
  }
}
