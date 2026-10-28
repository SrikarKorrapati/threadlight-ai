# Isolated browser fixture

`whatsapp-fixture.html` contains fictional messages in a WhatsApp-shaped DOM. It is a test fixture, not a WhatsApp client. The two Alex Rao contacts deliberately share a display name and have different conversation IDs.

`npm run test:browser` loads the real extension adapter and interface into this page in a separate Chromium instance. A test-only runtime in `tests/browser-support.mjs` supplies deterministic responses. The tests do not read your browser profile, connect to WhatsApp, call OpenAI, send messages, or create calendar events.

The generated `preview.png` shows the actual extension interface against the fictional conversation. Suggestions in this screenshot are test fixtures, not model output.

The fixture validates browser interaction and context boundaries. Live WhatsApp DOM compatibility still requires verification on the logged-in account. The parent build separately verified live OpenAI calls with fictional inputs; see ../VALIDATION.md.
