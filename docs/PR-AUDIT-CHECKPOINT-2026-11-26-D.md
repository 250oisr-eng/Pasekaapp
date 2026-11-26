# PR audit — continuation D, 26 November 2026

**Verified main after #564:** `a95d055c380b835d150c79c39e4a88af73bd0149`. This is a risk-based semantic audit of selected independent PRs, **not** per-patch certification of every historic open PR. Historical 411-row inventory does not establish a fresh current count.

## Changes integrated

- [#562](https://github.com/250oisr-eng/Pasekaapp/pull/562) documentation-only DOCX fallback reference, exact-head Governance #45878309941 SUCCESS, merged `69adb18a20abfc58eb6c26e2fd1a8c351ab9e8ab`. Historical [#91](https://github.com/250oisr-eng/Pasekaapp/pull/91) CLOSED/SUPERSEDED without branch deletion.
- [#564](https://github.com/250oisr-eng/Pasekaapp/pull/564) research-only reconciliation preserving two independent model research directions and their source-specific evidence, exact-head Governance #45878767637 SUCCESS, merged `a95d055c380b835d150c79c39e4a88af73bd0149`. Historical #539 and #540 CLOSED/SUPERSEDED, branches preserved. The integration does **not** approve weights, training, live inference, deletion, or release.
- Historical #155 docs-only historical checkpoint CLOSED/SUPERSEDED after verifying information about #148–154 and original CI exists already in main change journal/plan/status, without rewriting current status.
- Detailed previous four corrected regression ports and their exact CI: [checkpoint C](PR-AUDIT-CHECKPOINT-2026-11-26-C.md).

## Outstanding complex review

- [#563](https://github.com/250oisr-eng/Pasekaapp/pull/563): attempted current-main geometry guard for body exchanges with SW cache version v321. First Android #45878605621 **FAILED**: 923 Node tests, 920 passed, 3 failed. Root causes identified from real logs: an old test expected an ID-only profile to be enough for a physical swap, and two SW lifecycle tests assumed v320 remained current. Those tests were corrected to expect safe refusal of unknown geometry, old v320 cache eviction and protection of future v322/user caches. New head `a4536c1e4144966a31de2c72ecc10870f21a926e` with run #45878907609 is still **NOT VERIFIED** as of this report. **Do not merge before successful exact-head CI and re-review.** No production/OnePlus actions.
- #41 historical physical swap patch has a verified dangerous compatibility difference: it requires known honey body height and family even where current Farrar catalog has intentionally unknown honey height; blindly merging would break valid prior swaps. #563 adopts narrower guard.
- #60 historical inventory inspector would overwrite newer sectional physical layout, modern event checks, and existing independent read-only `auditLegacyLayoutBodyReferences()`; its unique strict cases need selective review, not wholesale merge.
- #96, #90, #156 and #7 contain old standalone docs not present in current main and need explicit source-as-of labeling rather than closing as duplicates. #533 would replay stale governance/status text.
- #168/PASEKA02 and #452 backup/restore remain high-risk, frozen/blocked pending independent external backup and real device evidence. #442 original video deletion stays FROZEN. #543 remains FROZEN per user decision to stop ADB loop.

## Safety and evidence limits

No publication, production DB writes, actual OnePlus installation, original media deletion, branch force push or mass merge. PR-head CI does not prove post-merge exact-main push CI, physical persistence or installed signing compatibility. Exact new census of all open PRs requires full REST pagination; GitHub search connector caps at 100 and numeric range queries did not produce the census. Therefore current-open count is `UNKNOWN`, not an inferred exact number.
