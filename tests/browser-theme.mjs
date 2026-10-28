/** Theme integration in an isolated fictional page. No WhatsApp, OpenAI, or user data. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { startFixture, projectRoot, installMockRuntime } from './browser-support.mjs';

const { chromium } = await import(process.env.COPILOT_PLAYWRIGHT || 'playwright');
const fixture = await startFixture();
const browser = await chromium.launch({ headless: true, ...(process.env.COPILOT_CHROMIUM ? { executablePath: process.env.COPILOT_CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, colorScheme: 'light' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let passed = 0;
const check = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
const aiRequests = () => page.evaluate(() => mockBridge.requests.filter(request => request.type === 'GENERATE').length);
const waitTheme = theme => page.waitForFunction(expected => document.querySelector('#threadlight-root')?.dataset.theme === expected, theme);

// Each fixture theme replaces prior markers so precedence is intentional in each case.
async function applyPageTheme({ theme, target = 'body', marker = 'data-theme', header = 'light' } = {}) {
  await page.evaluate(({ theme, target, marker, header }) => {
    for (const node of [document.documentElement, document.body]) {
      node.classList.remove('dark', 'light');
      node.removeAttribute('data-theme'); node.removeAttribute('data-color-mode');
      node.style.removeProperty('color-scheme'); node.style.removeProperty('background-color');
    }
    const node = target === 'html' ? document.documentElement : document.body;
    if (theme && marker === 'class') node.classList.add(theme);
    else if (theme && marker === 'color-scheme') node.style.colorScheme = theme;
    else if (theme) node.setAttribute(marker, theme);
    document.querySelector('#main header').style.backgroundColor = header === 'dark' ? '#202c33' : header === 'light' ? '#f0f2f5' : 'transparent';
    if (header === 'transparent') {
      document.documentElement.style.backgroundColor = 'transparent';
      document.body.style.backgroundColor = 'transparent';
    }
  }, { theme, target, marker, header });
}

function luminance(rgb) {
  const linear = rgb.map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

async function settleStyles() {
  await page.evaluate(async () => {
    const nodes = document.querySelector('#threadlight-root').shadowRoot.querySelectorAll('*');
    await Promise.all([...nodes].flatMap(node => node.getAnimations()).map(animation => animation.finished.catch(() => {})));
  });
}

async function assertReadable(selectors, theme) {
  // Read settled colors, rather than a transient frame between two valid themes.
  await settleStyles();
  const samples = await page.evaluate(selectors => {
    const shadow = document.querySelector('#threadlight-root').shadowRoot;
    const rgba = value => {
      const numbers = value.match(/[\d.]+/g)?.map(Number);
      if (!numbers || numbers.length < 3) throw new Error(`Unsupported computed color: ${value}`);
      return [...numbers.slice(0, 3), numbers[3] ?? 1];
    };
    const blend = (front, back) => front.slice(0, 3).map((channel, index) => channel * front[3] + back[index] * (1 - front[3]));
    const background = node => {
      const layers = [];
      for (let current = node; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.backgroundImage !== 'none') throw new Error(`Text contrast needs an opaque non-gradient surface: ${node.className}`);
        const color = rgba(style.backgroundColor); layers.push(color);
        if (color[3] === 1) break;
      }
      let result = [255, 255, 255];
      for (const layer of layers.reverse()) result = blend(layer, result);
      return result;
    };
    return selectors.map(selector => {
      const pseudo = selector.endsWith('::placeholder') ? '::placeholder' : null;
      const node = shadow.querySelector(pseudo ? selector.replace(pseudo, '') : selector);
      if (!node) throw new Error(`Missing contrast target: ${selector}`);
      const style = getComputedStyle(node, pseudo), bg = background(node), fg = blend(rgba(style.color), bg);
      return { selector, foreground: fg, background: bg, fontSize: style.fontSize };
    });
  }, selectors);
  for (const sample of samples) {
    const a = luminance(sample.foreground), b = luminance(sample.background);
    const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(contrast >= 4.5, `${theme} ${sample.selector} contrast ${contrast.toFixed(2)}:1 is below 4.5:1 (${JSON.stringify(sample)})`);
  }
}

async function generate(control) {
  const before = await aiRequests();
  await page.getByTestId(control).click();
  await page.waitForFunction(count => mockBridge.requests.filter(request => request.type === 'GENERATE').length > count, before);
  await page.waitForFunction(testid => !document.querySelector('#threadlight-root').shadowRoot.querySelector(`[data-testid="${testid}"]`).disabled, control);
}

async function assertNoHorizontalOverflow() {
  const overflows = await page.evaluate(() => {
    const shadow = document.querySelector('#threadlight-root').shadowRoot;
    const selectors = ['.panel', '.body', '.tabs', '.header', '.footer', '#view-write', '#view-calendar', '#view-memory', '#view-tasks'];
    const problems = [];
    for (const selector of selectors) {
      const node = shadow.querySelector(selector);
      if (!node.getClientRects().length) continue;
      const rect = node.getBoundingClientRect();
      if (rect.left < -1 || rect.right > innerWidth + 1 || node.scrollWidth > node.clientWidth + 1) {
        problems.push({ selector, left: rect.left, right: rect.right, viewport: innerWidth, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth });
      }
    }
    return problems;
  });
  assert.deepEqual(overflows, [], 'The sidebar and visible view fit the narrow viewport');
}

try {
  await page.goto(fixture.url);
  await page.evaluate(() => {
    fixture.contacts.b.name = 'Jamie Chen';
    document.querySelector('[data-contact="b"] strong').textContent = 'Jamie Chen';
    document.querySelector('[data-contact="b"] .avatar').textContent = 'JC';
    document.querySelector('.fixture-controls p').textContent = 'These fictional conversations have different displayed names.';
  });
  await applyPageTheme({ theme: 'dark', header: 'light' });
  await page.evaluate(installMockRuntime, fixture.url);
  await page.addScriptTag({ path: path.join(projectRoot, 'extension/adapter.js') });
  await page.addScriptTag({ path: path.join(projectRoot, 'extension/layout.js') });
  await page.addScriptTag({ path: path.join(projectRoot, 'extension/commitments.js') });
  await page.addScriptTag({ path: path.join(projectRoot, 'extension/launcher.js') });
  await page.addScriptTag({ path: path.join(projectRoot, 'extension/content.js') });
  await page.locator('#threadlight-root').waitFor({ state: 'attached' });
  await page.waitForFunction(() => mockBridge.requests.some(request => request.type === 'CAPTURE'));

  await check('WhatsApp dark theme overrides light OS and a light header', async () => {
    await waitTheme('dark');
    await page.getByTestId('toggle').click();
    await page.getByTestId('panel').waitFor({ state: 'visible' });
    assert.equal(await aiRequests(), 0);
  });
  await check('WhatsApp light theme overrides dark OS and a dark header at runtime', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await applyPageTheme({ theme: 'light', target: 'html', marker: 'class', header: 'dark' });
    await waitTheme('light');
    assert.equal(await aiRequests(), 0);
  });
  await check('body class, data-color-mode, and explicit color-scheme update the open sidebar', async () => {
    for (const entry of [
      { theme: 'dark', marker: 'class' },
      { theme: 'light', target: 'html', marker: 'data-color-mode', header: 'dark' },
      { theme: 'dark', marker: 'color-scheme' },
      { theme: 'light', marker: 'color-scheme', header: 'dark' },
    ]) { await applyPageTheme(entry); await waitTheme(entry.theme); }
    assert.equal(await aiRequests(), 0);
  });
  await check('explicit body theme wins over conflicting HTML markers', async () => {
    await applyPageTheme({ theme: 'light', target: 'html', marker: 'class' });
    await page.evaluate(() => { document.body.dataset.theme = 'dark'; });
    await waitTheme('dark');
    await page.evaluate(() => { document.body.dataset.theme = 'light'; document.documentElement.className = 'dark'; });
    await waitTheme('light');
  });
  await check('unmarked pages follow the visible WhatsApp header before OS preference', async () => {
    await page.emulateMedia({ colorScheme: 'light' });
    await applyPageTheme({ header: 'dark' }); await waitTheme('dark');
    await page.emulateMedia({ colorScheme: 'dark' });
    await applyPageTheme({ header: 'light' }); await waitTheme('light');
  });
  await check('theme tracking continues after WhatsApp replaces its conversation header', async () => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => {
      const old = document.querySelector('#main header'), next = old.cloneNode(true);
      next.style.backgroundColor = '#202c33'; old.replaceWith(next);
    });
    await waitTheme('dark');
    await page.evaluate(() => { document.querySelector('#main header').style.backgroundColor = '#f0f2f5'; });
    await waitTheme('light');
    assert.equal(await aiRequests(), 0);
  });
  await check('OS changes remain the fallback when the page exposes no theme surface', async () => {
    await applyPageTheme({ header: 'transparent' });
    await page.emulateMedia({ colorScheme: 'dark' }); await waitTheme('dark');
    await page.emulateMedia({ colorScheme: 'light' }); await waitTheme('light');
    assert.equal(await aiRequests(), 0);
  });
  await check('host page font rules cannot replace the sidebar and controls with a serif font', async () => {
    await page.addStyleTag({ content: '#threadlight-root { font-family: "Times New Roman", serif !important; }' });
    const fonts = await page.evaluate(() => {
      const host = document.querySelector('#threadlight-root'), shadow = host.shadowRoot;
      return { host: getComputedStyle(host).fontFamily, inner: ['.panel', '.brand', '.tab', '.mode', '#source', '#generate', '.launcher', '.selection-bubble button'].map(selector => ({ selector, family: getComputedStyle(shadow.querySelector(selector)).fontFamily })) };
    });
    assert.match(fonts.host, /Times New Roman/, 'The adversarial outside-page rule is active');
    for (const sample of fonts.inner) {
      assert.doesNotMatch(sample.family, /Times New Roman/, sample.selector);
      assert.match(sample.family, /Segoe UI|sans-serif|system-ui/, sample.selector);
    }
  });

  const writeSelectors = ['.panel', '.brand', '.chat-name', '.tab.active', '.tab:not(.active)', '.mode.active', '.mode:not(.active)', 'label', '#source', '#source::placeholder', '#prompt', '#generate', '.chip', '.attach-btn', '#status', '#coverage'];
  for (const theme of ['light', 'dark']) {
    await check(`${theme} sidebar, forms, navigation, and buttons have readable opaque surfaces`, async () => {
      await applyPageTheme({ theme, header: theme }); await waitTheme(theme);
      await page.getByTestId('tab-write').click();
      await assertReadable(writeSelectors, theme);
      const surfaces = await page.evaluate(() => {
        const shadow = document.querySelector('#threadlight-root').shadowRoot;
        return ['.panel', '.launcher', '.selection-bubble'].map(selector => {
          const style = getComputedStyle(shadow.querySelector(selector));
          return { selector, backdropFilter: style.backdropFilter, backgroundImage: style.backgroundImage, backgroundColor: style.backgroundColor };
        });
      });
      for (const surface of surfaces) {
        assert.equal(surface.backdropFilter, 'none', `${theme} ${surface.selector} uses no glass blur`);
        assert.equal(surface.backgroundImage, 'none', `${theme} ${surface.selector} uses a solid surface`);
        assert.match(surface.backgroundColor, /^rgb\(/, `${theme} ${surface.selector} is opaque`);
      }
      await page.getByTestId('tab-memory').click();
      await assertReadable(['#profile', '#profile::placeholder', '#save-profile', '#capture', '#memory-info', 'summary', '#forget'], theme);
      await page.getByTestId('tab-calendar').click();
      await assertReadable(['#calendar-source', '#calendar-prompt', '#calendar-prepare', '#calendar-account::placeholder', '#calendar-manage-account'], theme);
    });
  }

  await check('suggestions and reviewed Calendar fields remain readable across theme changes', async () => {
    await page.getByTestId('tab-write').click();
    await page.getByTestId('source-text').fill('I will send the final design tomorrow morning.');
    await page.getByTestId('prompt').fill('Make this friendly and keep the meaning.');
    await generate('generate');
    await page.getByTestId('suggestion').nth(2).waitFor();
    for (const theme of ['light', 'dark']) {
      await applyPageTheme({ theme, header: theme }); await waitTheme(theme);
      await assertReadable(['.suggestion-text', '.suggestion-head', '.insert', '.card-actions .secondary:not(.insert)'], theme);
    }
    await page.getByTestId('tab-calendar').click();
    await page.getByTestId('calendar-source').fill('Meet at the studio Friday, October 30, 2026, at 3 PM for thirty minutes.');
    await generate('calendar-prepare');
    await page.getByTestId('calendar-open').waitFor();
    for (const theme of ['light', 'dark']) {
      await applyPageTheme({ theme, header: theme }); await waitTheme(theme);
      await assertReadable(['[data-testid="calendar-title"]', '[data-testid="calendar-start"]', '[data-testid="calendar-end"]', '[data-testid="calendar-timeZone"]', '[data-testid="calendar-location"]', '[data-testid="calendar-open"]'], theme);
    }
    assert.equal(await aiRequests(), 2, 'Only the two explicit user actions generate model requests');
  });
  await check('all sidebar views fit 390px without horizontal overflow in either theme', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      const shadow = document.querySelector('#threadlight-root').shadowRoot;
      shadow.querySelector('#chat-name').textContent = 'A deliberately long fictional conversation title that should stay inside the sidebar';
      for (const node of shadow.querySelectorAll('.suggestion-text')) {
        node.dataset.previewText = node.textContent;
        node.textContent += ' ' + 'LongUnbrokenFictionalText'.repeat(12);
      }
    });
    for (const theme of ['light', 'dark']) {
      await applyPageTheme({ theme, header: theme }); await waitTheme(theme);
      for (const tab of ['write', 'calendar', 'memory', 'tasks']) {
        await page.getByTestId(`tab-${tab}`).click();
        await assertNoHorizontalOverflow();
      }
    }
    assert.equal(await aiRequests(), 2);
    assert.equal(await page.evaluate(() => fixture.sendCount), 0);
  });
  await page.setViewportSize({ width: 1440, height: 1380 });
  await applyPageTheme({ theme: 'dark', header: 'dark' }); await waitTheme('dark');
  await page.evaluate(() => {
    const shadow = document.querySelector('#threadlight-root').shadowRoot;
    shadow.querySelector('#chat-name').textContent = 'Alex Rao';
    for (const node of shadow.querySelectorAll('.suggestion-text')) { node.textContent = node.dataset.previewText; delete node.dataset.previewText; }
    document.querySelector('#main header').style.backgroundColor = '#202222';
  });
  await mkdir(path.join(projectRoot, 'demo'), { recursive: true });
  await page.getByTestId('tab-write').click(); await settleStyles();
  await page.screenshot({ path: path.join(projectRoot, 'demo/preview-dark.png'), fullPage: true });
  await page.getByTestId('tab-calendar').click(); await settleStyles();
  await page.screenshot({ path: path.join(projectRoot, 'demo/calendar-preview-dark.png'), fullPage: true });
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`\n${passed} isolated theme checks passed. No live WhatsApp or OpenAI calls were made.`);
} finally { await browser.close(); await fixture.close(); }
