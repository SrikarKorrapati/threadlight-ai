export class AppError extends Error {
  constructor(message, status = 400, code = 'INVALID_INPUT') {
    super(message); this.status = status; this.code = code;
  }
}

export function object(value, label, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(`${label} must be an object.`);
  if (allowed && Object.keys(value).some(key => !allowed.includes(key))) throw new AppError(`${label} contains an unsupported field.`);
  return value;
}
export function string(value, label, max, { optional = false, nonempty = false } = {}) {
  if (value === undefined && optional) return '';
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim())) throw new AppError(`${label} must be ${nonempty ? 'nonempty ' : ''}text under ${max} characters.`);
  if (/\u0000/.test(value)) throw new AppError(`${label} contains invalid characters.`);
  return value;
}
function array(value, label, max) {
  if (!Array.isArray(value) || value.length > max) throw new AppError(`${label} must contain at most ${max} items.`);
  return value;
}
export function validTimeZone(value) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; }
}
export function isDateTime(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && hour <= 23 && minute <= 59 && (second === undefined || Number.isNaN(second) || second <= 59);
}

export const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const AUDIO_MIMES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'application/ogg', 'audio/aac', 'audio/flac']);
export const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg', 'video/ogg']);
export const TEXT_MIMES = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json']);
const MIME_TYPES = new Set([...IMAGE_MIMES, ...AUDIO_MIMES, ...VIDEO_MIMES, ...TEXT_MIMES, 'application/pdf']);

export function validateInput(raw) {
  object(raw, 'Request', ['mode', 'text', 'prompt', 'chat', 'profile', 'messages', 'examples', 'attachments', 'sourceTimestamp', 'timeZone', 'now', 'trackWriting']);
  const modes = ['rewrite', 'reply', 'explain', 'calendar', 'commitments'];
  if (!modes.includes(raw.mode)) throw new AppError('Choose rewrite, reply, explain, calendar, or commitments.');
  if (raw.trackWriting !== undefined && typeof raw.trackWriting !== 'boolean') throw new AppError('trackWriting must be true or false.');
  const chat = object(raw.chat, 'Chat', ['id', 'name']);
  const result = {
    mode: raw.mode,
    trackWriting: raw.trackWriting === true,
    text: string(raw.text, 'Selected text or draft', 20000, { optional: true }),
    prompt: string(raw.prompt, 'Instructions', 4000, { optional: true }),
    chat: { id: string(chat.id, 'Chat ID', 256, { nonempty: true }), name: string(chat.name, 'Chat name', 200, { nonempty: true }) },
    profile: string(raw.profile, 'Contact notes', 10000, { optional: true }),
    sourceTimestamp: string(raw.sourceTimestamp, 'Source timestamp', 100, { optional: true }),
    timeZone: string(raw.timeZone, 'Timezone', 100, { nonempty: true }),
    now: string(raw.now, 'Current time', 80, { nonempty: true }),
  };
  if (!isDateTime(result.now)) throw new AppError('Current time must be an ISO date with a timezone.');
  if (!validTimeZone(result.timeZone)) throw new AppError('The timezone is not recognized.');
  result.messages = array(raw.messages ?? [], 'History', 1200).map((entry) => {
    object(entry, 'History message', ['id', 'text', 'direction', 'sender', 'timestamp', 'kind']);
    if (!['in', 'out'].includes(entry.direction)) throw new AppError('A history message has an invalid direction.');
    return {
      id: string(entry.id, 'Message ID', 512, { nonempty: true }), text: string(entry.text, 'Message text', 12000),
      direction: entry.direction, sender: string(entry.sender, 'Sender', 200, { optional: true }),
      timestamp: string(entry.timestamp, 'Message timestamp', 100, { optional: true }), kind: string(entry.kind, 'Message type', 40, { optional: true }),
    };
  });
  if (result.messages.reduce((sum, message) => sum + message.text.length, 0) > 300000) throw new AppError('Too much history for one request. Narrow the question or reduce imported history.');
  result.examples = array(raw.examples ?? [], 'Style examples', 30).map(example => {
    object(example, 'Style example', ['original', 'text']);
    return { original: string(example.original, 'Original example', 4000), text: string(example.text, 'Accepted example', 4000) };
  });
  let totalBytes = 0;
  result.attachments = array(raw.attachments ?? [], 'Attachments', 4).map(attachment => {
    object(attachment, 'Attachment', ['name', 'mime', 'data']);
    const name = string(attachment.name, 'Attachment name', 200, { nonempty: true }).replace(/[\\/\x00-\x1f]/g, '_');
    const mime = string(attachment.mime, 'Attachment type', 100, { nonempty: true }).toLowerCase().split(';')[0].trim();
    if (!MIME_TYPES.has(mime)) throw new AppError(`Unsupported attachment type: ${mime}. Use an image, PDF, plain text, audio, or video.`, 415, 'UNSUPPORTED_MEDIA');
    const data = string(attachment.data, 'Attachment data', 23000000, { nonempty: true });
    if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new AppError('Attachment data is not valid base64.');
    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length || bytes.toString('base64') !== data) throw new AppError('Attachment data is not valid base64.');
    totalBytes += bytes.length;
    if (totalBytes > 16 * 1024 * 1024) throw new AppError('Attachments must total 16 MB or less.', 413, 'TOO_LARGE');
    if (TEXT_MIMES.has(mime) && bytes.length > 512000) throw new AppError('Text attachments must be smaller than 500 KB.', 413, 'TOO_LARGE');
    return { name, mime, data };
  });
  if (result.mode === 'rewrite' && !result.text.trim() && !result.attachments.length) throw new AppError('Write or select your draft, or attach media before improving it.');
  if (!result.text.trim()) result.trackWriting = false;
  if (!result.text.trim() && !result.prompt.trim() && !result.messages.length && !result.attachments.length) throw new AppError('Add text, chat history, or an attachment first.');
  return result;
}

export function validateSetup(raw) {
  object(raw, 'Settings', ['apiKey', 'model', 'transcriptionModel', 'clearKey']);
  const data = {};
  for (const key of ['model', 'transcriptionModel']) if (raw[key] !== undefined) {
    data[key] = string(raw[key], key, 100, { nonempty: true }).trim();
    if (!/^[a-zA-Z0-9._:-]+$/.test(data[key])) throw new AppError('Model names may contain letters, numbers, dots, hyphens, underscores and colons.');
  }
  if (raw.apiKey !== undefined) {
    data.apiKey = string(raw.apiKey, 'API key', 1000).trim();
    if (data.apiKey && (!data.apiKey.startsWith('sk-') || data.apiKey.length < 20 || /\s/.test(data.apiKey))) throw new AppError('Enter a complete OpenAI API key beginning with sk-.');
  }
  if (raw.clearKey !== undefined && typeof raw.clearKey !== 'boolean') throw new AppError('clearKey must be true or false.');
  data.clearKey = raw.clearKey === true;
  return data;
}
