# Privacy

## What never happens

- Your text is never uploaded. Analysis runs in your browser.
- Your images are never uploaded. They are decoded with a canvas, analysed in memory, and dropped when you leave the page.
- No cookies are set. No advertising, no analytics scripts from third parties, no web fonts.
- No fingerprinting. The site does not read canvas fingerprints, audio fingerprints or font lists to identify you.

## What is counted, and how

The Stats tab shows aggregate usage. The backend stores four kinds of counter, all strings or integers:

- page views, and unique visitors per day;
- coarse dimensions: page path, UI language, country code from Cloudflare's `cf-ipcountry`, device class, screen-size bucket, referrer host;
- tool events: which tool ran, and for text, the verdict band (not the text);
- nothing else.

Unique visitors are counted with an HMAC-SHA256 of `date + IP + user agent` and a server secret. Only the first 8 bytes of the digest are used, as a KV key with a two-day TTL. The raw IP never reaches storage and the key is unreadable as personal data. The hash rotates every day, so the same person cannot be followed across days.

## Opting out

- The site honours `DNT: 1` and `Sec-GPC: 1`.
- The Stats tab has a button that stores an opt-out flag in `localStorage` and stops all beacons.
- Self-hosters can simply not bind the KV namespace; the counter then returns `available: false` and stores nothing.

## OpenAI Content Provenance (optional)

The image tool has a button that forwards a file to `POST /api/provenance`. That endpoint calls OpenAI's Content Provenance API **only when the deployment has an `OPENAI_API_KEY` secret configured**. Until then it returns `configured: false` and the local C2PA result, and nothing is forwarded.

When it is configured, the file is sent to OpenAI for the duration of the request and is not stored by this site. The API key never reaches the browser. If you would rather nothing ever leave the device, leave the secret unset; the local C2PA parse, Unicode scan and pixel analysis are unaffected.

## What the statistics are not

The numbers are directional, not exact. KV has no atomic increment, so concurrent writes to the same daily document can undercount. Country and referrer data are coarse by design.

## Data retention

Daily aggregate documents are kept indefinitely (they contain no personal data). Unique-visitor keys expire after two days. No other data is retained.

## Contact

Open an issue on GitHub for privacy questions or data requests: https://github.com/joynix28/is-it-ai-generated.org/issues
