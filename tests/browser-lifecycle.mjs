/** Async UI regressions with fictional conversations and a test-only model bridge. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { startFixture, projectRoot, installMockRuntime } from './browser-support.mjs';
const { chromium } = await import(process.env.COPILOT_PLAYWRIGHT || 'playwright');
const fixture = await startFixture();
const browser = await chromium.launch({ headless: true, ...(process.env.COPILOT_CHROMIUM ? { executablePath: process.env.COPILOT_CHROMIUM } : {}) });
const errors = [];
let passed = 0;
async function check(name, run) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(fixture.url); await page.evaluate(installMockRuntime, fixture.url);
    for (const file of ['adapter.js', 'commitments.js', 'layout.js', 'launcher.js', 'content.js']) await page.addScriptTag({ path: path.join(projectRoot, 'extension', file) });
    await page.waitForFunction(() => mockBridge.requests.some(request => request.type === 'CAPTURE'));
    await page.getByTestId('toggle').click();
    await run(page); passed++; console.log(`PASS ${name}`);
  } finally { await page.close(); }
}
const countRequests = page => page.evaluate(() => mockBridge.requests.filter(request => request.type === 'GENERATE').length);
const waitIdle = page => page.waitForFunction(() => !document.querySelector('#threadlight-root').shadowRoot.querySelector('#generate').disabled);

try {
  for (const field of ['calendar-source', 'calendar-prompt']) {
    await check(`editing ${field} during generation discards the outdated event preview`, async page => {
      await page.getByTestId('tab-calendar').click();
      await page.getByTestId('calendar-source').fill('Meet at the studio Friday, October 30, 2026, at 3 PM.');
      await page.evaluate(() => { mockBridge.delay = 450; });
      await page.getByTestId('calendar-prepare').click();
      await page.waitForFunction(() => mockBridge.requests.some(request => request.type === 'GENERATE'));
      await page.getByTestId(field).fill('Actually meet Saturday, October 31, 2026, at 5 PM.');
      await waitIdle(page);
      assert.equal(await page.getByTestId('calendar-open').count(), 0, 'An event based on the superseded details is not offered');
      assert.match(await page.locator('#threadlight-root').locator('#status').textContent(), /details changed/i);
      assert.equal(await countRequests(page), 1, 'Editing fields never starts another model request');
      await page.getByTestId('calendar-prepare').click();
      await page.getByTestId('calendar-open').waitFor();
      assert.equal(await countRequests(page), 2, 'Explicit preparation with current details still works');
    });
  }
  await check('focusing a sidebar search box preserves the current writing inputs and view', async page => {
    await page.evaluate(() => {
      const search = document.createElement('input'); search.id = 'fixture-search'; search.placeholder = 'Search contacts';
      document.querySelector('.layout > aside').prepend(search);
    });
    await page.getByTestId('prompt').fill('Keep this unsaved instruction.');
    const before = await page.evaluate(() => WACopilot.adapter.getSnapshot().viewId);
    await page.locator('#fixture-search').click();
    await page.locator('#fixture-search').fill('Another contact');
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => WACopilot.adapter.getSnapshot().viewId), before);
    assert.equal(await page.getByTestId('prompt').inputValue(), 'Keep this unsaved instruction.');
    assert.equal(await countRequests(page), 0);
  });
  await check('double-clicking Generate while history is saving sends one model request', async page => {
    await page.getByTestId('prompt').fill('Make the draft natural.');
    await page.evaluate(() => {
      const original = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = async (...args) => {
        if (args[0].type === 'CAPTURE') await new Promise(resolve => setTimeout(resolve, 600));
        return original(...args);
      };
      document.querySelector('.message-in .selectable-text').textContent += ' New message edit.';
    });
    await page.getByTestId('generate').dblclick({ delay: 100 });
    await page.getByTestId('suggestion').nth(2).waitFor(); await waitIdle(page);
    assert.equal(await countRequests(page), 1);
    assert.equal(await page.evaluate(() => fixture.sendCount), 0);
  });
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`\n${passed} isolated lifecycle checks passed. No live WhatsApp or OpenAI calls were made.`);
} finally { await browser.close(); await fixture.close(); }
