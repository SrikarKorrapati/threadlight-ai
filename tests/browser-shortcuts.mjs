/** Fictional browser fixture only; no model or private WhatsApp data. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { startFixture, projectRoot, installMockRuntime } from './browser-support.mjs';

const { chromium } = await import(process.env.COPILOT_PLAYWRIGHT || 'playwright');
const fixture = await startFixture();
const browser = await chromium.launch({ headless:true, ...(process.env.COPILOT_CHROMIUM ? {executablePath:process.env.COPILOT_CHROMIUM} : {}) });
const page = await browser.newPage({ viewport:{width:1440,height:1050} });
const manifest = JSON.parse(await readFile(path.join(projectRoot,'extension/manifest.json'),'utf8'));
const errors = [];page.on('pageerror',error=>errors.push(error.message));
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log(`PASS ${name}`);};
const initialize=async({failure='',delay=0}={})=>{
  await page.evaluate(installMockRuntime,fixture.url);
  await page.evaluate(({failure,delay})=>{mockBridge.shortcutError=failure;mockBridge.shortcutsDelay=delay;fixture.contacts.b.name='Jamie Chen';},{failure,delay});
  for(const filename of manifest.content_scripts[0].js)await page.addScriptTag({path:path.join(projectRoot,'extension',filename)});
  await page.getByTestId('toggle').click();
};
const labels=()=>page.getByTestId('shortcut-use').allTextContents();
const fillForm=async(label,prompt)=>{await page.getByTestId('shortcut-add').click();await page.getByTestId('shortcut-label').fill(label);await page.getByTestId('shortcut-prompt').fill(prompt);};
try {
  await page.goto(fixture.url);await initialize();
  await check('default shared shortcuts populate instructions without generating',async()=>{
    await page.getByTestId('shortcut-use').filter({hasText:'Friendly'}).click();
    assert.deepEqual(await labels(),['Friendly','Shorter','Professional']);
    assert.equal(await page.getByTestId('prompt').inputValue(),'Make it friendly and natural.');
    assert.equal(await page.evaluate(()=>mockBridge.requests.filter(item=>item.type==='GENERATE').length),0);
  });
  await check('adding a custom shortcut safely displays its label and exact instructions',async()=>{
    await fillForm('Gentle <b>tone</b>','Keep it gentle and clear.');await page.getByTestId('shortcut-save').click();
    await page.getByTestId('shortcut-form').waitFor({state:'hidden'});
    assert.equal((await labels()).includes('Gentle <b>tone</b>'),true);
    assert.equal(await page.getByTestId('shortcut-list').locator('b').count(),0);
    await page.getByTestId('shortcut-use').filter({hasText:'Gentle <b>tone</b>'}).click();
    assert.equal(await page.getByTestId('prompt').inputValue(),'Keep it gentle and clear.');
  });
  await check('custom shortcuts and unfinished form are shared across chats and account switches',async()=>{
    await fillForm('Not saved yet','Keep this unfinished form.');
    await page.evaluate(()=>fixture.switchChat('b'));
    await page.waitForFunction(()=>document.querySelector('#threadlight-root').shadowRoot.querySelector('#chat-name').textContent==='Jamie Chen');
    assert.equal(await page.getByTestId('shortcut-label').inputValue(),'Not saved yet');
    assert.equal(await page.getByTestId('shortcut-prompt').inputValue(),'Keep this unfinished form.');
    await page.evaluate(()=>{mockBridge.accountLabel='Work';mockBridge.dispatch({type:'UI_ACCOUNT_CHANGED'});});
    await page.waitForFunction(()=>mockBridge.requests.some(item=>item.type==='CAPTURE'&&item.accountLabel==='Work'));
    assert.equal(await page.getByTestId('shortcut-label').inputValue(),'Not saved yet');
    assert.equal((await labels()).includes('Gentle <b>tone</b>'),true);
    await page.getByTestId('shortcut-cancel').click();
  });
  await check('Manage removes a default and the master list survives reload',async()=>{
    await page.getByTestId('shortcut-manage').click();
    await page.getByRole('button',{name:'Delete Friendly',exact:true}).click();
    await page.getByRole('button',{name:'Delete Friendly',exact:true}).waitFor({state:'detached'});
    await page.reload();await initialize();
    await page.getByTestId('shortcut-use').first().waitFor();
    assert.deepEqual(await labels(),['Shorter','Professional','Gentle <b>tone</b>']);
  });
  await check('synthetic DOM clicks cannot add or delete shared shortcuts',async()=>{
    await fillForm('Blocked synthetic','Do not save through a script.');
    const before=await page.evaluate(()=>mockBridge.requests.filter(item=>/^(ADD|DELETE)_PROMPT_SHORTCUT$/.test(item.type)).length);
    await page.getByTestId('shortcut-save').evaluate(button=>button.click());
    await page.getByTestId('shortcut-manage').click();
    await page.getByTestId('shortcut-delete').first().evaluate(button=>button.click());
    assert.equal(await page.evaluate(()=>mockBridge.requests.filter(item=>/^(ADD|DELETE)_PROMPT_SHORTCUT$/.test(item.type)).length),before);
    await page.getByTestId('shortcut-cancel').click();
  });
  await check('failed save is accurate and retains the form for retry',async()=>{
    await fillForm('Retry me','Use a calm tone.');
    await page.evaluate(()=>{mockBridge.shortcutError='Local storage could not save the shortcut.';});
    await page.getByTestId('shortcut-save').click();
    await page.getByTestId('shortcut-status').filter({hasText:'Local storage could not save'}).waitFor();
    assert.equal(await page.getByTestId('shortcut-label').inputValue(),'Retry me');
    assert.equal((await labels()).includes('Retry me'),false);
    await page.evaluate(()=>{mockBridge.shortcutError='';});
    await page.getByTestId('shortcut-save').click();await page.getByTestId('shortcut-form').waitFor({state:'hidden'});
    assert.equal((await labels()).includes('Retry me'),true);
  });
  await check('broadcast refresh preserves unfinished forms and enforces the shared list limit',async()=>{
    await fillForm('Preserved','Preserve these instructions.');
    await page.evaluate(()=>{mockBridge.promptShortcuts=Array.from({length:20},(_,i)=>({id:'external-'+i,label:'Shared '+i,prompt:'Instruction '+i}));mockBridge.dispatch({type:'UI_PROMPT_SHORTCUTS_CHANGED',promptShortcuts:mockBridge.promptShortcuts});});
    assert.equal((await labels()).length,20);
    assert.equal(await page.getByTestId('shortcut-add').isDisabled(),true);
    assert.equal(await page.getByTestId('shortcut-save').isDisabled(),true);
    assert.equal(await page.getByTestId('shortcut-label').inputValue(),'Preserved');
    assert.equal(await page.getByTestId('shortcut-prompt').inputValue(),'Preserve these instructions.');
  });
  await check('load failure offers retry without pretending defaults are saved',async()=>{
    await page.reload();await initialize({failure:'Storage unavailable'});
    await page.getByTestId('shortcut-retry').waitFor();
    assert.equal((await labels()).length,0);
    assert.equal(await page.getByTestId('shortcut-add').isDisabled(),true);
    await page.evaluate(()=>{mockBridge.shortcutError='';});await page.getByTestId('shortcut-retry').click();
    await page.getByTestId('shortcut-use').first().waitFor();assert.equal((await labels()).length,4);
  });
  await check('a late initial read cannot overwrite a newer broadcast',async()=>{
    await page.reload();await initialize({delay:500});
    await page.evaluate(()=>mockBridge.dispatch({type:'UI_PROMPT_SHORTCUTS_CHANGED',promptShortcuts:[{id:'latest',label:'Latest shared',prompt:'Use this latest prompt.'}]}));
    await page.waitForTimeout(600);
    assert.deepEqual(await labels(),['Latest shared']);
  });
  assert.deepEqual(errors,[]);console.log(`${passed} shortcut checks passed.`);
}finally{await browser.close();await fixture.close();}
