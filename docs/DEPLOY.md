# Deploy to Cloudflare Pages

## Prerequisites

- A Cloudflare account with the domain (or a subdomain) ready.
- `wrangler` logged in: `npm install -g wrangler && wrangler login`.

## 1. Create the statistics store

The Stats tab needs one KV namespace. Create it and write the id into `wrangler.toml`:

```bash
export CLOUDFLARE_ACCOUNT_ID=your_account_id
export CLOUDFLARE_API_TOKEN=your_api_token   # needs Workers KV edit + Pages edit
npm run stats:create
```

Set the hashing secret:

```bash
wrangler pages secret put STATS_SECRET --project-name is-it-ai-generated
```

Use a long random string. The anonymous unique-visitor hash depends on it.

Skip this whole step if you do not want statistics. Without the `STATS` binding the counter stores nothing and `/api/stats` returns `available: false`.

## 1b. Optional: OpenAI Content Provenance

To enable the "Check with OpenAI provenance" button and the provenance results in `POST /api/provenance`:

```bash
wrangler pages secret put OPENAI_API_KEY --project-name is-it-ai-generated
```

Leave it unset to keep everything local; the endpoint then reports `configured: false` and still returns the local C2PA parse.

## 2. Build and deploy

```bash
npm run build
wrangler pages deploy
```

The first run creates the Pages project. `wrangler.toml` supplies `pages_build_output_dir = "public"`, the KV binding and non-secret vars.

## 3. Continuous deployment from GitHub

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, pick the repository, then set:

- Build command: `npm run build`
- Build output directory: `public`
- Production branch: `main`

Add the `STATS` KV binding under **Settings → Functions → KV namespace bindings** if you are not using `wrangler.toml`, and set `STATS_SECRET` under **Settings → Environment variables** as a secret. `_routes.json` already limits Functions to `/api/*`.

## 4. Custom domain

`is-it-ai-generated.org` is registered separately. Once you have the DNS control:

1. Open the Pages project → **Custom domains** → **Set up a domain** → `is-it-ai-generated.org`.
2. Cloudflare shows the record to create. If the domain's DNS is already on Cloudflare, it adds it automatically; otherwise create the shown `CNAME` at your registrar's DNS.
3. Add `www` as well if you want it, and pick a redirect.

TLS is provisioned automatically. `public/_headers` sets HSTS, a strict CSP and the other security headers.

## Local development

```bash
npm run dev          # http://localhost:8788, API emulated (no KV)
```

or, with real bindings:

```bash
npm run build
wrangler pages dev public
```

`wrangler pages dev` reads `wrangler.toml`, so the KV binding and `STATS_SECRET` from `.dev.vars` are available.

## Rollback

Every `wrangler pages deploy` creates a deployment with its own URL. In the dashboard, **Deployments** lets you roll back to any previous one.

## Checks

- `GET /api/health` returns `{"ok":true}`.
- `curl -s /api/detect -H 'content-type: application/json' -d '{"text":"hello"}'` returns a report.
- The Stats tab shows numbers after a few visits (KV writes take a moment to be consistent).
