# Validation record

Tested on 28 October 2026.

## Automated checks

Version 0.2.2 passed all **164 automated checks**:

- 78 Node tests: memory/account isolation, migration, persistence failure, paired requests, setup security, Calendar account choice and URLs, safe source formatting, config-write serialization, concurrent request limits, provider errors, text-credential filtering, and real local FFmpeg preprocessing.
- 34 interface checks: selection prompts, suggestions, safe insertion, attachments, automatic history capture while the panel is closed, separate Calendar UI, account save/default/chooser actions, trusted-action guards, readable commitments, and chat/account changes.
- 20 adapter checks: displayed-name identity, modern message wrappers, transitions, same-name view guards, bounded long/emoji messages, and strict imports.
- 7 layout checks: desktop side docking, narrow bottom docking, visible chat/composer/Send, no overflow, restored inline styles and dimensions, app replacement, and repeated open/close cycles.
- 4 lifecycle checks: stale Calendar source/prompt results are discarded, search focus preserves unsaved inputs, and rapid Generate clicks during capture cannot issue duplicate requests.
- 12 appearance checks: page/system theme precedence, live switching, header replacement, font isolation, contrast, and narrow layouts.
- 4 actual Manifest V3 checks in disposable Chromium with an intercepted fictional WhatsApp page.
- 5 setup-page checks: local key handling, concealed retrieval, token rotation, and narrow layout.

JavaScript syntax checks and `git diff --check` passed. Light/dark writing and Calendar screens plus readable commitment cards were visually inspected using fictional fixtures. Test doubles are confined to test code; production requires the real local service and OpenAI connection.

## Live OpenAI checks

Using a real OpenAI API connection, with fictional data only:

- Text rewrite: returned three distinct suggestions and a grammar correction.
- Image explanation: correctly described a synthetic solid red square.
- Voice-note processing: successfully transcribed synthesized speech and generated three rewrites. A live regression confirms that a request stays a request rather than becoming a promise or a reply.
- Video explanation: correctly described a synthetic two-second red video clip after FFmpeg preprocessing, including its lack of an audio track.
- Calendar extraction: preserved an explicit 30 October 2026, 15:00–15:30 India-time appointment with the correct timezone offset.

No real WhatsApp conversations were sent during these checks. No WhatsApp messages were sent and no Google Calendar events were saved.

## Live Brave checks and remaining checks

The extension was loaded unpacked in Brave, paired with the local service, and passed **Test connection**. Its panel opened in a real self-chat. The setup-page link initially failed on cross-site navigation; the narrowly scoped fix was verified through the real extension options link.

Live DOM inspection found opaque message IDs and `conv-msg-*` wrappers without the legacy `.message-in`/`.message-out` classes. The adapter handles explicit direction-tail markers. Version 0.2 removes the earlier phone confirmation, selects memory automatically by displayed name, and captures loaded messages while the panel is closed. Duplicate names share a history within the configured account. A separate temporary view identity protects draft insertion after switching between same-name chats.

Version 0.2.0 was then reloaded in Brave and WhatsApp Web was refreshed. Opening a real self-chat selected its history without phone confirmation and showed two saved messages. The live interface contained Write, Calendar, Memory, and Commitments; Calendar opened its own event-details inputs and Prepare event action. No WhatsApp messages were sent and no personal conversation was submitted to OpenAI.

The Progress interface and explanatory taglines were removed. In version 0.2.1, the glass styling was replaced by an opaque WhatsApp-style sidebar with green controls and automatic light/dark appearance. Explain was removed from Write and the selection context menu. The updated extension was reloaded in Brave; a live visual check confirmed matching dark surfaces, sans-serif text, and only Rewrite/Suggest a reply in Write. Writing and Calendar remain separate. Actual generation/insertion with real WhatsApp remains unverified; no personal chat was submitted to OpenAI during setup checks.

The automated fixtures verify the mechanisms, not every live WhatsApp variant. Rows without reliable direction evidence are omitted. All WhatsApp selectors remain isolated in `extension/adapter.js`.

PDF input is verified by request-shape tests and the documented OpenAI API format; a live PDF request has not been made. FFmpeg processing has been tested with real generated media, including a short H.264 clip.

## Version 0.2.2 review

The complete production codebase was reviewed across UI/adapter/layout, background and memory, server/configuration, validation, provider/media processing, permissions, and setup. `ARCHITECTURE.md` records the boundaries and fixed issues. The review included reproductions and regression tests for oversized message capture, stale Calendar previews, lost configuration updates, untrusted page actions, request races, and misleading provider errors.

Calendar account selection is covered by isolated UI and background URL tests. It does not add OAuth authorization. No Google Calendar event was saved and no Google account was changed during these checks.

The 0.2.2 extension was reloaded in the logged-in Brave session and the local service restarted with the saved key still configured. Live geometry checks measured a 1,650px viewport with chat/composer ending at x=1,250px and the sidebar starting at x=1,250px. At an 866px viewport, chat/composer ended at y=472px and the bottom dock started at y=472px. Both checks reported zero overlap. The Calendar account field, Add/change, Save account, and browser-default controls were visibly present; the removed explanatory sentence was absent. No generation, WhatsApp send, Google sign-in change, or event save was triggered by these live checks.
