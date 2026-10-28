/** Automatic displayed-name identity regression using fictional browser data only.
 * Same displayed names deliberately share an identity; this is a known product limitation.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryStore, captureMessages, LIMITS } from '../extension/memory.js';
const { chromium } = await import(process.env.COPILOT_PLAYWRIGHT || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true, ...(process.env.COPILOT_CHROMIUM ? { executablePath: process.env.COPILOT_CHROMIUM } : {}) });
const page = await browser.newPage();
let passed = 0;
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const fixture = `<!doctype html><html><body><nav><button id="other">Another contact</button></nav>
<main id="main"><header><span data-testid="conversation-info-header-chat-title" title="Sam">Sam</span></header><section id="messages">
<div data-id="OPAQUEIN001"><div class="message-in"><div data-pre-plain-text="[10:30, 28/10/2026] Sam: "><span class="selectable-text">Their wording.</span></div></div></div>
<div class="message-out" data-id="OPAQUEOUT002"><div data-pre-plain-text="[10:31, 28/10/2026] You: "><span class="selectable-text">My wording.</span></div></div>
<div class="message-in" data-id="album-OPAQUEA-OPAQUEB-4"><div data-id="NESTEDPHOTO"><span data-testid="image-thumb"></span><div class="message-in" data-id="ALBUMCHILD"><span data-testid="image-thumb"></span></div></div></div>
<div data-id="UNKNOWN"><span class="selectable-text">Unknown direction.</span></div>
<div class="message-in message-out" data-id="AMBIGUOUS"><span class="selectable-text">Ambiguous direction.</span></div>
</section><footer><div id="composer" role="textbox" contenteditable="true">Please fix this bit today.</div><button id="send">Send</button></footer></main><div id="threadlight-root"></div></body></html>`;
async function reset() {
  await page.goto('about:blank'); await page.setContent(fixture);
  await page.evaluate(() => { window.sent = 0; document.getElementById('send').onclick = () => window.sent++; });
  await page.addScriptTag({ path: path.join(root, 'extension/adapter.js') });
}
const snapshot = () => page.evaluate(() => { const s = WACopilot.adapter.getSnapshot(); return { chat: s.chat, messages: s.messages, draft: s.draft, viewId: s.viewId }; });
const rename = name => page.evaluate(name => { const n = document.querySelector('header span'); n.title = name; n.textContent = name; }, name);
const check = async (name, fn) => { await reset(); await fn(); passed++; console.log(`PASS ${name}`); };
try {
  await check('displayed name automatically supplies the conversation identity', async () => {
    const s = await snapshot(); assert.deepEqual(s.chat, { id: 'name:Sam', name: 'Sam' });
    assert.deepEqual(s.messages.map(m => m.direction), ['in', 'out', 'in']);
    assert.deepEqual(s.messages.map(m => m.id), ['OPAQUEIN001', 'OPAQUEOUT002', 'album-OPAQUEA-OPAQUEB-4']);
    assert.equal(s.messages[0].text, 'Their wording.'); assert.equal(s.messages[1].text, 'My wording.');
    assert.equal(s.messages[2].kind, 'image'); assert.match(s.messages[2].text, /contents not captured/);
  });
  await check('oversized DOM messages are explicitly shortened without losing regular rows or splitting Unicode', async () => {
    const originals = ['🙂'.repeat(8000), 'A' + '🙂'.repeat(8000)];
    await page.evaluate(values => {
      for (const [index, value] of values.entries()) {
        const row = document.createElement('div'); row.className = index ? 'message-out' : 'message-in'; row.dataset.id = 'LONG' + index;
        const span = document.createElement('span'); span.className = 'selectable-text'; span.textContent = value; row.append(span); document.getElementById('messages').append(row);
      }
    }, originals);
    const s = await snapshot(); assert.equal(s.messages.length, 5);
    assert.equal(s.messages[0].text, 'Their wording.'); assert.equal(s.messages[1].text, 'My wording.');
    for (const [index, original] of originals.entries()) {
      const body = s.messages.find(message => message.id === 'LONG' + index).text;
      assert.ok(body.length <= LIMITS.messageText);
      assert.match(body, /\n\[Message truncated: remaining text was not captured\.\]$/);
      const prefix = body.slice(0, body.lastIndexOf('\n['));
      assert.equal(prefix, original.slice(0, prefix.length)); assert.ok(body.isWellFormed());
    }
    const captured = captureMessages(createMemoryStore(), 'Personal', s.chat, s.messages);
    assert.equal(captured.memory.messages.length, 5, 'The real storage transaction accepts regular and bounded messages together');
    assert.throws(() => captureMessages(createMemoryStore(), 'Personal', s.chat, [{ id: 'raw-import', direction: 'in', text: originals[0] }]), /Message text/, 'Raw imports retain strict validation');
  });
  await check('a message exactly at the storage limit is retained without a truncation notice', async () => {
    const original = 'x'.repeat(LIMITS.messageText - 2) + '🙂';
    await page.evaluate(value => { document.querySelector('.message-out .selectable-text').textContent = value; }, original);
    const s = await snapshot(); assert.equal(s.messages.find(message => message.direction === 'out').text, original);
    assert.equal(captureMessages(createMemoryStore(), 'Personal', s.chat, s.messages).memory.messages.length, 3);
  });
  await check('name identity normalizes Unicode NFC and whitespace while preserving case', async () => {
    await rename('  Jose\u0301\u00a0\n  Rao  ');
    assert.deepEqual((await snapshot()).chat, { id: 'name:José Rao', name: 'José Rao' });
    await rename('JOSÉ Rao'); assert.equal((await snapshot()).chat.id, 'name:JOSÉ Rao');
    await rename('josé Rao'); assert.equal((await snapshot()).chat.id, 'name:josé Rao');
  });
  await check('normalized display names are capped to the memory-compatible 160 characters', async () => {
    await rename('A'.repeat(170));
    const chat = (await snapshot()).chat; assert.equal(chat.name, 'A'.repeat(160)); assert.equal(chat.id, 'name:' + 'A'.repeat(160));
  });
  await check('same name retains identity across reload, root replacement, and scrolled message windows', async () => {
    const expected = (await snapshot()).chat.id;
    await reset(); assert.equal((await snapshot()).chat.id, expected);
    await page.evaluate(() => { const root = document.getElementById('main'); root.replaceWith(root.cloneNode(true)); });
    assert.equal((await snapshot()).chat.id, expected);
    await page.evaluate(() => document.querySelectorAll('#messages [data-id]').forEach(n => n.dataset.id = 'OLDER' + n.dataset.id));
    assert.equal((await snapshot()).chat.id, expected);
  });
  await check('different displayed names and a renamed contact receive different identities', async () => {
    const first = (await snapshot()).chat.id;
    await rename('Alex'); const second = (await snapshot()).chat.id;
    assert.equal(second, 'name:Alex'); assert.notEqual(second, first);
    await rename('Alex Work'); assert.equal((await snapshot()).chat.id, 'name:Alex Work');
  });
  await check('two contacts with the same displayed name intentionally share the name identity', async () => {
    const before = (await snapshot()).chat.id;
    await page.evaluate(() => document.querySelectorAll('#messages [data-id]').forEach(n => n.dataset.id = 'OTHERPERSON' + n.dataset.id));
    assert.equal((await snapshot()).chat.id, before);
  });
  await check('old mounted rows are excluded after a header transition, while new rows and reloads work', async () => {
    assert.equal((await snapshot()).messages.length, 3);
    await rename('Other');
    const transitioning = await snapshot(); assert.equal(transitioning.chat.id, 'name:Other'); assert.deepEqual(transitioning.messages, []);
    await page.evaluate(() => document.querySelectorAll('#messages [data-id]').forEach(n => n.dataset.id = 'NEWCONTACT' + n.dataset.id));
    assert.equal((await snapshot()).messages.length, 3);
    await reset(); await rename('Other');
    const reloaded = await snapshot(); assert.equal(reloaded.chat.id, 'name:Other'); assert.equal(reloaded.messages.length, 3);
  });
  await check('an absent or empty header and absent main never produce a guessed identity', async () => {
    await rename('   '); assert.equal((await snapshot()).chat, null);
    await reset(); await page.evaluate(() => document.querySelector('#main header').remove()); assert.equal((await snapshot()).chat, null);
    await reset(); await page.evaluate(() => document.getElementById('main').remove()); assert.equal((await snapshot()).chat, null);
  });
  await check('there is no manual phone API and navigation preserves the storage identity', async () => {
    const result = await page.evaluate(() => ({ bind: typeof WACopilot.adapter.bindConversation, clear: typeof WACopilot.adapter.clearBinding }));
    assert.deepEqual(result, { bind: 'undefined', clear: 'undefined' });
    await page.locator('#other').click(); assert.equal((await snapshot()).chat.id, 'name:Sam');
  });
  await check('partial draft insertion preserves surrounding text and never sends', async () => {
    const result = await page.evaluate(() => {
      const box = document.getElementById('composer'), range = document.createRange();
      range.setStart(box.firstChild, 6); range.setEnd(box.firstChild, 20);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      const selected = WACopilot.adapter.getSelection(), current = WACopilot.adapter.getSnapshot();
      const inserted = WACopilot.adapter.insertDraft('review the design', { expectedChatId: current.chat.id, expectedDraft: current.draft, expectedViewId: current.viewId, range: selected.range });
      return { inserted, text: box.innerText, sent, own: selected.fromComposer };
    });
    assert.equal(result.inserted.ok, true); assert.equal(result.own, true);
    assert.equal(result.text, 'Please review the design today.'); assert.equal(result.sent, 0);
  });
  await check('changed draft or changed displayed name refuses stale draft insertion', async () => {
    const result = await page.evaluate(() => {
      const current = WACopilot.adapter.getSnapshot();
      document.getElementById('composer').textContent = 'My new unsaved draft';
      const changed = WACopilot.adapter.insertDraft('Wrong draft', { expectedChatId: current.chat.id, expectedDraft: current.draft });
      const header = document.querySelector('header span'); header.title = 'Alex'; header.textContent = 'Alex';
      const stale = WACopilot.adapter.insertDraft('Wrong contact', { expectedChatId: current.chat.id, expectedDraft: 'My new unsaved draft' });
      return { changed, stale, text: document.getElementById('composer').innerText };
    });
    assert.equal(result.changed.ok, false); assert.equal(result.stale.ok, false); assert.equal(result.text, 'My new unsaved draft');
  });
  await check('mixed legacy identities still wait instead of using the current name immediately', async () => {
    await page.evaluate(() => {
      document.querySelector('[data-id="OPAQUEIN001"]').dataset.id = 'false_12025550123@c.us_FIRST';
      document.querySelector('[data-id="OPAQUEOUT002"]').dataset.id = 'true_12025550123@c.us_SECOND';
    });
    assert.equal((await snapshot()).chat.id, 'name:Sam');
    await page.evaluate(() => document.querySelector('.message-out').dataset.id = 'true_12025550124@c.us_SECOND');
    assert.equal((await snapshot()).chat, null);
  });
  await check('observed conv-msg wrappers use explicit tail markers without message classes', async () => {
    await page.evaluate(() => {
      document.getElementById('messages').innerHTML = `
        <div role="row"><div class="x1n2onr6 xscbp6u" data-id="MODERNIN1" data-testid="conv-msg-MODERNIN1"><div data-testid="msg-container"><span data-testid="tail-in"></span><span data-testid="selectable-text">Incoming modern message.</span></div></div></div>
        <div role="row"><div class="x1n2onr6 xscbp6u" data-id="MODERNOUT2" data-testid="conv-msg-MODERNOUT2"><div data-testid="msg-container"><span data-testid="tail-out"></span><span data-testid="selectable-text">My modern message.</span></div></div></div>
        <div role="row"><div data-id="MODERNUNKNOWN3" data-testid="conv-msg-MODERNUNKNOWN3"><div data-testid="msg-container"><span data-testid="selectable-text">Direction unknown; omit.</span></div></div></div>
        <div role="row"><div data-id="MODERNCONFLICT4" data-testid="conv-msg-MODERNCONFLICT4"><span data-testid="tail-in"></span><span data-testid="tail-out"></span><span data-testid="selectable-text">Conflicting direction; omit.</span></div></div>
        <div role="row"><div data-id="album-MODERNA-MODERNB-4" data-testid="conv-msg-album-MODERNA-MODERNB-4"><div data-testid="msg-container"><span data-testid="tail-in"></span><span data-testid="image-thumb"></span><div data-id="ALBUMNESTED" data-testid="conv-msg-ALBUMNESTED"><span data-testid="tail-in"></span><span data-testid="image-thumb"></span></div></div></div></div>`;
    });
    assert.equal(await page.locator('.message-in,.message-out').count(), 0);
    const s = await snapshot(); assert.equal(s.chat.id, 'name:Sam');
    assert.deepEqual(s.messages.map(m => m.id), ['MODERNIN1', 'MODERNOUT2', 'album-MODERNA-MODERNB-4']);
    assert.deepEqual(s.messages.map(m => m.direction), ['in', 'out', 'in']);
    assert.equal(s.messages[0].text, 'Incoming modern message.'); assert.equal(s.messages[1].text, 'My modern message.');
    assert.match(s.messages[2].text, /image attachment/);
  });
  await check('same-name contact with identical draft refuses stale-view insertion', async () => {
    const result = await page.evaluate(() => {
      const previous = WACopilot.adapter.getSnapshot();
      document.querySelectorAll('#messages [data-id]').forEach(n => n.dataset.id = 'OTHERPERSON' + n.dataset.id);
      const current = WACopilot.adapter.getSnapshot();
      const inserted = WACopilot.adapter.insertDraft('Wrong person suggestion', { expectedChatId: previous.chat.id, expectedDraft: previous.draft, expectedViewId: previous.viewId });
      return { previous: { id: previous.chat.id, draft: previous.draft, viewId: previous.viewId }, current: { id: current.chat.id, draft: current.draft, viewId: current.viewId }, inserted, after: document.getElementById('composer').innerText };
    });
    assert.equal(result.previous.id, result.current.id); assert.equal(result.previous.draft, result.current.draft);
    assert.ok(result.current.viewId > result.previous.viewId); assert.equal(result.inserted.ok, false);
    assert.match(result.inserted.error, /view changed/); assert.equal(result.after, result.previous.draft);
  });
  await check('view identity remains stable for edited and newly appended messages with overlap', async () => {
    const before = await snapshot();
    await page.evaluate(() => {
      document.querySelector('.message-out .selectable-text').textContent = 'An edited message';
      const n = document.createElement('div'); n.dataset.id = 'NEWAPPENDED'; n.className = 'message-in'; n.innerHTML = '<span class="selectable-text">New message</span>'; document.getElementById('messages').append(n);
    });
    const after = await snapshot(); assert.equal(after.viewId, before.viewId); assert.equal(after.messages.length, 4);
    await page.evaluate(() => document.querySelector('[data-id="OPAQUEOUT002"]').remove());
    assert.equal((await snapshot()).viewId, before.viewId);
  });
  await check('root, header and name changes each advance the ephemeral view counter', async () => {
    for (const kind of ['root', 'header', 'name']) {
      await reset(); const before = await snapshot();
      await page.evaluate(kind => {
        if (kind === 'name') { const n = document.querySelector('header span'); n.title = 'Other'; n.textContent = 'Other'; }
        else { const n = document.querySelector(kind === 'root' ? '#main' : 'header'); n.replaceWith(n.cloneNode(true)); }
      }, kind);
      assert.ok((await snapshot()).viewId > before.viewId);
    }
  });
  await check('different available legacy JID advances the view even with an overlapping album', async () => {
    await page.evaluate(() => {
      document.querySelector('[data-id="OPAQUEIN001"]').dataset.id = 'false_12025550123@c.us_ONE';
      document.querySelector('[data-id="OPAQUEOUT002"]').dataset.id = 'true_12025550123@c.us_TWO';
    });
    const before = await snapshot();
    await page.evaluate(() => document.querySelectorAll('#messages [data-id]').forEach(n => { n.dataset.id = n.dataset.id.replace('12025550123@c.us', '12025550124@c.us'); }));
    const after = await snapshot(); assert.ok(after.viewId > before.viewId); assert.equal(after.chat.id, before.chat.id);
  });
  await check('outside navigation advances the view while assistant and composer clicks do not', async () => {
    const before = await snapshot();
    await page.evaluate(() => {
      const shadow = document.getElementById('threadlight-root').attachShadow({ mode: 'open' });
      const b = document.createElement('button'); b.textContent = 'Use'; shadow.append(b); b.click(); document.getElementById('composer').click();
    });
    assert.equal((await snapshot()).viewId, before.viewId);
    await page.evaluate(() => {
      const search = document.createElement('input'); search.id = 'contact-search'; search.type = 'search';
      document.querySelector('nav').append(search);
      const editable = document.createElement('div'); editable.id = 'editable-search'; editable.contentEditable = 'true'; editable.setAttribute('role', 'textbox'); editable.textContent = 'Search'; document.querySelector('nav').append(editable);
    });
    await page.locator('#contact-search').click(); await page.locator('#editable-search').click();
    assert.equal((await snapshot()).viewId, before.viewId, 'Focusing sidebar search controls keeps the active conversation');
    await page.locator('#other').click();
    const after = await snapshot(); assert.ok(after.viewId > before.viewId); assert.equal(after.chat.id, before.chat.id);
  });
  assert.deepEqual(errors, []);
  console.log(`\n${passed} isolated automatic-name identity checks passed.`);
} finally { await browser.close(); }
