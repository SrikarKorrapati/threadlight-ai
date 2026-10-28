# Validation record

Tested on 28 October 2026.

## Automated checks

- 59 Node tests passed, covering memory/account separation, startup migration to displayed-name scopes, source dates, authenticated requests, storage failures, stale work, calendar validation, provider errors, media processing, safe setup-page navigation, and credential filtering in model text inputs.
- 32 interface/DOM checks passed in isolated Chromium, covering the selection popup, free-form prompts, three suggestions, partial draft replacement, no-send behavior, stale drafts/chats/accounts, attachments, a dedicated Calendar view, event editing, history import, commitments, automatic displayed-name scoping, and initial/new/edited-message capture while the panel is closed without automatic model requests.
- 18 dedicated adapter checks passed, covering automatic displayed-name identity, normalization, header transitions, same-name contacts, independent view guards for draft insertion, and the observed modern `conv-msg-*`/`tail-in`/`tail-out` structure.
- 4 actual Manifest V3 extension checks passed in a disposable Chromium profile. The WhatsApp URL was intercepted with a fictional local fixture; no real account was used.
- 5 setup-page browser checks passed, covering local key save/removal, concealed key retrieval, pairing rotation, and narrow-screen layout.
- 12 theme checks passed, covering page-theme precedence over system appearance, live theme changes, header replacement, transparent-background fallback, protection from host-page font overrides, readable contrast, and narrow-screen layout.
- JavaScript syntax checks passed.

The 0.2.0 build passed its original 118 checks. For the 0.2.1 appearance update, 53 browser checks passed: 32 interaction, 12 theme, 4 actual-extension, and 5 setup checks. The unchanged core and adapter checks retain their prior validation. Writing, Calendar, and setup screens were visually inspected using fictional fixtures.

Test responses are simulated only inside the test harness. The production extension requires the real local service and OpenAI connection.

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
