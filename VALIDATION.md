# Validation record

Tested on 28 October 2026.

## Automated checks

- 49 Node tests passed, covering memory/account separation, source dates, authenticated requests, storage failures, stale work, calendar validation, provider errors, media processing, safe setup-page navigation, and credential filtering in model text inputs.
- 27 interface/DOM checks passed in isolated Chromium, covering the selection popup, free-form prompts, three suggestions, partial draft replacement, no-send behavior, stale drafts/chats/accounts, attachment selection, calendar editing, history import, commitments, and explicit phone confirmation before capture/generation.
- 15 dedicated adapter checks passed, covering opaque message IDs, manual phone binding and invalidation, same-name contacts, safe draft insertion, and the observed modern `conv-msg-*`/`tail-in`/`tail-out` structure.
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

## Live Brave installation and remaining checks

The extension was loaded unpacked in Brave, paired with the local service, and passed **Test connection**. Its panel opened in a real self-chat. The setup-page link initially failed on cross-site navigation; the narrowly scoped fix was verified through the real extension options link.

Live DOM inspection found opaque message IDs and `conv-msg-*` wrappers without the legacy `.message-in`/`.message-out` classes. The adapter now handles explicit direction-tail markers and offers manual international-phone confirmation when no stable chat ID is exposed. After reloading the updated extension, a real self-chat showed the prefilled phone confirmation, accepted **Use this contact**, and displayed **History linked to this contact. Ready when you are.** with **2 captured messages · local memory**. Matching fictional regressions pass. Actual generation/insertion with real WhatsApp remains unverified; no personal chat was submitted to OpenAI during this setup check.

The automated fixtures verify the mechanisms, not every live WhatsApp variant. Rows without reliable direction evidence are omitted. All WhatsApp selectors remain isolated in `extension/adapter.js`.

PDF input is verified by request-shape tests and the documented OpenAI API format; a live PDF request has not been made. FFmpeg processing has been tested with real generated media, including a short H.264 clip.
