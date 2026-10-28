import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { SYSTEM_PROMPT, validateResult } from '../server/provider.mjs';

const context = vm.createContext({});
vm.runInContext(await readFile(new URL('../extension/commitments.js', import.meta.url), 'utf8'), context);
const { present, formatSource, formatDate } = context.WACopilot.commitments;

test('legacy structured source becomes a short quote and human attribution without mutating Calendar data', () => {
  const task = { title: 'Send the final design', owner: 'You', due: '2026-10-29', status: 'pending', source: '"I will send the final design tomorrow." — sender: Alex, id: A1B2C3D4E5F6, timestamp: 09:35,27/10/2026' };
  const original = JSON.stringify(task), result = present(task);
  assert.equal(result.title, 'Send the final design');
  assert.equal(result.owner, 'You');
  assert.equal(result.due, '29 Oct 2026');
  assert.equal(result.statusLabel, 'To do');
  assert.equal(result.quote, 'I will send the final design tomorrow.');
  assert.equal(result.sourceLabel, 'Alex · 27 Oct 2026 · 09:35');
  assert.doesNotMatch(JSON.stringify(result), /A1B2C3D4E5F6/);
  assert.equal(JSON.stringify(task), original);
});

test('new source conventions support known sender/date independently and omit ID-only attribution', () => {
  assert.equal(formatSource('“Send it on Friday.” — sender: Smith, Alex, timestamp: 2026-10-27').sourceLabel, 'Smith, Alex · 27 Oct 2026');
  assert.equal(formatSource('"Send it on Friday." — sender: Alex').sourceLabel, 'Alex');
  assert.equal(formatSource('"Send it on Friday." — timestamp: 2026-10-27').sourceLabel, '27 Oct 2026');
  const idOnly = formatSource('"Send it on Friday." — id: ABC123DEF456');
  assert.equal(idOnly.quote, 'Send it on Friday.');
  assert.equal(idOnly.sourceLabel, '');
});

test('metadata-like words inside real quotations and unstructured sources remain intact', () => {
  for (const raw of [
    'Please send id: ABC123 tomorrow.',
    'The label reads sender: Alex, id: ABC123, timestamp: unknown.',
    'Send it — sender: Alex, id: ABC123, timestamp: 09:35,27/10/2026',
    '"Read the example: \\"hello\\" — sender: Alex, id: ABC123, timestamp: 09:35,27/10/2026"',
    '"Use this label — sender: Alex, id: ABC123, timestamp: tomorrow"',
    '"Message" — sender: Alex, id: ???, timestamp: 2026-10-27',
    '"Message" — sender: Alex, timestamp: 2026-10-27, id: ABC123',
  ]) {
    const result = formatSource(raw);
    assert.equal(result.sourceLabel, '', raw);
    assert.match(result.quote, /(?:id:|sender:)/, raw);
  }
});

test('date presentation validates dates and never guesses ambiguous day/month or relative dates', () => {
  assert.equal(formatDate('09:35, 03/04/2026'), '09:35, 03/04/2026');
  assert.equal(formatDate('03/04/2026'), '03/04/2026');
  assert.equal(formatDate('tomorrow morning'), 'tomorrow morning');
  assert.equal(formatDate('2026-02-30'), '2026-02-30');
  assert.equal(formatDate('2025-02-29'), '2025-02-29');
  assert.equal(formatDate('2028-02-29'), '29 Feb 2028');
  assert.equal(formatDate('25:35, 27/10/2026'), '25:35, 27/10/2026');
  assert.equal(formatDate('10/27/2026'), '27 Oct 2026');
  assert.equal(formatDate('9:35 PM, 27/10/2026'), '27 Oct 2026 · 09:35 PM');
  assert.equal(formatDate('2026-10-29T00:15:00+05:30'), '29 Oct 2026 · 00:15 UTC+05:30');
  assert.equal(formatDate('2026-10-29T23:30:12Z'), '29 Oct 2026 · 23:30:12 UTC');
  assert.equal(formatDate('2026-10-29T25:30:00Z'), '2026-10-29T25:30:00Z');
});

test('ambiguous source timestamps remain as written while structured IDs are hidden', () => {
  const result = formatSource('"Send it tomorrow." — sender: Alex, id: ABC123DEF, timestamp: 09:35,03/04/2026');
  assert.equal(result.sourceLabel, 'Alex · 09:35,03/04/2026');
  assert.equal(result.quote, 'Send it tomorrow.');
});

test('long quotations are bounded without splitting emoji and retain full text for accessible disclosure', () => {
  const raw = '😀'.repeat(300), result = formatSource(raw);
  assert.equal(Array.from(result.quote).length, 240);
  assert.equal(result.quote.endsWith('…'), true);
  assert.equal(result.quoteTruncated, true);
  assert.equal(result.fullQuote, raw);
  assert.equal(result.quote.includes('\uFFFD'), false);
});

test('presentation has clear fallbacks, known status labels and plain text rather than markup', () => {
  const empty = present(null);
  assert.equal(empty.owner, 'Owner unclear'); assert.equal(empty.due, 'No due date');
  assert.equal(empty.statusLabel, 'To do'); assert.equal(empty.quote, '');
  assert.equal(present({ status: 'done' }).statusLabel, 'Done');
  assert.equal(present({ status: 'dismissed' }).statusLabel, 'Dismissed');
  const result = present({ title: '<script>bad()</script>', source: '<b>Send the design</b>' });
  assert.equal(result.title, '<script>bad()</script>');
  assert.equal(result.quote, '<b>Send the design</b>');
});

test('provider source guidance avoids identifiers without changing the stored commitment contract', () => {
  assert.match(SYSTEM_PROMPT, /Never include a message ID, chat ID, technical identifier, or id: field in source/);
  assert.match(SYSTEM_PROMPT, /Keep the source timestamp as supplied/);
  const commitment = { title: 'Send design', owner: 'You', due: '', source: '"I will send it." — sender: Alex' };
  const result = validateResult({ suggestions: [], explanation: '', feedback: [], event: null, commitments: [commitment], mediaNotes: [] }, 'commitments');
  assert.deepEqual(result.commitments[0], commitment);
});
