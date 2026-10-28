/** Synthetic adapter regression; no WhatsApp or AI network access. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.COPILOT_PLAYWRIGHT || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true, ...(process.env.COPILOT_CHROMIUM ? { executablePath: process.env.COPILOT_CHROMIUM } : {}) });
const page = await browser.newPage();
let passed = 0;
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const fixture = `<!doctype html><html><body><nav><button id="other">Another Sam</button></nav>
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
const snapshot = () => page.evaluate(() => { const s = WACopilot.adapter.getSnapshot(); return { chat: s.chat, messages: s.messages, draft: s.draft, binding: s.binding }; });
const bind = () => page.evaluate(() => WACopilot.adapter.bindConversation('+1 202-555-0123'));
const check = async (name, fn) => { await reset(); await fn(); passed++; console.log(`PASS ${name}`); };
try {
  await check('opaque IDs keep messages available but require explicit identity', async () => {
    const s = await snapshot();
    assert.equal(s.chat, null); assert.equal(s.binding.required, true); assert.equal(s.binding.canBind, true);
    assert.equal(s.binding.name, 'Sam'); assert.equal(s.binding.suggestedPhone, '');
    assert.deepEqual(s.messages.map(m => m.direction), ['in', 'out', 'in']);
    assert.deepEqual(s.messages.map(m => m.id), ['OPAQUEIN001', 'OPAQUEOUT002', 'album-OPAQUEA-OPAQUEB-4']);
    assert.equal(s.messages[0].text, 'Their wording.'); assert.equal(s.messages[1].text, 'My wording.');
    assert.equal(s.messages[2].kind, 'image'); assert.match(s.messages[2].text, /contents not captured/);
  });
  await check('manual phone binding validates E164 and normalizes separators', async () => {
    assert.deepEqual(await bind(), { ok: true, chat: { id: 'manual:phone:+12025550123', name: 'Sam' } });
    assert.equal((await snapshot()).binding.required, false);
    const invalid = await page.evaluate(() => ['2025550123', '+123', '+1234567890123456', '+0123456789', '+12025550123ext4', 'Sam +12025550123'].map(phone => { try { WACopilot.adapter.bindConversation(phone); return false; } catch { return true; } }));
    assert.ok(invalid.every(Boolean));
  });
  await check('same-name contact switch invalidates on disjoint IDs', async () => {
    await bind();
    await page.evaluate(() => document.querySelectorAll('#messages [data-id]').forEach(n => n.dataset.id = 'OTHER' + n.dataset.id));
    const s = await snapshot(); assert.equal(s.chat, null); assert.equal(s.binding.required, true); assert.match(s.binding.reason, /conversation changed/);
  });
  await check('root, header, and header-name changes invalidate binding', async () => {
    for (const kind of ['header', 'root', 'name']) {
      await reset(); await bind();
      await page.evaluate(kind => {
        if (kind === 'name') { const n = document.querySelector('header span'); n.title = 'Other person'; n.textContent = 'Other person'; }
        else { const node = document.querySelector(kind === 'root' ? '#main' : 'header'); node.replaceWith(node.cloneNode(true)); }
      }, kind);
      assert.equal((await snapshot()).chat, null);
    }
  });
  await check('outside navigation invalidates without requiring a DOM mutation', async () => {
    await bind(); await page.locator('#other').click(); assert.equal((await snapshot()).chat, null);
    await bind(); await page.evaluate(() => document.getElementById('other').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })));
    assert.equal((await snapshot()).chat, null);
  });
  await check('assistant shadow UI and composer clicks preserve current binding', async () => {
    await bind();
    await page.evaluate(() => { const shadow = document.getElementById('threadlight-root').attachShadow({ mode: 'open' }); const b = document.createElement('button'); b.textContent = 'Use'; shadow.append(b); b.click(); document.getElementById('composer').click(); });
    assert.equal((await snapshot()).chat.id, 'manual:phone:+12025550123');
  });
  await check('clearBinding and reload never restore identity from display name', async () => {
    await bind(); await page.evaluate(() => WACopilot.adapter.clearBinding()); assert.equal((await snapshot()).chat, null);
    await bind(); await reset(); assert.equal((await snapshot()).chat, null);
  });
  await check('anchor overlap permits new messages but does not learn replacement anchors', async () => {
    await bind();
    await page.evaluate(() => { const n = document.createElement('div'); n.className = 'message-in'; n.dataset.id = 'NEWINCOMING'; n.innerHTML = '<span class="selectable-text">Another message.</span>'; document.getElementById('messages').append(n); });
    assert.equal((await snapshot()).chat.id, 'manual:phone:+12025550123');
    await page.evaluate(() => document.querySelectorAll('#messages > div').forEach(n => { if (n.dataset.id !== 'NEWINCOMING') n.remove(); }));
    assert.equal((await snapshot()).chat, null);
  });
  await check('partial insertion preserves surrounding text and never sends', async () => {
    await bind();
    const result = await page.evaluate(() => {
      const box = document.getElementById('composer'), range = document.createRange();
      range.setStart(box.firstChild, 6); range.setEnd(box.firstChild, 20);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      const selected = WACopilot.adapter.getSelection(), current = WACopilot.adapter.getSnapshot();
      const inserted = WACopilot.adapter.insertDraft('review the design', { expectedChatId: current.chat.id, expectedDraft: current.draft, range: selected.range });
      return { inserted, text: box.innerText, sent, own: selected.fromComposer };
    });
    assert.equal(result.inserted.ok, true); assert.equal(result.own, true);
    assert.equal(result.text, 'Please review the design today.'); assert.equal(result.sent, 0);
  });
  await check('stale manual binding and changed draft both refuse insertion', async () => {
    await bind();
    const result = await page.evaluate(() => {
      const current = WACopilot.adapter.getSnapshot();
      document.getElementById('composer').textContent = 'My new unsaved draft';
      const changed = WACopilot.adapter.insertDraft('Wrong draft', { expectedChatId: current.chat.id, expectedDraft: current.draft });
      WACopilot.adapter.clearBinding();
      const stale = WACopilot.adapter.insertDraft('Wrong contact', { expectedChatId: current.chat.id, expectedDraft: 'My new unsaved draft' });
      return { changed, stale, text: document.getElementById('composer').innerText };
    });
    assert.equal(result.changed.ok, false); assert.equal(result.stale.ok, false); assert.equal(result.text, 'My new unsaved draft');
  });
  await check('only an exact international phone header is suggested', async () => {
    for (const [name, expected] of [['+1 202-555-0123 (You)', '+12025550123'], ['+1 202-555-0123', '+12025550123'], ['Sam +1 202-555-0123', ''], ['+1 202-555-0123 (Work)', '']]) {
      await page.evaluate(name => { const n = document.querySelector('header span'); n.title = name; n.textContent = name; }, name);
      assert.equal((await snapshot()).binding.suggestedPhone, expected);
    }
  });
  await check('missing row direction or an empty message list cannot be bound', async () => {
    await page.evaluate(() => document.getElementById('messages').innerHTML = '<div data-id="OPAQUE"><span class="selectable-text">Unclassified.</span></div>');
    const s = await snapshot(); assert.equal(s.binding.canBind, false); assert.equal(s.messages.length, 0);
    assert.equal(await page.evaluate(() => { try { WACopilot.adapter.bindConversation('+12025550123'); return false; } catch { return true; } }), true);
  });
  await check('legacy JIDs remain automatic and mixed identities fail closed', async () => {
    await page.evaluate(() => {
      document.querySelector('[data-id="OPAQUEIN001"]').dataset.id = 'false_12025550123@c.us_FIRST';
      document.querySelector('[data-id="OPAQUEOUT002"]').dataset.id = 'true_12025550123@c.us_SECOND';
    });
    assert.equal((await snapshot()).chat.id, 'wa:12025550123@c.us');
    await page.evaluate(() => document.querySelector('.message-out').dataset.id = 'true_12025550124@c.us_SECOND');
    const mixed = await snapshot(); assert.equal(mixed.chat, null); assert.equal(mixed.binding.canBind, false);
  });
  await check('binding invalidation event is deferred and stale notifications are suppressed', async () => {
    await bind();
    const result = await page.evaluate(async () => {
      let count = 0; document.addEventListener('threadlight-binding-invalidated', () => count++);
      WACopilot.adapter.clearBinding(); const synchronous = count; await Promise.resolve(); const deferred = count;
      WACopilot.adapter.bindConversation('+12025550123'); WACopilot.adapter.clearBinding(); WACopilot.adapter.bindConversation('+12025550123');
      await Promise.resolve(); return { synchronous, deferred, final: count };
    });
    assert.deepEqual(result, { synchronous: 0, deferred: 1, final: 1 });
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
    const s = await snapshot(); assert.equal(s.chat, null); assert.equal(s.binding.canBind, true);
    assert.deepEqual(s.messages.map(m => m.id), ['MODERNIN1', 'MODERNOUT2', 'album-MODERNA-MODERNB-4']);
    assert.deepEqual(s.messages.map(m => m.direction), ['in', 'out', 'in']);
    assert.equal(s.messages[0].text, 'Incoming modern message.'); assert.equal(s.messages[1].text, 'My modern message.');
    assert.match(s.messages[2].text, /image attachment/);
    assert.equal((await bind()).chat.id, 'manual:phone:+12025550123');
  });
  assert.deepEqual(errors, []);
  console.log(`\n${passed} isolated adapter binding checks passed.`);
} finally { await browser.close(); }
