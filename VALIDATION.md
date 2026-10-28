# Validation record

Tested on 28 October 2026.

## Automated checks

- 45 Node tests passed, covering memory/account separation, source dates, authenticated requests, storage failures, stale work, calendar validation, provider errors, and media processing.
- 23 interface/DOM checks passed in isolated Chromium, covering the selection popup, free-form prompts, three suggestions, partial draft replacement, no-send behavior, stale drafts/chats/accounts, attachment selection, calendar editing, history import, and commitments.
- 4 actual Manifest V3 extension checks passed in a disposable Chromium profile. The WhatsApp URL was intercepted with a fictional local fixture; no real account was used.
- 5 setup-page browser checks passed, covering local key save/removal, concealed key retrieval, pairing rotation, and narrow-screen layout.
- JavaScript syntax checks passed.

Test responses are simulated only inside the test harness. The production extension requires the real local service and OpenAI connection.

## Live OpenAI checks

Using a real OpenAI API connection, with fictional data only:

- Text rewrite: returned three distinct suggestions and a grammar correction.
- Image explanation: correctly described a synthetic solid red square.
- Voice-note processing: successfully transcribed synthesized speech and generated three rewrites. A live regression confirms that a request stays a request rather than becoming a promise or a reply.
- Video explanation: correctly described a synthetic two-second red video clip after FFmpeg preprocessing, including its lack of an audio track.
- Calendar extraction: preserved an explicit 30 October 2026, 15:00–15:30 India-time appointment with the correct timezone offset.

No real WhatsApp conversations were sent during these checks. No WhatsApp messages were sent and no Google Calendar events were saved.

## Remaining live integration check

The extension has not yet been tested against a real logged-in WhatsApp Web account. Live compatibility with the current WhatsApp interface remains unverified.

The browser fixture proves the browser-extension mechanism and interaction logic; it does not prove that every selector matches the current WhatsApp release. All WhatsApp selectors are isolated in `extension/adapter.js` for that reason.

PDF input is verified by request-shape tests and the documented OpenAI API format; a live PDF request has not been made. FFmpeg processing has been tested with real generated media, including a short H.264 clip.
