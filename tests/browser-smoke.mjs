/** Isolated Chromium tests. All chat/AI data are synthetic. No production network calls. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { startFixture, projectRoot, installMockRuntime } from './browser-support.mjs';

const { chromium } = await import(process.env.COPILOT_PLAYWRIGHT || 'playwright');
const fixture = await startFixture();
const browser = await chromium.launch({ headless:true, ...(process.env.COPILOT_CHROMIUM ? {executablePath:process.env.COPILOT_CHROMIUM} : {}) });
const page = await browser.newPage({viewport:{width:1440,height:1050}});
let passed = 0;
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const check = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };

try {
  await page.goto(fixture.url);
  await page.evaluate(()=>{fixture.contacts.b.name='Jamie Chen';document.querySelector('[data-contact="b"] strong').textContent='Jamie Chen';document.querySelector('[data-contact="b"] .avatar').textContent='JC';document.querySelector('.fixture-controls p').textContent='These fictional conversations have different displayed names.';fixture.switchChat('a');});
  await page.addScriptTag({path:path.join(projectRoot,'extension/adapter.js')});
  await check('capture preserves direction, timestamp and displayed-name identity', async () => {
    const s = await page.evaluate(() => {const s=WACopilot.adapter.getSnapshot();return {chat:s.chat,messages:s.messages,draft:s.draft};});
    assert.equal(s.chat.id,'name:Alex Rao'); assert.equal(s.chat.name,'Alex Rao');
    assert.equal(s.messages.length,4); assert.equal(s.messages[1].direction,'out'); assert.equal(s.messages[0].direction,'in');
    assert.match(s.messages[0].timestamp,/10\/28\/2026/);
    assert.equal(s.messages[0].text,'Hey! Did you get a chance to look at the updated design?');
    assert.match(s.draft,/is that works/);
  });
  await check('different displayed names have separate memory identities', async () => {
    const ids = await page.evaluate(() => {const a=WACopilot.adapter.getSnapshot().chat;fixture.switchChat('b');const b=WACopilot.adapter.getSnapshot().chat;fixture.switchChat('a');return [a,b];});
    assert.notEqual(ids[0].name,ids[1].name); assert.notEqual(ids[0].id,ids[1].id);
  });
  await check('partial selection replaces only selected draft text and never sends', async () => {
    const result = await page.evaluate(() => {
      fixture.setDraft('Please fix this bit today.'); const box=document.querySelector('[contenteditable]');
      const range=document.createRange(); range.setStart(box.firstChild,7); range.setEnd(box.firstChild,19);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      const selection=WACopilot.adapter.getSelection(); const s=WACopilot.adapter.getSnapshot();
      const inserted=WACopilot.adapter.insertDraft('review the design',{expectedChatId:s.chat.id,expectedDraft:s.draft,range:selection.range});
      return {selection:selection.text,fromComposer:selection.fromComposer,inserted,text:box.innerText,sent:fixture.sendCount};
    });
    assert.equal(result.selection,'fix this bit'); assert.equal(result.fromComposer,true); assert.equal(result.inserted.ok,true);
    assert.equal(result.text,'Please review the design today.'); assert.equal(result.sent,0);
  });
  await check('draft changes and chat switches block stale insertions', async () => {
    const r=await page.evaluate(() => {
      const before=WACopilot.adapter.getSnapshot(); fixture.setDraft('A new unsaved draft');
      const changed=WACopilot.adapter.insertDraft('Wrong replacement',{expectedChatId:before.chat.id,expectedDraft:before.draft});
      fixture.switchChat('b'); const switched=WACopilot.adapter.insertDraft('Wrong contact',{expectedChatId:before.chat.id,expectedDraft:before.draft});
      const text=WACopilot.adapter.getSnapshot().draft; fixture.switchChat('a'); return {changed,switched,text};
    });
    assert.equal(r.changed.ok,false); assert.equal(r.switched.ok,false); assert.equal(r.text,'sounds good see you there');
  });
  await check('whitespace around a selected phrase survives replacement',async()=>{
    const result=await page.evaluate(()=>{
      fixture.setDraft('Please fix this bit today.');const box=document.querySelector('[contenteditable]');const range=document.createRange();
      range.setStart(box.firstChild,6);range.setEnd(box.firstChild,20);getSelection().removeAllRanges();getSelection().addRange(range);
      const selection=WACopilot.adapter.getSelection();const snapshot=WACopilot.adapter.getSnapshot();
      const inserted=WACopilot.adapter.insertDraft('review the design',{expectedChatId:snapshot.chat.id,expectedDraft:snapshot.draft,range:selection.range});
      const text=box.innerText;fixture.switchChat('a');return {text,inserted};
    });
    assert.equal(result.inserted.ok,true);assert.equal(result.text,'Please review the design today.');
  });
  await check('missing IDs allow name identity while unavailable names and mixed IDs fail closed', async () => {
    const r=await page.evaluate(() => {
      document.querySelectorAll('[data-id]')[1].dataset.id='false_918765432109@c.us_TRANSITION';
      const mixed=WACopilot.adapter.getSnapshot().chat;
      document.querySelectorAll('[data-id]').forEach(n=>n.removeAttribute('data-id'));
      const withoutIds=WACopilot.adapter.getSnapshot().chat;
      const title=document.querySelector('header [title]');title.title='';title.textContent='';
      const withoutName=WACopilot.adapter.getSnapshot().chat;
      fixture.switchChat('a');return {mixed,withoutIds,withoutName};
    });
    assert.equal(r.mixed,null);assert.equal(r.withoutIds.id,'name:Alex Rao');assert.equal(r.withoutName,null);
  });
  await check('the same displayed name intentionally returns the same scope across different IDs',async()=>{
    const r=await page.evaluate(()=>{
      const first=WACopilot.adapter.getSnapshot().chat;
      fixture.contacts.b.name='Alex Rao';fixture.switchChat('b');const repeated=WACopilot.adapter.getSnapshot().chat;
      fixture.contacts.b.name='Jamie Chen';fixture.switchChat('a');return {first,repeated};
    });
    assert.equal(r.first.id,r.repeated.id);assert.equal(r.first.id,'name:Alex Rao');
  });
  await check('name scopes normalize Unicode and whitespace while preserving exact case',async()=>{
    const ids=await page.evaluate(()=>{
      fixture.contacts.a.name='  Jose\u0301   Li  ';fixture.switchChat('a');const decomposed=WACopilot.adapter.getSnapshot().chat.id;
      fixture.contacts.a.name='José Li';fixture.switchChat('a');const composed=WACopilot.adapter.getSnapshot().chat.id;
      fixture.contacts.a.name='josé Li';fixture.switchChat('a');const lower=WACopilot.adapter.getSnapshot().chat.id;
      fixture.contacts.a.name='A'.repeat(161);fixture.switchChat('a');const overlong=WACopilot.adapter.getSnapshot().chat;
      fixture.contacts.a.name='Alex Rao';fixture.switchChat('a');return {decomposed,composed,lower,overlong};
    });
    assert.equal(ids.decomposed,'name:José Li');assert.equal(ids.composed,ids.decomposed);assert.equal(ids.lower,'name:josé Li');assert.notEqual(ids.lower,ids.composed);assert.equal(ids.overlong.id,'name:'+'A'.repeat(160));
  });
  if (process.env.COPILOT_ADAPTER_ONLY !== '1') {
    await page.evaluate(installMockRuntime,fixture.url);
    await page.addScriptTag({path:path.join(projectRoot,'extension/layout.js')});
    await page.addScriptTag({path:path.join(projectRoot,'extension/commitments.js')});
    await page.addScriptTag({path:path.join(projectRoot,'extension/content.js')});
    await runInterfaceTests(page,check);
    await mkdir(path.join(projectRoot,'demo'),{recursive:true});
    await page.screenshot({path:path.join(projectRoot,'demo/preview.png'),fullPage:true});
  }
  assert.deepEqual(errors,[],'No browser runtime errors');
  console.log(`\n${passed} isolated browser checks passed. No live WhatsApp or OpenAI calls were made.`);
} finally { await browser.close(); await fixture.close(); }

async function runInterfaceTests(page,check) {
  await check('content UI mounts and exposes an explicit reply action',async () => {
    await page.locator('#threadlight-root').waitFor({state:'attached'});
    await page.waitForFunction(()=>mockBridge.requests.some(r=>r.type==='CAPTURE'&&r.chat.id==='name:Alex Rao'));
    assert.equal(await page.getByTestId('panel').isVisible(),false);
    assert.equal(await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').length),0);
    assert.equal(await page.getByTestId('tab-stats').count(),0);
    await page.getByTestId('toggle').click();
    await page.getByTestId('panel').waitFor({state:'visible'});
    assert.match(await page.getByTestId('mode-reply').innerText(),/reply/i);
  });
  await runClosedPanelCaptureTest(page,check);
  await check('active selection metadata survives an unrelated page selection',async () => {
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
      fixture.setDraft('Please fix this bit today.');
      const box=document.querySelector('[contenteditable]');const range=document.createRange();
      range.setStart(box.firstChild,7);range.setEnd(box.firstChild,19);
      getSelection().removeAllRanges();getSelection().addRange(range);
      box.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,composed:true}));
    });
    await page.locator('#threadlight-root').locator('#ask-selection').click();
    assert.equal(await page.getByTestId('source-text').inputValue(),'fix this bit');
    await page.getByTestId('prompt').fill('Make this clearer.');
    await page.evaluate(()=>{
      const incoming=document.querySelector('.message-in .selectable-text');const range=document.createRange();range.selectNodeContents(incoming);
      getSelection().removeAllRanges();getSelection().addRange(range);incoming.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,composed:true}));
    });
    assert.equal(await page.getByTestId('source-text').inputValue(),'fix this bit');
    await generateUI(page);
    const request=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1));
    assert.equal(request.text,'fix this bit');
    assert.equal(request.sourceTimestamp,'');
    await page.getByTestId('insert').first().click();
    assert.equal(await page.locator('#main [contenteditable]').innerText(),'Please I can send you the updated design tomorrow morning. Does that work for you? today.');
    assert.equal(await page.evaluate(()=>fixture.sendCount),0);
  });
  await check('rewriting incoming text does not become a personal style example',async () => {
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
      const message=document.querySelector('.message-in .selectable-text');const range=document.createRange();range.selectNodeContents(message);
      getSelection().removeAllRanges();getSelection().addRange(range);message.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,composed:true}));
    });
    await page.locator('#threadlight-root').locator('#ask-selection').click();
    assert.match(await page.getByTestId('source-text').inputValue(),/Did you get a chance/);
    await generateUI(page);
    await page.getByTestId('insert').first().click();
    assert.equal(await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='ACCEPT').at(-1).original),'');
    await page.evaluate(()=>fixture.setDraft(fixture.contacts.a.draft));
    await page.locator('#threadlight-root').locator('#use-draft').click();
  });
  await check('custom prompt produces three distinct suggestions for the correct chat',async () => {
    await page.getByTestId('mode-rewrite').click();
    await page.getByTestId('prompt').fill('Make this friendly and keep the meaning.');
    await generateUI(page);
    await page.getByTestId('suggestion').nth(2).waitFor();
    assert.equal(await page.getByTestId('suggestion').count(),3);
    const request=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1));
    assert.equal(request.mode,'rewrite'); assert.equal(request.prompt,'Make this friendly and keep the meaning.');
    assert.equal(request.chat.id,'name:Alex Rao');
    const texts=await page.getByTestId('suggestion').allTextContents();
    assert.equal(new Set(texts).size,3);
  });
  await check('insert applies the chosen suggestion without sending',async () => {
    await page.getByTestId('insert').first().click();
    assert.equal(await page.locator('#main [contenteditable]').innerText(),'I can send you the updated design tomorrow morning. Does that work for you?');
    assert.equal(await page.evaluate(()=>fixture.sendCount),0);
  });
  await check('interface preserves an independently edited draft',async () => {
    await generateUI(page);
    await page.getByTestId('suggestion').nth(2).waitFor();
    await page.evaluate(()=>fixture.setDraft('Keep my new draft exactly as written.'));
    await page.getByTestId('insert').first().click();
    assert.equal(await page.locator('#main [contenteditable]').innerText(),'Keep my new draft exactly as written.');
    assert.match(await page.getByTestId('panel').innerText(),/draft changed/i);
  });
  await check('Suggest a reply sends reply mode instead of rewriting incoming text',async () => {
    await page.getByTestId('mode-reply').click();
    await page.getByTestId('prompt').fill('Acknowledge the plan, without promising a new deadline.');
    await generateUI(page);
    await page.getByTestId('suggestion').nth(2).waitFor();
    const request=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1));
    assert.equal(request.mode,'reply'); assert.equal(request.chat.id,'name:Alex Rao');
  });
  await check('attachment input forwards the explicit file with the request',async () => {
    await page.getByTestId('attachment-input').setInputFiles({name:'meeting-note.txt',mimeType:'text/plain',buffer:Buffer.from('Meet at the studio on Friday at 3 PM.')});
    await page.waitForFunction(()=>document.querySelector('#threadlight-root').shadowRoot.querySelector('#file-list').textContent.includes('meeting-note.txt'));
    await generateUI(page);
    await page.getByTestId('suggestion').nth(2).waitFor();
    const request=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1));
    assert.equal(request.attachments[0].name,'meeting-note.txt');
    assert.equal(Buffer.from(request.attachments[0].data,'base64').toString(),'Meet at the studio on Friday at 3 PM.');
  });
  await check('dedicated Calendar view preserves writing fields and opens an editable event draft',async () => {
    const writingSource=await page.getByTestId('source-text').inputValue();
    await page.getByTestId('mode-calendar').click();
    await page.getByTestId('calendar-source').fill('Meet at the studio on Friday, October 30, 2026 at 3 PM for 30 minutes.');
    await page.getByTestId('calendar-prompt').fill('Use the studio location and a thirty-minute duration.');
    await generateUI(page,'calendar-prepare');
    assert.equal(await page.getByTestId('source-text').inputValue(),writingSource);
    const request=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1));
    assert.equal(request.mode,'calendar');assert.equal(request.prompt,'Use the studio location and a thirty-minute duration.');
    await page.getByTestId('calendar-title').waitFor();
    await page.getByTestId('calendar-title').fill('Reviewed design meeting');
    await page.setViewportSize({width:1440,height:1380});
    await page.screenshot({path:path.join(projectRoot,'demo/calendar-preview.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1050});
    await page.getByTestId('calendar-open').click();
    const event=await page.evaluate(()=>mockBridge.calendars.at(-1));
    assert.equal(event.title,'Reviewed design meeting');
    assert.match(event.start,/2026-10-30/);
    assert.equal(await page.evaluate(()=>fixture.sendCount),0);
  });
  await check('Calendar account selection is saved, applied to review, and can return to the browser default',async()=>{
    assert.equal(await page.locator('#threadlight-root').getByText('Review the details, then save in Google Calendar.',{exact:true}).count(),0);
    await page.getByTestId('calendar-account').fill('alex.calendar@example.com');
    const before=await page.evaluate(()=>mockBridge.calendars.length);
    await page.getByTestId('calendar-open').click();
    assert.equal(await page.evaluate(()=>mockBridge.calendars.length),before,'Unsaved account choice blocks review');
    await page.getByTestId('calendar-save-account').click();
    await page.waitForFunction(()=>mockBridge.calendarAccount==='alex.calendar@example.com');
    await page.getByTestId('calendar-open').click();
    assert.equal(await page.evaluate(()=>mockBridge.calendars.at(-1).calendarAccount),'alex.calendar@example.com');
    await page.getByTestId('calendar-manage-account').click();
    const request=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='OPEN_CALENDAR_ACCOUNT').at(-1));
    assert.equal(request.event,undefined);assert.equal(request.text,undefined,'Account management carries no selected message');
    await page.evaluate(()=>mockBridge.dispatch({type:'UI_CALENDAR_ACCOUNT_CHANGED',calendarAccount:'second@example.com'}));
    assert.equal(await page.getByTestId('calendar-account').inputValue(),'second@example.com');
    await page.getByTestId('calendar-default-account').click();
    await page.waitForFunction(()=>mockBridge.calendarAccount==='');
    assert.equal(await page.getByTestId('calendar-account').inputValue(),'');
  });
  await check('synthetic page clicks and shortcuts cannot invoke AI or open a Calendar event',async()=>{
    const count=()=>page.evaluate(()=>mockBridge.requests.filter(r=>['GENERATE','OPEN_CALENDAR','OPEN_CALENDAR_ACCOUNT'].includes(r.type)).length);
    const before=await count();
    await page.evaluate(()=>{
      const root=document.querySelector('#threadlight-root').shadowRoot;
      for(const id of ['generate','calendar-prepare','find-tasks','calendar-manage-account'])root.getElementById(id).click();
      root.querySelector('[data-testid=calendar-open]').click();
      for(const id of ['prompt','calendar-prompt'])root.getElementById(id).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));
    });
    await page.waitForTimeout(100);
    assert.equal(await count(),before);
  });
  await check('an ambiguous calendar event requires dates and explicit review',async () => {
    const before=await page.evaluate(()=>{mockBridge.calendarNeedsClarification=true;return mockBridge.calendars.length;});
    await generateUI(page,'calendar-prepare');
    await page.getByTestId('calendar-open').click();
    assert.equal(await page.evaluate(()=>mockBridge.calendars.length),before);
    await page.getByTestId('calendar-start').fill('2026-10-30T15:00');
    await page.getByTestId('calendar-end').fill('2026-10-30T15:30');
    await page.getByTestId('calendar-open').click();
    assert.equal(await page.evaluate(()=>mockBridge.calendars.length),before);
    await page.getByTestId('calendar-reviewed').check();
    await page.getByTestId('calendar-open').click();
    assert.equal(await page.evaluate(()=>mockBridge.calendars.length),before+1);
    await page.evaluate(()=>{mockBridge.calendarNeedsClarification=false;});
  });
  await runCalendarContextTests(page,check);
  await check('text history import preserves your sender attribution in the current chat',async () => {
    await page.getByTestId('tab-memory').click();
    await page.locator('#threadlight-root').locator('summary').filter({hasText:'Import an exported chat'}).click();
    await page.locator('#threadlight-root').locator('#export-name').fill('You');
    await page.locator('#threadlight-root').locator('#import-file').setInputFiles({name:'export.txt',mimeType:'text/plain',buffer:Buffer.from('[10:00 AM, 10/27/2026] You: I will send the document.\n[10:01 AM, 10/27/2026] Alex Rao: Thanks!')});
    await page.waitForFunction(()=>mockBridge.requests.some(r=>r.type==='IMPORT_MESSAGES'));
    const request=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='IMPORT_MESSAGES').at(-1));
    assert.equal(request.chat.id,'name:Alex Rao');
    assert.equal(request.messages[0].direction,'out'); assert.equal(request.messages[1].direction,'in');
  });
  await check('a delayed preference save cannot overwrite another contact’s panel',async()=>{
    await page.evaluate(()=>{mockBridge.saveProfileDelay=800;});
    await page.locator('#threadlight-root').locator('#profile').fill('Use concise, friendly replies for the product team.');
    await page.locator('#threadlight-root').locator('#save-profile').click();
    await page.waitForFunction(()=>mockBridge.requests.some(r=>r.type==='SAVE_PROFILE'));
    await page.locator('[data-contact="b"]').click();
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#threadlight-root').locator('#profile').inputValue(),'');
    assert.equal(await page.evaluate(()=>mockBridge.memories.get('name:Alex Rao').profile),'Use concise, friendly replies for the product team.');
    assert.equal(await page.evaluate(()=>mockBridge.memories.get('name:Jamie Chen').profile),'');
    await page.evaluate(()=>{mockBridge.saveProfileDelay=0;});
    await page.locator('[data-contact="a"]').click();
    await page.waitForFunction(()=>document.querySelector('#threadlight-root').shadowRoot.querySelector('#profile').value==='Use concise, friendly replies for the product team.');
  });
  await check('commitment inbox renders extracted promises and updates completion',async () => {
    await page.getByTestId('tab-tasks').click();
    await page.locator('#threadlight-root').locator('#find-tasks').click();
    await page.locator('#threadlight-root').locator('.task-title').filter({hasText:'Send the final design'}).waitFor();
    const card=page.locator('#threadlight-root').locator('.task').first();
    assert.doesNotMatch(await card.innerText(),/ABCDEF123456789|sender:|timestamp:/);
    assert.match(await card.locator('.task-source').innerText(),/Could you send the final version/);
    assert.match(await card.locator('.task-attribution').innerText(),/Alex Rao · 27 Oct 2026 · 09:35/);
    assert.match(await card.locator('.task-meta').innerText(),/Due 29 Oct 2026/);
    await page.screenshot({path:path.join(projectRoot,'demo/commitments-preview.png'),fullPage:true});
    await page.locator('#threadlight-root').getByRole('button',{name:'Done',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#threadlight-root').shadowRoot.querySelector('.task-status').textContent==='Done');
    await page.getByTestId('tab-write').click();
  });
  await check('switching between different displayed names clears old suggestions',async () => {
    await page.getByTestId('mode-reply').click();
    await generateUI(page);
    await page.getByTestId('suggestion').nth(2).waitFor();
    await page.locator('[data-contact="b"]').click();
    await page.waitForFunction(()=>document.querySelector('#threadlight-root')?.shadowRoot?.querySelectorAll('[data-testid="suggestion"]').length===0);
    await generateUI(page);
    await page.getByTestId('suggestion').nth(2).waitFor();
    const request=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1));
    assert.equal(request.chat.id,'name:Jamie Chen');
  });
  await check('late results from the previous contact are not displayed in a new chat',async () => {
    await page.evaluate(()=>{mockBridge.delay=800;});
    await page.getByTestId('generate').click();
    await page.locator('[data-contact="a"]').click();
    await page.waitForTimeout(1100);
    assert.equal(await page.getByTestId('suggestion').count(),0);
    await page.evaluate(()=>{mockBridge.delay=0;});
  });
  await check('changing account scope clears old results and discards in-flight responses',async()=>{
    await page.getByTestId('mode-reply').click();
    const before=await page.evaluate(()=>{mockBridge.delay=800;return mockBridge.requests.filter(r=>r.type==='GENERATE').length;});
    await page.getByTestId('generate').click();
    await page.waitForFunction(n=>mockBridge.requests.filter(r=>r.type==='GENERATE').length>n,before);
    await page.evaluate(()=>{mockBridge.accountLabel='Secondary';mockBridge.dispatch({type:'UI_ACCOUNT_CHANGED'});});
    await page.waitForTimeout(1100);
    assert.equal(await page.getByTestId('suggestion').count(),0);
    assert.equal(await page.locator('#threadlight-root').locator('#profile').inputValue(),'');
    await page.evaluate(()=>{mockBridge.delay=0;});
    await generateUI(page);
    assert.equal(await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1).accountLabel),'Secondary');
    await page.evaluate(()=>{mockBridge.accountLabel='Personal';mockBridge.dispatch({type:'UI_ACCOUNT_CHANGED'});});
    await page.waitForFunction(()=>document.querySelector('#threadlight-root').shadowRoot.querySelector('#profile').value==='Use concise, friendly replies for the product team.');
    assert.equal(await page.getByTestId('suggestion').count(),0);
  });
  await runForgetCaptureTest(page,check);
  await runNameIdentityTests(page,check);
  await check('Escape dismisses the panel',async () => {
    await page.keyboard.press('Escape');
    await page.getByTestId('panel').waitFor({state:'hidden'});
  });
  // End on a useful preview. The banner explicitly labels all data as fictional.
  await page.getByTestId('toggle').click();
  await page.getByTestId('mode-rewrite').click();
  await page.getByTestId('prompt').fill('Make this sound natural, friendly, and confident.');
  await generateUI(page);
  await page.getByTestId('suggestion').nth(2).waitFor();
  await page.setViewportSize({width:1440,height:1380});
}

async function runNameIdentityTests(page,check) {
  let oldInsert;
  await check('opaque messages are automatically captured by displayed name without phone UI',async()=>{
    await page.evaluate(()=>{fixture.switchChat('a');document.querySelectorAll('#main [data-id]').forEach((node,index)=>{node.dataset.id=`opaque_a_${index}`;});});
    await page.waitForFunction(()=>mockBridge.requests.some(r=>r.type==='CAPTURE'&&r.chat.id==='name:Alex Rao'&&r.messages.some(m=>m.id==='opaque_a_0')));
    assert.equal(await page.locator('#threadlight-root').locator('#contact-phone').count(),0);
    assert.equal(await page.locator('#threadlight-root').locator('#bind-contact').count(),0);
    assert.equal(await page.evaluate(()=>WACopilot.adapter.getSnapshot().chat.id),'name:Alex Rao');
    const captured=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='CAPTURE'&&r.messages.some(m=>m.id==='opaque_a_0')).at(-1));
    assert.equal(captured.messages.length,4);assert.equal(captured.messages[1].direction,'out');
    await page.getByTestId('mode-reply').click();await generateUI(page);
    assert.equal(await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1).chat.id),'name:Alex Rao');
    oldInsert=await page.getByTestId('insert').first().elementHandle();
  });
  await check('a changed name resets results and rejects the previous contact’s insertion',async()=>{
    await page.evaluate(()=>{fixture.switchChat('b');document.querySelectorAll('#main [data-id]').forEach((node,index)=>{node.dataset.id=`opaque_b_${index}`;});});
    await page.waitForFunction(()=>document.querySelector('#threadlight-root').shadowRoot.querySelectorAll('[data-testid=suggestion]').length===0);
    assert.equal(await page.evaluate(()=>WACopilot.adapter.getSnapshot().chat.id),'name:Jamie Chen');
    const before=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='ACCEPT').length);
    await oldInsert.evaluate(button=>button.click());await page.waitForTimeout(100);
    assert.equal(await page.locator('#main [contenteditable]').innerText(),'sounds good see you there');
    assert.equal(await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='ACCEPT').length),before);
    assert.equal(await page.evaluate(()=>fixture.sendCount),0);
    await generateUI(page);assert.equal(await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1).chat.id),'name:Jamie Chen');
    await oldInsert.dispose();
  });
  await check('returning to a displayed name restores its existing context automatically',async()=>{
    await page.evaluate(()=>{fixture.switchChat('a');document.querySelectorAll('#main [data-id]').forEach((node,index)=>{node.dataset.id=`opaque_return_a_${index}`;});});
    await page.waitForFunction(()=>document.querySelector('#threadlight-root').shadowRoot.querySelector('#profile').value==='Use concise, friendly replies for the product team.');
    assert.equal(await page.evaluate(()=>WACopilot.adapter.getSnapshot().chat.id),'name:Alex Rao');
    await generateUI(page);assert.equal(await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1).chat.id),'name:Alex Rao');
  });
  await check('a named conversation with no loaded message rows can still improve a draft',async()=>{
    await page.evaluate(()=>{document.querySelector('.messages').replaceChildren();fixture.setDraft('i will share the design soon');});
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>WACopilot.adapter.getSnapshot().chat.id),'name:Alex Rao');
    assert.equal(await page.evaluate(()=>WACopilot.adapter.getSnapshot().messages.length),0);
    await page.locator('#threadlight-root').locator('#use-draft').click();await generateUI(page);
    const request=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1));
    assert.equal(request.mode,'rewrite');assert.equal(request.chat.id,'name:Alex Rao');assert.equal(request.text,'i will share the design soon');
    await page.evaluate(()=>fixture.switchChat('a'));
  });
}

async function generateUI(page,control='generate') {
  const before=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').length);
  await page.getByTestId(control).click();
  await page.waitForFunction(before=>mockBridge.requests.filter(r=>r.type==='GENERATE').length>before,before);
  await page.waitForFunction(control=>!document.querySelector('#threadlight-root').shadowRoot.querySelector(`[data-testid="${control}"]`).disabled,control);
}

async function runClosedPanelCaptureTest(page,check) {
  await check('new and edited messages are captured locally while the assistant is closed',async()=>{
    await page.keyboard.press('Escape');
    const generated=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').length);
    await page.evaluate(()=>{fixture.contacts.a.messages.push({text:'A new fictional message while closed.',direction:'in',time:'10:25 AM'});fixture.switchChat('a');});
    await page.waitForFunction(()=>mockBridge.memories.get('name:Alex Rao')?.messages.some(m=>m.text==='A new fictional message while closed.'));
    await page.evaluate(()=>{document.querySelector('#main .messages .row:last-child .selectable-text').textContent='An edited fictional message while closed.';});
    await page.waitForFunction(()=>mockBridge.memories.get('name:Alex Rao')?.messages.some(m=>m.text==='An edited fictional message while closed.'));
    await page.locator('[data-contact="b"]').click();
    await page.waitForFunction(()=>mockBridge.memories.get('name:Jamie Chen')?.messages.some(m=>m.text==='Are you coming to the park on Sunday?'));
    assert.equal(await page.evaluate(()=>mockBridge.memories.get('name:Jamie Chen').messages.some(m=>m.text==='An edited fictional message while closed.')),false);
    assert.equal(await page.evaluate(()=>mockBridge.memories.get('name:Alex Rao').messages.some(m=>m.text==='An edited fictional message while closed.')),true);
    assert.equal(await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').length),generated);
    assert.equal(await page.getByTestId('panel').isVisible(),false);
    await page.evaluate(()=>{fixture.contacts.a.messages.pop();fixture.switchChat('a');});
    await page.waitForFunction(()=>document.querySelector('#threadlight-root').shadowRoot.querySelector('#chat-name').textContent==='Alex Rao');
  });
}

async function runForgetCaptureTest(page,check) {
  await check('forget stays empty across reopening until the visible conversation actually changes',async()=>{
    const generated=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').length);
    await page.evaluate(()=>{fixture.contacts.a.name='Forget Test';fixture.switchChat('a');document.querySelectorAll('#main [data-id]').forEach((node,index)=>{node.dataset.id=`forget_test_${index}`;});});
    await page.waitForFunction(()=>mockBridge.memories.get('name:Forget Test')?.messages.length>0);
    await page.getByTestId('tab-memory').click();
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#threadlight-root').locator('#forget').click();
    await page.waitForFunction(()=>mockBridge.requests.some(r=>r.type==='FORGET_CHAT'&&r.chat.id==='name:Forget Test'));
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>mockBridge.memories.get('name:Forget Test')?.messages.length||0),0);
    const captured=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='CAPTURE'&&r.chat.id==='name:Forget Test').length);
    await page.keyboard.press('Escape');await page.getByTestId('toggle').click();await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>mockBridge.memories.get('name:Forget Test')?.messages.length||0),0);
    assert.equal(await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='CAPTURE'&&r.chat.id==='name:Forget Test').length),captured);
    await page.evaluate(()=>{document.querySelector('#main .message-in .selectable-text').textContent='A real conversation change after forgetting.';});
    await page.waitForFunction(()=>mockBridge.memories.get('name:Forget Test')?.messages.some(m=>m.text==='A real conversation change after forgetting.'));
    assert.equal(await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').length),generated);
    await page.evaluate(()=>{fixture.contacts.a.name='Alex Rao';fixture.switchChat('a');});
    await page.waitForFunction(()=>document.querySelector('#threadlight-root').shadowRoot.querySelector('#profile').value==='Use concise, friendly replies for the product team.');
    await page.getByTestId('tab-write').click();
  });
}

async function runCalendarContextTests(page,check) {
  await check('Calendar selection carries its source time and discards a late event after chat switch',async()=>{
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
      const message=[...document.querySelectorAll('#main .message-in .selectable-text')].at(-1);
      const range=document.createRange();range.selectNodeContents(message);getSelection().removeAllRanges();getSelection().addRange(range);
      message.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,composed:true}));
    });
    await page.locator('#threadlight-root').locator('#calendar-selection').click();
    assert.match(await page.getByTestId('calendar-source').inputValue(),/studio on Friday/);
    await generateUI(page,'calendar-prepare');
    const request=await page.evaluate(()=>mockBridge.requests.filter(r=>r.type==='GENERATE').at(-1));
    assert.equal(request.mode,'calendar');assert.match(request.sourceTimestamp,/10:21 AM, 10\/28\/2026/);
    const before=await page.evaluate(()=>{mockBridge.delay=700;return mockBridge.requests.filter(r=>r.type==='GENERATE').length;});
    await page.getByTestId('calendar-prepare').click();
    await page.waitForFunction(n=>mockBridge.requests.filter(r=>r.type==='GENERATE').length>n,before);
    await page.locator('[data-contact="b"]').click();await page.waitForTimeout(1000);
    assert.equal(await page.getByTestId('calendar-title').count(),0);
    assert.equal(await page.getByTestId('calendar-source').inputValue(),'');
    await page.evaluate(()=>{mockBridge.delay=0;fixture.switchChat('a');});
    await page.waitForFunction(()=>document.querySelector('#threadlight-root').shadowRoot.querySelector('#chat-name').textContent==='Alex Rao');
  });
}
