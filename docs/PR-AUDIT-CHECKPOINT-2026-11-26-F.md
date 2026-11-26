# PR audit — continuation F, 26 November 2026

**Verified main after safe #568 integration:** `4c0d9b9093ee613d2befcf05e7c5e4b6efb5c8c5`.

## Live open-PR census

Fresh complete identifier census via **15 disjoint daily GitHub searches**, `is:pr is:open created:YYYY-MM-DD` (12–26 November 2026), no bucket above 88. [397 OPEN pull requests](PR-AUDIT-LIVE-CENSUS-2026-11-26-F.json), each unique. Historical main-based classification: **39 root and 358 stacked**. Compared to preceding 400-row snapshot on branch E, #52/#170/#175 no longer open and zero new open IDs. This census establishes current open membership at query time; does **not** refresh head/base SHA for all 397 nor establish semantic review of every diff.

The original 411-row [historical machine inventory](PR-AUDIT-INVENTORY-2026-11-26.json) remains valuable for old head/base/dependency/path metadata but must never be treated as live. Snapshot chronology: 411 historical → [401](PR-AUDIT-LIVE-CENSUS-2026-11-26.json) → 400 intermediate work branch E → 397 in this checkpoint.

## Exact safe integrations from this cycle

| Port PR | Historic source / purpose | Exact-head CI | Squash merge | Changed scope |
|---|---|---|---|---|
| [#566](https://github.com/250oisr-eng/Pasekaapp/pull/566) | #41: corrupted/legacy frame history swap protections | Android #45879582136 **SUCCESS** on `226433a777e07742b02d0dead1fd9c928ec99b71` | `3b42923c70ac808d41090f167a4747d865cf77b8` | `tests/equipment-bodies.test.mjs` only |
| [#567](https://github.com/250oisr-eng/Pasekaapp/pull/567) | #60: read-only audit of unregistered/malformed legacy body references | Android #45879689725 **SUCCESS** on `e787697d7b1f88e18bcffed4b2fbda28b8acffae` | `af22d2ba5d54ab07b89ab9276388406e4eda9cd3` | `tests/equipment-inventory.test.mjs` only |
| [#568](https://github.com/250oisr-eng/Pasekaapp/pull/568) | #52: bounded Cloudflare Worker body tests and CI triggers | Android #45880155202 **SUCCESS** on `2c3994f7d3d7f65d8317ea352a02fb927af14c83` | `4c0d9b9093ee613d2befcf05e7c5e4b6efb5c8c5` | new `tests/cloudflare-bounded-body-ci.test.mjs`; two CI workflow path filters |

**Important Cloudflare distinction:** the production Worker already contained `readBoundedBody` and 270000-byte streaming guard; it was not overwritten from #52. The unique missing value was CI trigger coverage for `cloudflare/**` and direct negative tests for malformed lengths/UTF-8. No Cloudflare deployment.

## Historical cleanup with preserved branches/commits

- **#41 CLOSED/SUPERSEDED**: #563 geometry guard and #566 frame-history tests cover useful safety intent. Original strict rule would break legitimate same-profile Farrar honey swaps when optional height is unknown; current implementation deliberately retains these while failing closed on conflicting geometry, unknown frame height and ID-only profiles. No silent claimed equivalence.
- **#52 CLOSED/SUPERSEDED**: production Worker already bounded requests; #568 adds unique CI/tests. Do not replay old Worker baseline.
- **#170 CLOSED/SUPERSEDED**: device is known, but old assumption of permanent immediate OnePlus availability is unsafe. Current rules require separate evidence and authorization for real data/device changes.
- **#175 CLOSED/SUPERSEDED**: older OP/Varroa PR snapshots were already reconciled into live source/status; current files retain newer evidence.

These four PRs were closed **without merging their historical branches**. No branch or commit deletion.

## Remaining unresolved groups — not safe to bulk merge

1. **B01 archive/restore #168, #452, #524:** independent real OnePlus archive/Blob restore and rollback still unproven; all production restore and original-media delete frozen.
2. **B04/B05 Android signing #519/#520/#543:** debug APK provenance integrated, owner signing-key custody and installed signer compatibility still BLOCKED; #543 USB/ADB investigation frozen by user direction.
3. **B06/#442 real bee detection:** source research #539/#540 preserved in #564, but exact checkpoint bytes/license, real IN/OUT ground truth and deployed offline inference NOT_VERIFIED, auto cleanup FROZEN.
4. **B07 physical technology #54/#453/#200 and descendants:** source DOCX, later user confirmations, queen/section lineage, frame inventory and migration must be proven before activation.
5. **Historical #60:** separate legacy read-only audit tests now in main, but old monolithic inspect replacement not accepted; would discard newer sectional model semantics. Keep REVIEW_REQUIRED.
6. **Old docs #96/#90/#156/#7/#191/#533:** historical source material or conflicting current rules; unique content must be distinguished from obsolete status, not blindly merged or closed.

## Evidence integrity

All cited CI successes are on **exact PR test HEADs**; post-merge push CI conclusions for the resulting main merge SHAs are **NOT_VERIFIED** by the available PR-only workflow lookup. GitHub CI does **not** prove original media recovery, installed OnePlus behavior, bee recognition or physical operations. No production deployment/publication, real-data mutation, phone update, original video deletion, branch rewrite or mass merge was performed. Owner permission for safe PR work is not release permission.
