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
      <div class="header"><div class="brand-icon">${sparkle}</div><div><div class="brand">Threadlight</div><div class="eyebrow">A little more like you</div></div><span class="spacer"></span><button class="icon-btn" id="settings" aria-label="Settings">⚙</button><button class="icon-btn" id="close" aria-label="Close assistant">✕</button></div>
      <div class="chat-strip"><div class="chat-name" id="chat-name">Open a conversation</div><span class="local-pill">Personal memory</span></div>
      <section id="chat-binding" class="notice" style="margin:12px 18px" hidden><strong>Choose whose history to use</strong><p class="muted">Confirm this contact’s phone number, including the country code, to keep their history separate. Confirm again after switching chats.</p><label for="contact-phone">Contact’s phone number</label><input id="contact-phone" data-testid="contact-phone" class="field" type="tel" autocomplete="off" placeholder="+91 98765 43210" maxlength="40" style="min-height:0"><button id="bind-contact" data-testid="bind-contact" class="secondary" style="margin-top:10px">Use this contact</button></section>
      <nav class="tabs" aria-label="Assistant sections"><button class="tab active" data-tab="write" data-testid="tab-write">Write</button><button class="tab" data-tab="memory" data-testid="tab-memory">Memory</button><button class="tab" data-tab="tasks" data-testid="tab-tasks">Commitments</button><button class="tab" data-tab="stats" data-testid="tab-stats">Progress</button></nav>
      <div class="body">
        <section id="view-write">
          <div class="intro"><h2 class="intro-title">Find the right words.</h2><div class="muted">Your voice, with a little help.</div></div>
          <div class="modes"><button class="mode active" data-mode="rewrite" data-testid="mode-rewrite">Rewrite a message</button><button class="mode" data-mode="reply" data-testid="mode-reply">${sparkle} Suggest a reply</button></div>
          <div class="mode-row"><button class="link-btn" data-mode="explain" data-testid="mode-explain">Explain selection</button><button class="link-btn" data-mode="calendar" data-testid="mode-calendar">Add to calendar</button></div>
          <div class="label-row"><label for="source" id="source-label">YOUR DRAFT OR SELECTED TEXT</label><button class="link-btn" id="use-draft">Use current draft</button></div>
          <textarea class="field source" id="source" data-testid="source-text" placeholder="Select text in this chat, or write a draft here…" maxlength="20000"></textarea>
          <div class="prompt-wrap"><div class="label-row"><label for="prompt">WHAT WOULD YOU LIKE TO CHANGE?</label><span class="muted" style="font-size:10px">Your instructions</span></div><textarea class="field prompt" id="prompt" data-testid="prompt" placeholder="Make this warmer, but keep it short…" maxlength="4000"></textarea></div>
          <div class="chips"><button class="chip" data-prompt="Make it friendly and natural.">Friendly</button><button class="chip" data-prompt="Make it shorter without losing the meaning.">Shorter</button><button class="chip" data-prompt="Make it professional without sounding stiff.">Professional</button></div>
          <div class="attach-line"><button class="attach-btn" id="attach">＋ Attach media</button><span class="muted" style="font-size:10px">Image · voice · PDF · video</span><input class="file-input" data-testid="attachment-input" id="files" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,audio/*,video/*,.ogg,.opus,.m4a,.mp3,.mp4,.webm,.mov,.txt"></div>
          <div class="files" id="file-list"></div>
          <button class="primary" data-testid="generate" id="generate">${sparkle}<span id="generate-label">Generate suggestions</span></button>
          <div class="notice" id="connection-note" hidden></div><div id="results" aria-live="polite"></div>
        </section>
        <section id="view-memory" hidden><h2 class="intro-title">A little context goes a long way.</h2><p class="muted">Kept separately for this conversation. Your outgoing messages and accepted edits help shape suggestions.</p><div class="label-row"><label for="profile">HOW YOU WANT TO SOUND WITH THIS PERSON</label></div><textarea id="profile" class="field profile" maxlength="10000" placeholder="We work together. Keep replies warm, concise, and direct. Preserve my usual emojis."></textarea><div class="inline-actions"><button id="save-profile" class="secondary">Save preferences</button><button id="capture" class="secondary">Capture loaded messages</button></div><div id="memory-info" class="notice"></div><p class="muted">Open this panel while chatting to retain loaded messages. Older messages become available when you scroll to them. Missing media is recorded as a placeholder.</p><details><summary class="muted">Import an exported chat</summary><p class="muted">Import only the export for the current conversation.</p><label for="export-name">Your exact sender name in the export</label><input id="export-name" class="field" style="min-height:0" placeholder="Your WhatsApp display name"><div class="inline-actions"><button id="import" class="secondary">Import .txt or .json</button><input id="import-file" type="file" accept=".txt,.json" class="file-input"></div></details><div class="inline-actions"><button id="forget" class="link-btn danger">Forget this conversation</button></div><div class="notice">Memory stays in this browser profile. Relevant context is sent to OpenAI only when you ask for help.</div></section>
        <section id="view-tasks" hidden><h2 class="intro-title">Keep your word.</h2><p class="muted">Review possible commitments from the captured conversation. Mark them done when you follow through.</p><button class="primary" id="find-tasks">Find commitments</button><div class="notice">These are suggestions. Check who promised what and whether plans changed.</div><div id="tasks" style="margin-top:16px"></div></section>
        <section id="view-stats" hidden><h2 class="intro-title">Small edits. Better habits.</h2><p class="muted">Feedback on your own drafts. Tone preferences and grammar corrections are kept distinct.</p><div id="stats"></div></section>
      </div>
      <div class="status" id="status" role="status">Ready when you are.</div><div class="footer"><span id="coverage">Only captured conversation context</span><span>Powered by OpenAI</span></div>
    </aside>
    <div class="selection-bubble" id="selection-bubble" hidden><button id="ask-selection">${sparkle} Ask Threadlight</button><button id="calendar-selection">Calendar</button></div>`;
  shadow.append(shell); document.documentElement.append(host);
  const $ = sel => shadow.querySelector(sel);
  const $$ = sel => [...shadow.querySelectorAll(sel)];
  let opened = false, mode = 'rewrite', activeTab = 'write', chat = null, memory = {}, stats = {}, attachments = [], lastSelection = null, bubblePending = null, accountLabel = '';
  let selectionDraft = '', requestNumber = 0, contextVersion = 0, busy = false, debounce, fingerprint = '', resultContext = null, ownDraft = false;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const isCurrent = target => !!target && chat?.id === target.id && (!target.accountLabel || target.accountLabel === accountLabel) && adapter.getSnapshot().chat?.id === target.id;
  function setStatus(message, error = false) { $('#status').textContent = message; $('#status').classList.toggle('error', error); }
  async function send(type, data = {}) {
    try {
      const response = await chrome.runtime.sendMessage({ type, ...(accountLabel ? {accountLabel} : {}), ...data });
      if (!response?.ok) throw new Error(response?.error || 'The extension did not respond. Reload WhatsApp Web after reloading the extension.');
      return response;
    } catch (error) { throw new Error(error.message.includes('Extension context invalidated') ? 'Extension updated. Reload WhatsApp Web to reconnect.' : error.message); }
  }
  function setBusy(value) {
    busy = value; $('#generate').disabled = value; $('#find-tasks').disabled = value;
    $$('[data-mode]').forEach(b => b.disabled = value);
    $('#generate-label').textContent = value ? 'Thinking about your conversation…' : ({ rewrite: 'Generate suggestions', reply: 'Suggest replies', explain: 'Explain this message', calendar: 'Prepare calendar event' }[mode]);
  }
  function setMode(next) {
    mode = next; setTab('write');
    $$('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    $('#source-label').textContent = mode === 'reply' ? 'MESSAGE TO REPLY TO · OPTIONAL' : mode === 'calendar' ? 'MESSAGE WITH THE PLAN OR COMMITMENT' : mode === 'explain' ? 'MESSAGE TO EXPLAIN' : 'YOUR DRAFT OR SELECTED TEXT';
    $('#prompt').placeholder = mode === 'reply' ? 'What would you like to say? Optional…' : mode === 'calendar' ? 'Add missing details, such as time or duration…' : mode === 'explain' ? 'Explain the meaning, tone, or a phrase…' : 'Make this warmer, but keep it short…';
    setBusy(busy);
  }
  function setTab(name) {
    activeTab = name; $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    ['write','memory','tasks','stats'].forEach(t => $('#view-' + t).hidden = t !== name);
    if (name === 'stats') renderStats(); if (name === 'tasks') renderTasks();
  }
  function resetForChat(next) {
    requestNumber++; contextVersion++; setBusy(false); chat = next; bubblePending = null; memory = {}; stats = {}; attachments = []; lastSelection = null; fingerprint = ''; resultContext = null; ownDraft=false;
    $('#source').value = ''; $('#prompt').value = ''; $('#profile').value = ''; $('#results').replaceChildren(); renderFiles();
    $('#selection-bubble').hidden = true; $('#chat-name').textContent = next?.name || 'Open a conversation with messages'; $('#coverage').textContent = 'Only captured conversation context';
    $('#memory-info').textContent='';$('#contact-phone').value='';$('#chat-binding').dataset.name='';renderTasks();renderStats();
  }
  function updateMemory(data) {
    if(data.settings?.accountLabel)accountLabel=data.settings.accountLabel;
    if (data.memory) memory = data.memory; if (data.stats) stats = data.stats;
    const count = memory.messages?.length || 0;
    $('#coverage').textContent = `${count} captured messages · local memory`;
    $('#memory-info').textContent = `${count} messages retained. ${memory.examples?.length || 0} accepted writing examples.${memory.coverage?.retentionRemovals ? ` ${memory.coverage.retentionRemovals} older messages removed at the storage limit.` : ''}`;
    if (shadow.activeElement !== $('#profile')) $('#profile').value = memory.profile || '';
    if (activeTab === 'tasks') renderTasks(); if (activeTab === 'stats') renderStats();
  }
  async function refresh({ force = false } = {}) {
    if (!opened) return;
    const snap = adapter.getSnapshot(); const changed = chat?.id !== snap.chat?.id;
    if (changed) resetForChat(snap.chat);
    const binding=snap.binding;$('#chat-binding').hidden=!binding?.required;
    if(binding?.required){
      $('#chat-name').textContent=binding.name||'Choose a conversation';
      if($('#chat-binding').dataset.name!==binding.name){$('#chat-binding').dataset.name=binding.name;$('#contact-phone').value=binding.suggestedPhone||'';}
      $('#bind-contact').disabled=!binding.canBind;
    }
    if (!snap.chat) { setStatus(binding?.reason || 'Open a chat with loaded messages so its identity can be verified.', true); return; }
    chat = snap.chat; $('#chat-name').textContent = chat.name; const capturedId = chat.id; const version=contextVersion;
    if (changed || force) {
      const data = await send('GET_STATE', { chat }); if (version!==contextVersion||!isCurrent({id:capturedId})) return; updateMemory(data);
      if (changed) setStatus('Context switched to ' + chat.name + '.');
    }
    const mark = JSON.stringify(snap.messages.map(m => [m.id,m.text]));
    if (mark !== fingerprint || force) {
      const data = await send('CAPTURE', { chat, messages: snap.messages }); if (version!==contextVersion||!isCurrent({id:capturedId})) return; fingerprint = mark; updateMemory(data);
    }
  }
  async function openPanel(nextMode = 'rewrite', text) {
    const observed = adapter.getSelection();
    const selected = text && bubblePending?.selection.text===text ? bubblePending.selection : observed;
    const snap = adapter.getSnapshot();
    opened = true; $('.panel').hidden = false; $('.launcher').hidden = true;
    await refresh({ force: true }).catch(e => setStatus(e.message, true));
    if(adapter.getSnapshot().chat?.id!==snap.chat?.id){setStatus('The conversation changed. Select the message again.',true);return;}
    setMode(nextMode);
    lastSelection = selected.text ? selected : null; selectionDraft = snap.draft;
    $('#source').value = text ?? selected.text ?? '';
    ownDraft = !!selected.fromComposer;
    if (!$('#source').value && nextMode === 'rewrite') {$('#source').value = snap.draft;ownDraft=!!snap.draft;}
    $('#selection-bubble').hidden = true; $('#prompt').focus();
    send('HEALTH').then(r => {const health = r.health || r; const ready = health.ready ?? health.configured; $('#connection-note').hidden = ready !== false; if (ready === false) $('#connection-note').textContent = 'One-time setup: add your OpenAI key in the local setup page, then pair this extension in Settings.';}).catch(() => {$('#connection-note').hidden = false; $('#connection-note').textContent = 'Start the local service and pair it in Settings to use OpenAI.';});
  }
  function closePanel() { opened = false; $('.panel').hidden = true; $('.launcher').hidden = false; $('#selection-bubble').hidden = true; }
  async function generate(action = mode) {
    if (busy) return; await refresh(); const snap = adapter.getSnapshot();
    if (!chat || snap.chat?.id !== chat.id) throw new Error('Open a conversation with loaded messages first.');
    const text = $('#source').value.trim();
    if (['rewrite','explain','calendar'].includes(action) && !text && !attachments.length) throw new Error('Select a message, write a draft, or attach media first.');
    const n = ++requestNumber;
    const context = { chat: { ...chat }, accountLabel, original: action === 'rewrite' && ownDraft ? text : '', mode: action, draft: snap.draft, range: action === 'rewrite' && lastSelection?.fromComposer && selectionDraft === snap.draft && text === lastSelection.text ? lastSelection.range : null };
    setBusy(true); setStatus('Reading the relevant context…'); $('#connection-note').hidden = true;
    try {
      const { result } = await send('GENERATE', { chat: context.chat, mode: action, text, prompt: $('#prompt').value.trim(), trackWriting:action==='rewrite'&&ownDraft, attachments: attachments.map(({ name,mime,data }) => ({ name,mime,data })), sourceTimestamp: lastSelection?.sourceTimestamp || '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, now: new Date().toISOString() });
      if (n !== requestNumber || adapter.getSnapshot().chat?.id !== context.chat.id) {if(n === requestNumber) setStatus('Conversation changed. Those suggestions were discarded.');return;}
      resultContext = context;
      if (action === 'commitments') { await refresh({ force: true }); renderTasks(); setStatus('Review the possible commitments below.'); }
      else { renderResult(result); setStatus(action === 'calendar' ? 'Check the details before opening Google Calendar.' : 'Choose the version that sounds like you.'); }
      const state = await send('GET_STATE', { chat: context.chat }); if (chat?.id === context.chat.id) updateMemory(state);
    } finally { if (n === requestNumber) setBusy(false); }
  }
  function safeRun(fn) { return (...args) => Promise.resolve().then(() => fn(...args)).catch(e => setStatus(e.message || 'Something went wrong.', true)); }
  function renderResult(result) {
    const root = $('#results'); root.replaceChildren();
    for (const note of result.mediaNotes || []) root.append(el('p','media-note',note));
    if (result.suggestions?.length) {
      const heading = el('div','section-heading','A few ways to say it'); heading.append(el('span','',String(result.suggestions.length) + ' options')); root.append(heading);
      result.suggestions.forEach((suggestion, index) => {
        const card = el('article','suggestion'); card.dataset.testid = 'suggestion';
        const head = el('div','suggestion-head',suggestion.label); head.append(el('span','suggestion-number',String(index + 1).padStart(2,'0'))); card.append(head, el('p','suggestion-text',suggestion.text),el('p','suggestion-explanation',suggestion.explanation));
        const actions = el('div','card-actions'); const c = resultContext;
        const insert = el('button','secondary insert',c.range ? 'Replace selection' : c.draft ? 'Replace draft' : 'Use this draft'); insert.dataset.testid='insert';
        insert.addEventListener('click', safeRun(async () => {
          const outcome = adapter.insertDraft(suggestion.text, { expectedChatId: c.chat.id, expectedDraft: c.draft, range: c.range }); if (!outcome.ok) throw new Error(outcome.error);
          setStatus('Inserted into the draft. You choose when to send.'); insert.disabled = true;
          const data = await send('ACCEPT', { chat:c.chat,accountLabel:c.accountLabel,original:c.original,suggestion,feedback:c.original?result.feedback||[]:[],action:'insert' }); if(isCurrent(c.chat)&&accountLabel===c.accountLabel)updateMemory(data);
        }));
        const copy = el('button','secondary','Copy'); copy.dataset.testid='copy'; copy.addEventListener('click',safeRun(async()=>{
          await navigator.clipboard.writeText(suggestion.text); setStatus('Copied.');
          const data=await send('ACCEPT',{chat:c.chat,accountLabel:c.accountLabel,original:c.original,suggestion,feedback:c.original?result.feedback||[]:[],action:'copy'}); if(isCurrent(c.chat)&&accountLabel===c.accountLabel)updateMemory(data);
        })); actions.append(insert,copy); card.append(actions); root.append(card);
      }); root.append(el('p','notice','Suggestions stay as drafts until you send them in WhatsApp.'));
    }
    if (result.explanation) root.append(el('div','section-heading',mode === 'explain' ? 'What it means' : 'A little context'),el('div','explanation-box',result.explanation));
    if (result.event) renderEvent(result.event,root);
    if (result.feedback?.length && mode === 'rewrite' && resultContext.original) {
      const details = el('details','notice'); details.append(el('summary','','What changed in your English'));
      for(const f of result.feedback){const row=el('div','feedback-item');row.append(el('b','',f.category),el('div','',`${f.original} → ${f.improved}`),el('div','',f.reason));details.append(row);}root.append(details);
    }
  }
  function renderEvent(event, root) {
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
    if(event.needsClarification){const label=el('label','review-check','I have filled in and checked the missing details above.');reviewed=el('input');reviewed.type='checkbox';reviewed.dataset.testid='calendar-reviewed';label.prepend(reviewed);form.append(label);}
    const button=el('button','primary','Review in Google Calendar');button.dataset.testid='calendar-open';button.addEventListener('click',safeRun(async()=>{
      const value={...event,description:notes.value};Object.entries(fields).forEach(([k,v])=>value[k]=v.value.trim());
      if(!value.title||!value.start||!value.end)throw new Error('Add a title, start, and end time before opening Calendar.');
      if(reviewed&&!reviewed.checked)throw new Error('Check the missing details, then tick the review box.');
      for(const key of ['start','end']){const date=new Date(value[key]);if(!Number.isFinite(+date)||localInput(date.toISOString())!==value[key])throw new Error('Choose a valid local date and time.');value[key]=date.toISOString();}
      value.needsClarification=false;value.questions=[];
      await send('OPEN_CALENDAR',{event:value});setStatus('Opened Google Calendar. Review and press Save there.');
    }));form.append(button,el('p','notice','Opens a prefilled event. You save it in Google Calendar; nobody is invited automatically.'));root.append(form);
  }
  function renderFiles() {
    const root=$('#file-list');root.replaceChildren();
    attachments.forEach((file,index)=>{const chip=el('span','file-chip',file.name);const remove=el('button','','×');remove.setAttribute('aria-label','Remove '+file.name);remove.onclick=()=>{attachments.splice(index,1);renderFiles();};chip.append(remove);root.append(chip);});
  }
  async function addFiles(files) {
    if(attachments.length+files.length>4)throw new Error('Attach up to four files at a time.');
    if(attachments.reduce((n,f)=>n+f.size,0)+[...files].reduce((n,f)=>n+f.size,0)>16*1024*1024)throw new Error('Keep attachments under 16 MB combined.');
    const current=chat?.id; const incoming=[];
    for(const file of files){
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read '+file.name));reader.readAsDataURL(file);});
      incoming.push({name:file.name,mime:file.type||({pdf:'application/pdf',txt:'text/plain',ogg:'audio/ogg',opus:'audio/ogg',mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'}[file.name.split('.').pop().toLowerCase()]||'application/octet-stream'),data,size:file.size});
    }
    if(chat?.id!==current)throw new Error('The conversation changed. Attach those files again in the intended chat.');
    attachments.push(...incoming);renderFiles();setStatus('Attachments will be sent to OpenAI when you generate.');
  }
  function renderTasks() {
    const root=$('#tasks');root.replaceChildren(); const tasks=memory.tasks||[];
    if(!tasks.length){root.append(el('div','empty','No commitments captured yet. Find commitments to review this conversation.'));return;}
    const target=chat?{...chat,accountLabel}:null;
    for(const task of tasks){
      const card=el('article','task');card.append(el('div','task-title',task.title),el('div','task-meta',`${task.owner||'Owner unclear'} · ${task.due||'No date specified'} · ${task.status||'pending'}`));if(task.source)card.append(el('div','task-source',task.source));
      const actions=el('div','card-actions');if(!task.status||task.status==='pending')for(const [label,status] of [['Done','done'],['Dismiss','dismissed']]){const b=el('button','secondary',label);b.onclick=safeRun(async()=>{if(!isCurrent(target))throw new Error('The conversation changed.');const data=await send('UPDATE_TASK',{chat:target,id:task.id,status});if(isCurrent(target))updateMemory(data);});actions.append(b);}
      const calendar=el('button','secondary','Calendar');calendar.onclick=safeRun(()=>{if(!isCurrent(target))throw new Error('The conversation changed.');setMode('calendar');$('#source').value=[task.title,task.due,task.source].filter(Boolean).join('\n');ownDraft=false;lastSelection=null;$('#prompt').focus();});actions.append(calendar);card.append(actions);root.append(card);
    }
  }
  function renderStats() {
    const root=$('#stats');root.replaceChildren();const grid=el('div','stat-grid');
    for(const [value,label] of [[stats.acceptedRewrites||0,'Rewrites used'],[stats.acceptedSuggestions||0,'Suggestions used']]){const card=el('div','stat');card.append(el('div','stat-value',String(value)),el('div','stat-label',label));grid.append(card);}root.append(grid);
    root.append(el('p','notice','These are writing activity counts, not an English proficiency score. Copying or inserting a suggestion counts as use, not proof of learning.'));
    if(stats.commonIssues?.length){root.append(el('div','section-heading','Patterns to practise'));for(const issue of stats.commonIssues)root.append(el('p','muted',`${issue.category}: ${issue.count}`));}
    const feedback=stats.recentFeedback||[];
    if(feedback.length){root.append(el('div','section-heading','Recent learning notes'));for(const f of feedback.slice(-10).reverse()){const item=el('div','feedback-item');item.append(el('b','',f.category||'Writing'),el('div','',`${f.original||''} → ${f.improved||''}`),el('div','',f.reason||''));root.append(item);}}
    else root.append(el('div','empty','Rewrite your own drafts to start collecting specific learning notes.'));
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
  $('.launcher').onclick=safeRun(()=>openPanel());$('#close').onclick=closePanel;$('#settings').onclick=safeRun(()=>send('OPEN_SETTINGS'));
  $('#bind-contact').onclick=safeRun(async()=>{adapter.bindConversation($('#contact-phone').value);await refresh({force:true});if(chat)setStatus('History linked to this contact. Ready when you are.');});
  $$('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  $$('[data-mode]').forEach(b=>b.onclick=()=>{setMode(b.dataset.mode);$('#results').replaceChildren();});
  $$('[data-prompt]').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.prompt;$('#prompt').focus();});
  $('#source').addEventListener('input',()=>{if(!lastSelection?.text)ownDraft=true;});
  $('#generate').onclick=safeRun(()=>generate());$('#find-tasks').onclick=safeRun(()=>generate('commitments'));
  $('#use-draft').onclick=()=>{const snap=adapter.getSnapshot();$('#source').value=snap.draft;lastSelection=null;ownDraft=true;setMode('rewrite');};
  $('#attach').onclick=()=>$('#files').click();$('#files').onchange=()=>{const files=[...$('#files').files];safeRun(async()=>{await addFiles(files);$('#files').value='';})();};
  shadow.addEventListener('paste',e=>{if(e.clipboardData?.files.length){e.preventDefault();safeRun(()=>addFiles(e.clipboardData.files))();}});
  $('#save-profile').onclick=safeRun(async()=>{if(!isCurrent(chat))throw new Error('Open a conversation first.');const target={...chat,accountLabel};const data=await send('SAVE_PROFILE',{chat:target,profile:$('#profile').value});if(isCurrent(target)){updateMemory(data);setStatus('Preferences saved for this conversation.');}});
  $('#capture').onclick=safeRun(async()=>{await refresh({force:true});setStatus('Loaded messages captured.');});
  $('#forget').onclick=safeRun(async()=>{if(!isCurrent(chat))return;const target={...chat,accountLabel};if(!window.confirm('Forget saved messages, preferences, examples, and commitments for this conversation?'))return;const data=await send('FORGET_CHAT',{chat:target});if(isCurrent(target)){updateMemory(data);fingerprint=JSON.stringify(adapter.getSnapshot().messages.map(m=>[m.id,m.text]));setStatus('Conversation memory cleared. Close the panel to stop new capture.');}});
  $('#import').onclick=()=>$('#import-file').click();$('#import-file').onchange=safeRun(async()=>{
    if(!chat)throw new Error('Open the conversation this export belongs to first.');const target={...chat,accountLabel};const file=$('#import-file').files[0];if(!file)return;if(file.size>10*1024*1024)throw new Error('Import a text export under 10 MB.');
    const text=await file.text();const name=$('#export-name').value.trim();if(!file.name.endsWith('.json')&&!name)throw new Error('Enter your sender name before importing.');
    const messages=file.name.endsWith('.json')?JSON.parse(text):parseImport(text,name);if(chat?.id!==target.id)throw new Error('Chat changed; import again into the intended conversation.');
    if(!Array.isArray(messages))throw new Error('JSON must contain an array of message records.');const data=await send('IMPORT_MESSAGES',{chat:target,messages});if(isCurrent(target)){updateMemory(data);setStatus('History imported for '+target.name+'.');$('#import-file').value='';}
  });
  function bubbleSelection(event) {
    if(event.composedPath().includes(host))return;const selected=adapter.getSelection();if(!selected.text){$('#selection-bubble').hidden=true;return;}
    bubblePending={selection:selected,chatId:adapter.getSnapshot().chat?.id};const rect=selected.range.getBoundingClientRect();const bubble=$('#selection-bubble');bubble.hidden=false;bubble.style.left=Math.max(10,Math.min(rect.left,window.innerWidth-245))+'px';bubble.style.top=Math.max(8,Math.min(rect.bottom+8,window.innerHeight-55))+'px';
  }
  document.addEventListener('mouseup',bubbleSelection);document.addEventListener('keyup',event=>{if(event.key==='Shift')bubbleSelection(event);});
  const openSelection=next=>{if(bubblePending?.chatId!==adapter.getSnapshot().chat?.id)throw new Error('The conversation changed. Select the message again.');return openPanel(next,bubblePending?.selection.text);};
  $('#ask-selection').onclick=safeRun(()=>openSelection('rewrite'));$('#calendar-selection').onclick=safeRun(()=>openSelection('calendar'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closePanel();return;}if(event.altKey&&event.shiftKey&&event.code==='KeyW'){event.preventDefault();opened?closePanel():safeRun(()=>openPanel())();}});
  $('#prompt').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();safeRun(()=>generate())();}});
  chrome.runtime.onMessage.addListener(message=>{if(message.type==='UI_ACCOUNT_CHANGED'){adapter.clearBinding?.();accountLabel='';resetForChat(null);if(opened)safeRun(()=>refresh({force:true}))();}if(message.type==='UI_OPEN'){if(message.toggle&&opened)closePanel();else safeRun(()=>openPanel(message.mode||'rewrite',message.text))();}});
  document.addEventListener('threadlight-binding-invalidated',()=>{if(opened)safeRun(()=>refresh({force:true}))();});
  new MutationObserver(()=>{if(!opened)return;clearTimeout(debounce);debounce=setTimeout(()=>refresh().catch(e=>setStatus(e.message,true)),280);}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-id','title']});
})();
