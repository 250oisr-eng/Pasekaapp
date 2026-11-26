# PR audit N — 33 historical main-root PRs: unified per-line mechanical diff pass
**Date:** 2026-11-26. **Protected main reference before this docs branch:** `fcf735e121d7c9916ab85d5482256bcf5f205dbf`. Repository: `250oisr-eng/Pasekaapp`. This report is an evidence supplement to [root inventory K](PR-AUDIT-ROOTS-2026-11-26-K.json), not an authorization to merge or publish.

## Coverage, confidence and method
1. Queried **live PR metadata** for all 33 historical roots (state, draft, head/base SHA, changed-file counts). All remained at their K-recorded head SHA when queried: **30 OPEN DRAFT**, **3 CLOSED WITHOUT MERGE** (#200/#519/#520). A different assistant may advance main later; refresh before acting.
2. Requested **all changed-file patches** for each of the 33 via the paginated GitHub PR patch endpoint; received **407 file patches**, with no `null` patches in the returned file inventories. Parsed `+` and `-` lines hunk by hunk: **36512 added** and **312 deleted** lines (patch text, includes docs/tests). Inspected risky added expressions in executable files, then re-opened selected individual patches and current-main guards.
3. **Evidence limit:** received per-file patch text and a regex pass do not establish that GitHub has not shortened an oversized patch, or that every changed line has received human semantic review. No execution of all 33 branch test suites, no fresh exact-head CI review for all 33, no APK/device/IndexedDB/video operations. Every remaining open root is therefore **NOT_EXHAUSTIVELY_APPROVED**.
4. Historical branches mostly compare against a much older base, rather than current main. PR `mergeable` is not functional or data safety certification. Do not treat 30 roots as an independent queue of ready-to-merge changes; several source fixes are already selectively integrated in newer main commits.

## Confirmed source-level high-risk gates
- **#157 `js/media-lifecycle.js:78–80`:** `canDeleteMediaOriginal(job)` allows deletion solely from persisted job/result flags plus `cleanup_pending`, without independent complete backup/restore, licensing, model proof, multi-copy inventory, or owner-specific cleanup authority. **HOLD_UNSAFE_DELETE / B06 / issue #442; no bulk merge.** The current protected-main video gate remains intentionally frozen.
- **#1 `js/entrance-analysis.js`, `canDeleteVideoOriginal`:** uploaded/server-deleted flags and Blob size are not V0–V6 proofs. Even an apparently more restrictive historic predicate cannot override current `#442` freeze; **HOLD**.
- **#14 `js/paseka-archive-restore.js:275,396`:** `media.clear()` occurs during archive/rollback flows. This mutates an entire media store; snapshot and rollback assumptions need independent test evidence. Do not directly port the historic restore/UI/SW combination.
- **#168 `js/paseka-archive-restore.js:521,806–807`:** restoring a snapshot can `media.clear()` and `main.delete('state')`. That is incompatible with a blanket preservation claim absent atomic rollback, collision and real-original protection proof. **HOLD B01/B02**; compare with protected current-main guard, not just branch unit tests.
- **#543 `scripts/backup-oneplus-cold-sandbox.mjs:53–70`:** optional `--allow-force-stop` executes `adb shell am force-stop ru.paseka.journal`. This is **not strictly read-only**: it stops the production app and could lose unsaved work. The option is not default, but never run it automatically or present the script as non-interfering. A TAR copy is not independent WebView/MediaStore recovery.
- **#187 `tests/browser-ui-smoke.mjs` and `index.html`:** tests expect the old honeycomb layout and inline keyboard handlers; current main already has delegated Enter/Space activation. Historic UI and browser tests cannot be transplanted directly. A narrow aria-label port was already merged in #587.
- **#532 `qa/tracked-drafts.json`, `scripts/comprehensive-pr-checks.mjs`:** hardcoded prior PR snapshot and network-dependent PR checks are stale; isolated TAP fail-closed safety gate was ported in #585. Avoid reintroducing a brittle CI network dependency.
- **#54/#453:** profile B07 activation requires complete physical layout, source-bound OP semantics, local guards, migrations and compatibility checks. The user-provided original technology and subsequent confirmed dimensions/OP-02 take precedence over historic drafts.
- **#200/#519/#520:** source PRs are CLOSED WITHOUT MERGE after safe selective ports #583/#581/#582. Do not reopen or duplicate.
- Other categories are documented triage only; an absence of regex flags is **not** a safety proof.

## Per-root patch inventory and action
| PR | Files | Patch line delta | Source status at review | Required disposition |
|---|---:|---:|---|---|
| [#1](https://github.com/250oisr-eng/Pasekaapp/pull/1) | 18 | +842 / −31 | OPEN | HOLD #442 |
| [#7](https://github.com/250oisr-eng/Pasekaapp/pull/7) | 1 | +229 / −0 | OPEN | PRESERVE / no direct merge |
| [#9](https://github.com/250oisr-eng/Pasekaapp/pull/9) | 4 | +789 / −0 | OPEN | HOLD B01/B04/B05 |
| [#14](https://github.com/250oisr-eng/Pasekaapp/pull/14) | 11 | +2642 / −16 | OPEN | HOLD B01/B04/B05 |
| [#54](https://github.com/250oisr-eng/Pasekaapp/pull/54) | 5 | +331 / −1 | OPEN | HOLD B07 |
| [#81](https://github.com/250oisr-eng/Pasekaapp/pull/81) | 8 | +371 / −15 | OPEN | PRESERVE / no direct merge |
| [#86](https://github.com/250oisr-eng/Pasekaapp/pull/86) | 6 | +305 / −5 | OPEN | PRESERVE / no direct merge |
| [#90](https://github.com/250oisr-eng/Pasekaapp/pull/90) | 7 | +382 / −0 | OPEN | PRESERVE / no direct merge |
| [#96](https://github.com/250oisr-eng/Pasekaapp/pull/96) | 11 | +1446 / −69 | OPEN | PRESERVE / no direct merge |
| [#156](https://github.com/250oisr-eng/Pasekaapp/pull/156) | 6 | +393 / −0 | OPEN | PRESERVE / no direct merge |
| [#157](https://github.com/250oisr-eng/Pasekaapp/pull/157) | 2 | +208 / −0 | OPEN | HOLD #442 |
| [#168](https://github.com/250oisr-eng/Pasekaapp/pull/168) | 31 | +7481 / −13 | OPEN | HOLD B01/B04/B05 |
| [#187](https://github.com/250oisr-eng/Pasekaapp/pull/187) | 16 | +1527 / −29 | OPEN | SELECTIVE PORT ONLY |
| [#188](https://github.com/250oisr-eng/Pasekaapp/pull/188) | 5 | +81 / −0 | OPEN | PRESERVE / no direct merge |
| [#189](https://github.com/250oisr-eng/Pasekaapp/pull/189) | 11 | +1417 / −0 | OPEN | SELECTIVE PORT ONLY |
| [#191](https://github.com/250oisr-eng/Pasekaapp/pull/191) | 6 | +68 / −0 | OPEN | PRESERVE / no direct merge |
| [#200](https://github.com/250oisr-eng/Pasekaapp/pull/200) | 6 | +175 / −1 | CLOSED_WITHOUT_MERGE | CLOSED source / already ported |
| [#381](https://github.com/250oisr-eng/Pasekaapp/pull/381) | 2 | +57 / −0 | OPEN | PRESERVE / no direct merge |
| [#451](https://github.com/250oisr-eng/Pasekaapp/pull/451) | 12 | +817 / −9 | OPEN | HOLD B01/B04/B05 |
| [#452](https://github.com/250oisr-eng/Pasekaapp/pull/452) | 25 | +2543 / −8 | OPEN | HOLD B01/B04/B05 |
| [#453](https://github.com/250oisr-eng/Pasekaapp/pull/453) | 23 | +1328 / −20 | OPEN | HOLD B07 |
| [#469](https://github.com/250oisr-eng/Pasekaapp/pull/469) | 29 | +1978 / −16 | OPEN | HOLD B01/B04/B05 |
| [#479](https://github.com/250oisr-eng/Pasekaapp/pull/479) | 7 | +476 / −13 | OPEN | SELECTIVE PORT ONLY |
| [#519](https://github.com/250oisr-eng/Pasekaapp/pull/519) | 7 | +162 / −3 | CLOSED_WITHOUT_MERGE | CLOSED source / already ported |
| [#520](https://github.com/250oisr-eng/Pasekaapp/pull/520) | 7 | +130 / −4 | CLOSED_WITHOUT_MERGE | CLOSED source / already ported |
| [#521](https://github.com/250oisr-eng/Pasekaapp/pull/521) | 6 | +162 / −4 | OPEN | SELECTIVE PORT ONLY |
| [#522](https://github.com/250oisr-eng/Pasekaapp/pull/522) | 49 | +4222 / −34 | OPEN | HOLD B01/B04/B05 |
| [#523](https://github.com/250oisr-eng/Pasekaapp/pull/523) | 22 | +1283 / −7 | OPEN | HOLD B01/B04/B05 |
| [#524](https://github.com/250oisr-eng/Pasekaapp/pull/524) | 12 | +592 / −6 | OPEN | HOLD B01/B04/B05 |
| [#529](https://github.com/250oisr-eng/Pasekaapp/pull/529) | 4 | +108 / −1 | OPEN | PRESERVE / no direct merge |
| [#532](https://github.com/250oisr-eng/Pasekaapp/pull/532) | 14 | +994 / −4 | OPEN | SELECTIVE PORT ONLY |
| [#534](https://github.com/250oisr-eng/Pasekaapp/pull/534) | 11 | +869 / −0 | OPEN | HOLD B01/B04/B05 |
| [#543](https://github.com/250oisr-eng/Pasekaapp/pull/543) | 23 | +2104 / −3 | OPEN | HOLD B01/B04/B05 |

## Decision and next auditable cycle
- **No direct historical root merge justified** from this pass: 2 unsafe cleanup, 11 P0 archive/device, 2 physical model, 10 historic documentation, 5 selective candidates, 3 already-port-closed. Preserve source branches and comments; do not close a partially ported source without checking unique remaining functionality.
- When a concrete unique change is identified, make **one small fresh-main Draft** containing code + negative regression tests + current-main comparison; check CI at final SHA, then review merge against latest main. #187 browser smoke requires a redesigned optional, isolated test, not the original Playwright/axe suite as-is. Revisit #189, #479 and #521 only on new evidence or a demonstrated missing user-visible function.
- **No source video deletion, no full restore to real IndexedDB, no APK upgrade, no external production deployment, no B07 activation, and no release.** Device-level proofs B01/B04/B05/B07/#442 remain outstanding.

**Evidence provenance:** direct GitHub PR metadata and changed-file patch retrieval on this date; source code excerpts above re-opened separately. **Automated scanning ≠ human line-by-line semantic certification.**
