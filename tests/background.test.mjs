import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackground, buildCalendarUrl, validateSettings, STORAGE_KEYS } from '../extension/background.js';
import { validateInput } from '../server/validation.mjs';
import { createMemoryStore, captureMessages, scopeKey } from '../extension/memory.js';

const chat = { id: 'person@c.us', name: 'Person' };
const extensionId = 'a'.repeat(32);
const content = { id: extensionId, url: 'https://web.whatsapp.com/', tab: { id: 1 }, frameId: 0 };
const options = { id: extensionId, url: `chrome-extension://${extensionId}/options.html` };
const aiResult = () => ({ suggestions: [], feedback: [], commitments: [], explanation: '', event: null, mediaNotes: [] });
const request = () => ({ type: 'GENERATE', chat, mode: 'reply', text: '', prompt: '', attachments: [], now: '2026-10-28T09:00:00Z', timeZone: 'Asia/Kolkata' });

function harness({ saved = {}, fetchImpl, timers, setImpl } = {}) {
  const data = structuredClone(saved);
  const tabs = [];
  const broadcasts = [];
  const accesses = [];
  const writes = [];
  let networkCalls = 0;
  const chromeApi = {
    runtime: { id: extensionId, getURL: path => `chrome-extension://${extensionId}/${path}`, openOptionsPage: async () => {} },
    storage: {
      local: { setAccessLevel: async value => accesses.push(['local', value]), get: async () => structuredClone(data), set: async value => { writes.push(structuredClone(value)); if (setImpl) await setImpl(value); Object.assign(data, structuredClone(value)); } },
      session: { setAccessLevel: async value => accesses.push(['session', value]) },
    },
    tabs: { create: async value => tabs.push(value), query: async () => [{ id: 1 }], sendMessage: async (id, value) => broadcasts.push({ id, value }) },
  };
  const fetcher = async (...args) => { networkCalls++; return fetchImpl ? fetchImpl(...args) : { ok: true, json: async () => ({ ok: true, result: aiResult() }) }; };
  const background = createBackground({ chromeApi, fetchImpl: fetcher, ...(timers ? { timers } : {}) });
  return { background, data, tabs, broadcasts, accesses, writes, networkCalls: () => networkCalls, chromeApi };
}
const paired = { bridgeUrl: 'http://127.0.0.1:4318', pairingToken: 'secret-pairing-token', accountLabel: 'Personal' };

test('content scripts cannot read or modify the pairing token, including through GET_STATE', async () => {
  const h = harness({ saved: { [STORAGE_KEYS.settings]: paired } });
  await h.background.ready;
  assert.ok(h.accesses.every(([, value]) => value.accessLevel === 'TRUSTED_CONTEXTS'));
  assert.equal((await h.background.handleMessage({ type: 'GET_SETTINGS' }, content)).ok, false);
  assert.equal((await h.background.handleMessage({ type: 'SAVE_SETTINGS', settings: paired }, content)).ok, false);
  const state = await h.background.handleMessage({ type: 'GET_STATE', chat }, content);
  assert.equal(JSON.stringify(state).includes('secret-pairing-token'), false);
  assert.equal((await h.background.handleMessage({ type: 'GET_SETTINGS' }, options)).settings.pairingToken, paired.pairingToken);
});

test('foreign pages, child frames, and other extensions cannot issue requests', async () => {
  const h = harness();
  for (const sender of [{ ...content, url: 'https://evil.example' }, { ...content, frameId: 1 }, { ...content, id: 'other-extension' }, { ...options, url: `${options.url}?fake=true` }]) {
    assert.equal((await h.background.handleMessage({ type: 'GET_STATE', chat }, sender)).ok, false);
  }
  assert.equal(h.networkCalls(), 0);
});

test('loading, capturing, and acceptance do not make automatic external requests', async () => {
  const h = harness();
  await h.background.handleMessage({ type: 'GET_STATE', chat }, content);
  await h.background.handleMessage({ type: 'CAPTURE', chat, messages: [{ id: '1', text: 'Hello', direction: 'out', sender: 'Me', timestamp: '', kind: 'text' }] }, content);
  await h.background.handleMessage({ type: 'ACCEPT', chat, original: 'helo', suggestion: { text: 'hello' }, action: 'copy', feedback: [] }, content);
  assert.equal(h.networkCalls(), 0);
  const restarted = harness({ saved: h.data });
  assert.equal((await restarted.background.handleMessage({ type: 'GET_STATE', chat }, content)).stats.acceptedRewrites, 1);
});

test('failed persistence does not leave a misleading worker-only memory update', async () => {
  const h = harness();
  await h.background.ready;
  h.chromeApi.storage.local.set = async () => { throw new Error('Storage quota exceeded'); };
  const result = await h.background.handleMessage({ type: 'CAPTURE', chat, messages: [{ id: '1', text: 'Unsaved draft', direction: 'out' }] }, content);
  assert.equal(result.ok, false);
  assert.equal((await h.background.handleMessage({ type: 'GET_STATE', chat }, content)).memory.messages.length, 0);
});

test('generation sends only the selected account/chat context and uses Bearer auth', async () => {
  let body, headers;
  const h = harness({ saved: { [STORAGE_KEYS.settings]: paired }, fetchImpl: async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:4318/api/generate');
    body = JSON.parse(init.body); headers = init.headers;
    return { ok: true, json: async () => ({ ok: true, result: aiResult() }) };
  } });
  await h.background.handleMessage({ type: 'CAPTURE', chat, messages: [{ id: '1', text: 'Allowed context', direction: 'out' }] }, content);
  await h.background.handleMessage({ type: 'CAPTURE', chat: { id: 'someone-else', name: 'Person' }, messages: [{ id: '2', text: 'Other person secret', direction: 'in' }] }, content);
  const result = await h.background.handleMessage(request(), content);
  assert.equal(result.ok, true);
  assert.equal(headers.Authorization, `Bearer ${paired.pairingToken}`);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].text, 'Allowed context');
  assert.equal(JSON.stringify(body).includes('Other person secret'), false);
  assert.doesNotThrow(() => validateInput(body));
});

test('writing feedback is opt-in and only for a rewrite of confirmed own writing', async () => {
  const flags = [];
  const h = harness({ saved: { [STORAGE_KEYS.settings]: paired }, fetchImpl: async (_url, init) => {
    flags.push(JSON.parse(init.body).trackWriting);
    return { ok: true, json: async () => ({ ok: true, result: { ...aiResult(), feedback: [{ category: 'Grammar', original: 'I has', improved: 'I have', reason: 'Agreement' }] } }) };
  } });
  assert.equal((await h.background.handleMessage({ ...request(), mode: 'rewrite', text: 'I has' }, content)).result.feedback.length, 0);
  assert.equal((await h.background.handleMessage({ ...request(), mode: 'rewrite', text: 'I has', trackWriting: true }, content)).result.feedback.length, 1);
  assert.equal((await h.background.handleMessage({ ...request(), trackWriting: true }, content)).result.feedback.length, 0);
  assert.deepEqual(flags, [false, true, false]);
});

test('raw selected-message timestamps pass through without guessing their locale', async () => {
  let sourceTimestamp;
  const h = harness({ saved: { [STORAGE_KEYS.settings]: paired }, fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    sourceTimestamp = body.sourceTimestamp;
    assert.doesNotThrow(() => validateInput(body));
    return { ok: true, json: async () => ({ ok: true, result: aiResult() }) };
  } });
  const result = await h.background.handleMessage({ ...request(), mode: 'explain', text: 'Meet tomorrow', sourceTimestamp: '10:30, 28/10/2026' }, content);
  assert.equal(result.ok, true);
  assert.equal(sourceTimestamp, '10:30, 28/10/2026');
});

test('forgetting during generation prevents an in-flight commitment from restoring deleted memory', async () => {
  let resolveResponse;
  const h = harness({ saved: { [STORAGE_KEYS.settings]: paired }, fetchImpl: () => new Promise(resolve => { resolveResponse = resolve; }) });
  const pending = h.background.handleMessage(request(), content);
  while (!resolveResponse) await new Promise(resolve => setImmediate(resolve));
  await h.background.handleMessage({ type: 'FORGET_CHAT', chat }, content);
  resolveResponse({ ok: true, json: async () => ({ ok: true, result: { ...aiResult(), commitments: [{ title: 'Private task', due: '', owner: 'Me', source: '' }] } }) });
  assert.equal((await pending).ok, true);
  assert.equal((await h.background.handleMessage({ type: 'GET_STATE', chat }, content)).memory.tasks.length, 0);
});

test('changing account namespace isolates future reads and generation', async () => {
  const h = harness({ saved: { [STORAGE_KEYS.settings]: paired } });
  await h.background.handleMessage({ type: 'CAPTURE', chat, messages: [{ id: '1', text: 'Personal secret', direction: 'out' }] }, content);
  await h.background.handleMessage({ type: 'SAVE_SETTINGS', settings: { ...paired, accountLabel: 'Work' } }, options);
  const state = await h.background.handleMessage({ type: 'GET_STATE', chat }, content);
  assert.equal(state.settings.accountLabel, 'Work');
  assert.equal(state.memory.messages.length, 0);
  assert.deepEqual(h.broadcasts, [{ id: 1, value: { type: 'UI_ACCOUNT_CHANGED' } }]);
});

test('stale accepted suggestions and generation requests cannot cross an account switch', async () => {
  const h = harness({ saved: { [STORAGE_KEYS.settings]: paired } });
  await h.background.handleMessage({ type: 'SAVE_SETTINGS', settings: { ...paired, accountLabel: 'Work' } }, options);
  const accepted = await h.background.handleMessage({ type: 'ACCEPT', accountLabel: 'Personal', chat, original: 'I has', suggestion: { text: 'I have' }, action: 'copy', feedback: [{ category: 'Grammar' }] }, content);
  const generated = await h.background.handleMessage({ ...request(), accountLabel: 'Personal' }, content);
  assert.equal(accepted.ok, false);
  assert.equal(generated.ok, false);
  assert.match(accepted.error, /account changed/);
  assert.match(generated.error, /account changed/);
  assert.equal(h.networkCalls(), 0);
  const state = await h.background.handleMessage({ type: 'GET_STATE', chat }, content);
  assert.equal(state.stats.acceptedRewrites, 0);
});

test('account switch settings persist when a WhatsApp tab cannot receive its reset message', async () => {
  const h = harness({ saved: { [STORAGE_KEYS.settings]: paired } });
  h.chromeApi.tabs.sendMessage = async () => { throw new Error('Tab unavailable'); };
  const result = await h.background.handleMessage({ type: 'SAVE_SETTINGS', settings: { ...paired, accountLabel: 'Work' } }, options);
  assert.equal(result.ok, true);
  assert.equal(result.settings.accountLabel, 'Work');
});

test('bridge settings reject remote hosts, embedded credentials and path-based token exfiltration', () => {
  for (const bridgeUrl of ['https://evil.example', 'http://localhost:4318', 'http://127.0.0.1:4318/redirect', 'http://user@127.0.0.1:4318', 'http://127.0.0.1:4318?target=evil', 'http://127.0.0.1:4319']) {
    assert.throws(() => validateSettings({ ...paired, bridgeUrl }));
  }
});

test('calendar draft preserves offset, encodes text, and never adds invitees or saves an event', async () => {
  const event = { title: 'Design & review', start: '2026-10-29T10:30:00+05:30', end: '2026-10-29T11:00:00+05:30', timeZone: 'Asia/Kolkata', location: 'Studio A', description: 'Check a=b & c=d', attendees: ['nobody@example.com'] };
  const url = new URL(buildCalendarUrl(event));
  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.searchParams.get('dates'), '20261029T050000Z/20261029T053000Z');
  assert.equal(url.searchParams.get('text'), event.title);
  assert.equal(url.searchParams.has('add'), false);
  assert.equal(url.toString().includes('nobody'), false);
  const h = harness();
  assert.deepEqual(await h.background.handleMessage({ type: 'OPEN_CALENDAR', event }, content), { ok: true, opened: true });
  assert.equal(h.tabs.length, 1);
  assert.equal(h.networkCalls(), 0);
});

test('ambiguous, impossible, reversed or timezone-less event dates are rejected', () => {
  const valid = { title: 'Meeting', start: '2026-10-29T10:00:00Z', end: '2026-10-29T11:00:00Z', timeZone: 'UTC' };
  for (const patch of [{ needsClarification: true }, { start: '' }, { start: '2026-02-30T10:00:00Z' }, { start: '2026-10-29T10:00:00' }, { start: '2026-10-29T25:00:00Z' }, { end: '2026-10-28T11:00:00Z' }, { timeZone: 'Unknown/Moon' }]) {
    assert.throws(() => buildCalendarUrl({ ...valid, ...patch }));
  }
});

test('Calendar account saves globally, survives restart and connection changes, and never exposes pairing credentials', async () => {
  const h = harness({ saved: { [STORAGE_KEYS.settings]: paired } });
  assert.deepEqual(await h.background.handleMessage({ type: 'GET_CALENDAR_ACCOUNT' }, content), { ok: true, calendarAccount: '' });
  const saved = await h.background.handleMessage({ type: 'SAVE_CALENDAR_ACCOUNT', calendarAccount: '  Writer+Calendar@Example.com  ', chat, accountLabel: 'Unrelated', pairingToken: 'replace-token', bridgeUrl: 'https://evil.example' }, content);
  assert.deepEqual(saved, { ok: true, calendarAccount: 'writer+calendar@example.com' });
  assert.equal(h.data[STORAGE_KEYS.settings].pairingToken, paired.pairingToken);
  assert.equal(h.data[STORAGE_KEYS.settings].bridgeUrl, paired.bridgeUrl);
  assert.equal(h.data[STORAGE_KEYS.settings].accountLabel, 'Personal');
  assert.deepEqual(h.broadcasts, [{ id: 1, value: { type: 'UI_CALENDAR_ACCOUNT_CHANGED', calendarAccount: 'writer+calendar@example.com' } }]);
  const state = await h.background.handleMessage({ type: 'GET_STATE', chat: { id: 'other-contact', name: 'Other' } }, content);
  assert.equal(state.settings.calendarAccount, 'writer+calendar@example.com');
  assert.equal(JSON.stringify(state).includes(paired.pairingToken), false);
  await h.background.handleMessage({ type: 'SAVE_SETTINGS', settings: { ...paired, accountLabel: 'Work' } }, options);
  const restarted = harness({ saved: h.data });
  assert.deepEqual(await restarted.background.handleMessage({ type: 'GET_CALENDAR_ACCOUNT' }, content), { ok: true, calendarAccount: 'writer+calendar@example.com' });
  assert.equal(h.tabs.length, 0);
  assert.equal(h.networkCalls(), 0);
});

test('reviewed Calendar events use the saved email and clearing it restores the browser default', async () => {
  const event = { title: 'Review & plan', start: '2026-10-29T10:00:00Z', end: '2026-10-29T11:00:00Z', timeZone: 'UTC', description: 'Private fictional event details' };
  const h = harness({ saved: { [STORAGE_KEYS.settings]: { ...paired, calendarAccount: 'writer+calendar@example.com' } } });
  const response = await h.background.handleMessage({ type: 'OPEN_CALENDAR', event, calendarAccount: 'ignored@example.com' }, content);
  assert.equal(response.ok, true);
  const first = new URL(h.tabs[0].url);
  assert.equal(first.origin, 'https://calendar.google.com');
  assert.equal(first.searchParams.get('authuser'), 'writer+calendar@example.com');
  assert.equal(first.searchParams.get('text'), event.title);
  assert.equal(first.searchParams.get('details'), event.description);
  assert.equal(first.searchParams.get('action'), 'TEMPLATE');
  assert.equal(first.searchParams.has('add'), false);
  assert.equal((await h.background.handleMessage({ type: 'SAVE_CALENDAR_ACCOUNT', calendarAccount: '' }, content)).ok, true);
  await h.background.handleMessage({ type: 'OPEN_CALENDAR', event }, content);
  assert.equal(new URL(h.tabs[1].url).searchParams.has('authuser'), false);
  assert.equal(h.networkCalls(), 0);
});

test('Calendar account rejects malformed and oversized addresses without changing saved settings', async () => {
  const h = harness({ saved: { [STORAGE_KEYS.settings]: { ...paired, calendarAccount: 'saved@example.com' } } });
  for (const calendarAccount of [undefined, null, {}, 0, 'missing-at.example.com', 'a b@example.com', 'person@example.com\r\nX-Test: bad', 'https://evil.example', 'a'.repeat(65) + '@example.com', 'a@' + 'x'.repeat(260) + '.com']) {
    const response = await h.background.handleMessage({ type: 'SAVE_CALENDAR_ACCOUNT', calendarAccount }, content);
    assert.equal(response.ok, false);
  }
  assert.equal((await h.background.handleMessage({ type: 'GET_CALENDAR_ACCOUNT' }, content)).calendarAccount, 'saved@example.com');
  assert.equal(h.writes.length, 0);
  assert.equal(h.broadcasts.length, 0);
  assert.equal(h.tabs.length, 0);
  assert.equal(h.networkCalls(), 0);
});

test('failed Calendar account persistence leaves the saved account and broadcasts unchanged', async () => {
  const h = harness({ saved: { [STORAGE_KEYS.settings]: { ...paired, calendarAccount: 'saved@example.com' } }, setImpl: async () => { throw new Error('Storage unavailable'); } });
  const response = await h.background.handleMessage({ type: 'SAVE_CALENDAR_ACCOUNT', calendarAccount: 'unsaved@example.com' }, content);
  assert.equal(response.ok, false);
  assert.match(response.error, /Storage unavailable/);
  assert.equal((await h.background.handleMessage({ type: 'GET_CALENDAR_ACCOUNT' }, content)).calendarAccount, 'saved@example.com');
  assert.equal(h.data[STORAGE_KEYS.settings].calendarAccount, 'saved@example.com');
  assert.equal(h.broadcasts.length, 0);
});

test('Google account chooser opens only ordinary Calendar with no event data, tokens or OAuth scopes', async () => {
  const h = harness({ saved: { [STORAGE_KEYS.settings]: { ...paired, calendarAccount: 'saved@example.com' } } });
  assert.deepEqual(await h.background.handleMessage({ type: 'OPEN_CALENDAR_ACCOUNT', text: 'Private chat', event: { title: 'Private appointment' }, continue: 'https://evil.example', scope: 'calendar' }, content), { ok: true, opened: true });
  const url = new URL(h.tabs[0].url);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.pathname, '/AccountChooser');
  assert.deepEqual([...url.searchParams], [['continue', 'https://calendar.google.com/calendar/']]);
  assert.equal(h.networkCalls(), 0);
  assert.equal(h.writes.length, 0);
  for (const type of ['GET_CALENDAR_ACCOUNT', 'SAVE_CALENDAR_ACCOUNT', 'OPEN_CALENDAR_ACCOUNT']) {
    assert.equal((await h.background.handleMessage({ type, calendarAccount: 'attacker@example.com' }, { ...content, url: 'https://evil.example' })).ok, false);
  }
  assert.equal(h.tabs.length, 1);
});

test('selected Google account is not sent to the model with conversation context', async () => {
  let body;
  const h = harness({ saved: { [STORAGE_KEYS.settings]: { ...paired, calendarAccount: 'calendar-private@example.com' } }, fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ ok: true, result: aiResult() }) };
  } });
  assert.equal((await h.background.handleMessage(request(), content)).ok, true);
  assert.equal(Object.hasOwn(body, 'calendarAccount'), false);
  assert.equal(JSON.stringify(body).includes('calendar-private@example.com'), false);
});

test('invalid or oversized attachments never leave the extension', async () => {
  const h = harness({ saved: { [STORAGE_KEYS.settings]: paired } });
  for (const attachments of [[{ name: 'bad.png', mime: 'image/png', data: 'not base64!' }], Array.from({ length: 5 }, () => ({ name: 'a.txt', mime: 'text/plain', data: 'YQ==' }))]) {
    assert.equal((await h.background.handleMessage({ ...request(), attachments }, content)).ok, false);
  }
  assert.equal(h.networkCalls(), 0);
});

test('request-only MV3 keepalive and timeout timers are cleared after success and failure', async () => {
  for (const fail of [false, true]) {
    const active = new Map();
    const intervalDelays = [];
    let nextId = 0, platformCalls = 0;
    const timers = {
      setTimeout: (fn, ms) => { const id = ++nextId; active.set(id, { fn, ms, type: 'timeout' }); return id; },
      clearTimeout: id => active.delete(id),
      setInterval: (fn, ms) => { const id = ++nextId; active.set(id, { fn, ms, type: 'interval' }); intervalDelays.push(ms); return id; },
      clearInterval: id => active.delete(id),
    };
    const h = harness({ saved: { [STORAGE_KEYS.settings]: paired }, timers, fetchImpl: async () => {
      for (const timer of active.values()) if (timer.type === 'interval') timer.fn();
      if (fail) throw new Error('Model unavailable');
      return { ok: true, json: async () => ({ ok: true, result: aiResult() }) };
    } });
    h.chromeApi.runtime.getPlatformInfo = async () => { platformCalls++; return { os: 'test' }; };
    const result = await h.background.handleMessage(request(), content);
    assert.equal(result.ok, !fail);
    assert.deepEqual(intervalDelays, [20000]);
    assert.equal(platformCalls, 1);
    assert.equal(active.size, 0);
  }
});

const legacyPerson = { id: 'wa:legacy-person@c.us', name: 'Person' };
const namedPerson = { id: 'name:Person', name: 'Person' };
function oldNameStore({ destination = false } = {}) {
  const store = createMemoryStore();
  captureMessages(store, 'Personal', legacyPerson, [{ id: 'legacy-message', text: 'Saved before name-based identity', direction: 'out' }]);
  if (destination) captureMessages(store, 'Personal', namedPerson, [{ id: 'new-message', text: 'Saved under displayed name', direction: 'out' }]);
  return store;
}

test('startup serves name history only after migration and marker are persisted', async () => {
  let releaseWrite, writeStarted;
  const started = new Promise(resolve => { writeStarted = resolve; });
  const held = new Promise(resolve => { releaseWrite = resolve; });
  const h = harness({ saved: { [STORAGE_KEYS.memory]: oldNameStore() }, setImpl: async () => { writeStarted(); await held; } });
  let responseFinished = false;
  const response = h.background.handleMessage({ type: 'GET_STATE', chat: namedPerson }, content).then(value => { responseFinished = true; return value; });
  await started; await new Promise(resolve => setImmediate(resolve));
  assert.equal(responseFinished, false, 'No response may expose unpersisted migrated state');
  assert.equal(h.data[STORAGE_KEYS.memory].nameIdentityVersion, undefined);
  releaseWrite(); await h.background.ready;
  const state = await response;
  assert.equal(state.ok, true); assert.equal(state.memory.messages[0].text, 'Saved before name-based identity');
  assert.equal(h.data[STORAGE_KEYS.memory].nameIdentityVersion, 1);
  assert.equal(Object.hasOwn(h.data[STORAGE_KEYS.memory].chats, scopeKey('Personal', legacyPerson)), false);
  assert.equal(h.writes.length, 1); assert.equal(h.networkCalls(), 0);
});

test('failed startup migration persistence rejects readiness and never exposes migrated memory', async () => {
  const original = oldNameStore();
  const h = harness({ saved: { [STORAGE_KEYS.memory]: original }, setImpl: async () => { throw new Error('Migration storage failed'); } });
  await assert.rejects(h.background.ready, /Migration storage failed/);
  for (const message of [{ type: 'GET_STATE', chat: namedPerson }, { type: 'CAPTURE', chat: namedPerson, messages: [] }, request()]) {
    const result = await h.background.handleMessage(message, content);
    assert.equal(result.ok, false); assert.match(result.error, /Migration storage failed/); assert.equal('memory' in result, false);
  }
  assert.deepEqual(h.data[STORAGE_KEYS.memory], original);
  assert.equal(h.writes.length, 1); assert.equal(h.networkCalls(), 0);
});

test('startup marker prevents preserved legacy records reappearing after forget and restart', async () => {
  const h = harness({ saved: { [STORAGE_KEYS.memory]: oldNameStore({ destination: true }) } });
  await h.background.ready; assert.equal(h.data[STORAGE_KEYS.memory].nameIdentityVersion, 1);
  assert.equal((await h.background.handleMessage({ type: 'FORGET_CHAT', chat: namedPerson }, content)).ok, true);
  const restarted = harness({ saved: h.data });
  const state = await restarted.background.handleMessage({ type: 'GET_STATE', chat: namedPerson }, content);
  assert.equal(state.ok, true); assert.equal(state.memory.messages.length, 0);
  assert.ok(restarted.data[STORAGE_KEYS.memory].chats[scopeKey('Personal', legacyPerson)]);
  assert.equal(restarted.writes.length, 0);
});

test('fresh empty startup does not persist an unnecessary memory or migration marker', async () => {
  for (const saved of [{}, { [STORAGE_KEYS.memory]: createMemoryStore() }]) {
    const h = harness({ saved }); await h.background.ready;
    assert.equal(h.writes.length, 0); assert.deepEqual(h.data, saved);
  }
});
