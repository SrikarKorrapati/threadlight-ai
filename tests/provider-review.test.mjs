import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../server/provider.mjs';
import { validateInput } from '../server/validation.mjs';

const config = { apiKey: 'sk-synthetic-test-only', model: 'gpt-5-mini', transcriptionModel: 'gpt-transcribe' };
const sample = () => validateInput({ mode: 'explain', text: 'What does the voice note say?', chat: { id: 'name:Alex', name: 'Alex' }, timeZone: 'Asia/Kolkata', now: '2026-10-28T10:00:00+05:30', attachments: [{ name: 'recording.wav', mime: 'audio/wav', data: Buffer.from('synthetic-audio').toString('base64') }] });
const response = value => new Response(JSON.stringify(value), { status: 200 });
const result = { suggestions: [], explanation: 'A limited transcript.', feedback: [], event: null, commitments: [], mediaNotes: [] };

test('long transcripts disclose omitted speech to the model and user', async () => {
  let observed = false;
  const output = await generate(sample(), config, { ffmpeg: null, fetchImpl: async (url, options) => {
    if (url.endsWith('/transcriptions')) return response({ text: 'a'.repeat(60001) });
    const payload = JSON.parse(options.body), parts = payload.input[0].content;
    const context = JSON.parse(parts[0].text);
    assert.ok(context.attachmentProcessingNotes.some(note => note.includes('later speech was not analyzed')));
    const transcript = parts.map(part => { try { return JSON.parse(part.text).untrustedTranscript; } catch { return undefined; } }).find(Boolean);
    assert.equal(transcript.length, 60000);
    observed = true;
    return response({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] });
  } });
  assert.equal(observed, true);
  assert.ok(output.mediaNotes.some(note => note.includes('first 60,000 characters')));
});

test('malformed provider JSON uses actionable safe errors rather than runtime exceptions', async () => {
  await assert.rejects(generate(sample(), config, { ffmpeg: null, fetchImpl: async () => response(null) }), error => error.code === 'NO_TRANSCRIPT');
  const input = sample(); input.attachments = [];
  await assert.rejects(generate(input, config, { fetchImpl: async () => response(null) }), error => error.code === 'INVALID_AI_RESPONSE');
  await assert.rejects(generate(input, config, { fetchImpl: async () => response({ output: [null, { type: 'message', content: [null] }] }) }), error => error.code === 'INVALID_AI_RESPONSE');
});

test('a provider timeout while reading its response body remains an actionable timeout', async () => {
  const input = sample(); input.attachments = [];
  await assert.rejects(generate(input, config, { fetchImpl: async () => ({ ok: true, json: async () => { throw new DOMException('The operation was aborted.', 'AbortError'); } }) }), error => error.code === 'TIMEOUT');
});
