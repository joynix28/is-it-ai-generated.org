/**
 * Tiny static dev server with the Pages Functions API emulated, so you can
 * develop the whole thing without wrangler. Rebuilds on request.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const PORT = Number(process.env.PORT || 8788);
const root = new URL('..', import.meta.url).pathname;

spawnSync(process.execPath, [join(root, 'scripts', 'build.mjs')], { stdio: 'inherit' });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let path = url.pathname === '/' ? '/index.html' : url.pathname;

    if (path.startsWith('/api/') || path === '/api') {
      const name = path === '/api' ? 'index' : path.slice(5).replace(/\/+$/, '');
      const mod = await import(join(root, 'functions', 'api', `${name}.js`));
      const chunks = [];
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        for await (const c of req) chunks.push(c);
      }
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(`http://localhost:${PORT}${url.pathname}${url.search}`, {
        method: req.method,
        headers: req.headers,
        body,
      });
      const handler = req.method === 'OPTIONS'
        ? (mod.onRequestOptions || mod.onRequest)
        : req.method === 'GET'
          ? (mod.onRequestGet || mod.onRequest)
          : (mod.onRequestPost || mod.onRequest);
      if (!handler) {
        res.writeHead(405).end('Method not allowed');
        return;
      }
      const out = await handler({ request, env: {}, params: {} });
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }

    const filePath = join(root, 'public', path);
    const info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(await readFile(filePath));
  } catch (err) {
    res.writeHead(500).end(String(err && err.stack));
  }
});

server.listen(PORT, () => console.log(`\n  http://localhost:${PORT}\n`));
