import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createBridge } from '../server/index.mjs';
import { validateInput } from '../server/validation.mjs';

const sample = () => ({ mode: 'rewrite', text: 'i will sent it tomorrow', prompt: '', chat: { id: '123@s.whatsapp.net', name: 'Alex' }, profile: '', messages: [], examples: [], attachments: [], timeZone: 'Asia/Kolkata', now: '2026-10-28T10:00:00+05:30' });
const result = () => ({ suggestions: [{ label: 'Natural', text: 'I will send it tomorrow.', explanation: 'Use the base verb after will.' }, { label: 'Warm', text: 'I’ll send it over tomorrow.', explanation: 'A friendly version.' }, { label: 'Brief', text: 'I’ll send it tomorrow.', explanation: 'A concise version.' }], explanation: '', feedback: [{ category: 'Verb form', original: 'will sent', improved: 'will send', reason: 'Use the base form after will.' }], event: null, commitments: [], mediaNotes: [] });
const responseFor = value => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('generation validation rejects unsupported actions, invalid dates and oversized history', () => {
  assert.throws(() => validateInput({ ...sample(), mode: 'send' }), /Choose rewrite/);
  assert.throws(() => validateInput({ ...sample(), now: 'tomorrow' }), /ISO date/);
  assert.throws(() => validateInput({ ...sample(), now: '2026-02-30T10:00:00+05:30' }), /ISO date/);
  assert.throws(() => validateInput({ ...sample(), trackWriting: 'true' }), /true or false/);
  assert.equal(validateInput({ ...sample(), sourceTimestamp: '10:30, 28/10/2026' }).sourceTimestamp, '10:30, 28/10/2026');
  assert.throws(() => validateInput({ ...sample(), timeZone: 'Guess/Here' }), /timezone/);
  assert.throws(() => validateInput({ ...sample(), extraInstruction: 'send now' }), /unsupported field/);
  assert.throws(() => validateInput({ ...sample(), messages: Array.from({ length: 1201 }, () => ({})) }), /at most 1200/);
  assert.throws(() => validateInput({ ...sample(), text: '' }), /draft/);
});

test('attachment validation rejects malformed base64, unsupported types and total size overflow', () => {
  const withFile = file => ({ ...sample(), attachments: [file] });
  assert.throws(() => validateInput(withFile({ name: 'note.txt', mime: 'text/plain', data: '!!!=' })), /base64/);
  assert.throws(() => validateInput(withFile({ name: 'app.exe', mime: 'application/x-msdownload', data: 'YWJj' })), /Unsupported/);
  const file = { name: 'picture.jpg', mime: 'image/jpeg', data: Buffer.alloc(9 * 1024 * 1024).toString('base64') };
  assert.throws(() => validateInput({ ...sample(), attachments: [file, file] }), /16 MB/);
});

test('local HTTP bridge enforces pairing, same-origin setup and CSRF while keeping secrets private', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'wac-server-test-'));
  let calls = 0, providerPayload;
  const bridge = await createBridge({ configPath: join(directory, '.local/config.json'), env: {}, ffmpeg: null, port: 0, fetchImpl: async (url, options) => { calls++; providerPayload = JSON.parse(options.body); return responseFor(result()); } });
  const address = await bridge.listen(), base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await bridge.close(); await rm(directory, { recursive: true, force: true }); });
  const extension = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  let response = await fetch(`${base}/api/health`);
  assert.deepEqual(await response.json(), { ok: true, ready: false, model: 'gpt-5-mini', transcriptionModel: 'gpt-transcribe', media: { video: false, audio: true } });
  response = await fetch(`${base}/api/health`, { headers: { Origin: 'https://attacker.example' } });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/api/health`, { headers: { Origin: 'null' } }); assert.equal(response.status, 403);
  response = await fetch(`${base}/api/setup`, { headers: { Origin: extension } }); assert.equal(response.status, 403);
  response = await fetch(`${base}/api/setup`); assert.equal(response.status, 403);
  response = await fetch(base);
  assert.equal(response.status, 200); assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  response = await fetch(`${base}/api/setup`, { headers: { Cookie: cookie } });
  const state = await response.json();
  assert.equal(state.ready, false); assert.equal(typeof state.pairingToken, 'string'); assert.equal(state.apiKey, undefined);
  const request = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  response = await request('/api/setup', { apiKey: 'sk-testing-key-for-local-only' }, { Cookie: cookie, Origin: base }); assert.equal(response.status, 403);
  response = await request('/api/setup', { apiKey: 'sk-testing-key-for-local-only' }, { Cookie: cookie, Origin: base, 'X-CSRF-Token': state.csrfToken }); assert.equal(response.status, 200);
  assert.equal(calls, 0, 'Saving settings never sends a provider request');
  const disk = await readFile(join(directory, '.local/config.json'), 'utf8');
  assert.match(disk, /sk-testing-key-for-local-only/);
  assert.equal((await stat(join(directory, '.local/config.json'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(directory, '.local'))).mode & 0o777, 0o700);
  response = await request('/api/generate', sample(), { Origin: extension }); assert.equal(response.status, 401);
  response = await request('/api/generate', sample(), { Origin: extension, Authorization: `Bearer ${state.pairingToken}` });
  assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), extension);
  assert.equal((await response.json()).result.suggestions.length, 3);
  assert.equal(calls, 1); assert.equal(providerPayload.store, false); assert.equal(providerPayload.tools, undefined);
  assert.equal(providerPayload.text.format.type, 'json_schema'); assert.equal(providerPayload.text.format.strict, true);
  assert.match(providerPayload.instructions, /untrusted source material/);
  response = await fetch(`${base}/api/health`, { headers: { Origin: extension } });
  const healthText = await response.text(); assert.doesNotMatch(healthText, /sk-testing|pairingToken|csrfToken/);
  response = await request('/api/setup/rotate', {}, { Cookie: cookie, Origin: base, 'X-CSRF-Token': state.csrfToken });
  const rotated = await response.json(); assert.notEqual(rotated.pairingToken, state.pairingToken);
  response = await request('/api/generate', sample(), { Authorization: `Bearer ${state.pairingToken}` }); assert.equal(response.status, 401);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/health`, { headers: { Host: `attacker.example:${address.port}` } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject);
  });
  assert.equal(hostStatus, 403, 'Host guard blocks DNS rebinding');
});

test('unconfigured server never generates fabricated suggestions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'wac-no-key-'));
  let called = false;
  const bridge = await createBridge({ configPath: join(directory, '.local/config.json'), env: {}, ffmpeg: null, port: 0, fetchImpl: async () => { called = true; throw new Error('Must not run'); } });
  const { port } = await bridge.listen();
  t.after(async () => { await bridge.close(); await rm(directory, { recursive: true, force: true }); });
  const response = await fetch(`http://127.0.0.1:${port}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridge.config.get().pairingToken}` }, body: JSON.stringify(sample()) });
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'NOT_CONFIGURED'); assert.equal(called, false);
});

test('setup link permits top-level HTML navigation while cross-site fetches and API navigation stay blocked', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'wac-setup-navigation-'));
  const bridge = await createBridge({ configPath: join(directory, '.local/config.json'), env: {}, ffmpeg: null, port: 0, fetchImpl: async () => { throw new Error('Setup navigation must not call AI'); } });
  const { port } = await bridge.listen(), base = `http://127.0.0.1:${port}`;
  t.after(async () => { await bridge.close(); await rm(directory, { recursive: true, force: true }); });
  // Raw HTTP preserves browser Fetch Metadata exactly; Node fetch sets its own mode.
  const request = (path, headers, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request(`${base}${path}`, { method, headers }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    }); req.on('error', reject); req.end();
  });
  const navigation = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-User': '?1', Accept: 'text/html,application/xhtml+xml' };
  const page = await request('/', navigation);
  assert.equal(page.status, 200); assert.match(page.headers['content-type'], /text\/html/); assert.match(page.body, /Threadlight/);
  assert.match(page.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  const cookie = page.headers['set-cookie'][0].split(';')[0];
  const extension = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const extensionPage = await request('/', { ...navigation, Origin: extension });
  assert.equal(extensionPage.status, 200); assert.equal(extensionPage.headers['access-control-allow-origin'], undefined, 'Navigation exception must not grant CORS access to setup');
  assert.equal((await request('/', { ...navigation, 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty' })).status, 403);
  assert.equal((await request('/', { ...navigation, 'Sec-Fetch-Dest': 'iframe' })).status, 403);
  assert.equal((await request('/', { ...navigation, Accept: 'application/json' })).status, 403);
  assert.equal((await request('/', navigation, 'POST')).status, 403);
  assert.equal((await request('/', { ...navigation, Host: `untrusted.example:${port}` })).status, 403);
  assert.equal((await request('/', { ...navigation, Origin: 'https://untrusted.example' })).status, 403);
  for (const path of ['/api/setup', '/api/health', '/api/generate', '/setup.js']) assert.equal((await request(path, { ...navigation, Cookie: cookie })).status, 403, `${path} must not inherit the navigation exception`);
  assert.equal((await request('/api/setup', { ...navigation, Origin: extension, Cookie: cookie })).status, 403);
  const stateResponse = await fetch(`${base}/api/setup`, { headers: { Cookie: cookie } });
  assert.equal(stateResponse.status, 200, 'The new page can initialize its same-origin setup session');
  const state = await stateResponse.json();
  const csrfFailure = await fetch(`${base}/api/setup`, { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': `${state.csrfToken}-invalid` }, body: '{}' });
  assert.equal(csrfFailure.status, 403, 'Setup mutations still require the session CSRF token');
});

test('generation flushes headers before the model resolves and streams valid JSON for success or failure', async t => {
  for (const fail of [false, true]) {
    await t.test(fail ? 'provider error after headers' : 'successful delayed generation', async t => {
      const directory = await mkdtemp(join(tmpdir(), 'wac-heartbeat-'));
      let release, resolved = false;
      const pending = new Promise(resolve => { release = resolve; });
      const bridge = await createBridge({ configPath: join(directory, '.local/config.json'), env: { OPENAI_API_KEY: 'sk-test-no-paid-requests' }, ffmpeg: null, port: 0, heartbeatMs: 20, fetchImpl: async () => {
        await pending; resolved = true;
        if (fail) throw new Error('Private provider detail');
        return responseFor(result());
      } });
      const { port } = await bridge.listen();
      t.after(async () => { release(); await bridge.close(); await rm(directory, { recursive: true, force: true }); });
      const response = await fetch(`http://127.0.0.1:${port}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridge.config.get().pairingToken}` }, body: JSON.stringify(sample()), signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, 200); assert.equal(resolved, false, 'Headers must arrive while the model is still pending');
      const reader = response.body.getReader();
      const first = await reader.read();
      assert.match(new TextDecoder().decode(first.value), /^\s+$/, 'Pending model emits harmless JSON whitespace');
      assert.equal(resolved, false);
      release();
      const chunks = [first.value];
      while (true) { const next = await reader.read(); if (next.done) break; chunks.push(next.value); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(body.ok, !fail);
      if (fail) { assert.equal(body.code, 'PROVIDER_UNREACHABLE'); assert.doesNotMatch(body.error, /Private provider detail/); }
      else assert.equal(body.result.suggestions.length, 3);
    });
  }
});


test('simultaneous request bodies cannot bypass the two-generation limit', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'threadlight-limit-'));
  let release, accepted = 0, received = 0, allReceived;
  const providerPending = new Promise(resolve => { release = resolve; });
  const requestsReceived = new Promise(resolve => { allReceived = resolve; });
  const bridge = await createBridge({ configPath: join(directory, 'config.json'), env: { OPENAI_API_KEY: 'sk-test-no-network' }, ffmpeg: null, port: 0, fetchImpl: async () => {
    accepted++; await providerPending; return responseFor(result());
  } });
  bridge.server.on('request', () => { if (++received === 3) allReceived(); });
  const { port } = await bridge.listen();
  t.after(async () => { release(); await bridge.close(); await rm(directory, { recursive: true, force: true }); });
  const body = JSON.stringify(sample());
  const requests = Array.from({ length: 3 }, () => {
    let request;
    const status = new Promise((resolve, reject) => {
      request = http.request({ hostname: '127.0.0.1', port, path: '/api/generate', method: 'POST', headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: `Bearer ${bridge.config.get().pairingToken}`,
      } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject); request.flushHeaders();
    });
    return { request, status };
  });
  await requestsReceived;
  for (const { request } of requests) request.end(body);
  const statuses = await Promise.all(requests.map(({ status }) => status));
  assert.deepEqual(statuses.sort(), [200, 200, 429]);
  assert.equal(accepted, 2);
  release();
});

export { sample, result, responseFor };
