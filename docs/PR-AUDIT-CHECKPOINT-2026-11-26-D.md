# PR audit — continuation D, 26 November 2026

**Verified main after #563:** `5bbf634eeef5960e4a7e56c68d7598445ec616f0`. This is a risk-based semantic audit of selected independent PRs, **not** per-patch certification of every historic open PR. A fresh date-partitioned GitHub census establishes **401 OPEN**, while the earlier 411-row inventory remains a historical baseline.

## Changes integrated

- [#562](https://github.com/250oisr-eng/Pasekaapp/pull/562) documentation-only DOCX fallback reference, exact-head Governance #45878309941 SUCCESS, merged `69adb18a20abfc58eb6c26e2fd1a8c351ab9e8ab`. Historical [#91](https://github.com/250oisr-eng/Pasekaapp/pull/91) CLOSED/SUPERSEDED without branch deletion.
- [#564](https://github.com/250oisr-eng/Pasekaapp/pull/564) research-only reconciliation preserving two independent model research directions and their source-specific evidence, exact-head Governance #45878767637 SUCCESS, merged `a95d055c380b835d150c79c39e4a88af73bd0149`. Historical #539 and #540 CLOSED/SUPERSEDED, branches preserved. The integration does **not** approve weights, training, live inference, deletion, or release.
- Historical #155 docs-only historical checkpoint CLOSED/SUPERSEDED after verifying information about #148–154 and original CI exists already in main change journal/plan/status, without rewriting current status.
- Detailed previous four corrected regression ports and their exact CI: [checkpoint C](PR-AUDIT-CHECKPOINT-2026-11-26-C.md).

## Outstanding complex review

- [#563](https://github.com/250oisr-eng/Pasekaapp/pull/563): local physical body-geometry guard, SW v321, negative/positive tests. Initial Android #45878605621 **FAILED**: 923 Node tests, 920 passed, 3 failed. Root causes identified from real logs: old ID-only swap test expected unsafe PASS, two SW v320 tests assumed old shell remained current. Tests fixed without removing fail-closed guards. New HEAD `a4536c1e4144966a31de2c72ecc10870f21a926e`, exact Android #45878907609 **SUCCESS**, squash MERGED `5bbf634eeef5960e4a7e56c68d7598445ec616f0`. Production deployment/physical OnePlus still NOT_TESTED.
- #41 historical physical swap patch has a verified dangerous compatibility difference: it requires known honey body height and family even where current Farrar catalog has intentionally unknown honey height; blindly merging would break valid prior swaps. #563 adopts narrower guard.
- #60 historical inventory inspector would overwrite newer sectional physical layout, modern event checks, and existing independent read-only `auditLegacyLayoutBodyReferences()`; its unique strict cases need selective review, not wholesale merge.
- #96, #90, #156 and #7 contain old standalone docs not present in current main and need explicit source-as-of labeling rather than closing as duplicates. #533 would replay stale governance/status text.
- #168/PASEKA02 and #452 backup/restore remain high-risk, frozen/blocked pending independent external backup and real device evidence. #442 original video deletion stays FROZEN. #543 remains FROZEN per user decision to stop ADB loop.

## Fresh exhaustive open-PR census

[Machine-readable live census](PR-AUDIT-LIVE-CENSUS-2026-11-26.json) was built by 15 non-overlapping GitHub `is:pr is:open created:YYYY-MM-DD` queries (12–26 November). **401 unique OPEN**, no duplicates, largest bucket 88, versus prior 411-row history: 10 historical PR numbers no longer open and **0 new open numbers not in the old snapshot**. Historic base classifications among the 401: **43 directly main; 358 stacked**. Their actual head/base SHA **must be re-read live** before any merge. This is comprehensive open PR identification, *not* full semantic review of each diff. Any subsequent GitHub activity invalidates the count as a live guarantee.

## Safety and evidence limits

No publication, production DB writes, actual OnePlus installation, original media deletion, branch force push or mass merge. PR-head CI does not prove post-merge exact-main push CI, physical persistence or installed signing compatibility. A date-partitioned exhaustive open-PR census found 401 unique identifiers at snapshot time, without refreshing per-PR live head/base SHA. The active count may change as other work proceeds.
