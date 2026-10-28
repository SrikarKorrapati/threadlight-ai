/** Reserved-space layout regression tests on a fictional WhatsApp-shaped page only. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { startFixture, projectRoot, installMockRuntime } from './browser-support.mjs';

const { chromium } = await import(process.env.COPILOT_PLAYWRIGHT || 'playwright');
const fixture = await startFixture();
const browser = await chromium.launch({ headless: true, ...(process.env.COPILOT_CHROMIUM ? { executablePath: process.env.COPILOT_CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let passed = 0;
const check = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };

// Reproduce the observed shell hierarchy with adversarial viewport-sized shells.
// Reserving space on #app alone must also constrain these nested flex/grid shells.
async function prepareAppFixture() {
  await page.addStyleTag({ content: `
    html,body { width:100%; height:100%; }
    #app { position:fixed; inset:0; display:flex; flex-direction:column; }
    .fixture-banner { display:none; }
    .layout-fixture-frame,.layout-fixture-container { display:flex; flex-direction:column; width:100%; height:100%; }
    .app-wrapper-web { position:relative; width:100vw; height:100vh; min-width:1000px; }
    #app .two { display:grid; width:100vw; height:100vh; min-width:1000px; grid-template-columns:290px minmax(0,1fr); }
    .layout-fixture-chat { position:relative; display:flex; min-width:600px; min-height:0; }
    #app #main { min-height:0; flex:1; }
    #app #main > header { flex-shrink:0; }
    #app .messages { min-height:0; }
    #app #main > footer { flex-shrink:0; }
    #app [contenteditable] { min-width:0; overflow-wrap:anywhere; }
    #app #send { flex-shrink:0; }
    @media(max-width:1199px) { .app-wrapper-web,#app .two,.layout-fixture-chat { min-width:0; } #app .two { grid-template-columns:minmax(0,1fr); } #app .two > aside { display:none; } }
  ` });
  await page.evaluate(() => {
    const app = document.querySelector('#app') || document.createElement('div'); app.id = 'app';
    app.style.cssText = 'width:100%;height:100%;min-width:0;min-height:0;--fixture-owned-token:original;';
    if (!app.isConnected) document.querySelector('.fixture-banner').before(app);
    const layout = document.querySelector('.layout'); layout.classList.add('two');
    const chat = document.createElement('div'); chat.className = 'layout-fixture-chat';
    document.querySelector('#main').before(chat); chat.append(document.querySelector('#main'));
    const frame = document.createElement('div'); frame.className = 'layout-fixture-frame';
    const wrapper = document.createElement('div'); wrapper.className = 'app-wrapper-web';
    const container = document.createElement('div'); container.className = 'layout-fixture-container';
    container.append(layout); wrapper.append(container); frame.append(wrapper); app.replaceChildren(frame);
    window.layoutFixtureTemplate = app.cloneNode(true);
  });
}

async function geometry() {
  return page.evaluate(() => {
    const rect = node => {
      const value = node.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const shadow = document.querySelector('#threadlight-root').shadowRoot;
    return {
      app: rect(document.querySelector('#app')),
      chat: rect(document.querySelector('#main')),
      composer: rect(document.querySelector('#main [contenteditable]')),
      footer: rect(document.querySelector('#main footer')),
      send: rect(document.querySelector('#send')),
      panel: rect(shadow.querySelector('.panel')),
      viewport: { width: innerWidth, height: innerHeight },
      pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    };
  });
}

async function waitForDock(orientation) {
  await page.waitForFunction(orientation => {
    const panel = document.querySelector('#threadlight-root')?.shadowRoot.querySelector('.panel');
    const main = document.querySelector('#main'), footer = document.querySelector('#main footer');
    if (!panel || panel.hidden || !main || !footer) return false;
    const a = main.getBoundingClientRect(), b = panel.getBoundingClientRect(), c = footer.getBoundingClientRect();
    return orientation === 'right' ? a.right <= b.left + 1 && c.right <= b.left + 1 : a.bottom <= b.top + 1 && c.bottom <= b.top + 1;
  }, orientation, { timeout: 6000 });
}

async function assertDock(orientation) {
  await waitForDock(orientation);
  const value = await geometry();
  for (const key of ['chat', 'composer', 'footer', 'send']) {
    const region = value[key];
    assert.ok(region.width > 30 && region.height > 15, `${key} stays usable: ${JSON.stringify(region)}`);
    assert.ok(region.left >= -1 && region.right <= value.viewport.width + 1, `${key} fits horizontally`);
    assert.ok(region.top >= -1 && region.bottom <= value.viewport.height + 1, `${key} fits vertically`);
    if (orientation === 'right') assert.ok(region.right <= value.panel.left + 1, `${key} is left of the sidebar`);
    else assert.ok(region.bottom <= value.panel.top + 1, `${key} is above the bottom dock`);
  }
  assert.ok(value.panel.width >= 300 && value.panel.height >= 220, 'Assistant retains usable space');
  assert.ok(value.panel.left >= -1 && value.panel.right <= value.viewport.width + 1, 'Assistant fits horizontally');
  assert.ok(value.panel.top >= -1 && value.panel.bottom <= value.viewport.height + 1, 'Assistant fits vertically');
  assert.ok(value.pageWidth <= value.viewport.width + 1, `No horizontal page overflow: ${JSON.stringify(value)}`);
  return value;
}

async function openPanel() {
  await page.getByTestId('toggle').click();
  await page.getByTestId('panel').waitFor({ state: 'visible' });
}

async function closePanel() {
  await page.locator('#threadlight-root').locator('#close').click();
  await page.getByTestId('panel').waitFor({ state: 'hidden' });
}

async function assertRestored() {
  await page.waitForFunction(() => {
    const app = document.querySelector('#app').getBoundingClientRect();
    return Math.abs(app.right - innerWidth) <= 1 && Math.abs(app.bottom - innerHeight) <= 1;
  }, undefined, { timeout: 6000 });
  const value = await geometry();
  assert.ok(Math.abs(value.chat.right - value.viewport.width) <= 1, 'Chat regains its original width');
  assert.ok(Math.abs(value.chat.bottom - value.viewport.height) <= 1, 'Chat regains its original height');
  assert.ok(value.pageWidth <= value.viewport.width + 1, 'Restored page has no horizontal overflow');
}

try {
  await page.goto(fixture.url);
  await prepareAppFixture();
  await page.evaluate(installMockRuntime, fixture.url);
  await page.addScriptTag({ path: path.join(projectRoot, 'extension/adapter.js') });
  await page.addScriptTag({ path: path.join(projectRoot, 'extension/layout.js') });
  await page.addScriptTag({ path: path.join(projectRoot, 'extension/commitments.js') });
  await page.addScriptTag({ path: path.join(projectRoot, 'extension/content.js') });
  await page.getByTestId('toggle').waitFor();
  await page.waitForFunction(() => mockBridge.requests.some(request => request.type === 'CAPTURE'));

  await check('opening the desktop sidebar reserves space for the chat, composer, and Send control', async () => {
    await assertRestored();
    const before = await geometry();
    await openPanel();
    const after = await assertDock('right');
    assert.ok(after.chat.width < before.chat.width - 250, 'Chat reflows into the available width');
    await page.locator('#main [contenteditable]').fill('This fictional draft remains editable beside Threadlight.');
    assert.match(await page.locator('#main [contenteditable]').innerText(), /remains editable/);
  });
  await check('closing restores app dimensions and preserves existing plus later inline styles', async () => {
    await page.evaluate(() => {
      const app = document.querySelector('#app');
      app.style.setProperty('--fixture-live-update', 'survives');
      app.style.setProperty('opacity', '0.99');
    });
    await closePanel();
    await assertRestored();
    const style = await page.evaluate(() => {
      const s = document.querySelector('#app').style;
      return { width: s.width, height: s.height, minWidth: s.minWidth, minHeight: s.minHeight, owned: s.getPropertyValue('--fixture-owned-token'), live: s.getPropertyValue('--fixture-live-update'), opacity: s.opacity };
    });
    assert.deepEqual(style, { width: '100%', height: '100%', minWidth: '0px', minHeight: '0px', owned: 'original', live: 'survives', opacity: '0.99' });
  });
  await check('desktop viewport changes keep the sidebar separated without horizontal overflow', async () => {
    await openPanel();
    for (const viewport of [{ width: 1280, height: 900 }, { width: 1700, height: 1100 }, { width: 1200, height: 800 }]) {
      await page.setViewportSize(viewport);
      await assertDock('right');
    }
  });
  await check('narrow windows use a bottom dock while keeping the conversation and composer visible', async () => {
    for (const viewport of [{ width: 1199, height: 900 }, { width: 900, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const value = await assertDock('bottom');
      assert.ok(value.chat.height >= 180, 'Conversation has usable vertical room above the dock');
      await page.locator('#main [contenteditable]').fill('Still editable in the narrow layout.');
    }
  });
  await check('closing and reopening at a narrow width restores the full app height', async () => {
    await closePanel(); await assertRestored();
    await openPanel(); await assertDock('bottom');
    await page.setViewportSize({ width: 1440, height: 1000 }); await assertDock('right');
  });
  await check('a replaced app root is docked and the removed root retains its own inline styles', async () => {
    await page.evaluate(() => {
      const previous = document.querySelector('#app'), replacement = layoutFixtureTemplate.cloneNode(true);
      replacement.style.setProperty('--fixture-owned-token', 'replacement');
      replacement.querySelector('#send').addEventListener('click', () => { fixture.sendCount++; });
      window.layoutPreviousRoot = previous; previous.replaceWith(replacement);
    });
    await assertDock('right');
    await closePanel(); await assertRestored();
    const styles = await page.evaluate(() => [layoutPreviousRoot, document.querySelector('#app')].map(node => ({ width: node.style.width, height: node.style.height, own: node.style.getPropertyValue('--fixture-owned-token'), live: node.style.getPropertyValue('--fixture-live-update') })));
    assert.deepEqual(styles, [
      { width: '100%', height: '100%', own: 'original', live: 'survives' },
      { width: '100%', height: '100%', own: 'replacement', live: '' },
    ]);
  });
  await check('repeated open/close cycles do not accumulate reserved space or request AI', async () => {
    for (let index = 0; index < 3; index++) { await openPanel(); await assertDock('right'); await closePanel(); await assertRestored(); }
    assert.equal(await page.evaluate(() => mockBridge.requests.filter(request => request.type === 'GENERATE').length), 0);
    assert.equal(await page.evaluate(() => fixture.sendCount), 0);
  });
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`\n${passed} isolated layout checks passed. No live WhatsApp or OpenAI calls were made.`);
} finally { await browser.close(); await fixture.close(); }
