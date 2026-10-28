/* The DOM adapter is the only file coupled to WhatsApp's page structure. */
(() => {
  const ns = globalThis.WACopilot = globalThis.WACopilot || {};
  const clean = value => String(value || '').replace(/[\u200b\u200e\u200f]/g, '').trim();
  const normalizeName = value => clean(value).replace(/\s+/g, ' ').normalize('NFC').slice(0, 160);
  const main = () => document.querySelector('#main');
  const getComposer = root => root?.querySelector('footer [contenteditable="true"][role="textbox"], footer [contenteditable="true"][data-lexical-editor], footer [contenteditable="true"]') || null;
  const textOf = node => clean(node?.innerText ?? node?.textContent);
  const observedOwners = new Map();
  let viewId = 0, lastView = null, viewEventQueued = false;
  function advanceView(notify = true) {
    viewId++;
    if (notify && !viewEventQueued) {
      viewEventQueued = true;
      queueMicrotask(() => {
        viewEventQueued = false;
        document.dispatchEvent(new CustomEvent('threadlight-view-changed', { detail: { viewId } }));
      });
    }
  }
  function updateView({ root, header, name, identityIds }, jids) {
    const ids = new Set(identityIds), jid = jids.length === 1 ? jids[0] : null;
    const structuralChange = !lastView || root !== lastView.root || header !== lastView.header || name !== lastView.name;
    const changedJid = !!lastView?.jid && !!jid && lastView.jid !== jid;
    const disjointWindow = !!lastView?.ids.size && ids.size > 0 && ![...ids].some(id => lastView.ids.has(id));
    if (structuralChange || changedJid || disjointWindow) advanceView(!!lastView);
    lastView = { root, header, name, jid: jid || (structuralChange ? null : lastView?.jid),
      ids: ids.size ? ids : structuralChange ? new Set() : lastView.ids };
  }
  function jidFromMessageId(value) {
    return String(value || '').match(/^(?:true|false)_([^_\s]+@(?:c\.us|s\.whatsapp\.net|g\.us|lid))_/)?.[1] || null;
  }
  function headerName(header) {
    const node = header?.querySelector('[data-testid="conversation-info-header-chat-title"], [data-testid="conversation-info-header"] [title], span[title]')
      || header?.querySelector('[data-testid="conversation-info-header"] span[dir="auto"], span[dir="auto"]');
    return normalizeName(node?.getAttribute('title') || node?.textContent || '');
  }
  function readMessages(root) {
    const messages = [], identityIds = [], seen = new Set();
    if (!root) return { messages, identityIds };
    // Modern conv-msg wrappers expose direction through explicit tail markers.
    // CSS utility class names are intentionally not interpreted as direction.
    const modern = '[data-id][data-testid^="conv-msg-"]';
    const rowSelector = `.message-in, .message-out, ${modern}`;
    const rows = [...root.querySelectorAll(rowSelector)].filter(row => !row.parentElement?.closest(rowSelector));
    for (const row of rows) {
      const evidence = selector => [...row.querySelectorAll(selector)].some(node => !node.closest('[data-testid="quoted-message"], [data-testid="quoted-message-text"]'));
      const legacyIn = row.classList.contains('message-in') || evidence('.message-in');
      const legacyOut = row.classList.contains('message-out') || evidence('.message-out');
      const tailIn = evidence('[data-testid="tail-in"]'), tailOut = evidence('[data-testid="tail-out"]');
      const incoming = legacyIn || tailIn, outgoing = legacyOut || tailOut;
      if (incoming === outgoing) continue;
      const ancestor = row.closest('[data-id]');
      const node = ancestor && ancestor !== root && root.contains(ancestor) ? ancestor : row.querySelector('[data-id]');
      const id = clean(node?.getAttribute('data-id'));
      if (!id || id.length > 512 || seen.has(id)) continue;
      seen.add(id); identityIds.push(id);
      const body = row.hasAttribute('data-pre-plain-text') ? row : row.querySelector('[data-pre-plain-text]') || (node?.hasAttribute('data-pre-plain-text') ? node : null);
      const texts = [...row.querySelectorAll('.selectable-text, [data-testid="selectable-text"]')].filter(item => !item.parentElement?.closest('.selectable-text, [data-testid="selectable-text"]') && !item.closest('[data-testid="quoted-message"], [data-testid="quoted-message-text"]'));
      let text = texts.map(textOf).filter(Boolean).join('\n');
      const audio = !!row.querySelector('audio, [data-testid="audio-play"], [data-icon="audio-play"], [data-icon="ptt-play"]');
      const video = !!row.querySelector('video, [data-icon="video-play"]');
      const picture = !!row.querySelector('img[src^="blob:"], img[src^="data:"], [data-testid="image-thumb"]');
      const doc = !!row.querySelector('[data-testid="document-thumb"], [data-icon="document"]');
      const kind = audio ? 'audio' : video ? 'video' : picture ? 'image' : doc ? 'document' : 'text';
      if (!text && kind !== 'text') text = `[${kind} attachment — contents not captured; attach the file to use it]`;
      if (!text) continue;
      const prefix = body?.getAttribute('data-pre-plain-text') || '';
      const sender = prefix.replace(/^\[[^\]]*\]\s*/, '').replace(/:\s*$/, '');
      messages.push({ id, text, direction: outgoing ? 'out' : 'in', sender: clean(sender), timestamp: prefix.match(/^\[([^\]]*)\]/)?.[1] || '', kind });
    }
    return { messages, identityIds };
  }
  function inspectConversation() {
    const root = main(), header = root?.querySelector('header') || null, name = headerName(header);
    return { root, header, name, composer: getComposer(root), ...readMessages(root) };
  }
  function getSnapshot() {
    const { root, header, name, composer, messages, identityIds } = inspectConversation();
    const jids = [...new Set(identityIds.map(jidFromMessageId).filter(Boolean))];
    updateView({ root, header, name, identityIds }, jids);
    // Equal display names intentionally share history within an account.
    // Mixed legacy IDs still signal a transition: wait for it to settle.
    const chat = root && header && name && jids.length <= 1 ? { id: 'name:' + name, name } : null;
    const reason = !root ? 'Open a WhatsApp conversation first.'
      : jids.length > 1 ? 'WhatsApp is changing conversations. Wait, then try again.'
      : !header || !name ? 'The conversation header is unavailable.'
      : '';
    // A header can update before the old message rows disappear. Do not capture
    // rows already observed under a different name into the newly opened chat.
    const currentMessages = chat ? messages.filter(message => {
      const previous = observedOwners.get(message.id);
      if (previous && previous !== chat.id) return false;
      observedOwners.set(message.id, chat.id);
      if (observedOwners.size > 6000) observedOwners.delete(observedOwners.keys().next().value);
      return true;
    }) : [];
    return { chat, messages: currentMessages, draft: textOf(composer), composer, reason, viewId };
  }
  function getSelection() {
    const sel = window.getSelection(), root = main();
    if (!sel?.rangeCount || !root || !sel.toString().trim()) return { text: '', range: null, fromComposer: false, sourceTimestamp: '' };
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return { text: '', range: null, fromComposer: false, sourceTimestamp: '' };
    const composer = getComposer(root), fromComposer = !!composer?.contains(range.commonAncestorContainer);
    const node = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const row = node?.closest('[data-id], .message-in, .message-out');
    const prefix = node?.closest('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || row?.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
    return { text: sel.toString().trim(), range: range.cloneRange(), fromComposer, sourceTimestamp: prefix.match(/^\[([^\]]*)\]/)?.[1] || '' };
  }
  function insertDraft(text, { expectedChatId, expectedDraft, expectedViewId, range = null } = {}) {
    const snap = getSnapshot();
    if (!snap.chat || snap.chat.id !== expectedChatId) return { ok: false, error: 'The conversation changed. Generate suggestions in the current chat.' };
    if (expectedViewId !== undefined && expectedViewId !== snap.viewId) return { ok: false, error: 'The conversation view changed. Generate suggestions again before inserting a draft.' };
    if (!snap.composer) return { ok: false, error: 'The WhatsApp draft box is unavailable. Copy the suggestion instead.' };
    if (snap.draft !== expectedDraft) return { ok: false, error: 'Your draft changed after generation. Copy this suggestion or generate again.' };
    if (range && (!range.startContainer.isConnected || !snap.composer.contains(range.commonAncestorContainer))) return { ok: false, error: 'The selection changed. Select the draft again.' };
    snap.composer.focus();
    const selection = window.getSelection(); selection.removeAllRanges();
    if (range) selection.addRange(range);
    else { const all = document.createRange(); all.selectNodeContents(snap.composer); selection.addRange(all); }
    // Participate in the editor's input/undo path. Never press Enter or click Send.
    const selectedText = range?.toString() || '';
    const leading = range ? selectedText.match(/^\s*/)[0] : '', trailing = range ? selectedText.match(/\s*$/)[0] : '';
    const replacement = range ? leading + String(text).trim() + trailing : String(text);
    const inserted = document.execCommand('insertText', false, replacement);
    if (!inserted) return { ok: false, error: 'WhatsApp did not accept the draft. Use Copy instead.' };
    snap.composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: replacement }));
    return { ok: true };
  }
  function observeNavigation(event) {
    if (event.composedPath().some(node => node?.id === 'threadlight-root')) return;
    const root = main();
    if (!root || (event.target instanceof Node && root.contains(event.target))) return;
    advanceView();
  }
  document.addEventListener('pointerdown', observeNavigation, true);
  document.addEventListener('click', observeNavigation, true);
  ns.adapter = { getSnapshot, getSelection, insertDraft, jidFromMessageId };
})();
