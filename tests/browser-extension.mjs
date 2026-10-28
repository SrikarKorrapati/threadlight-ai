/** Loads the actual MV3 extension in a disposable browser profile.
 * WhatsApp requests are intercepted with a fictional local fixture; no account is opened.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projectRoot } from './browser-support.mjs';

const { chromium } = await import(process.env.COPILOT_PLAYWRIGHT || 'playwright');
const profile = await mkdtemp(path.join(os.tmpdir(), 'threadlight-extension-test-'));
const extension = path.join(projectRoot, 'extension');
const context = await chromium.launchPersistentContext(profile, {
  headless:true,
  ...(process.env.COPILOT_CHROMIUM ? {executablePath:process.env.COPILOT_CHROMIUM} : {channel:'chromium'}),
  viewport:{width:1440,height:1000},
  args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
});
const errors=[];
const openaiCalls=[];
try {
  await context.route('https://web.whatsapp.com/**', async route => {
    const pathname=new URL(route.request().url()).pathname;
    if (pathname==='/' || pathname==='/index.html') return route.fulfill({contentType:'text/html',body:await readFile(path.join(projectRoot,'demo/whatsapp-fixture.html'),'utf8')});
    if (pathname==='/fixture.js') return route.fulfill({contentType:'text/javascript',body:await readFile(path.join(projectRoot,'demo/fixture.js'),'utf8')});
    return route.fulfill({status:404,body:''});
  });
  await context.route('https://api.openai.com/**',async route => {openaiCalls.push(route.request().url());await route.abort();});
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:15000});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('https://web.whatsapp.com/');
  await page.locator('#threadlight-root').waitFor({state:'attached',timeout:15000});
  await page.getByTestId('toggle').click();
  await page.getByTestId('panel').waitFor({state:'visible'});
  assert.match(await page.getByTestId('panel').innerText(),/Alex Rao/);
  console.log('PASS real Manifest V3 extension loads content scripts and reads the rendered chat');
  await page.getByTestId('mode-reply').click();
  assert.match(await page.getByTestId('panel').innerText(),/reply/i);
  console.log('PASS explicit Suggest a reply action is present in the real extension');
  await page.locator('[data-contact="b"]').click();
  await page.waitForTimeout(500);
  await page.reload();
  await page.locator('#threadlight-root').waitFor({state:'attached'});
  await page.getByTestId('toggle').click();
  await page.getByTestId('panel').waitFor({state:'visible'});
  assert.match(await page.getByTestId('panel').innerText(),/Alex Rao/);
  console.log('PASS extension remounts after navigation without stale page state');
  const extensionId=new URL(worker.url()).hostname;
  const options=await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  assert.match(await options.locator('body').innerText(),/Threadlight/i);
  console.log('PASS real extension settings page loads');
  assert.deepEqual(errors,[],'No page runtime errors');
  assert.deepEqual(openaiCalls,[],'No model calls before an explicit generation');
  console.log('\n4 real-extension smoke checks passed against intercepted synthetic WhatsApp content. Live WhatsApp/OpenAI remain untested.');
} finally {
  await context.close();
  await rm(profile,{recursive:true,force:true});
}
