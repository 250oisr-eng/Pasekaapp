# PR audit — continuation C, 26 November 2026

**Verified main after last integration:** `7d8af290cb9621ea7e83610a939dbceb19027b20` (#560). This is a **selective semantic review of explicitly listed PRs**, not proof that all >400 historical pull requests were code-reviewed. Historic inventory [PR-AUDIT-INVENTORY-2026-11-26.json](PR-AUDIT-INVENTORY-2026-11-26.json) remains an immutable source snapshot (411 open before later PR activity); a live full-pagination census is not established by this checkpoint.

## Main-based ports merged on exact checked code

| Historical PR | New PR | Source test SHA; CI on that PR SHA | Merge SHA | Files actually merged |
|---|---|---|---|---|
| #536 | [#557](https://github.com/250oisr-eng/Pasekaapp/pull/557) | `f8b098bb7af38738fead6f5a2b5219fbcc87a9e5`; Android #45877095034 SUCCESS | `1805c7d10ccc50b3b37a3f2b53bd0f5083f684ab` | `tests/idb-blocked-upgrade-retry.test.mjs` |
| #42 | [#558](https://github.com/250oisr-eng/Pasekaapp/pull/558) | `baf6342de800f260a9ee9945e2be4489491c4085`; Android #45877248236 SUCCESS | `0619c44e244568f4f8df8283161e035efffcc5eb` | `tests/equipment-inventory.test.mjs` |
| #516 | [#559](https://github.com/250oisr-eng/Pasekaapp/pull/559) | `06550ed8653829c460d8dc16359b856d020238e0`; Android #45877525614 SUCCESS | `c202d35ba1176c22e9f0bc41927012d73e45d760` | `scripts/audit-oneplus-json-transfer.mjs`, `tests/audit-oneplus-json-transfer.test.mjs` |
| #44 | [#560](https://github.com/250oisr-eng/Pasekaapp/pull/560) | `a204c4e39373b9eee309666d2f0d91942edaa4b7`; Android #45877662641 SUCCESS | `7d8af290cb9621ea7e83610a939dbceb19027b20` | `js/pesticide-incident.js`, `tests/pesticide-incident.test.mjs` |

Exact merge-SHA CI on `main` is **NOT VERIFIED** by the available commit-run lookup, which returns only PR-triggered runs, not push-triggered runs. CI success does not prove physical OnePlus compatibility, real media archive restoration or data migrations on device.

## Historical PR cleanup, without branch deletion

- #536 CLOSED/SUPERSEDED after all new code (single IDB test) was ported to #557. Its other changed paths were stale status/metrics/journal.
- #42 CLOSED/SUPERSEDED after its single profile regression test was ported to #558.
- #516 CLOSED/SUPERSEDED after its two code/test files were ported to #559; historical reporting files intentionally not replayed.
- #44 CLOSED/SUPERSEDED after current main gained its GPS provenance validator and tests through #560.
- #69 CLOSED/SUPERSEDED after checking current production `readMain`, `readAutoBackup`, abort safety, startup freshness and original test titles. Historic dependent #70 was already CLOSED. Its old main base is obsolete.

Each historical PR includes the reason and exact replacement references in its updated description. No destructive force-push, branch deletion or unilateral product decision was applied.

## Further investigated but NOT approved for blind merge

- **#60 physical body links:** current `js/equipment-inventory.js` contains newer sectional/honey-stack geometry, append-only equipment event validation and a separate read-only `auditLegacyLayoutBodyReferences()`. Old #60 rewrites a monolithic `inspect` and adds stricter legacy-only checks. Some assertions remain unimplemented; transplanting that old function would discard current invariants. Require a separate current-main minimal patch + negative legacy and sectional regressions.
- **#41 physical body dimensions:** historic compatibility function changes require current profile-isolation and swap regression review. Not approved by passing old CI alone.
- **#539 vs #540 video model research:** alternative RF-DETR Nano and LiteRT routes with overlapping old project-status edits. Official public RF-DETR model-license page indicates Nano/Small/Medium/Large detection Apache-2.0; Mendeley v6 dataset page indicates CC BY 4.0, but **exact selected checkpoint SHA, original labeled binaries, independent split and real detection/IN/OUT proof remain absent**. Preserve both research branches; do not blindly merge conflicting old documentation, do not enable video cleanup.
- **#543 physical OnePlus TAR/ADB:** FROZEN per user decision. Earlier read-only local artifacts and CI cannot establish actual OnePlus independent restore. No more repetitive USB trials.
- **#168 archive stack, #9 archival history, #453/#54 sectional technology, #200 honey:** unresolved integration and physical model / rollback gates. Never bulk merge or close based only on ancestry/path inventory.
- **#533 governance docs:** overlaps active AGENTS/status/strategy; do not revert newer project facts by replaying old files.
- **#7 audit document:** original historical 14 November file is absent in main, but its time-sensitive claims are outdated; not safe to merge as current operational truth without an explicit historical label.

## Priority queue after this cycle

1. Confirm latest exact-main Fast/Android/E2E check conclusions using push-run evidence (the PR-filtered run lookup is insufficient).
2. Audit #60 in **current** physical model; add minimal read-only legacy checks without altering sectional, legacy migration or user data.
3. Examine #41 and other root PRs only with current-main semantic diff and regression tests; preserve old branch ancestry.
4. For archives/restore/video, maintain B01/B04/B05/B06/#442 FROZEN/BLOCKED until external evidence and user-confirmed device actions.
5. Produce a new live full-pagination open-PR census with exact head/base SHA and parent graph. The old 411-row JSON is historical and cannot be called a current live count.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL / NO_MASS_MERGE.**
