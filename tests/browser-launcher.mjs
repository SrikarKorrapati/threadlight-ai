/** Trusted launcher gestures in an isolated fictional page; no live chats or provider calls. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { startFixture, projectRoot, installMockRuntime } from './browser-support.mjs';
const { chromium } = await import(process.env.COPILOT_PLAYWRIGHT || 'playwright');
const manifest = JSON.parse(await readFile(path.join(projectRoot, 'extension/manifest.json'), 'utf8'));
const scripts = manifest.content_scripts.find(entry => entry.matches.includes('https://web.whatsapp.com/*')).js;
const fixture = await startFixture();
const browser = await chromium.launch({ headless: true, ...(process.env.COPILOT_CHROMIUM ? { executablePath: process.env.COPILOT_CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let passed = 0;
const check = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };

// Persistence is deliberately test-only localStorage on the fictional origin.
// Production launcher preferences are served by the extension background worker.
function installLauncherPreferencesMock() {
  const key = 'threadlight.test.launcher-position';
  const original = chrome.runtime.sendMessage;
  const read = () => JSON.parse(localStorage.getItem(key) || 'null');
  window.launcherTest = { get position() { return read(); }, closedQuotes: 0 };
  chrome.runtime.sendMessage = (message, callback) => {
    if (!['GET_LAUNCHER_POSITION', 'SAVE_LAUNCHER_POSITION'].includes(message.type)) return original(message, callback);
    mockBridge.requests.push(JSON.parse(JSON.stringify(message)));
    let result;
    if (message.type === 'SAVE_LAUNCHER_POSITION') {
      const value = message.position;
      if (value === null) { localStorage.removeItem(key); result = { ok: true, position: null }; }
      else if (!value || !['x', 'y'].every(axis => Number.isFinite(value[axis]) && value[axis] >= 0 && value[axis] <= 1)) result = { ok: false, error: 'Expected normalized launcher coordinates.' };
      else { localStorage.setItem(key, JSON.stringify({ x: value.x, y: value.y })); result = { ok: true, position: read() }; }
    } else result = { ok: true, position: read() };
    const task = Promise.resolve(result);
    if (callback) { task.then(callback); return; }
    return task;
  };
}

async function load() {
  await page.goto(fixture.url);
  await page.evaluate(installMockRuntime, fixture.url);
  await page.evaluate(installLauncherPreferencesMock);
  for (const file of scripts) await page.addScriptTag({ path: path.join(projectRoot, 'extension', file) });
  await page.getByTestId('toggle').waitFor();
  await page.waitForFunction(() => mockBridge.requests.some(request => request.type === 'GET_LAUNCHER_POSITION'));
  await page.waitForFunction(() => document.querySelector('#threadlight-root').shadowRoot.querySelector('.launcher').dataset.positionReady === 'true');
  await safePosition();
}

async function rectangle() {
  return page.evaluate(() => {
    const rect = document.querySelector('#threadlight-root').shadowRoot.querySelector('.launcher').getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  });
}

async function safePosition() {
  await page.waitForFunction(() => {
    const button = document.querySelector('#threadlight-root')?.shadowRoot.querySelector('.launcher');
    const footer = document.querySelector('#main footer');
    if (!button || button.hidden || !footer) return false;
    const r = button.getBoundingClientRect(), f = footer.getBoundingClientRect();
    return r.width > 50 && r.height > 20 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= f.top - 11;
  }, undefined, { timeout: 5000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return rectangle();
}

async function dragTo(x, y) {
  await page.getByTestId('toggle').hover();
  const before = await rectangle();
  const saves = await page.evaluate(() => mockBridge.requests.filter(request => request.type === 'SAVE_LAUNCHER_POSITION').length);
  await page.mouse.move(before.left + before.width / 2, before.top + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(count => mockBridge.requests.filter(request => request.type === 'SAVE_LAUNCHER_POSITION').length > count, saves, { timeout: 5000 });
  return rectangle();
}

async function showQuote(height = 240) {
  await page.evaluate(height => {
    const footer = document.querySelector('#main footer');
    document.querySelector('#fixture-quote')?.remove();
    footer.style.position = 'relative'; footer.style.minHeight = `${height}px`; footer.style.paddingTop = `${height - 72}px`;
    const quote = document.createElement('div'); quote.id = 'fixture-quote'; quote.textContent = 'Replying to a fictional quoted message';
    quote.style.cssText = 'position:absolute;left:20px;right:20px;top:10px;height:60px;padding:10px;background:#d5e9db;';
    const close = document.createElement('button'); close.id = 'fixture-quote-close'; close.textContent = '×'; close.setAttribute('aria-label', 'Cancel quoted reply');
    close.style.cssText = 'position:absolute;right:0;top:0;width:36px;height:36px;';
    close.onclick = () => { launcherTest.closedQuotes++; quote.remove(); footer.style.minHeight = '92px'; footer.style.paddingTop = '19px'; };
    quote.append(close); footer.prepend(quote);
  }, height);
}

try {
  await load();
  await check('default launcher is above the actual composer footer and has no saved override', async () => {
    const rect = await safePosition();
    assert.ok(rect.left > 1000, 'The default launcher is near the right edge');
    assert.equal(await page.evaluate(() => launcherTest.position), null);
    assert.equal(await page.getByTestId('panel').isVisible(), false);
  });
  await check('a growing quoted-reply footer moves the default launcher and leaves Close accessible', async () => {
    const before = await rectangle();
    await showQuote(); const after = await safePosition();
    assert.ok(after.top < before.top - 80, 'The launcher responds to the taller footer');
    await page.locator('#fixture-quote-close').click({ timeout: 2000 });
    assert.equal(await page.evaluate(() => launcherTest.closedQuotes), 1);
    await safePosition();
  });
  await check('dragging moves the launcher, saves normalized coordinates, and suppresses its release click', async () => {
    const before = await rectangle(), after = await dragTo(650, 300);
    assert.ok(after.left < before.left - 200 && after.top < before.top - 100, 'The drag changes both coordinates');
    assert.equal(await page.getByTestId('panel').isVisible(), false, 'Releasing a drag does not open the assistant');
    const saved = await page.evaluate(() => launcherTest.position);
    for (const axis of ['x', 'y']) assert.ok(saved[axis] > 0 && saved[axis] < 1, `${axis} is normalized`);
  });
  await check('an ordinary click after dragging still opens the assistant and preserves position when closed', async () => {
    const before = await rectangle();
    await page.getByTestId('toggle').click(); await page.getByTestId('panel').waitFor({ state: 'visible' });
    await page.locator('#threadlight-root').locator('#close').click(); await safePosition();
    const after = await rectangle();
    assert.ok(Math.abs(after.left - before.left) <= 2 && Math.abs(after.top - before.top) <= 2);
  });
  await check('the saved position survives page reload and switching conversations', async () => {
    const before = await rectangle(), saved = await page.evaluate(() => launcherTest.position);
    await load(); const reloaded = await safePosition();
    assert.deepEqual(await page.evaluate(() => launcherTest.position), saved);
    assert.ok(Math.abs(reloaded.left - before.left) <= 2 && Math.abs(reloaded.top - before.top) <= 2);
    await page.locator('[data-contact="b"]').click();
    const switched = await safePosition();
    assert.ok(Math.abs(switched.left - reloaded.left) <= 2 && Math.abs(switched.top - reloaded.top) <= 2);
  });
  await check('saved positions stay onscreen and above the footer when the viewport becomes small', async () => {
    await dragTo(1420, 900); await safePosition();
    await page.setViewportSize({ width: 390, height: 700 });
    const rect = await safePosition();
    assert.ok(rect.width < 390 && rect.right <= 390 && rect.left >= 0 && rect.top >= 0);
    assert.equal(await page.getByTestId('panel').isVisible(), false);
  });
  await check('a user-positioned launcher also avoids a newly expanded reply footer', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 }); await safePosition();
    await dragTo(1400, 880); const before = await rectangle();
    await showQuote(320); const after = await safePosition();
    assert.ok(after.bottom < before.bottom - 100);
    await page.locator('#fixture-quote-close').click({ timeout: 2000 });
    assert.equal(await page.evaluate(() => launcherTest.closedQuotes), 1);
    await safePosition();
  });
  await check('dragging past a viewport edge is clamped and never generates a reply or sends a message', async () => {
    // The cursor remains in the viewport; its center offset would put the button
    // beyond the edge without clamping, while pointerup remains browser-visible.
    await dragTo(1, 1); const rect = await safePosition();
    assert.ok(rect.left >= 0 && rect.top >= 0);
    assert.equal(await page.getByTestId('panel').isVisible(), false);
    assert.equal(await page.evaluate(() => mockBridge.requests.filter(request => request.type === 'GENERATE').length), 0);
    assert.equal(await page.evaluate(() => fixture.sendCount), 0);
  });
  await check('keyboard movement uses small and large steps and Home restores the safe default', async () => {
    const before = await rectangle();
    await page.getByTestId('toggle').focus(); await page.keyboard.press('ArrowRight');
    await page.waitForFunction(previous => document.querySelector('#threadlight-root').shadowRoot.querySelector('.launcher').getBoundingClientRect().left > previous + 5, before.left);
    const moved = await rectangle(); assert.ok(Math.abs(moved.left - before.left - 10) <= 2);
    await page.keyboard.press('Shift+ArrowDown');
    await page.waitForFunction(previous => document.querySelector('#threadlight-root').shadowRoot.querySelector('.launcher').getBoundingClientRect().top > previous + 30, moved.top);
    const shifted = await rectangle(); assert.ok(Math.abs(shifted.top - moved.top - 40) <= 2);
    await page.keyboard.press('Home'); await page.waitForFunction(() => launcherTest.position === null && document.querySelector('#threadlight-root').shadowRoot.querySelector('.launcher').getBoundingClientRect().left > 1000);
    const restored = await safePosition(); assert.ok(restored.left > 1000);
    assert.equal(await page.getByTestId('panel').isVisible(), false);
  });
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`\n${passed} isolated launcher checks passed. No live WhatsApp or OpenAI calls were made.`);
} finally { await browser.close(); await fixture.close(); }
