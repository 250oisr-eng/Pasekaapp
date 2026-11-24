# B08 semantic port PR #52 — bounded body before Cloudflare Worker JSON parse

**2026-11-25.** F0 inventory: `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`, `cloudflare/worker.js` currently performs `const raw = await request.text()` (reads entire body in memory) and only then checks `raw.length > 90000`. Historical [Draft #52](https://github.com/250oisr-eng/Pasekaapp/pull/52), 8 commits ahead/863 behind main, contains `readBoundedBody` that caps actual UTF-8 stream bytes. **Do not merge or cherry-pick entire old PR** (touches CI, unrelated tests/worker context). No known physical Worker load/prod incident; this is a code-level resource-boundary defect.

## F1 — Contract

- Preserve origin allowlist, OPTIONS, auth, rate limiting, current `question/context/history` behavior and 90 000-character guard.
- Before allocating full request body, validate `Content-Length` when given (nonnegative, safe integer, at most 270 000 bytes) and cap **actual** streaming bytes at 270 000 regardless of claimed length, reject with HTTP 413 and existing Russian error message.
- Malformed/unsafe declared length and invalid UTF-8 remain HTTP 400; malformed JSON remains 400. Invalid content does not call Workers AI.
- No new paid services, no device/IndexedDB/video data or release; Worker is **not** deployed by this task.

## F2 — Feasibility

Only Worker code and Node `Request`/stream synthetic fixtures are needed. GitHub CI can run independent of user's PC. **LIMITED_SAFE_DRAFT**; no real Cloudflare runtime tests until separately authorized release. Dependencies: original `main` worker available, old Draft #52 exact helper inspected, unchanged Worker export and Wrangler config.

## F3/F4 — Invariants and rollback

- Keep maximum request-memory allocation O(maxBytes); no use of `request.text()` on untrusted inbound stream. Return 413 on oversized `Content-Length` **before** reading the stream. Limit accumulated chunk sizes, cancel reader on overflow, release lock in finally; decode UTF-8 with `fatal:true`.
- No authentication/rate-limit/CORS bypass. The old 90 000-character limit remains independent of 270 000 UTF-8-byte limit.
- Negative tests: genuine UTF-8 bytes > limit, dishonest small Content-Length, absurd declared length, malformed header, bad UTF-8, malformed JSON, guard present in actual source. Test source itself, not a duplicated alternate implementation.
- Rollback is a simple reversal of the two localized Worker changes before any deployment; no schema migration, no published Worker modification, no production data touch.

## F5–F7

- Run `npm test`, related regression suite, Android CI and Governance on **actual final SHA**. Synthetic Node evidence is not proof of deployed Cloudflare runtime.
- Draft only; before any merge obtain separate approval for named PR; before Cloudflare release require separate authorization and B15 verified gate. Production deployment, secrets and existing app data must stay untouched.
