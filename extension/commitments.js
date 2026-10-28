(() => {
  'use strict';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const string = value => typeof value === 'string' ? value.trim() : '';
  const compact = value => string(value).replace(/\s+/g, ' ');
  const pairs = { '"': '"', "'": "'", '“': '”', '‘': '’' };

  function validDate(year, month, day) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  }
  const dateLabel = (year, month, day) => `${day} ${months[month - 1]} ${year}`;

  function formatDate(value) {
    const raw = compact(value);
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2}))?$/);
    if (iso) {
      const [, year, month, day, hour, minute, second, fraction, zone] = iso;
      if (!validDate(+year, +month, +day)) return raw;
      let label = dateLabel(+year, +month, +day);
      if (hour !== undefined) {
        if (+hour > 23 || +minute > 59 || +(second || 0) > 59) return raw;
        if (zone !== 'Z' && (+zone.slice(1, 3) > 14 || +zone.slice(4) > 59 || (+zone.slice(1, 3) === 14 && +zone.slice(4) !== 0))) return raw;
        const seconds = second && (+second || fraction) ? `:${second}${fraction ? `.${fraction}` : ''}` : '';
        label += ` · ${hour}:${minute}${seconds} ${zone === 'Z' ? 'UTC' : `UTC${zone}`}`;
      }
      return label;
    }
    // WhatsApp's localized dates do not identify their locale. Only resolve a
    // numeric date if its ordering is unambiguous, and never infer a timezone.
    const local = raw.match(/^(?:(\d{1,2}):(\d{2})(?:\s*(AM|PM))?,\s*)?(\d{1,2})([/.\-])(\d{1,2})\5(\d{4})$/i);
    if (!local) return raw;
    const [, hour, minute, period, first, , second, year] = local;
    let day, month;
    if (+first > 12 && +second <= 12) { day = +first; month = +second; }
    else if (+second > 12 && +first <= 12) { day = +second; month = +first; }
    else if (+first === +second) { day = +first; month = +second; }
    else return raw;
    if (!validDate(+year, month, day) || (hour !== undefined && (+minute > 59 || (period ? +hour < 1 || +hour > 12 : +hour > 23)))) return raw;
    const time = hour === undefined ? '' : ` · ${hour.padStart(2, '0')}:${minute}${period ? ` ${period.toUpperCase()}` : ''}`;
    return dateLabel(+year, month, day) + time;
  }

  function unquote(value) {
    const end = pairs[value[0]];
    return end && value.length >= 2 && value.endsWith(end) ? value.slice(1, -1).trim() : value;
  }

  function parseMetadata(value) {
    // Parse a complete, known suffix only. In particular, never strip `id:`
    // from the quote itself, or consume an arbitrary unquoted source string.
    const id = '[A-Za-z0-9._:@/+\\-]{6,200}';
    const patterns = [
      [new RegExp(`^sender:\\s*(.+?),\\s*id:\\s*${id},\\s*timestamp:\\s*(.+)$`, 'i'), 1, 2],
      [/^sender:\s*(.+?),\s*timestamp:\s*(.+)$/i, 1, 2],
      [new RegExp(`^sender:\\s*(.+?),\\s*id:\\s*${id}$`, 'i'), 1, 0],
      [new RegExp(`^id:\\s*${id},\\s*timestamp:\\s*(.+)$`, 'i'), 0, 1],
      [/^sender:\s*(.+)$/i, 1, 0],
      [/^timestamp:\s*(.+)$/i, 0, 1],
      [new RegExp(`^id:\\s*${id}$`, 'i'), 0, 0],
    ];
    for (const [pattern, senderIndex, timestampIndex] of patterns) {
      const match = value.match(pattern);
      if (!match) continue;
      const sender = senderIndex ? compact(match[senderIndex]) : '';
      const timestamp = timestampIndex ? compact(match[timestampIndex]) : '';
      if (sender.length > 160 || timestamp.length > 100 || /["“”\r\n]/.test(`${sender}${timestamp}`) || /,\s*(?:sender|id|timestamp):/i.test(`${sender}\n${timestamp}`)) continue;
      return { sender, timestamp };
    }
    return null;
  }

  function formatSource(value) {
    const raw = string(value);
    let quote = raw, sender = '', timestamp = '';
    const closing = pairs[raw[0]];
    if (closing) {
      // The separator must follow the closing quotation mark. Metadata-like
      // wording inside a quotation remains ordinary source text.
      const separator = new RegExp(`${closing}\\s+[—–]\\s+`, 'g');
      for (const match of raw.matchAll(separator)) {
        const metadata = parseMetadata(raw.slice(match.index + match[0].length));
        if (!metadata || !raw.slice(1, match.index).trim()) continue;
        quote = raw.slice(1, match.index).trim();
        ({ sender, timestamp } = metadata);
        break;
      }
    }
    quote = compact(quote === raw ? unquote(raw) : quote);
    const characters = Array.from(quote);
    const shortened = characters.length > 240;
    let excerpt = shortened ? characters.slice(0, 239).join('').trimEnd() : quote;
    if (shortened) {
      const wordEnd = excerpt.lastIndexOf(' ');
      if (wordEnd >= 180) excerpt = excerpt.slice(0, wordEnd);
      excerpt += '…';
    }
    return { quote: excerpt, fullQuote: quote, quoteTruncated: shortened, sender, timestamp, sourceLabel: [sender, formatDate(timestamp)].filter(Boolean).join(' · ') };
  }

  function present(task = {}) {
    if (!task || typeof task !== 'object') task = {};
    const statuses = { pending: 'To do', done: 'Done', dismissed: 'Dismissed' };
    const status = Object.hasOwn(statuses, task.status) ? task.status : 'pending';
    return {
      title: compact(task.title) || 'Untitled commitment',
      owner: compact(task.owner) || 'Owner unclear',
      due: formatDate(task.due) || 'No due date',
      status, statusLabel: statuses[status],
      ...formatSource(task.source),
    };
  }

  globalThis.WACopilot = globalThis.WACopilot || {};
  globalThis.WACopilot.commitments = Object.freeze({ present, formatSource, formatDate });
})();
