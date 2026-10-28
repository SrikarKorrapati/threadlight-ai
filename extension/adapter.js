/* The DOM adapter is the only file coupled to WhatsApp's page structure. */
(() => {
  const ns = globalThis.WACopilot = globalThis.WACopilot || {};
  const clean = value => String(value || '').replace(/[\u200b\u200e\u200f]/g, '').trim();
  const main = () => document.querySelector('#main');
  const getComposer = root => root?.querySelector('footer [contenteditable="true"][role="textbox"], footer [contenteditable="true"][data-lexical-editor], footer [contenteditable="true"]') || null;
  const textOf = node => clean(node?.innerText ?? node?.textContent);
  function jidFromMessageId(value) {
    const match = String(value || '').match(/^(?:true|false)_([^_\s]+@(?:c\.us|s\.whatsapp\.net|g\.us|lid))_/);
    return match?.[1] || null;
  }
  function getSnapshot() {
    const root = main();
    if (!root) return { chat: null, messages: [], draft: '', composer: null };
    const composer = getComposer(root);
    const nodes = [...root.querySelectorAll('[data-id]')].filter(n => jidFromMessageId(n.getAttribute('data-id')));
    const ids = [...new Set(nodes.map(n => jidFromMessageId(n.getAttribute('data-id'))))];
    // Mixed identities can appear during a chat transition. Fail closed until it settles.
    const jid = ids.length === 1 ? ids[0] : null;
    const header = root.querySelector('header');
    const nameNode = header?.querySelector('[data-testid="conversation-info-header-chat-title"], [data-testid="conversation-info-header"] [title], span[title]');
    const name = clean(nameNode?.getAttribute('title') || nameNode?.textContent || 'Current conversation');
    const chat = jid ? { id: 'wa:' + jid, name } : null;
    const seen = new Set();
    const messages = [];
    for (const node of nodes) {
      const id = node.getAttribute('data-id');
      if (seen.has(id)) continue;
      seen.add(id);
      const row = node.closest('.message-in, .message-out') || node.querySelector('.message-in, .message-out') || node;
      const body = node.querySelector('[data-pre-plain-text]') || (node.hasAttribute('data-pre-plain-text') ? node : null);
      const textNodes = [...node.querySelectorAll('.selectable-text')].filter(n => !n.parentElement?.closest('.selectable-text') && !n.closest('[data-testid="quoted-message"], [data-testid="quoted-message-text"]'));
      let text = textNodes.map(textOf).filter(Boolean).join('\n');
      const audio = !!node.querySelector('audio, [data-testid="audio-play"], [data-icon="audio-play"], [data-icon="ptt-play"]');
      const video = !!node.querySelector('video, [data-icon="video-play"]');
      const picture = !!node.querySelector('img[src^="blob:"], img[src^="data:"], [data-testid="image-thumb"]');
      const doc = !!node.querySelector('[data-testid="document-thumb"], [data-icon="document"]');
      const kind = audio ? 'audio' : video ? 'video' : picture ? 'image' : doc ? 'document' : 'text';
      if (!text && kind !== 'text') text = `[${kind} attachment — contents not captured; attach the file to use it]`;
      if (!text) continue;
      const prefix = body?.getAttribute('data-pre-plain-text') || '';
      const sender = prefix.replace(/^\[[^\]]*\]\s*/, '').replace(/:\s*$/, '');
      messages.push({ id, text, direction: row.classList.contains('message-out') || id.startsWith('true_') ? 'out' : 'in', sender: clean(sender), timestamp: prefix.match(/^\[([^\]]*)\]/)?.[1] || '', kind });
    }
    return { chat, messages, draft: textOf(composer), composer };
  }
  function getSelection() {
    const sel = window.getSelection();
    const root = main();
    if (!sel?.rangeCount || !root || !sel.toString().trim()) return { text: '', range: null, fromComposer: false, sourceTimestamp: '' };
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return { text: '', range: null, fromComposer: false, sourceTimestamp: '' };
    const composer = getComposer(root);
    const fromComposer = !!composer?.contains(range.commonAncestorContainer);
    const node = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const row = node?.closest('[data-id], .message-in, .message-out');
    const prefix = node?.closest('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || row?.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
    return { text: sel.toString().trim(), range: range.cloneRange(), fromComposer, sourceTimestamp: prefix.match(/^\[([^\]]*)\]/)?.[1] || '' };
  }
  function insertDraft(text, { expectedChatId, expectedDraft, range = null } = {}) {
    const snap = getSnapshot();
    if (!snap.chat || snap.chat.id !== expectedChatId) return { ok: false, error: 'The conversation changed. Generate suggestions in the current chat.' };
    if (!snap.composer) return { ok: false, error: 'The WhatsApp draft box is unavailable. Copy the suggestion instead.' };
    if (snap.draft !== expectedDraft) return { ok: false, error: 'Your draft changed after generation. Copy this suggestion or generate again.' };
    if (range && (!range.startContainer.isConnected || !snap.composer.contains(range.commonAncestorContainer))) return { ok: false, error: 'The selection changed. Select the draft again.' };
    snap.composer.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    if (range) selection.addRange(range);
    else {
      const all = document.createRange();
      all.selectNodeContents(snap.composer);
      selection.addRange(all);
    }
    // insertText participates in the editor's normal undo/input path. Never press Enter or click Send.
    const selectedText = range?.toString() || '';
    const leading = range ? selectedText.match(/^\s*/)[0] : '';
    const trailing = range ? selectedText.match(/\s*$/)[0] : '';
    const replacement = range ? leading + String(text).trim() + trailing : String(text);
    const inserted = document.execCommand('insertText', false, replacement);
    if (!inserted) return { ok: false, error: 'WhatsApp did not accept the draft. Use Copy instead.' };
    snap.composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: replacement }));
    return { ok: true };
  }
  ns.adapter = { getSnapshot, getSelection, insertDraft, jidFromMessageId };
})();
