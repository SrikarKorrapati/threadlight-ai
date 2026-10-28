'use strict';
const $ = id => document.getElementById(id);
let state;
function notice(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
async function api(path, body) {
  const response = await fetch(path, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'Connection failed. Reload this page.');
  return result;
}
function render() {
  $('status').textContent = state.ready ? 'Key configured' : 'Add an API key';
  $('status').classList.toggle('ready', state.ready);
  $('model').value = state.model; $('transcription').value = state.transcriptionModel;
  $('pairing-token').value = state.pairingToken;
  $('clear-key').hidden = state.keySource !== 'local';
  $('key-hint').textContent = state.ready ? `A key is configured ${state.keySource === 'environment' ? 'in the server environment' : 'on this computer'}. Leave this field blank to keep it. Key validity is checked on your first generation.` : 'Add a key from your OpenAI API account. API usage is billed separately from ChatGPT.';
  $('media-status').textContent = state.media.video ? 'Images, PDFs, text documents and voice notes. Video uses up to six frames and audio from the first minute.' : 'Images, PDFs, text documents and supported audio. Install FFmpeg and restart the bridge for video and OGG voice notes.';
}
async function load() { state = await api('/api/setup'); render(); }
$('toggle-key').addEventListener('click', () => { const show = $('api-key').type === 'password'; $('api-key').type = show ? 'text' : 'password'; $('toggle-key').textContent = show ? 'Hide' : 'Show'; });
$('setup-form').addEventListener('submit', async event => {
  event.preventDefault(); $('save').disabled = true; notice('notice', 'Saving on this computer…');
  try {
    await api('/api/setup', { apiKey: $('api-key').value, model: $('model').value.trim(), transcriptionModel: $('transcription').value.trim() });
    $('api-key').value = ''; await load(); notice('notice', 'Connection saved. No AI request was made.');
  } catch (error) { notice('notice', error.message, true); }
  finally { $('save').disabled = false; }
});
$('clear-key').addEventListener('click', async () => {
  try { await api('/api/setup', { clearKey: true }); await load(); notice('notice', state.ready ? 'Saved key removed. The server environment still supplies a key.' : 'Saved API key removed.'); }
  catch (error) { notice('notice', error.message, true); }
});
$('copy-token').addEventListener('click', async () => {
  if (!state) return;
  try { await navigator.clipboard.writeText(state.pairingToken); notice('pair-notice', 'Copied. Paste into the extension’s pairing token field.'); }
  catch { $('pairing-token').type = 'text'; $('pairing-token').select(); notice('pair-notice', 'Select and copy the token, then paste it into extension settings.'); }
});
$('rotate-token').addEventListener('click', async () => {
  try { const result = await api('/api/setup/rotate', {}); state.pairingToken = result.pairingToken; render(); notice('pair-notice', 'New token created. Copy it into each extension you want to pair.'); }
  catch (error) { notice('pair-notice', error.message, true); }
});
load().catch(error => notice('notice', error.message, true));
