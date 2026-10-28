import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, createMemoryStore, loadMemoryStore, captureMessages, getChatState, saveProfile, recordAcceptance, buildGenerationContext, addCommitments, updateTask, forgetChat, scopeKey } from '../extension/memory.js';

const chat = { id: '1111111111@c.us', name: 'Sam' };
const other = { id: '2222222222@c.us', name: 'Sam' };
const message = (id, text = 'Hello', direction = 'in', timestamp = '2026-10-28T09:00:00Z') => ({ id, text, direction, sender: 'Sam', timestamp, kind: 'text' });

test('same display name and different account namespaces never share history, profiles, or statistics', () => {
  const store = createMemoryStore();
  captureMessages(store, 'Personal', chat, [message('one', 'Private appointment')]);
  saveProfile(store, 'Personal', chat, 'Use a warm tone.');
  recordAcceptance(store, 'Personal', chat, { original: 'I has', suggestion: { text: 'I have' }, action: 'copy', feedback: [{ category: 'Grammar' }] });
  for (const [account, target] of [['Work', chat], ['Personal', other]]) {
    const state = getChatState(store, account, target);
    assert.equal(state.memory.messages.length, 0);
    assert.equal(state.memory.profile, '');
    assert.equal(state.stats.acceptedRewrites, 0);
  }
  assert.notEqual(scopeKey('a,b', { id: 'c' }), scopeKey('a', { id: 'b,c' }));
});

test('captures deduplicate by stable ID, preserve edits, and retain source timestamps', () => {
  const store = createMemoryStore();
  captureMessages(store, 'Personal', chat, [message('one'), message('two')]);
  captureMessages(store, 'Personal', chat, [message('one', 'Edited'), message('two')]);
  const { memory, stats } = getChatState(store, 'Personal', chat);
  assert.equal(memory.messages.length, 2);
  assert.equal(memory.messages[0].text, 'Edited');
  assert.equal(stats.capturedTotal, 2);
  assert.equal(stats.oldestMessage, '2026-10-28T09:00:00.000Z');
  assert.equal(memory.coverage.completeHistory, false);
});

test('imports without message IDs deduplicate deterministically and reject malformed input atomically', () => {
  const store = createMemoryStore();
  captureMessages(store, 'Personal', chat, [message('')]);
  captureMessages(store, 'Personal', chat, [message('')]);
  assert.equal(getChatState(store, 'Personal', chat).stats.capturedMessages, 1);
  assert.throws(() => captureMessages(store, 'Personal', chat, [message('good'), { ...message('bad'), direction: 'unknown' }]));
  assert.equal(getChatState(store, 'Personal', chat).stats.capturedMessages, 1);
});

test('retention is bounded and visibly reports removals while preserving chronological messages', () => {
  const store = createMemoryStore();
  const inputs = Array.from({ length: LIMITS.messages + 11 }, (_, i) => message(`id-${i}`, `message ${i}`, 'in', new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()));
  captureMessages(store, 'Personal', chat, inputs);
  const state = getChatState(store, 'Personal', chat);
  assert.equal(state.memory.messages.length, LIMITS.messages);
  assert.equal(state.memory.messages[0].id, 'id-11');
  assert.equal(state.stats.retentionRemovals, 11);
  assert.equal(state.stats.historyLimited, true);
});

test('style examples use outgoing messages and accepted rewrites, not another person’s incoming wording', () => {
  const store = createMemoryStore();
  captureMessages(store, 'Personal', chat, [message('in', 'Their unique style'), message('out', 'My own voice', 'out')]);
  recordAcceptance(store, 'Personal', chat, { original: 'I am agree', suggestion: { text: 'I agree' }, action: 'insert', feedback: [{ category: 'Grammar' }] });
  const context = buildGenerationContext(store, 'Personal', chat);
  assert.deepEqual(context.examples.map(item => item.text), ['My own voice', 'I agree']);
  assert.ok(context.messages.some(item => item.text === 'Their unique style'));
});

test('accepting the same rewrite twice counts once and a reply is not scored as English improvement', () => {
  const store = createMemoryStore();
  const acceptance = { original: 'I has', suggestion: { text: 'I have' }, action: 'copy', feedback: [{ category: 'Grammar' }, { category: 'Grammar' }] };
  recordAcceptance(store, 'Personal', chat, acceptance);
  recordAcceptance(store, 'Personal', chat, { ...acceptance, action: 'insert' });
  recordAcceptance(store, 'Personal', chat, { original: '', suggestion: { text: 'Sounds good.' }, action: 'insert', feedback: [{ category: 'Grammar' }] });
  const state = getChatState(store, 'Personal', chat);
  assert.equal(state.stats.acceptedSuggestions, 2);
  assert.equal(state.stats.acceptedRewrites, 1);
  assert.equal(state.stats.feedbackCounts.Grammar, 1);
  assert.equal(state.memory.examples.length, 1);
});

test('persisted state survives a worker restart and read snapshots cannot mutate storage', () => {
  let store = createMemoryStore();
  captureMessages(store, 'Personal', chat, [message('one')]);
  store = loadMemoryStore(JSON.parse(JSON.stringify(store)));
  const view = getChatState(store, 'Personal', chat);
  view.memory.messages[0].text = 'Modified outside storage';
  assert.equal(getChatState(store, 'Personal', chat).memory.messages[0].text, 'Hello');
  assert.throws(() => loadMemoryStore({ version: 99, chats: {} }));
});

test('locale timestamps are retained without guessing date order or claiming calendar coverage', () => {
  const store = createMemoryStore();
  captureMessages(store, 'Personal', chat, [message('locale', 'Meet tomorrow', 'in', '10:22, 04/05/2026')]);
  const state = getChatState(store, 'Personal', chat);
  assert.equal(state.memory.messages[0].timestamp, '10:22, 04/05/2026');
  assert.equal(state.stats.oldestMessage, '');
});

test('commitments remain scoped and completed state survives repeated extraction', () => {
  const store = createMemoryStore();
  const commitment = { title: 'Send design', due: '2026-10-30', owner: 'Me', source: 'I will send the design.' };
  const state = addCommitments(store, 'Personal', chat, [commitment]);
  const id = state.memory.tasks[0].id;
  updateTask(store, 'Personal', chat, id, 'done');
  addCommitments(store, 'Personal', chat, [commitment]);
  assert.equal(getChatState(store, 'Personal', chat).memory.tasks[0].status, 'done');
  assert.equal(getChatState(store, 'Personal', chat).memory.tasks.length, 1);
  assert.throws(() => updateTask(store, 'Personal', other, id, 'done'), /not found/);
});

test('forgetting removes only the requested account/conversation including learned style and feedback', () => {
  const store = createMemoryStore();
  captureMessages(store, 'Personal', chat, [message('one')]);
  captureMessages(store, 'Work', chat, [message('two')]);
  saveProfile(store, 'Personal', chat, 'Private note');
  forgetChat(store, 'Personal', chat);
  assert.equal(getChatState(store, 'Personal', chat).stats.capturedTotal, 0);
  assert.equal(getChatState(store, 'Personal', chat).memory.profile, '');
  assert.equal(getChatState(store, 'Work', chat).memory.messages.length, 1);
});

test('context retrieval searches older retained messages under the request character budget', () => {
  const store = createMemoryStore();
  const messages = Array.from({ length: 110 }, (_, index) => message(String(index), `${index === 0 ? 'Saffron project deadline December' : 'Recent discussion'} ${'x'.repeat(3200)}`, 'in', new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()));
  captureMessages(store, 'Personal', chat, messages);
  const context = buildGenerationContext(store, 'Personal', chat, 'What was the Saffron deadline?');
  assert.ok(context.messages.some(item => item.id === '0'));
  assert.ok(context.messages.some(item => item.id === '109'));
  assert.ok(context.messages.reduce((sum, item) => sum + item.text.length, 0) <= 280000);
});
