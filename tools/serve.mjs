// Development server: serves plugin/ with the mock Otzaria host injected.
// Usage: node tools/serve.mjs [port]   ->  http://localhost:5178/?theme=dark
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const pluginRoot = resolve(here, '..', 'plugin');
const mockRoot = resolve(here, 'mock');
const port = Number(process.argv[2] || 5178);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function safeJoin(base, path) {
  const target = normalize(join(base, decodeURIComponent(path)));
  return target.startsWith(base) ? target : null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file;
  if (url.pathname.startsWith('/__mock/')) file = safeJoin(mockRoot, url.pathname.slice('/__mock/'.length));
  else file = safeJoin(pluginRoot, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  if (!file) {
    res.writeHead(403).end();
    return;
  }
  try {
    let body = await readFile(file);
    if (file.endsWith('index.html') && file.startsWith(pluginRoot)) {
      body = Buffer.from(String(body).replace('<head>', '<head>\n  <script src="/__mock/otzaria-mock.js"></script>'));
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`Plugin preview: http://localhost:${port}/`));
