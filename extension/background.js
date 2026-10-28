import { createMemoryStore, migrateNameIdentityStore, validateChat, scopeKey, getChatState, captureMessages, saveProfile, recordAcceptance, addCommitments, updateTask, forgetChat, buildGenerationContext } from './memory.js';

export const STORAGE_KEYS = { settings: 'wac.settings.v1', memory: 'wac.memory.v1' };
export const DEFAULT_SETTINGS = Object.freeze({ bridgeUrl: 'http://127.0.0.1:4318', pairingToken: '', accountLabel: 'Personal', calendarAccount: '' });
const MODES = new Set(['rewrite', 'reply', 'explain', 'calendar', 'commitments']);
const ACCOUNT_SCOPED_MUTATIONS = new Set(['CAPTURE', 'IMPORT_MESSAGES', 'SAVE_PROFILE', 'ACCEPT', 'UPDATE_TASK', 'FORGET_CHAT']);
const OPTIONS_PATH = 'options.html';

function field(value, max, name, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${name} is missing or invalid.`);
  return value;
}
function zone(value) {
  field(value, 100, 'Time zone', true);
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { throw new Error('Choose a valid IANA time zone, such as Asia/Kolkata.'); }
  return value;
}
export function validateZonedISO(value, name = 'Date') {
  field(value, 100, name, true);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw new Error(`${name} must include a date, time, and time-zone offset.`);
  const [, y, m, d, h, min, sec = '0', , , offH = '0', offM = '0'] = match;
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  if (+m < 1 || +m > 12 || +d < 1 || +d > lastDay || +h > 23 || +min > 59 || +sec > 59 || +offH > 14 || +offM > 59 || (+offH === 14 && +offM !== 0) || !Number.isFinite(Date.parse(value))) throw new Error(`${name} is not a valid date and time.`);
  return value;
}
export function validateCalendarAccount(value = '') {
  const email = field(value, 254, 'Google account email').trim().toLowerCase();
  if (email && (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email) || email.split('@')[0].length > 64)) {
    throw new Error('Enter a valid Google account email, or leave it empty for the browser default.');
  }
  return email;
}
export function buildCalendarUrl(event, calendarAccount = '') {
  if (!event || typeof event !== 'object' || event.needsClarification) throw new Error('Resolve the event questions before opening Calendar.');
  const title = field(event.title, 300, 'Event title', true).trim();
  const start = validateZonedISO(event.start, 'Start time');
  const end = validateZonedISO(event.end, 'End time');
  if (Date.parse(end) <= Date.parse(start)) throw new Error('The event end must be after its start.');
  const timeZone = zone(event.timeZone);
  const description = field(event.description || '', 12000, 'Event description');
  const location = field(event.location || '', 1000, 'Event location');
  const compact = date => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const url = new URL('https://calendar.google.com/calendar/render');
  url.search = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${compact(start)}/${compact(end)}`, ctz: timeZone, location, details: description }).toString();
  const email = validateCalendarAccount(calendarAccount);
  if (email) url.searchParams.set('authuser', email);
  return url.toString();
}
export function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings.');
  let parsed;
  try { parsed = new URL(input.bridgeUrl); } catch { throw new Error('Invalid bridge URL.'); }
  if (parsed.origin !== 'http://127.0.0.1:4318' || parsed.username || parsed.password || !['', '/'].includes(parsed.pathname) || parsed.search || parsed.hash) throw new Error('The bridge must use http://127.0.0.1:4318.');
  const pairingToken = field(input.pairingToken || '', 512, 'Pairing token').trim();
  if (pairingToken && !/^[A-Za-z0-9_.~+-]+$/.test(pairingToken)) throw new Error('The pairing token contains invalid characters.');
  return { bridgeUrl: parsed.origin, pairingToken, accountLabel: field(input.accountLabel, 120, 'Account label', true).trim(), calendarAccount: validateCalendarAccount(input.calendarAccount) };
}
export function senderKind(sender, runtime) {
  if (!sender || sender.id !== runtime.id) return null;
  if (sender.url === runtime.getURL(OPTIONS_PATH)) return 'options';
  try {
    const url = new URL(sender.url);
    if (url.origin === 'https://web.whatsapp.com' && Number.isInteger(sender.tab?.id) && sender.frameId === 0) return 'content';
  } catch { /* reject missing/opaque origins */ }
  return null;
}
function validateAttachments(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length > 4) throw new Error('Select at most four attachments.');
  let total = 0;
  return attachments.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid attachment.');
    const name = field(item.name, 200, 'Attachment name', true);
    const mime = field(item.mime, 100, 'Attachment type', true);
    const data = field(item.data, 24 * 1024 * 1024, 'Attachment content', true);
    if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('An attachment is not valid base64.');
    total += data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    if (total > 16 * 1024 * 1024) throw new Error('Attachments must total at most 16 MB.');
    return { name, mime, data };
  });
}
function safeResult(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.suggestions) || !Array.isArray(result.feedback) || !Array.isArray(result.commitments) || !Array.isArray(result.mediaNotes)) throw new Error('The bridge returned an invalid response.');
  return result;
}

export function createBackground({ chromeApi = globalThis.chrome, fetchImpl = globalThis.fetch, now = () => new Date().toISOString(), timers = globalThis } = {}) {
  if (!chromeApi?.runtime || !chromeApi?.storage?.local) throw new Error('Chrome extension APIs are unavailable.');
  let settings = { ...DEFAULT_SETTINGS };
  let memory = createMemoryStore();
  let queue = Promise.resolve();
  const epochs = new Map();
  const serial = work => { const next = queue.then(work, work); queue = next.catch(() => {}); return next; };
  const ready = (async () => {
    // Deny direct storage access from content scripts, including the pairing token.
    await chromeApi.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    if (chromeApi.storage.session?.setAccessLevel) await chromeApi.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    const saved = await chromeApi.storage.local.get([STORAGE_KEYS.settings, STORAGE_KEYS.memory]);
    settings = validateSettings({ ...DEFAULT_SETTINGS, ...saved[STORAGE_KEYS.settings] });
    const migration = migrateNameIdentityStore(saved[STORAGE_KEYS.memory]);
    if (migration.changed) await chromeApi.storage.local.set({ [STORAGE_KEYS.memory]: migration.store });
    memory = migration.store;
  })();
  const publicSettings = () => ({ accountLabel: settings.accountLabel, bridgeUrl: settings.bridgeUrl, calendarAccount: settings.calendarAccount });
  function checkAccount(message) {
    if (message.accountLabel !== undefined && message.accountLabel !== settings.accountLabel) throw new Error('The active account changed. Refresh this conversation before continuing.');
  }
  async function broadcastToWhatsApp(message) {
    try {
      const tabs = await chromeApi.tabs.query({ url: 'https://web.whatsapp.com/*' });
      for (const tab of tabs) {
        if (!Number.isInteger(tab.id)) continue;
        try {
          // Do not wait for a response: the receiving UI may immediately request
          // fresh state, which uses this same serialized storage queue.
          const delivered = chromeApi.tabs.sendMessage(tab.id, message);
          delivered?.catch(() => {});
        } catch { /* A tab may close or have no content script yet. */ }
      }
    } catch { /* Settings remain saved if tab enumeration is unavailable. */ }
  }
  async function mutate(operation) {
    // Commit a full transaction only after persistence succeeds; quota errors cannot
    // leave a worker-only state that appears saved but disappears after restart.
    const next = structuredClone(memory);
    const result = operation(next);
    await chromeApi.storage.local.set({ [STORAGE_KEYS.memory]: next });
    memory = next;
    return result;
  }
  async function bridge(path, { body, token, baseUrl = settings.bridgeUrl, timeout = 180000 } = {}) {
    const controller = new AbortController();
    const timer = timers.setTimeout(() => controller.abort(), timeout);
    // An explicitly requested transcription or model response can outlive MV3's
    // idle worker window. A cheap extension API call keeps this one request alive;
    // both timers are removed on success, error, or the bounded abort timeout.
    const keepAlive = path === '/api/generate' && typeof chromeApi.runtime.getPlatformInfo === 'function'
      ? timers.setInterval(() => {
        try { chromeApi.runtime.getPlatformInfo()?.catch(() => {}); }
        catch { /* A shutdown or unavailable API must not mask the real request error. */ }
      }, 20000)
      : null;
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: body ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(typeof data.error === 'string' ? data.error.slice(0, 600) : `The bridge returned HTTP ${response.status}.`);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The request timed out. Try a shorter recording or smaller attachment.');
      if (error instanceof TypeError) throw new Error('Cannot reach the local bridge. Start it, then check Settings.');
      throw error;
    } finally { timers.clearTimeout(timer); if (keepAlive !== null) timers.clearInterval(keepAlive); }
  }
  async function generate(message) {
    const request = await serial(async () => {
      checkAccount(message);
      const chat = validateChat(message.chat);
      if (!MODES.has(message.mode)) throw new Error('Unsupported assistance mode.');
      if (!settings.pairingToken) throw new Error('Pair the local bridge in Settings before using AI.');
      const input = {
        mode: message.mode, text: field(message.text || '', 20000, 'Draft or selection'), prompt: field(message.prompt || '', 4000, 'Request'),
        trackWriting: message.trackWriting === true && message.mode === 'rewrite',
        chat, ...buildGenerationContext(memory, settings.accountLabel, chat, `${message.text || ''} ${message.prompt || ''}`),
        attachments: validateAttachments(message.attachments),
        sourceTimestamp: field(message.sourceTimestamp || '', 100, 'Source message time'),
        timeZone: zone(message.timeZone), now: validateZonedISO(message.now || now(), 'Current time'),
      };
      const account = settings.accountLabel;
      const key = scopeKey(account, chat);
      return { input, token: settings.pairingToken, baseUrl: settings.bridgeUrl, account, key, epoch: epochs.get(key) || 0 };
    });
    const data = await bridge('/api/generate', { body: request.input, token: request.token, baseUrl: request.baseUrl });
    const result = safeResult(data.result || data);
    if (!request.input.trackWriting) result.feedback = [];
    if (result.commitments.length) await serial(async () => {
      // Forgetting a conversation invalidates in-flight writes to its memory.
      if ((epochs.get(request.key) || 0) === request.epoch) await mutate(store => addCommitments(store, request.account, request.input.chat, result.commitments, now()));
    });
    return { ok: true, result };
  }
  async function dispatch(message, sender) {
    const kind = senderKind(sender, chromeApi.runtime);
    if (!kind) throw new Error('This request did not come from a trusted extension surface.');
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') throw new Error('Invalid extension request.');
    await ready;
    if (message.type === 'GENERATE') return generate(message);
    if (message.type === 'HEALTH') {
      const data = await bridge('/api/health', { timeout: 5000 });
      return { ok: true, ready: data.ready === true, model: typeof data.model === 'string' ? data.model : '', transcriptionModel: typeof data.transcriptionModel === 'string' ? data.transcriptionModel : '', media: { video: data.media?.video === true, audio: data.media?.audio === true } };
    }
    return serial(async () => {
      if (ACCOUNT_SCOPED_MUTATIONS.has(message.type)) checkAccount(message);
      const account = settings.accountLabel;
      switch (message.type) {
        case 'GET_STATE': return { ok: true, settings: publicSettings(), ...getChatState(memory, account, message.chat) };
        case 'CAPTURE':
        case 'IMPORT_MESSAGES': return { ok: true, settings: publicSettings(), ...await mutate(store => captureMessages(store, account, message.chat, message.messages, now())) };
        case 'SAVE_PROFILE': return { ok: true, ...await mutate(store => saveProfile(store, account, message.chat, message.profile, now())) };
        case 'ACCEPT': return { ok: true, ...await mutate(store => recordAcceptance(store, account, message.chat, message, now())) };
        case 'UPDATE_TASK': return { ok: true, ...await mutate(store => updateTask(store, account, message.chat, message.id, message.status, now())) };
        case 'FORGET_CHAT': {
          const key = scopeKey(account, message.chat);
          const state = await mutate(store => forgetChat(store, account, message.chat));
          epochs.set(key, (epochs.get(key) || 0) + 1);
          return { ok: true, ...state };
        }
        case 'GET_SETTINGS':
          if (kind !== 'options') throw new Error('Settings and pairing tokens are only available on the extension Settings page.');
          return { ok: true, settings: { ...settings } };
        case 'SAVE_SETTINGS': {
          if (kind !== 'options') throw new Error('Only the extension Settings page may change settings.');
          const next = validateSettings(message.settings);
          // The connection form does not edit the independent Calendar choice.
          next.calendarAccount = settings.calendarAccount;
          await chromeApi.storage.local.set({ [STORAGE_KEYS.settings]: next });
          const accountChanged = next.accountLabel !== settings.accountLabel;
          settings = next;
          if (accountChanged) await broadcastToWhatsApp({ type: 'UI_ACCOUNT_CHANGED' });
          return { ok: true, settings: { ...settings } };
        }
        case 'GET_CALENDAR_ACCOUNT': return { ok: true, calendarAccount: settings.calendarAccount };
        case 'SAVE_CALENDAR_ACCOUNT': {
          const calendarAccount = validateCalendarAccount(field(message.calendarAccount, 254, 'Google account email'));
          const next = { ...settings, calendarAccount };
          await chromeApi.storage.local.set({ [STORAGE_KEYS.settings]: next });
          settings = next;
          await broadcastToWhatsApp({ type: 'UI_CALENDAR_ACCOUNT_CHANGED', calendarAccount });
          return { ok: true, calendarAccount };
        }
        case 'OPEN_CALENDAR_ACCOUNT': {
          // Account management never carries a selected message or event details.
          const url = new URL('https://accounts.google.com/AccountChooser');
          url.searchParams.set('continue', 'https://calendar.google.com/calendar/');
          await chromeApi.tabs.create({ url: url.toString() });
          return { ok: true, opened: true };
        }
        case 'OPEN_SETTINGS': await chromeApi.runtime.openOptionsPage(); return { ok: true };
        case 'OPEN_CALENDAR': {
          const url = buildCalendarUrl(message.event, settings.calendarAccount);
          await chromeApi.tabs.create({ url });
          return { ok: true, opened: true };
        }
        default: throw new Error('Unknown extension request.');
      }
    });
  }
  const handleMessage = (message, sender) => dispatch(message, sender).catch(error => ({ ok: false, error: error.message || 'The request could not be completed.' }));
  async function openUI(tab, mode = 'reply', text, toggle = false) {
    if (!Number.isInteger(tab?.id) || !tab.url?.startsWith('https://web.whatsapp.com/')) return;
    try { await chromeApi.tabs.sendMessage(tab.id, { type: 'UI_OPEN', mode, ...(text ? { text } : {}), ...(toggle ? { toggle: true } : {}) }); }
    catch { /* The tab may have navigated or the extension may need a reload. */ }
  }
  function register() {
    chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => { handleMessage(message, sender).then(sendResponse); return true; });
    chromeApi.runtime.onInstalled.addListener(() => {
      chromeApi.contextMenus.removeAll(() => {
        for (const [mode, title] of [['rewrite', 'Improve selected English'], ['calendar', 'Draft a calendar event']]) {
          chromeApi.contextMenus.create({ id: `wac-${mode}`, title: `Copilot: ${title}`, contexts: ['selection'], documentUrlPatterns: ['https://web.whatsapp.com/*'] });
        }
      });
    });
    chromeApi.contextMenus.onClicked.addListener((info, tab) => {
      const mode = String(info.menuItemId).replace(/^wac-/, '');
      if (['rewrite', 'calendar'].includes(mode)) void openUI(tab, mode, info.selectionText);
    });
    chromeApi.action.onClicked.addListener(tab => { void openUI(tab, 'reply', undefined, true); });
    chromeApi.commands?.onCommand.addListener(async command => {
      if (!['toggle-copilot', 'open-copilot'].includes(command)) return;
      const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
      await openUI(tab, 'reply', undefined, true);
    });
  }
  return { ready, handleMessage, register };
}

if (globalThis.chrome?.runtime?.id) createBackground().register();
