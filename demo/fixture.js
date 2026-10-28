/* Synthetic WhatsApp-shaped DOM. No network calls, credentials, or real chat data. */
window.fixture = {
  sendCount: 0,
  contact: 'a',
  contacts: {
    a: { jid: '919876543210@c.us', name: 'Alex Rao', draft: 'i can send you the updated design tomorrow morning is that works?', messages: [
      { text: 'Hey! Did you get a chance to look at the updated design?', direction: 'in', time: '10:18 AM' },
      { text: 'Yes, I checked the new screens. The layout looks much clearer.', direction: 'out', time: '10:19 AM' },
      { text: 'Great. Could you send the final version tomorrow morning? We can review it at 10.', direction: 'in', time: '10:20 AM' },
      { text: 'Also, let’s meet at the studio on Friday at 3 PM for 30 minutes.', direction: 'in', time: '10:21 AM' },
    ]},
    b: { jid: '918765432109@c.us', name: 'Alex Rao', draft: 'sounds good see you there', messages: [
      { text: 'Are you coming to the park on Sunday?', direction: 'in', time: '9:10 AM' },
      { text: 'Yes! I will bring the badminton rackets.', direction: 'out', time: '9:12 AM' },
    ]},
  },
  switchChat(id) {
    this.contact = id;
    const contact = this.contacts[id];
    document.querySelector('header [title]').textContent = contact.name;
    document.querySelector('header [title]').title = contact.name;
    const messages = document.querySelector('.messages');
    messages.replaceChildren();
    const day = document.createElement('div'); day.className = 'day'; day.textContent = 'OCTOBER 28, 2026'; messages.append(day);
    contact.messages.forEach((message, i) => {
      const row = document.createElement('div'); row.className = `row ${message.direction}`;
      row.dataset.id = `${message.direction === 'out'}_${contact.jid}_MSG${id.toUpperCase()}${i}`;
      const bubble = document.createElement('div'); bubble.className = `message-${message.direction}`;
      const copy = document.createElement('div'); copy.className = 'copyable-text';
      copy.dataset.prePlainText = `[${message.time}, 10/28/2026] ${message.direction === 'out' ? 'You' : contact.name}: `;
      const span = document.createElement('span'); span.className = 'selectable-text copyable-text'; span.textContent = message.text;
      const stamp = document.createElement('span'); stamp.className = 'stamp'; stamp.textContent = message.time;
      copy.append(span); bubble.append(copy, stamp); row.append(bubble); messages.append(row);
    });
    this.setDraft(contact.draft);
  },
  setDraft(text) {
    const composer = document.querySelector('[contenteditable]');
    composer.textContent = text;
    composer.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:text}));
  },
};
document.querySelectorAll('[data-contact]').forEach(button => button.addEventListener('click', () => window.fixture.switchChat(button.dataset.contact)));
document.querySelector('#set-draft').addEventListener('click', () => window.fixture.setDraft(window.fixture.contacts[window.fixture.contact].draft));
document.querySelector('#missing-id').addEventListener('click', () => document.querySelectorAll('[data-id]').forEach(element => element.removeAttribute('data-id')));
document.querySelector('#send').addEventListener('click', () => { window.fixture.sendCount += 1; });
window.fixture.switchChat('a');
