import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openConfig, makeToken } from './config.mjs';
import { AppError, validateInput, validateSetup } from './validation.mjs';
import { generate } from './provider.mjs';
import { findFfmpeg } from './media.mjs';

const assets = new Map([
  ['/', ['setup.html', 'text/html; charset=utf-8']],
  ['/setup.js', ['setup.js', 'text/javascript; charset=utf-8']],
  ['/setup.css', ['setup.css', 'text/css; charset=utf-8']],
]);
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
function errorBody(error) {
  return { ok: false, error: error instanceof AppError ? error.message : 'The local bridge encountered an error. Restart it and try again.', code: error instanceof AppError ? error.code : 'SERVER_ERROR' };
}
function readJSON(req, max = 24 * 1024 * 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new AppError('Use application/json.', 415, 'CONTENT_TYPE');
  if (req.headers['content-encoding']) throw new AppError('Compressed request bodies are not accepted.', 415, 'CONTENT_TYPE');
  if (Number(req.headers['content-length']) > max) throw new AppError('Request is too large.', 413, 'TOO_LARGE');
  return new Promise((resolve, reject) => {
    let size = 0, settled = false; const chunks = [];
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > max) { settled = true; chunks.length = 0; reject(new AppError('Request is too large.', 413, 'TOO_LARGE')); }
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new AppError('Request body is not valid JSON.')); }
    });
    req.on('error', () => { if (!settled) reject(new AppError('Request was interrupted.')); });
  });
}

export async function createBridge({ configPath, env = process.env, fetchImpl = fetch, ffmpeg: ffmpegOption, port = 4318, heartbeatMs = 10000 } = {}) {
  const config = await openConfig(configPath, env);
  const ffmpeg = ffmpegOption === undefined ? await findFfmpeg(env) : ffmpegOption;
  const sessions = new Map();
  let active = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const actualPort = server.address()?.port || port;
      const hosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
      if (!hosts.includes(req.headers.host)) throw new AppError('Invalid local host.', 403, 'HOST_FORBIDDEN');
      const origin = req.headers.origin;
      const ownOrigin = origin === `http://${req.headers.host}`;
      const extensionOrigin = typeof origin === 'string' && /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
      const path = new URL(req.url, `http://${req.headers.host}`).pathname;
      // A user opening the setup link from an extension is a cross-site document
      // navigation. Permit only that HTML entry point, never API/embedded fetches.
      const setupNavigation = req.method === 'GET' && path === '/' && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document' && /\btext\/html\b/i.test(req.headers.accept || '');
      if (origin && !ownOrigin && !extensionOrigin) throw new AppError('This origin cannot access the local bridge.', 403, 'ORIGIN_FORBIDDEN');
      if (!origin && req.headers['sec-fetch-site'] === 'cross-site' && !setupNavigation) throw new AppError('Cross-site requests are not allowed.', 403, 'ORIGIN_FORBIDDEN');
      const extensionApi = extensionOrigin && ['/api/generate', '/api/health'].includes(path);
      if (extensionOrigin && !extensionApi && !setupNavigation) throw new AppError('This endpoint is only available in local setup.', 403, 'ORIGIN_FORBIDDEN');
      if (extensionApi) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      if (req.method === 'OPTIONS' && ['/api/generate', '/api/health'].includes(path)) { res.writeHead(204); res.end(); return; }
      if (req.method === 'GET' && path === '/api/health') {
        send(res, 200, { ok: true, ready: config.public().ready, model: config.public().model, transcriptionModel: config.public().transcriptionModel, media: { video: !!ffmpeg, audio: true } }); return;
      }
      const cookie = /(?:^|;\s*)wac_setup=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '')?.[1];
      let session = cookie && sessions.get(cookie);
      if (session && session.expires < Date.now()) { sessions.delete(cookie); session = null; }
      if (req.method === 'GET' && assets.has(path)) {
        if (path === '/' && !session) {
          for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
          if (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
          const id = makeToken(); session = { csrf: makeToken(), expires: Date.now() + 3600000 }; sessions.set(id, session);
          res.setHeader('Set-Cookie', `wac_setup=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);
        }
        const [filename, mime] = assets.get(path);
        const bytes = await readFile(new URL(filename, import.meta.url));
        res.writeHead(200, { 'Content-Type': mime }); res.end(bytes); return;
      }
      if (path.startsWith('/api/setup')) {
        if (!session) throw new AppError('Setup session expired. Reload this page.', 403, 'SESSION_REQUIRED');
        if (req.method === 'GET' && path === '/api/setup') {
          send(res, 200, { ok: true, ...config.public(), pairingToken: config.get().pairingToken, csrfToken: session.csrf, media: { video: !!ffmpeg, audio: true }, bridgeUrl: `http://127.0.0.1:${actualPort}` }); return;
        }
        if (req.method !== 'POST' || !ownOrigin || !equal(req.headers['x-csrf-token'], session.csrf)) throw new AppError('Setup verification failed. Reload this page.', 403, 'CSRF_REQUIRED');
        if (path === '/api/setup') {
          const changes = validateSetup(await readJSON(req, 8000)); await config.save(changes);
          send(res, 200, { ok: true, ...config.public() }); return;
        }
        if (path === '/api/setup/rotate') {
          await readJSON(req, 100);
          send(res, 200, { ok: true, pairingToken: await config.rotate() }); return;
        }
      }
      if (path === '/api/generate' && req.method === 'POST') {
        const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization || '')?.[1];
        if (!equal(token, config.get().pairingToken)) throw new AppError('The extension is not paired. Copy the pairing token from local setup into extension settings.', 401, 'NOT_PAIRED');
        if (active >= 2) throw new AppError('Two requests are already running. Wait for one to finish.', 429, 'BUSY');
        const input = validateInput(await readJSON(req));
        if (!config.public().ready) throw new AppError('Add an OpenAI API key in local setup before generating suggestions.', 503, 'NOT_CONFIGURED');
        active++;
        const controller = new AbortController();
        let heartbeat;
        const connected = () => !res.destroyed && !res.writableEnded;
        const disconnect = () => { clearInterval(heartbeat); controller.abort(); };
        res.once('close', disconnect);
        // MV3 service workers require fetch response headers within 30 seconds.
        // JSON permits leading whitespace, so heartbeat bytes preserve one JSON body.
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.flushHeaders();
        heartbeat = setInterval(() => { if (connected()) res.write('\n'); else disconnect(); }, Math.max(10, heartbeatMs));
        heartbeat.unref();
        try {
          const result = await generate(input, config.get(), { fetchImpl, ffmpeg, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(150000)]) });
          if (connected()) res.end(JSON.stringify({ ok: true, result }));
        } catch (error) {
          // Headers are already sent; the extension checks the JSON ok flag too.
          if (connected()) res.end(JSON.stringify(errorBody(error)));
        } finally { active--; clearInterval(heartbeat); res.off('close', disconnect); }
        return;
      }
      throw new AppError('Endpoint not found.', 404, 'NOT_FOUND');
    } catch (error) {
      if (res.headersSent) { if (!res.destroyed && !res.writableEnded) res.end(JSON.stringify(errorBody(error))); return; }
      send(res, error instanceof AppError ? error.status : 500, errorBody(error));
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.timeout = 180000;
  return {
    server,
    config,
    listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server.address()); }); }),
    close: () => new Promise((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const bridge = await createBridge();
    await bridge.listen();
    console.log('Threadlight AI is running at http://127.0.0.1:4318');
    console.log('Open that address to configure your API key and pair the extension.');
    console.log('Messages are sent to OpenAI only when you request a generation. Press Ctrl+C to stop.');
    const stop = async () => { await bridge.close(); process.exit(0); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? 'Port 4318 is already in use. Open http://127.0.0.1:4318 or stop the other local bridge.' : 'Could not start the local bridge. Check Node 22+ and read/write access to .local/config.json.');
    process.exitCode = 1;
  }
}
