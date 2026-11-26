# PR portfolio audit — checkpoint H, 26 November 2026

## Scope and evidence
- Live `main` at entry: `d812bfa46e28ec418a1f6ca1a958ecccd445160d`; PR #572 confirmed `MERGED`, merge commit equals main.
- Fresh **15 disjoint GitHub `is:pr is:open created:YYYY-MM-DD`** buckets (12–26 November); each bucket below 100 returned rows. **397 unique open IDs** before this cycle's cleanup, zero duplicates in live census.
- #8 was independently checked: historical code re-enabled `deleteAllData`/`indexedDB.deleteDatabase` while #572 safely ported the previous-use marker and explicitly retained the destructive reset block. **#8 CLOSED/SUPERSEDED_UNSAFE, NOT MERGED** with documented comment; branch and Git history kept.
- **396 open** after #8 closure (397 - 1); a fresh complete post-closure rescan is still required if concurrent GitHub changes occur. Classification below is based on the 397-row prior in-repo census minus #8; **historical** base/SHA/path information is not refreshed for every row.
- Class split from source metadata after #8 removal: **38 historically main-based / 358 stacked**, totaling 396. Historical review categories: 19 P0 data/Android, 358 stacked, 7 governance/docs, 4 P0/video, 4 P1 technology, 4 independent roots. This is a portfolio triage, **not 396 code-level reviews**.

## Individually inspected candidates and disposition
| PR | Observations on current live PR / patches | Disposition |
|---|---|---|
| #8 | Old startup detector plus destructive reset; #572 merged provides current guarded startup and preserved reset freeze | **CLOSED, not merged**; old UI text only selectively reviewable |
| #60 | Old `js/equipment-inventory.js` replacement conflicts with newer sectional semantics; #567 separately ported read-only legacy tests | **REVIEW_REQUIRED**; no wholesale merge / close yet |
| #516 | Useful new cross-hive family-reference warning in read-only JSON preflight; original PR also carries stale `PROJECT_STATUS.md` and docs | **SELECTIVE_PORT_CANDIDATE**; inspect exact current script/tests, then minimal fresh-main patch and exact-head CI |
| #529 | Historic review document and old status lines; not current product code; PR mergeable=false | **DOCS_RECONCILE**; preserve unique findings before possible supersede |
| #533 | Governance change overlapping current `AGENTS.md`, status, strategy, blockers; PR mergeable=false; history carries stale states | **DOCS_RECONCILE**; no direct merge |
| #532 | Comprehensive QA tests/docs, PR mergeable=false; inspect overlap with existing CI gates and negative tests | **REVIEW_REQUIRED** |
| #537 | Stacked on #534; physical OnePlus kit and isolated package; physical device proof not obtained | **STACKED/HOLD** |
| #525–#528 | Nested USB/check-hub branches, overlapping and dependent; #543 / user direction freezes repeated ADB/USB work | **STACKED/HOLD**, no device operations |

## Safety and integration policy
1. No wholesale merges, rebases, retargets or deletions of stacked dependencies. Validate base/head live immediately before any operation, review actual diff against current main and confirm whether unique behavior is already present.
2. Any port that touches backups, restore, IndexedDB, Service Worker, video, hive profile or critical operations requires negative/regression tests and CI on exact new SHA.
3. **B01 independent full restore, B04/B05 device signer/rollback, #442 video recognition and deletion, B07 sectional profile activation remain blocked/frozen.** A passing debug build does not prove physical OnePlus operation.
4. Approval to work with PRs covers documented selective merges/closures but **not** release, production deployment, changes to real user data, original-video deletion or unsafe migrations.
5. For a superset/superseded historical PR, keep its branch/commits; document preserved unique requirements and evidence before closing.

## Next bounded audit cycle
- Reconcile #516's unique `scripts/audit-oneplus-json-transfer.mjs` read-only family/hive warning into current main without copying stale docs and with full tests.
- Work down remaining 38 root candidates with code/semantic review, exact-head CI and conflict checks; classify as MERGEABLE_SAFE, SELECTIVE_PORT, BLOCKED or SUPERSEDED with detailed evidence.
- Resolve 358 stacked branches topologically only after their parent chains and critical data invariants are reviewed.
- Update the live census, `PROJECT_STATUS.md`, journal, and metrics after each verified macrocycle. No false claim of fully clearing 396 PRs.

**Release not authorized; no user data, branches, original video, deployment or device were modified.**
