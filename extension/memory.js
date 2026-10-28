/** Pure, account-and-chat scoped storage helpers. No network I/O. */
export const LIMITS = Object.freeze({ messages: 1200, messageText: 12000, messageBytes: 650000, examples: 24, tasks: 100, profiles: 6000, scopes: 100, seen: 6000, accepted: 1000, storageBytes: 7 * 1024 * 1024 });
const encoder = new TextEncoder();
const bytes = value => encoder.encode(JSON.stringify(value)).length;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function text(value, max, name, required = false) {
  if (typeof value !== 'string') throw new Error(`${name} must be text.`);
  const result = value.trim();
  if (required && !result) throw new Error(`${name} is required.`);
  if (result.length > max) throw new Error(`${name} exceeds ${max} characters.`);
  return result;
}
export function validateChat(chat) {
  if (!chat || typeof chat !== 'object' || Array.isArray(chat)) throw new Error('Select a conversation first.');
  return { id: text(chat.id, 256, 'Conversation ID', true), name: text(chat.name || 'Conversation', 160, 'Conversation name') };
}
export function scopeKey(account, chat) {
  return JSON.stringify([text(account, 120, 'Account label', true), validateChat(chat).id]);
}
function fingerprint(value) {
  let a = 2166136261, b = 2246822507;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b ^ value.charCodeAt(i), 3266489909);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
export function createMemoryStore() { return { version: 1, chats: {} }; }
export function loadMemoryStore(value) {
  if (!value) return createMemoryStore();
  if (value.version !== 1 || !value.chats || typeof value.chats !== 'object' || Array.isArray(value.chats)) throw new Error('Saved memory format is unsupported.');
  return value;
}
/** Prepare the one-time transition from legacy IDs to displayed-name scopes.
 * Returns a fresh store; callers must persist it before exposing migrated state.
 * Ambiguous legacy records remain untouched and are never reconsidered once marked.
 */
export function migrateNameIdentityStore(value) {
  const store = structuredClone(loadMemoryStore(value));
  if (store.nameIdentityVersion === 1) return { store, changed: false, migrated: 0 };
  if (store.nameIdentityVersion != null) throw new Error('Saved name identity version is unsupported.');
  if (Object.keys(store.chats).length === 0) return { store, changed: false, migrated: 0 };
  const groups = new Map();
  for (const [key, record] of Object.entries(store.chats)) {
    let parts;
    try { parts = JSON.parse(key); } catch { continue; }
    if (!Array.isArray(parts) || parts.length !== 2 || typeof parts[0] !== 'string' || typeof parts[1] !== 'string'
      || !parts[0].trim() || parts[0].trim().length > 120 || !record?.chat || record.chat.id !== parts[1] || typeof record.chat.name !== 'string') continue;
    const name = record.chat.name.replace(/[\u200b\u200e\u200f]/g, '').trim().replace(/\s+/g, ' ').normalize('NFC').slice(0, 160);
    if (!name) continue;
    const account = parts[0].trim(), groupKey = JSON.stringify([account, name]);
    const item = { key, record, account, name, legacy: parts[1].startsWith('wa:') || parts[1].startsWith('manual:phone:') };
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(item);
  }
  let migrated = 0;
  for (const candidates of groups.values()) {
    if (candidates.length !== 1 || !candidates[0].legacy) continue;
    const { key, record, account, name } = candidates[0];
    const id = 'name:' + name, destination = scopeKey(account, { id, name });
    if (own(store.chats, destination)) continue;
    record.chat = { ...record.chat, id, name };
    store.chats[destination] = record;
    delete store.chats[key];
    migrated++;
  }
  // Persist even if every source was ambiguous. Forgetting a destination later
  // must never cause preserved legacy records to be adopted on another startup.
  store.nameIdentityVersion = 1;
  return { store, changed: true, migrated };
}
function emptyRecord(chat, now) {
  return { chat: validateChat(chat), messages: [], profile: '', examples: [], tasks: [], seen: [], accepted: [], recentFeedback: [], updatedAt: now,
    counters: { capturedTotal: 0, acceptedSuggestions: 0, acceptedRewrites: 0, copied: 0, inserted: 0, retentionRemovals: 0, removedTasks: 0, feedbackCounts: {} } };
}
function recordFor(store, account, chat, now, create = true) {
  const key = scopeKey(account, chat);
  if (!own(store.chats, key)) {
    if (!create) return emptyRecord(chat, now);
    if (Object.keys(store.chats).length >= LIMITS.scopes) throw new Error('Memory contains 100 conversation scopes. Forget an unused conversation before adding another.');
    store.chats[key] = emptyRecord(chat, now);
  }
  const record = store.chats[key];
  if (create) { record.chat = validateChat(chat); record.updatedAt = now; }
  return record;
}
const sourceTime = timestamp => /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? Date.parse(timestamp) : NaN;
const messageTime = message => sourceTime(message.timestamp) || Date.parse(message.capturedAt) || 0;
function enforceLimits(store, record) {
  record.messages.sort((a, b) => messageTime(a) - messageTime(b));
  const excessCount = Math.max(0, record.messages.length - LIMITS.messages);
  if (excessCount) { record.messages.splice(0, excessCount); record.counters.retentionRemovals += excessCount; }
  let retainedBytes = bytes(record.messages), removeCount = 0;
  while (retainedBytes > LIMITS.messageBytes && removeCount < record.messages.length) {
    retainedBytes -= bytes(record.messages[removeCount]) + 1;
    removeCount++;
  }
  if (removeCount) { record.messages.splice(0, removeCount); record.counters.retentionRemovals += removeCount; }
  record.seen = record.seen.slice(-LIMITS.seen);
  record.accepted = record.accepted.slice(-LIMITS.accepted);
  record.examples = record.examples.slice(-LIMITS.examples);
  record.recentFeedback = (record.recentFeedback || []).slice(-20);
  while (record.tasks.length > LIMITS.tasks) {
    const completed = record.tasks.findIndex(task => task.status !== 'pending');
    record.tasks.splice(completed < 0 ? 0 : completed, 1);
    record.counters.removedTasks++;
  }
  while (bytes(store) > LIMITS.storageBytes) {
    const records = Object.values(store.chats);
    const candidate = records.filter(item => item.messages.length).sort((a, b) => messageTime(a.messages[0]) - messageTime(b.messages[0]))[0];
    if (candidate) { const count = Math.min(30, candidate.messages.length); candidate.messages.splice(0, count); candidate.counters.retentionRemovals += count; continue; }
    const examples = records.find(item => item.examples.length);
    if (examples) { examples.examples.shift(); continue; }
    const seen = records.find(item => item.seen.length > 100);
    if (seen) { seen.seen = seen.seen.slice(-Math.floor(seen.seen.length / 2)); continue; }
    const accepted = records.find(item => item.accepted.length > 100);
    if (accepted) { accepted.accepted = accepted.accepted.slice(-Math.floor(accepted.accepted.length / 2)); continue; }
    const tasks = records.find(item => item.tasks.length);
    if (tasks) { tasks.tasks.shift(); tasks.counters.removedTasks++; continue; }
    throw new Error('Memory storage is full. Forget an unused conversation.');
  }
}
function normalizeMessage(message, now) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid message.');
  const body = text(message.text || '', LIMITS.messageText, 'Message text');
  const kind = text(message.kind || 'text', 40, 'Message type');
  if (!['in', 'out'].includes(message.direction)) throw new Error('A message must have an incoming or outgoing direction.');
  const id = text(message.id || '', 512, 'Message ID');
  const sender = text(message.sender || '', 160, 'Sender');
  const timestamp = text(message.timestamp || '', 100, 'Message timestamp');
  const identity = id ? `id:${id}` : `body:${JSON.stringify([body, message.direction, sender, timestamp, kind])}`;
  // Preserve unparsed WhatsApp locale timestamps verbatim. Do not invent the
  // month/day order or timezone; coverage dates only use unambiguous ISO values.
  return { id: id || `import:${fingerprint(identity)}`, text: body, direction: message.direction, sender, timestamp: Number.isFinite(sourceTime(timestamp)) ? new Date(timestamp).toISOString() : timestamp, kind, capturedAt: now, _key: fingerprint(identity) };
}
export function captureMessages(store, account, chat, messages, now = new Date().toISOString()) {
  if (!Array.isArray(messages) || messages.length > 20000) throw new Error('Import or capture at most 20,000 messages at a time.');
  const normalized = messages.map(message => normalizeMessage(message, now)).filter(message => message.text || message.kind !== 'text');
  const record = recordFor(store, account, chat, now);
  const seen = new Set(record.seen);
  const present = new Map(record.messages.map((message, index) => [message._key, index]));
  for (const message of normalized) {
    if (present.has(message._key)) {
      const previous = record.messages[present.get(message._key)];
      record.messages[present.get(message._key)] = { ...message, capturedAt: previous.capturedAt };
    } else { present.set(message._key, record.messages.length); record.messages.push(message); }
    if (!seen.has(message._key)) { record.counters.capturedTotal++; seen.add(message._key); record.seen.push(message._key); }
  }
  enforceLimits(store, record);
  return getChatState(store, account, chat);
}
export function saveProfile(store, account, chat, profile, now = new Date().toISOString()) {
  const valid = text(profile, LIMITS.profiles, 'Conversation profile');
  const record = recordFor(store, account, chat, now);
  record.profile = valid;
  enforceLimits(store, record);
  return getChatState(store, account, chat);
}
export function recordAcceptance(store, account, chat, acceptance, now = new Date().toISOString()) {
  if (!acceptance || !['insert', 'copy'].includes(acceptance.action)) throw new Error('Invalid acceptance action.');
  const original = text(acceptance.original || '', 20000, 'Original draft');
  const suggestion = text(acceptance.suggestion?.text, 20000, 'Accepted suggestion', true);
  const feedback = acceptance.feedback || [];
  if (!Array.isArray(feedback) || feedback.length > 30) throw new Error('Invalid writing feedback.');
  const categories = new Set(feedback.map(item => text(item.category || 'Other', 80, 'Feedback category', true)));
  const record = recordFor(store, account, chat, now);
  const key = fingerprint(JSON.stringify([original, suggestion]));
  if (record.accepted.includes(key)) return getChatState(store, account, chat);
  record.accepted.push(key);
  record.counters.acceptedSuggestions++;
  record.counters[acceptance.action === 'copy' ? 'copied' : 'inserted']++;
  if (original && original !== suggestion) {
    record.counters.acceptedRewrites++;
    record.examples.push({ original: original.slice(0, 4000), text: suggestion.slice(0, 4000), acceptedAt: now });
    record.recentFeedback ||= [];
    for (const item of feedback) record.recentFeedback.push({ category: String(item.category || 'Other').slice(0, 80), original: String(item.original || '').slice(0, 1000), improved: String(item.improved || '').slice(0, 1000), reason: String(item.reason || '').slice(0, 1200), acceptedAt: now });
    for (const category of categories) {
      const previous = own(record.counters.feedbackCounts, category) ? record.counters.feedbackCounts[category] : 0;
      Object.defineProperty(record.counters.feedbackCounts, category, { value: previous + 1, enumerable: true, writable: true, configurable: true });
    }
  }
  enforceLimits(store, record);
  return getChatState(store, account, chat);
}
export function addCommitments(store, account, chat, commitments, now = new Date().toISOString()) {
  if (!Array.isArray(commitments) || commitments.length > 50) throw new Error('Too many extracted commitments.');
  const tasks = commitments.map(item => {
    const title = text(item.title, 500, 'Commitment title', true);
    const due = text(item.due || '', 100, 'Commitment due date');
    const owner = text(item.owner || '', 160, 'Commitment owner');
    const source = text(item.source || '', 2000, 'Commitment source');
    return { id: `task:${fingerprint(JSON.stringify([title.toLowerCase(), due, owner.toLowerCase()]))}`, title, due, owner, source, status: 'pending', createdAt: now };
  });
  const record = recordFor(store, account, chat, now);
  for (const task of tasks) {
    const existing = record.tasks.find(item => item.id === task.id);
    if (existing) existing.source = task.source || existing.source;
    else record.tasks.push(task);
  }
  enforceLimits(store, record);
  return getChatState(store, account, chat);
}
export function updateTask(store, account, chat, id, status, now = new Date().toISOString()) {
  if (!['pending', 'done', 'dismissed'].includes(status)) throw new Error('Invalid commitment status.');
  const record = recordFor(store, account, chat, now, false);
  const task = record.tasks.find(item => item.id === id);
  if (!task) throw new Error('This commitment was not found in the selected conversation.');
  task.status = status; task.updatedAt = now; record.updatedAt = now;
  return getChatState(store, account, chat);
}
export function forgetChat(store, account, chat) {
  delete store.chats[scopeKey(account, chat)];
  return getChatState(store, account, chat);
}
export function getChatState(store, account, chat) {
  const record = chat ? recordFor(store, account, chat, '', false) : emptyRecord({ id: 'none', name: '' }, '');
  const messages = record.messages.map(({ _key, capturedAt, ...message }) => message);
  const dates = messages.map(message => message.timestamp).filter(date => Number.isFinite(sourceTime(date))).sort((a, b) => Date.parse(a) - Date.parse(b));
  const outgoing = messages.filter(message => message.direction === 'out');
  const commonIssues = Object.entries(record.counters.feedbackCounts).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
  return structuredClone({
    memory: { messages, profile: record.profile, examples: record.examples, tasks: record.tasks,
      coverage: { retained: messages.length, oldest: dates[0] || '', newest: dates.at(-1) || '', retentionRemovals: record.counters.retentionRemovals, completeHistory: false } },
    stats: { messageCount: messages.length, capturedMessages: messages.length, capturedTotal: record.counters.capturedTotal,
      incomingMessages: messages.length - outgoing.length, outgoingMessages: outgoing.length,
      acceptedSuggestions: record.counters.acceptedSuggestions, acceptedRewrites: record.counters.acceptedRewrites, rewriteCount: record.counters.acceptedRewrites, recentFeedback: record.recentFeedback || [],
      copiedSuggestions: record.counters.copied, insertedSuggestions: record.counters.inserted,
      feedbackCounts: record.counters.feedbackCounts, commonIssues, retentionRemovals: record.counters.retentionRemovals, historyLimited: true,
      oldestMessage: dates[0] || '', newestMessage: dates.at(-1) || '', pendingTasks: record.tasks.filter(task => task.status === 'pending').length, removedTasks: record.counters.removedTasks,
      measurement: 'Accepted draft suggestions only; not an English proficiency score. Duplicate acceptance is suppressed within the retained acceptance log.' } });
}
export function buildGenerationContext(store, account, chat, query = '') {
  const { memory } = getChatState(store, account, chat);
  const outgoing = memory.messages.filter(message => message.direction === 'out' && message.text).slice(-12).map(message => ({ original: '', text: message.text.slice(0, 4000) }));
  // Search all retained messages, then combine relevant history and recent turns
  // within the bridge's 300k-character limit. This is lexical, not semantic search.
  const stop = new Set(['the', 'and', 'was', 'with', 'that', 'this', 'what', 'when', 'have', 'you', 'your', 'please', 'from', 'for']);
  const terms = [...new Set(String(query).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].filter(term => !stop.has(term)).slice(0, 60);
  const selected = new Set();
  let used = 0;
  const select = index => {
    if (index < 0 || index >= memory.messages.length || selected.has(index)) return;
    const size = memory.messages[index].text.length;
    if (used + size > 280000) return;
    selected.add(index); used += size;
  };
  for (let index = memory.messages.length - 1; index >= Math.max(0, memory.messages.length - 100) && used < 130000; index--) select(index);
  const ranked = memory.messages.map((message, index) => ({ index, score: terms.reduce((sum, term) => sum + (message.text.toLowerCase().includes(term) ? 1 : 0), 0) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score || b.index - a.index);
  for (const { index } of ranked) { select(index); select(index - 1); select(index + 1); }
  for (let index = memory.messages.length - 1; index >= 0; index--) select(index);
  const messages = [...selected].sort((a, b) => a - b).map(index => memory.messages[index]);
  return { profile: memory.profile, messages, examples: [...outgoing, ...memory.examples.slice(-12).map(({ original, text: body }) => ({ original, text: body }))] };
}
