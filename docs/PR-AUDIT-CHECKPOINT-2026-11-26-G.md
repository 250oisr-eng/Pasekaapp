# PR audit — continuation G (26 November 2026)

**Live main confirmed:** `10a77e046d1120d7f8286cd6cdbb3cb8348c99b7` (compare with branch `main` identical before this audit). This checkpoint is an evidence-led **review of #43 and #8**, not a claim that all 397 open PR diffs are semantically reviewed.

## P1 inspection journal (#43) — confirmed defect, corrected in current-main Draft #570

### F0: grounded discrepancy
- On this main, `index.html` still limits `validateJournalRecordDraft` to **0..6** frame counts, `extractInspectionFieldsFromText` to a **single 0–6 digit**, and `createExpansionSuggestion` uses `5/6`, `3/6` and the literal `'из 6 рамок'`. Form inputs have `max="6"`, and the family-health widget shows `x/6` regardless of installed brood bodies.
- Historical #43 implements a capacity-by-assembly approach, but also contains stale, unrelated Cloudflare Worker and startup UI changes, so wholesale replay is unsafe.
- Primary DOCX `улей для каждого техпроцесс.docx` inspected this session: 94 paragraphs, 0 tables. Paragraph 4 explicitly describes six 6-frame brood bodies and two 10-frame honey bodies. No independent new multiqueen profile may be activated by this change.

### F1–F6: minimal repair
[Draft #570](https://github.com/250oisr-eng/Pasekaapp/pull/570) changes current main's journal, parser, suggestion and display to use selected hive profile `framesPerBox × unique active installed brood keys`; winter `winterOrder` overrides summer, unknown physical inputs yield **null capacity**, never a fabricated limit. Existing historical counts remain unchanged and editable without rewriting old values, while amended counts and contradictory fields revalidate. Voice and AI only fill an unsaved draft; expansion tasks remain `status:'suggested'`. PWA shell version 321→322, user caches protected.

- First exact-head Android run #45882146183 **FAIL** due to two isolated synthetic test fixture `S` injections; 939/941 passed.
- Corrected exact HEAD `267253f55d166d34783cdfd4188f6933e9398e1f`: Android [#45882313294](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45882313294) **SUCCESS**, **941/941** Node tests, Gradle **BUILD SUCCESSFUL**, debug APK signer/byte safety audit SUCCESS and artifact uploaded.
- Diff against verified main is **6 files**, ahead 8/behind 0, mergeable. **Not merged**, `CI_VERIFIED_EXACT_SHA / READY_FOR_MERGE_REVIEW` awaiting separate merge approval per `AGENTS.md`. Full real OnePlus installation NOT_TESTED; Fast Quality standalone not run on this pull request.
- Do not close old #43 until unique functionality and physical compatibility are reconciled after a permitted current-main integration. Do not copy its old Wrangler preview configuration blindly.

## P0 startup data loss (#8) — confirmed structural gap, NOT yet fixed

### Reproduction path from actual code (read-only audit)
- Current `openDB()` classifies `oldVersion===0` as `createdDuringOpen=true`. `canInitializeFreshDatabase(databaseCreated,loadedState)` returns true for `(true,null)`.
- Boot performs `openDB → readMain → read → canInitializeFreshDatabase`. If IndexedDB has been independently removed but the browser/device retains other storage or previous-use evidence, the next open has `oldVersion=0`, no state/backup and is treated as an ordinary first launch. The app does **not** check a separate persistent previous-use marker or ask for informed confirmation in this case.
- A brand-new install and an unexpectedly recreated database are therefore not distinguishable with the current classifier. Current code *does* reject an already-existing empty v3 database, aborts on blocked/malformed reads, and blocks writes before bootstrap completes; do not misreport those safeguards as absent.
- Current `deleteAllData()` is deliberately **hard blocked** to protect original video/records pending independent restore, so the historic #8 implementation (which re-enables destructive deletion after a typed phrase) must **not** be merged wholesale. Historic #8 also predates current schema/backup gates.

### Required independent next patch
1. Introduce a non-sensitive previous-use marker with explicit failure behavior (persist only after a verified state is present and startup is safe; no marker==proof-of-new-user assumption).
2. On `oldVersion=0` and missing main/backup, fail closed for an existing marker, and require explicit informed first-use acknowledgment when marker is absent or unreadable.
3. Verify with separate isolated fake IndexedDB cases: genuine first use, unexpected store deletion but retained marker, missing main with valid backup, denied/blocked marker storage, failed consent, repeat/reload, concurrent tab and previous records.
4. Preserve hard-blocked `deleteAllData`, `entrance_media` Blob stores, `startupWriteGate`, transactional commit, schema-15 migrations, SW behavior and user data. No production restore/mutation.
5. The marker cannot prove recovery if both IndexedDB and localStorage (or analogous settings storage) are cleared together. Full external archive remains B01 blocked; do not claim perfect data-loss protection.

**#8: REVIEW_REQUIRED / P0_CONFIRMED_GAP; no new fix created in this checkpoint**, to avoid two simultaneous competing `index.html` changes while #570 is pending. This is a safe ordered dependency, not abandonment.

## Evidence integrity and further work
- Last open-PR census in [checkpoint F](PR-AUDIT-CHECKPOINT-2026-11-26-F.md) was 397 at snapshot time, and current membership must be reread before any PR merge/closure; no full 397-patch review is claimed.
- Historical #60 remains REVIEW_REQUIRED; modern read-only `auditLegacyLayoutBodyReferences()` and its negative tests already exist in main.
- No production data write, user-original video deletion, Cloudflare/Pages deployment, device install, release, or GitHub branch deletion performed.
