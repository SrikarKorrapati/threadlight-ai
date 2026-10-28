(() => {
  if (document.getElementById('threadlight-root')) return;
  const { adapter } = globalThis.WACopilot;
  const host = document.createElement('div'); host.id = 'threadlight-root';
  const shadow = host.attachShadow({ mode: 'open' });
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = chrome.runtime.getURL('content.css'); shadow.append(css);
  const sparkle = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z"/></svg>';
  const shell = document.createElement('div');
  shell.innerHTML = `
    <button class="launcher" data-testid="toggle" aria-label="Open Threadlight">${sparkle} Threadlight</button>
    <aside class="panel" data-testid="panel" aria-label="Threadlight writing assistant" hidden>
      <div class="header"><button class="icon-btn" id="close" aria-label="Close assistant" title="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><div class="brand">Threadlight</div><span class="spacer"></span><button class="icon-btn" id="settings" aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--header)"/><circle cx="15" cy="17" r="3" fill="var(--header)"/></svg></button></div>
      <div class="chat-strip"><div class="chat-name" id="chat-name">Open a conversation</div></div>
      <nav class="tabs" aria-label="Assistant sections"><button class="tab active" data-tab="write" data-testid="tab-write">Write</button><button class="tab" data-tab="calendar" data-testid="tab-calendar"><span data-testid="mode-calendar">Calendar</span></button><button class="tab" data-tab="memory" data-testid="tab-memory">Memory</button><button class="tab" data-tab="tasks" data-testid="tab-tasks">Commitments</button></nav>
      <div class="body">
        <section id="view-write">
          <div class="modes"><button class="mode active" data-mode="rewrite" data-testid="mode-rewrite">Rewrite</button><button class="mode" data-mode="reply" data-testid="mode-reply">Suggest a reply</button></div>
          <div class="label-row"><label for="source" id="source-label">Message</label><button class="link-btn" id="use-draft">Use draft</button></div>
          <textarea class="field source" id="source" data-testid="source-text" placeholder="Select text or write a message…" maxlength="20000"></textarea>
          <div class="prompt-wrap"><div class="label-row"><label for="prompt">Instructions</label></div><textarea class="field prompt" id="prompt" data-testid="prompt" placeholder="Tone, length, or details…" maxlength="4000"></textarea></div>
          <div class="shortcut-section">
            <div class="shortcut-heading"><span class="label">Shared shortcuts</span><span class="spacer"></span><button class="link-btn" id="shortcut-add" data-testid="shortcut-add" aria-label="Add shortcut" disabled>＋ Add</button><button class="link-btn" id="shortcut-manage" data-testid="shortcut-manage" aria-pressed="false" disabled>Manage</button></div>
            <div class="chips" id="shortcut-list" data-testid="shortcut-list" aria-label="Shared prompt shortcuts"></div>
            <div class="shortcut-notice"><span id="shortcut-status" data-testid="shortcut-status" role="status">Loading shortcuts…</span><button class="link-btn" id="shortcut-retry" data-testid="shortcut-retry" hidden>Retry</button></div>
            <div class="shortcut-form" id="shortcut-form" data-testid="shortcut-form" hidden>
              <label for="shortcut-label">Label</label><input class="field" id="shortcut-label" data-testid="shortcut-label" maxlength="40" placeholder="e.g. Clear and warm" autocomplete="off">
              <label for="shortcut-prompt">Instructions</label><textarea class="field" id="shortcut-prompt" data-testid="shortcut-prompt" maxlength="1000" placeholder="How should the message change?"></textarea>
              <div class="inline-actions"><button class="secondary" id="shortcut-save" data-testid="shortcut-save" disabled>Save</button><button class="link-btn" id="shortcut-cancel" data-testid="shortcut-cancel">Cancel</button></div>
            </div>
          </div>
          <div class="attach-line"><button class="attach-btn" id="attach">＋ Attach</button><input class="file-input" data-testid="attachment-input" id="files" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,audio/*,video/*,.ogg,.opus,.m4a,.mp3,.mp4,.webm,.mov,.txt"></div>
          <div class="files" id="file-list"></div>
          <button class="primary" data-testid="generate" id="generate">${sparkle}<span id="generate-label">Generate suggestions</span></button>
          <div class="notice" id="connection-note" hidden></div><div id="results" aria-live="polite"></div>
        </section>
        <section id="view-calendar" data-testid="view-calendar" hidden>
          <div class="label-row"><label for="calendar-account">Google account</label><button class="link-btn" id="calendar-manage-account" data-testid="calendar-manage-account">Add / change</button></div>
          <input class="field" id="calendar-account" data-testid="calendar-account" type="email" maxlength="254" placeholder="Browser default" autocomplete="email" spellcheck="false" autocapitalize="off">
          <div class="inline-actions"><button class="secondary" id="calendar-save-account" data-testid="calendar-save-account" disabled>Save account</button><button class="link-btn" id="calendar-default-account" data-testid="calendar-default-account" disabled>Use browser default</button></div>
          <div class="label-row"><label for="calendar-source">Message or event details</label><button class="link-btn" id="calendar-use-selection">Use selection</button></div>
          <textarea class="field source" id="calendar-source" data-testid="calendar-source" maxlength="20000" placeholder="Select a message with a plan, or add the details…"></textarea>
          <div class="prompt-wrap"><div class="label-row"><label for="calendar-prompt">Additional details</label></div><textarea class="field prompt" id="calendar-prompt" data-testid="calendar-prompt" maxlength="4000" placeholder="Date, time, duration, or location…"></textarea></div>
          <div class="attach-line"><button class="attach-btn" id="calendar-attach">＋ Attach</button></div><div class="files" id="calendar-file-list"></div>
          <button class="primary" id="calendar-prepare" data-testid="calendar-prepare">${sparkle}<span id="calendar-prepare-label">Prepare event</span></button>
          <div id="calendar-results" data-testid="calendar-results" aria-live="polite"></div>
        </section>
        <section id="view-memory" hidden><div class="label-row"><label for="profile">Writing preferences</label></div><textarea id="profile" class="field profile" maxlength="6000" placeholder="Tone and preferences for this conversation…"></textarea><div class="inline-actions"><button id="save-profile" class="secondary">Save preferences</button><button id="capture" class="secondary">Update history</button></div><div id="memory-info" class="notice"></div><details class="import-details"><summary>Import an exported chat</summary><label for="export-name">Your name in the export</label><input id="export-name" class="field" placeholder="Exact sender name"><div class="inline-actions"><button id="import" class="secondary">Import .txt or .json</button><input id="import-file" type="file" accept=".txt,.json" class="file-input"></div></details><div class="inline-actions"><button id="forget" class="link-btn danger">Clear conversation</button></div></section>
        <section id="view-tasks" hidden><button class="primary" id="find-tasks">Find commitments</button><div id="tasks"></div></section>
      </div>
      <div class="footer"><div class="status" id="status" role="status">Ready</div><span id="coverage">0 messages</span></div>
    </aside>
    <div class="selection-bubble" id="selection-bubble" hidden><button id="ask-selection">${sparkle} Ask Threadlight</button><button id="calendar-selection">Calendar</button></div>`;
  shadow.append(shell); document.documentElement.append(host);
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  let themeFrame = 0, themeTargets = [];
  function explicitTheme(node) {
    if (!node) return null;
    for (const attribute of ['data-theme', 'data-color-mode', 'data-color-scheme']) {
      const value = node.getAttribute(attribute)?.trim().toLowerCase();
      if (value === 'dark' || value === 'light') return value;
    }
    if (node.classList.contains('dark')) return 'dark';
    if (node.classList.contains('light')) return 'light';
    return null;
  }
  function backgroundTheme(node) {
    const match = getComputedStyle(node).backgroundColor.match(/^rgba?\(([^)]+)\)$/);
    if (!match) return null;
    const values = match[1].split(/[\s,/]+/).filter(Boolean);
    const alpha = values[3] == null ? 1 : parseFloat(values[3]) / (values[3].endsWith('%') ? 100 : 1);
    if (alpha < .95 || values.length < 3) return null;
    const rgb = values.slice(0, 3).map(value => parseFloat(value) / (value.endsWith('%') ? 100 : 255));
    if (!rgb.every(Number.isFinite)) return null;
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 < .45 ? 'dark' : 'light';
  }
  function syncTheme() {
    const roots = [document.body, document.documentElement].filter(Boolean);
    let theme = roots.map(explicitTheme).find(Boolean);
    if (!theme) theme = roots.map(node => getComputedStyle(node).colorScheme.trim()).find(value => value === 'dark' || value === 'light');
    if (!theme) {
      for (let node = document.querySelector('#main header') || document.body; node; node = node.parentElement) {
        theme = backgroundTheme(node);
        if (theme) break;
      }
    }
    theme ||= systemDark.matches ? 'dark' : 'light';
    if (host.dataset.theme !== theme) host.dataset.theme = theme;
  }
  function scheduleTheme() {
    if (!themeFrame) themeFrame = requestAnimationFrame(() => { themeFrame = 0; syncTheme(); });
  }
  const themeObserver = new MutationObserver(scheduleTheme);
  function bindThemeTargets() {
    const nodes = new Set([document.documentElement, document.body].filter(Boolean));
    for (let node = document.querySelector('#main header'); node; node = node.parentElement) nodes.add(node);
    const next = [...nodes];
    if (next.length === themeTargets.length && next.every((node, index) => node === themeTargets[index])) return;
    themeObserver.disconnect(); themeTargets = next;
    for (const node of next) themeObserver.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode', 'data-color-scheme'] });
    scheduleTheme();
  }
  bindThemeTargets(); syncTheme(); systemDark.addEventListener('change', scheduleTheme);
  const $ = sel => shadow.querySelector(sel);
  const $$ = sel => [...shadow.querySelectorAll(sel)];
  let opened = false, mode = 'rewrite', activeTab = 'write', chat = null, memory = {}, attachments = [], lastSelection = null, bubblePending = null, accountLabel = '';
  let currentViewId = null, refreshPromise = null, refreshPending = false, refreshForced = false;
  let generationPreparing = false;
  const pausedCaptures = new Map(), forgettingScopes = new Set();
  let calendarSelection = null;
  let calendarAccount = '', calendarAccountDirty = false, calendarAccountSaving = false;
  let promptShortcuts = [], shortcutsLoaded = false, shortcutsLoading = false, shortcutsSaving = false, shortcutsManaging = false;
  let shortcutsVersion = 0, shortcutsError = '';
  const messageFingerprint = messages => JSON.stringify(messages.map(m => [m.id,m.text,m.direction,m.sender,m.timestamp,m.kind]));
  const captureScope = (account, id) => JSON.stringify([account, id]);
  let selectionDraft = '', requestNumber = 0, contextVersion = 0, busy = false, debounce, fingerprint = '', fingerprintScope = '', resultContext = null, ownDraft = false;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const isCurrent = target => { const latest = adapter.getSnapshot(); return !!target && chat?.id === target.id && (!target.accountLabel || target.accountLabel === accountLabel) && latest.chat?.id === target.id && (target.viewId === undefined || latest.viewId === target.viewId); };
  function setStatus(message, error = false) { $('#status').textContent = message; $('#status').classList.toggle('error', error); }
  function updateCalendarAccountButtons() {
    $('#calendar-save-account').disabled = calendarAccountSaving || !calendarAccountDirty;
    $('#calendar-default-account').disabled = calendarAccountSaving || (!calendarAccount && !$('#calendar-account').value.trim());
  }
  function updateCalendarAccount(value, force = false) {
    if (typeof value !== 'string') return;
    calendarAccount = value;
    if (force || !calendarAccountDirty) { $('#calendar-account').value = value; calendarAccountDirty = false; }
    updateCalendarAccountButtons();
  }
  async function saveCalendarAccount(value) {
    if (calendarAccountSaving) return;
    calendarAccountSaving = true; updateCalendarAccountButtons();
    const before = $('#calendar-account').value;
    try {
      const response = await send('SAVE_CALENDAR_ACCOUNT', { calendarAccount: value });
      updateCalendarAccount(response.calendarAccount, $('#calendar-account').value === before);
      setStatus(response.calendarAccount ? 'Google account saved.' : 'Using browser default.');
    } finally { calendarAccountSaving = false; updateCalendarAccountButtons(); }
  }
  async function send(type, data = {}) {
    try {
      const response = await chrome.runtime.sendMessage({ type, ...(accountLabel ? {accountLabel} : {}), ...data });
      if (!response?.ok) throw new Error(response?.error || 'The extension did not respond. Reload WhatsApp Web after reloading the extension.');
      return response;
    } catch (error) { throw new Error(error.message.includes('Extension context invalidated') ? 'Extension updated. Reload WhatsApp Web to reconnect.' : error.message); }
  }
  function updateShortcutControls() {
    const waiting = shortcutsLoading || shortcutsSaving;
    $('#shortcut-add').disabled = waiting || !shortcutsLoaded || promptShortcuts.length >= 20;
    $('#shortcut-manage').disabled = waiting || !shortcutsLoaded || !promptShortcuts.length;
    $('#shortcut-manage').textContent = shortcutsManaging ? 'Done' : 'Manage';
    $('#shortcut-manage').setAttribute('aria-pressed', String(shortcutsManaging));
    $('#shortcut-save').disabled = waiting || !shortcutsLoaded || promptShortcuts.length >= 20 || !$('#shortcut-label').value.trim() || !$('#shortcut-prompt').value.trim();
    $('#shortcut-save').textContent = shortcutsSaving ? 'Saving…' : 'Save';
    for (const id of ['shortcut-label', 'shortcut-prompt', 'shortcut-cancel']) $('#' + id).disabled = shortcutsSaving;
    const status = shortcutsError || (shortcutsLoading ? 'Loading shortcuts…' : !shortcutsLoaded ? '' : !promptShortcuts.length ? 'No shortcuts yet.' : promptShortcuts.length >= 20 ? '20 shortcuts maximum.' : '');
    $('#shortcut-status').textContent = status;
    $('#shortcut-status').classList.toggle('error', !!shortcutsError);
    $('#shortcut-retry').hidden = !shortcutsError || shortcutsLoaded;
    $('.shortcut-notice').hidden = !status;
  }
  function renderShortcuts() {
    const list = $('#shortcut-list'); list.replaceChildren();
    for (const shortcut of promptShortcuts) {
      const item = el('span', 'shortcut-item'); item.dataset.shortcutId = shortcut.id;
      const use = el('button', 'chip', shortcut.label); use.dataset.testid = 'shortcut-use'; use.title = shortcut.prompt;
      use.addEventListener('click', userAction(() => { $('#prompt').value = shortcut.prompt; $('#prompt').focus(); }));
      item.append(use);
      if (shortcutsManaging) {
        const remove = el('button', 'shortcut-remove', '×'); remove.dataset.testid = 'shortcut-delete'; remove.setAttribute('aria-label', `Delete ${shortcut.label}`); remove.disabled = shortcutsSaving;
        remove.addEventListener('click', userAction(() => mutateShortcut('DELETE_PROMPT_SHORTCUT', { id: shortcut.id })));
        item.append(remove);
      }
      list.append(item);
    }
    updateShortcutControls();
  }
  function applyShortcuts(value) {
    if (!Array.isArray(value) || value.length > 20 || value.some(item => !item || typeof item.id !== 'string' || !item.id || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 40 || typeof item.prompt !== 'string' || !item.prompt.trim() || item.prompt.length > 1000) || new Set(value.map(item => item.id)).size !== value.length) throw new Error('Shortcuts could not be loaded. Please retry.');
    promptShortcuts = value.map(({ id, label, prompt }) => ({ id, label, prompt }));
    shortcutsLoaded = true; shortcutsError = ''; renderShortcuts();
  }
  async function loadShortcuts() {
    if (shortcutsLoading) return;
    const version = shortcutsVersion; shortcutsLoading = true; shortcutsError = ''; updateShortcutControls();
    try { const response = await send('GET_PROMPT_SHORTCUTS'); if (version === shortcutsVersion) applyShortcuts(response.promptShortcuts); }
    catch (error) { if (version === shortcutsVersion) shortcutsError = error.message; }
    finally { shortcutsLoading = false; updateShortcutControls(); }
  }
  async function mutateShortcut(type, data) {
    if (shortcutsSaving || !shortcutsLoaded) return;
    const version = shortcutsVersion; shortcutsSaving = true; shortcutsError = ''; renderShortcuts();
    try {
      const response = await send(type, data);
      if (version === shortcutsVersion) applyShortcuts(response.promptShortcuts);
      if (type === 'ADD_PROMPT_SHORTCUT') { $('#shortcut-label').value = ''; $('#shortcut-prompt').value = ''; $('#shortcut-form').hidden = true; }
    } catch (error) { shortcutsError = error.message; }
    finally { shortcutsSaving = false; renderShortcuts(); }
  }
  function setBusy(value) {
    busy = value; $('#generate').disabled = value; $('#find-tasks').disabled = value; $('#calendar-prepare').disabled = value;
    $$('[data-mode]').forEach(b => b.disabled = value);
    $('#generate-label').textContent = value ? 'Generating…' : ({ rewrite: 'Generate suggestions', reply: 'Suggest replies', explain: 'Explain this message', calendar: 'Prepare calendar event' }[mode]);
    $('#calendar-prepare-label').textContent = value ? 'Preparing…' : 'Prepare event';
  }
  function setMode(next) {
    if (next === 'calendar') { setTab('calendar'); return; }
    mode = next === 'reply' ? 'reply' : 'rewrite'; setTab('write');
    $$('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    $('#source-label').textContent = mode === 'reply' ? 'Message · optional' : mode === 'calendar' ? 'Event details' : 'Message';
    $('#prompt').placeholder = mode === 'reply' ? 'What would you like to say?' : mode === 'calendar' ? 'Date, time, or other details…' : mode === 'explain' ? 'What would you like explained?' : 'Tone, length, or details…';
    setBusy(busy);
  }
  function setTab(name) {
    activeTab = name; $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    ['write','calendar','memory','tasks'].forEach(t => $('#view-' + t).hidden = t !== name);
    if (name === 'tasks') renderTasks();
  }
  function resetForChat(next, viewId = null) {
    currentViewId = viewId;
    requestNumber++; contextVersion++; setBusy(false); chat = next; bubblePending = null; memory = {}; attachments = []; lastSelection = null; fingerprint = ''; fingerprintScope = ''; resultContext = null; ownDraft=false;
    $('#source').value = ''; $('#prompt').value = ''; $('#profile').value = ''; $('#results').replaceChildren(); renderFiles();
    calendarSelection = null; $('#calendar-source').value = ''; $('#calendar-prompt').value = ''; $('#calendar-results').replaceChildren();
    $('#selection-bubble').hidden = true; $('#chat-name').textContent = next?.name || 'Open a conversation with messages'; $('#coverage').textContent = '0 messages';
    $('#memory-info').textContent='';renderTasks();
  }
  function updateMemory(data) {
    if(data.settings?.accountLabel)accountLabel=data.settings.accountLabel;
    if(data.settings)updateCalendarAccount(data.settings.calendarAccount);
    if (data.memory) memory = data.memory;
    const count = memory.messages?.length || 0;
    $('#coverage').textContent = `${count} messages`;
    $('#memory-info').textContent = `${count} messages · ${memory.examples?.length || 0} style examples${memory.coverage?.retentionRemovals ? ` · ${memory.coverage.retentionRemovals} older messages removed` : ''}`;
    if (shadow.activeElement !== $('#profile')) $('#profile').value = memory.profile || '';
    if (activeTab === 'tasks') renderTasks();
  }
  async function refreshOnce(force) {
    const snap = adapter.getSnapshot(), snapshotChat = snap.chat ? { ...snap.chat } : null;
    const changed = chat?.id !== snapshotChat?.id || currentViewId !== snap.viewId;
    if (changed) resetForChat(snapshotChat, snap.viewId);
    if (!snapshotChat) { setStatus(snap.reason || 'Open a conversation.', true); return; }
    chat = snapshotChat; $('#chat-name').textContent = snapshotChat.name;
    const capturedId = snapshotChat.id, viewId = snap.viewId, version = contextVersion;
    if (accountLabel && forgettingScopes.has(captureScope(accountLabel, capturedId))) return;
    const current = () => { const latest = adapter.getSnapshot(); return version === contextVersion && chat?.id === capturedId && latest.chat?.id === capturedId && latest.viewId === viewId; };
    if (changed || force || !accountLabel) {
      const data = await send('GET_STATE', { chat: snapshotChat });
      if (!current()) { refreshPending = true; return; }
      updateMemory(data); if (changed) setStatus('Ready');
    }
    if (!current()) { refreshPending = true; return; }
    const capturedAccount = accountLabel, scope = captureScope(capturedAccount, capturedId), mark = messageFingerprint(snap.messages);
    if (forgettingScopes.has(scope)) return;
    if (fingerprintScope !== scope) { fingerprintScope = scope; fingerprint = ''; }
    if (pausedCaptures.has(scope)) {
      if (pausedCaptures.get(scope) === mark) { fingerprint = mark; return; }
      pausedCaptures.delete(scope);
    }
    if (mark !== fingerprint) {
      const data = await send('CAPTURE', { chat: snapshotChat, accountLabel: capturedAccount, messages: snap.messages });
      if (!current() || accountLabel !== capturedAccount) { refreshPending = true; return; }
      fingerprint = mark; updateMemory(data);
    }
  }
  function refresh({ force = false } = {}) {
    refreshPending = true; refreshForced = refreshForced || force;
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      while (refreshPending) {
        const nextForce = refreshForced; refreshPending = false; refreshForced = false;
        await refreshOnce(nextForce);
      }
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  async function openPanel(nextMode = 'rewrite', text) {
    const observed = adapter.getSelection();
    const selected = text && bubblePending?.selection.text===text ? bubblePending.selection : observed;
    const snap = adapter.getSnapshot();
    opened = true; $('.panel').hidden = false; $('.launcher').hidden = true;
    await refresh({ force: true }).catch(e => setStatus(e.message, true));
    if(adapter.getSnapshot().chat?.id!==snap.chat?.id||adapter.getSnapshot().viewId!==snap.viewId){setStatus('The conversation changed. Select the message again.',true);return;}
    setMode(nextMode);
    if (nextMode === 'calendar') {
      calendarSelection = selected.text ? selected : null;
      $('#calendar-source').value = text ?? selected.text ?? '';
      $('#calendar-results').replaceChildren();
      $('#calendar-prompt').focus();
    } else {
      lastSelection = selected.text ? selected : null; selectionDraft = snap.draft;
      $('#source').value = text ?? selected.text ?? '';
      ownDraft = !!selected.fromComposer;
      if (!$('#source').value && nextMode === 'rewrite') {$('#source').value = snap.draft;ownDraft=!!snap.draft;}
      $('#prompt').focus();
    }
    $('#selection-bubble').hidden = true;
    send('HEALTH').then(r => {const health = r.health || r; const ready = health.ready ?? health.configured; $('#connection-note').hidden = ready !== false; if (ready === false) $('#connection-note').textContent = 'Finish setup in Settings.';}).catch(() => {$('#connection-note').hidden = false; $('#connection-note').textContent = 'Start Threadlight and check Settings.';});
  }
  function closePanel() { opened = false; $('.panel').hidden = true; $('.launcher').hidden = false; $('#selection-bubble').hidden = true; }
  async function generate(action = activeTab === 'calendar' ? 'calendar' : mode) {
    if (busy || generationPreparing) return;
    generationPreparing = true;
    const initial = adapter.getSnapshot(), initialAccount = accountLabel;
    try { await refresh(); } finally { generationPreparing = false; }
    const snap = adapter.getSnapshot();
    if (snap.chat?.id !== initial.chat?.id || snap.viewId !== initial.viewId || (initialAccount && accountLabel !== initialAccount)) throw new Error('The conversation changed. Generate again in the intended chat.');
    if (!chat || snap.chat?.id !== chat.id) throw new Error('Open a conversation with loaded messages first.');
    const text = action === 'commitments' ? '' : $(action === 'calendar' ? '#calendar-source' : '#source').value.trim();
    const prompt = action === 'commitments' ? '' : $(action === 'calendar' ? '#calendar-prompt' : '#prompt').value.trim();
    const selection = action === 'calendar' ? calendarSelection : lastSelection;
    const submittedAttachments = [...attachments];
    if (['rewrite','explain','calendar'].includes(action) && !text && !attachments.length) throw new Error('Select a message, write a draft, or attach media first.');
    const n = ++requestNumber;
    const context = { chat: { ...chat }, accountLabel, viewId: snap.viewId, original: action === 'rewrite' && ownDraft ? text : '', mode: action, draft: snap.draft, range: action === 'rewrite' && lastSelection?.fromComposer && selectionDraft === snap.draft && text === lastSelection.text ? lastSelection.range : null };
    setBusy(true); setStatus('Generating…'); $('#connection-note').hidden = true;
    try {
      const { result } = await send('GENERATE', { chat: context.chat, accountLabel:context.accountLabel, mode: action, text, prompt, trackWriting:false, attachments: action === 'commitments' ? [] : attachments.map(({ name,mime,data }) => ({ name,mime,data })), sourceTimestamp: selection?.sourceTimestamp || '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, now: new Date().toISOString() });
      if (n !== requestNumber || !isCurrent({...context.chat,accountLabel:context.accountLabel,viewId:context.viewId})) {if(n === requestNumber) setStatus('Conversation changed. Those suggestions were discarded.');return;}
      if (action === 'calendar' && ($('#calendar-source').value.trim() !== text || $('#calendar-prompt').value.trim() !== prompt || calendarSelection !== selection || attachments.length !== submittedAttachments.length || attachments.some((file, index) => file !== submittedAttachments[index]))) {
        setStatus('Event details changed. Prepare the event again.'); return;
      }
      resultContext = context;
      if (action === 'commitments') { await refresh({ force: true }); renderTasks(); setStatus('Commitments ready.'); }
      else { renderResult(result, action); setStatus(action === 'calendar' ? 'Review the event.' : 'Suggestions ready.'); }
      const state = await send('GET_STATE', { chat: context.chat }); if (isCurrent({...context.chat,accountLabel:context.accountLabel,viewId:context.viewId})) updateMemory(state);
    } finally { if (n === requestNumber) setBusy(false); }
  }
  function safeRun(fn) { return (...args) => Promise.resolve().then(() => fn(...args)).catch(e => setStatus(e.message || 'Something went wrong.', true)); }
  // Page scripts can see the open shadow tree, but cannot initiate privileged UI actions.
  function userAction(fn) { return safeRun(event => { if (event instanceof Event && event.isTrusted) return fn(event); }); }
  function renderResult(result, action = mode) {
    const root = $(action === 'calendar' ? '#calendar-results' : '#results'); root.replaceChildren();
    if(result.mediaNotes?.length){const details=el('details','media-details');details.append(el('summary','','Media details'));for(const note of result.mediaNotes)details.append(el('p','media-note',note));root.append(details);}
    if (result.suggestions?.length) {
      result.suggestions.forEach((suggestion, index) => {
        const card = el('article','suggestion'); card.dataset.testid = 'suggestion';
        const head = el('div','suggestion-head',suggestion.label); head.append(el('span','suggestion-number',String(index + 1).padStart(2,'0'))); card.append(head, el('p','suggestion-text',suggestion.text));
        const actions = el('div','card-actions'); const c = resultContext;
        const insert = el('button','secondary insert',c.range ? 'Replace selection' : c.draft ? 'Replace draft' : 'Use this draft'); insert.dataset.testid='insert';
        insert.addEventListener('click', userAction(async () => {
          const outcome = adapter.insertDraft(suggestion.text, { expectedChatId: c.chat.id, expectedViewId: c.viewId, expectedDraft: c.draft, range: c.range }); if (!outcome.ok) throw new Error(outcome.error);
          setStatus('Draft inserted.'); insert.disabled = true;
          const data = await send('ACCEPT', { chat:c.chat,accountLabel:c.accountLabel,original:c.original,suggestion,feedback:c.original?result.feedback||[]:[],action:'insert' }); if(isCurrent({...c.chat,viewId:c.viewId})&&accountLabel===c.accountLabel)updateMemory(data);
        }));
        const copy = el('button','secondary','Copy'); copy.dataset.testid='copy'; copy.addEventListener('click',userAction(async()=>{
          if(!isCurrent({...c.chat,accountLabel:c.accountLabel,viewId:c.viewId}))throw new Error('The conversation changed.');
          await navigator.clipboard.writeText(suggestion.text); setStatus('Copied.');
          const data=await send('ACCEPT',{chat:c.chat,accountLabel:c.accountLabel,original:c.original,suggestion,feedback:c.original?result.feedback||[]:[],action:'copy'}); if(isCurrent({...c.chat,viewId:c.viewId})&&accountLabel===c.accountLabel)updateMemory(data);
        })); actions.append(insert,copy); card.append(actions); root.append(card);
      });
    }
    if (result.explanation && !result.suggestions?.length) root.append(el('div','explanation-box',result.explanation));
    if (result.event) renderEvent(result.event,root,resultContext);
  }
  function renderEvent(event, root, context) {
    root.append(el('div','section-heading','Calendar preview'));
    if(event.questions?.length) {const q=el('ul','small-list');event.questions.forEach(s=>q.append(el('li','',s)));root.append(q);}
    const form=el('div','form-stack'); const fields={};
    const localZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localInput=value=>{if(!value)return '';const date=new Date(value);if(!Number.isFinite(+date))return '';const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;};
    for(const [key,label] of [['title','Event title'],['start','Starts'],['end','Ends'],['timeZone','Your timezone'],['location','Location']]){
      const wrap=el('label','',label);const input=el('input');input.type=['start','end'].includes(key)?'datetime-local':'text';input.value=['start','end'].includes(key)?localInput(event[key]):key==='timeZone'?localZone:event[key]||'';input.readOnly=key==='timeZone';input.dataset.testid='calendar-'+key;wrap.append(input);form.append(wrap);fields[key]=input;
    }
    const description=el('label','','Notes');const notes=el('textarea','field');notes.value=event.description||'';description.append(notes);form.append(description);
    let reviewed=null;
    if(event.needsClarification){const label=el('label','review-check','Missing details checked');reviewed=el('input');reviewed.type='checkbox';reviewed.dataset.testid='calendar-reviewed';label.prepend(reviewed);form.append(label);}
    const button=el('button','primary','Review in Google Calendar');button.dataset.testid='calendar-open';button.addEventListener('click',userAction(async()=>{
      if(!isCurrent({...context.chat,accountLabel:context.accountLabel,viewId:context.viewId}))throw new Error('The conversation changed. Prepare this event again.');
      if(calendarAccountSaving||calendarAccountDirty)throw new Error('Save the Google account or use the browser default first.');
      const value={...event,description:notes.value};Object.entries(fields).forEach(([k,v])=>value[k]=v.value.trim());
      if(!value.title||!value.start||!value.end)throw new Error('Add a title, start, and end time before opening Calendar.');
      if(reviewed&&!reviewed.checked)throw new Error('Check the missing details, then tick the review box.');
      for(const key of ['start','end']){const date=new Date(value[key]);if(!Number.isFinite(+date)||localInput(date.toISOString())!==value[key])throw new Error('Choose a valid local date and time.');value[key]=date.toISOString();}
      value.needsClarification=false;value.questions=[];
      await send('OPEN_CALENDAR',{event:value});setStatus('Opened Calendar. Save the event there.');
    }));form.append(button);root.append(form);
  }
  function renderFiles() {
    for(const root of [$('#file-list'),$('#calendar-file-list')]){
      root.replaceChildren();
      attachments.forEach((file,index)=>{const chip=el('span','file-chip',file.name);const remove=el('button','','×');remove.setAttribute('aria-label','Remove '+file.name);remove.onclick=()=>{attachments.splice(index,1);renderFiles();};chip.append(remove);root.append(chip);});
    }
  }
  async function addFiles(files) {
    if(attachments.length+files.length>4)throw new Error('Attach up to four files at a time.');
    if(attachments.reduce((n,f)=>n+f.size,0)+[...files].reduce((n,f)=>n+f.size,0)>16*1024*1024)throw new Error('Keep attachments under 16 MB combined.');
    const current=chat?{...chat,accountLabel,viewId:currentViewId}:null; const incoming=[];
    for(const file of files){
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read '+file.name));reader.readAsDataURL(file);});
      incoming.push({name:file.name,mime:file.type||({pdf:'application/pdf',txt:'text/plain',ogg:'audio/ogg',opus:'audio/ogg',mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'}[file.name.split('.').pop().toLowerCase()]||'application/octet-stream'),data,size:file.size});
    }
    if(!isCurrent(current))throw new Error('The conversation changed. Attach those files again in the intended chat.');
    if(attachments.length+incoming.length>4||attachments.reduce((n,f)=>n+f.size,0)+incoming.reduce((n,f)=>n+f.size,0)>16*1024*1024)throw new Error('Attach at most four files totalling 16 MB.');
    attachments.push(...incoming);renderFiles();setStatus('Files attached.');
  }
  function renderTasks() {
    const root=$('#tasks');root.replaceChildren(); const tasks=memory.tasks||[];
    if(!tasks.length){root.append(el('div','empty','No commitments.'));return;}
    const target=chat?{...chat,accountLabel,viewId:currentViewId}:null;
    for(const task of tasks){
      const display=globalThis.WACopilot.commitments.present(task);
      const card=el('article','task');
      const heading=el('div','task-heading');heading.append(el('div','task-title',display.title),el('span','task-status '+display.status,display.statusLabel));card.append(heading);
      const meta=el('div','task-meta');meta.append(el('span','',display.owner),el('span','task-due',display.due==='No due date'?display.due:'Due '+display.due));card.append(meta);
      if(display.quote){
        card.append(el('blockquote','task-source',display.quote));
        if(display.sourceLabel)card.append(el('div','task-attribution',display.sourceLabel));
        if(display.quoteTruncated){const details=el('details','task-more');details.append(el('summary','','Full message'),el('p','task-source',display.fullQuote));card.append(details);}
      }
      const actions=el('div','card-actions');if(!task.status||task.status==='pending')for(const [label,status] of [['Done','done'],['Dismiss','dismissed']]){const b=el('button','secondary',label);b.onclick=userAction(async()=>{if(!isCurrent(target))throw new Error('The conversation changed.');const data=await send('UPDATE_TASK',{chat:target,id:task.id,status});if(isCurrent(target))updateMemory(data);});actions.append(b);}
      const calendar=el('button','secondary','Calendar');calendar.onclick=userAction(()=>{if(!isCurrent(target))throw new Error('The conversation changed.');setTab('calendar');$('#calendar-source').value=[task.title,task.due,task.source].filter(Boolean).join('\n');calendarSelection=null;$('#calendar-results').replaceChildren();$('#calendar-prompt').focus();});actions.append(calendar);card.append(actions);root.append(card);
    }
  }
  function parseImport(text,name) {
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);const messages=[];
    for(const line of lines){
      const m=line.match(/^(?:\[([^\]]+)\]\s*|([^\n]+?)\s+-\s+)([^:]+):\s?(.*)$/);
      if(m&&/\d[\/.\-]\d/.test(m[1]||m[2]))messages.push({timestamp:m[1]||m[2],sender:m[3].trim(),text:m[4],direction:m[3].trim()===name?'out':'in',kind:'text'});
      else if(messages.length)messages[messages.length-1].text+='\n'+line;
    }
    if(!messages.length)throw new Error('No messages recognized. Use a WhatsApp text export or normalized JSON.');
    if(!messages.some(m=>m.sender===name))throw new Error('Your sender name was not found. Enter it exactly as it appears in the export.');
    return messages.map((m,i)=>({...m,id:`import:${m.timestamp}:${m.sender}:${i}`}));
  }
  $('.launcher').onclick=userAction(()=>openPanel());$('#close').onclick=closePanel;$('#settings').onclick=userAction(()=>send('OPEN_SETTINGS'));
  $$('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  $$('[data-mode]').forEach(b=>b.onclick=()=>{setMode(b.dataset.mode);$('#results').replaceChildren();});
  $('#shortcut-add').onclick=userAction(()=>{$('#shortcut-form').hidden=false;$('#shortcut-label').focus();});
  $('#shortcut-manage').onclick=userAction(()=>{shortcutsManaging=!shortcutsManaging;renderShortcuts();});
  $('#shortcut-cancel').onclick=userAction(()=>{$('#shortcut-form').hidden=true;$('#shortcut-label').value='';$('#shortcut-prompt').value='';shortcutsError='';updateShortcutControls();});
  $('#shortcut-save').onclick=userAction(()=>mutateShortcut('ADD_PROMPT_SHORTCUT',{label:$('#shortcut-label').value.trim(),prompt:$('#shortcut-prompt').value.trim()}));
  $('#shortcut-retry').onclick=userAction(loadShortcuts);
  for(const id of ['shortcut-label','shortcut-prompt'])$('#'+id).addEventListener('input',updateShortcutControls);
  $('#source').addEventListener('input',()=>{if(!lastSelection?.text)ownDraft=true;});
  $('#generate').onclick=userAction(()=>generate(mode));$('#find-tasks').onclick=userAction(()=>generate('commitments'));
  $('#calendar-prepare').onclick=userAction(()=>generate('calendar'));
  $('#calendar-account').addEventListener('input',()=>{calendarAccountDirty=$('#calendar-account').value.trim().toLowerCase()!==calendarAccount;updateCalendarAccountButtons();});
  $('#calendar-save-account').onclick=userAction(()=>saveCalendarAccount($('#calendar-account').value));
  $('#calendar-default-account').onclick=userAction(()=>{if(calendarAccountSaving)return;$('#calendar-account').value='';calendarAccountDirty=true;return saveCalendarAccount('');});
  $('#calendar-manage-account').onclick=userAction(async()=>{await send('OPEN_CALENDAR_ACCOUNT');setStatus('Google opened. Save the account email here.');});
  $('#calendar-use-selection').onclick=userAction(()=>{const selected=adapter.getSelection();if(!selected.text)throw new Error('Select a message in the conversation first.');calendarSelection=selected;$('#calendar-source').value=selected.text;$('#calendar-results').replaceChildren();});
  $('#calendar-source').addEventListener('input',()=>{if(calendarSelection&&$('#calendar-source').value!==calendarSelection.text)calendarSelection=null;$('#calendar-results').replaceChildren();});
  $('#calendar-prompt').addEventListener('input',()=>$('#calendar-results').replaceChildren());
  $('#use-draft').onclick=()=>{const snap=adapter.getSnapshot();$('#source').value=snap.draft;lastSelection=null;ownDraft=true;setMode('rewrite');};
  $('#attach').onclick=()=>$('#files').click();$('#calendar-attach').onclick=()=>$('#files').click();$('#files').onchange=()=>{const files=[...$('#files').files];safeRun(async()=>{try{await addFiles(files);}finally{$('#files').value='';}})();};
  shadow.addEventListener('paste',e=>{if(e.clipboardData?.files.length){e.preventDefault();safeRun(()=>addFiles(e.clipboardData.files))();}});
  $('#save-profile').onclick=userAction(async()=>{if(!isCurrent({...chat,viewId:currentViewId}))throw new Error('Open a conversation first.');const target={...chat,accountLabel,viewId:currentViewId};const data=await send('SAVE_PROFILE',{chat:target,profile:$('#profile').value});if(isCurrent(target)){updateMemory(data);setStatus('Preferences saved.');}});
  $('#capture').onclick=userAction(async()=>{await refresh({force:true});setStatus('History updated.');});
  $('#forget').onclick=userAction(async()=>{
    const target=chat?{...chat,accountLabel,viewId:currentViewId}:null;if(!isCurrent(target))return;
    if(!window.confirm('Forget saved messages, preferences, examples, and commitments for this conversation?'))return;
    const scope=captureScope(target.accountLabel,target.id),mark=messageFingerprint(adapter.getSnapshot().messages);
    if(forgettingScopes.has(scope))return;
    forgettingScopes.add(scope);pausedCaptures.set(scope,mark);fingerprint=mark;fingerprintScope=scope;contextVersion++;requestNumber++;setBusy(false);resultContext=null;$('#results').replaceChildren();$('#calendar-results').replaceChildren();
    try {const data=await send('FORGET_CHAT',{chat:target,accountLabel:target.accountLabel});if(isCurrent(target)){updateMemory(data);setStatus('History cleared. Saving resumes when messages change.');}}
    catch(error){pausedCaptures.delete(scope);fingerprint='';throw error;}
    finally{forgettingScopes.delete(scope);safeRun(()=>refresh())();}
  });
  $('#import').onclick=()=>$('#import-file').click();$('#import-file').onchange=safeRun(async()=>{
    if(!chat)throw new Error('Open the conversation this export belongs to first.');const target={...chat,accountLabel,viewId:currentViewId};const file=$('#import-file').files[0];if(!file)return;if(file.size>10*1024*1024)throw new Error('Import a text export under 10 MB.');
    const text=await file.text();const name=$('#export-name').value.trim();if(!file.name.endsWith('.json')&&!name)throw new Error('Enter your sender name before importing.');
    const messages=file.name.endsWith('.json')?JSON.parse(text):parseImport(text,name);if(!isCurrent(target))throw new Error('Chat changed; import again into the intended conversation.');
    if(!Array.isArray(messages))throw new Error('JSON must contain an array of message records.');const data=await send('IMPORT_MESSAGES',{chat:target,accountLabel:target.accountLabel,messages});if(isCurrent(target)){updateMemory(data);setStatus('History imported for '+target.name+'.');$('#import-file').value='';}
  });
  function bubbleSelection(event) {
    if(event.composedPath().includes(host))return;const selected=adapter.getSelection();if(!selected.text){$('#selection-bubble').hidden=true;return;}
    const snap=adapter.getSnapshot();bubblePending={selection:selected,chatId:snap.chat?.id,viewId:snap.viewId};const rect=selected.range.getBoundingClientRect();const bubble=$('#selection-bubble');bubble.hidden=false;bubble.style.left=Math.max(10,Math.min(rect.left,window.innerWidth-245))+'px';bubble.style.top=Math.max(8,Math.min(rect.bottom+8,window.innerHeight-55))+'px';
  }
  document.addEventListener('mouseup',bubbleSelection);document.addEventListener('keyup',event=>{if(event.key==='Shift')bubbleSelection(event);});
  const openSelection=next=>{if(bubblePending?.chatId!==adapter.getSnapshot().chat?.id||bubblePending?.viewId!==adapter.getSnapshot().viewId)throw new Error('The conversation changed. Select the message again.');return openPanel(next,bubblePending?.selection.text);};
  $('#ask-selection').onclick=userAction(()=>openSelection('rewrite'));$('#calendar-selection').onclick=userAction(()=>openSelection('calendar'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closePanel();return;}if(event.altKey&&event.shiftKey&&event.code==='KeyW'){event.preventDefault();opened?closePanel():safeRun(()=>openPanel())();}});
  $('#prompt').addEventListener('keydown',e=>{if(e.isTrusted&&(e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();safeRun(()=>generate())();}});
  $('#calendar-prompt').addEventListener('keydown',e=>{if(e.isTrusted&&(e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();safeRun(()=>generate('calendar'))();}});
  chrome.runtime.onMessage.addListener(message=>{if(message.type==='UI_CALENDAR_ACCOUNT_CHANGED')updateCalendarAccount(message.calendarAccount);if(message.type==='UI_ACCOUNT_CHANGED'){accountLabel='';resetForChat(null);safeRun(()=>refresh({force:true}))();}if(message.type==='UI_OPEN'){if(message.toggle&&opened)closePanel();else safeRun(()=>openPanel(message.mode||'rewrite',message.text))();}});
  new MutationObserver(()=>{bindThemeTargets();clearTimeout(debounce);debounce=setTimeout(()=>refresh().catch(e=>setStatus(e.message,true)),280);}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-id','title','data-testid']});
  document.addEventListener('threadlight-view-changed',()=>{if(adapter.getSnapshot().viewId!==currentViewId)safeRun(()=>refresh({force:true}))();});
  safeRun(()=>refresh({force:true}))();
  safeRun(async()=>{const response=await send('GET_CALENDAR_ACCOUNT');updateCalendarAccount(response.calendarAccount);})();
  chrome.runtime.onMessage.addListener(message=>{if(message.type==='UI_PROMPT_SHORTCUTS_CHANGED'){shortcutsVersion++;try{applyShortcuts(message.promptShortcuts);}catch(error){shortcutsError=error.message;updateShortcutControls();}}});
  loadShortcuts();
})();
