# PR portfolio audit — checkpoint H, 26 November 2026

## Scope and evidence
- Live `main` at entry: `d812bfa46e28ec418a1f6ca1a958ecccd445160d`; PR #572 confirmed `MERGED`, merge commit equals main.
- Fresh **15 disjoint GitHub `is:pr is:open created:YYYY-MM-DD`** buckets (12–26 November); each bucket below 100 returned rows. **397 unique open IDs** before this cycle's cleanup, zero duplicates in live census.
- #8 was independently checked: historical code re-enabled `deleteAllData`/`indexedDB.deleteDatabase` while #572 safely ported the previous-use marker and explicitly retained the destructive reset block. **#8 CLOSED/SUPERSEDED_UNSAFE, NOT MERGED** with documented comment; branch and Git history kept.
- **396 indexed open** after #8 and #516 closures, verified by a second 15-bucket search. Important limitation: #516 was directly observed OPEN by the PR endpoint but was absent from both earlier 397-row search census and saved F snapshot, showing that even daily-bucket search is **not a guaranteed complete GitHub census**; avoid declaring the 396 count exhaustive until independently paginated PR listing is reconciled. Classification below is based on the 397-row prior in-repo census minus #8 (which never included #516); **historical** base/SHA/path information is not refreshed for every row.
- Class split from source metadata after #8 removal: **38 historically main-based / 358 stacked**, totaling 396. Historical review categories: 19 P0 data/Android, 358 stacked, 7 governance/docs, 4 P0/video, 4 P1 technology, 4 independent roots. This is a portfolio triage, **not 396 code-level reviews**.

## Individually inspected candidates and disposition
| PR | Observations on current live PR / patches | Disposition |
|---|---|---|
| #8 | Old startup detector plus destructive reset; #572 merged provides current guarded startup and preserved reset freeze | **CLOSED, not merged**; old UI text only selectively reviewable |
| #60 | Old `js/equipment-inventory.js` replacement conflicts with newer sectional semantics; #567 separately ported read-only legacy tests | **REVIEW_REQUIRED**; no wholesale merge / close yet |
| #516 | Subsequent direct inspection of current `scripts/audit-oneplus-json-transfer.mjs` and matching tests proves cross-hive warnings, missing context handling and privacy/non-mutation regression tests already IN_MAIN; old PR carries stale docs | **CLOSED/SUPERSEDED, not merged**, preserved historical branch; prior selective-port hypothesis overturned by direct code evidence |
| #529 | Historic review document and old status lines; not current product code; PR mergeable=false | **DOCS_RECONCILE**; preserve unique findings before possible supersede |
| #533 | Governance change overlapping current `AGENTS.md`, status, strategy, blockers; PR mergeable=false; history carries stale states | **DOCS_RECONCILE**; no direct merge |
| #532 | Comprehensive QA tests/docs, PR mergeable=false; inspect overlap with existing CI gates and negative tests | **REVIEW_REQUIRED** |
| #537 | Stacked on #534; physical OnePlus kit and isolated package; physical device proof not obtained | **STACKED/HOLD** |
| #525–#528 | Nested USB/check-hub branches, overlapping and dependent; #543 / user direction freezes repeated ADB/USB work | **STACKED/HOLD**, no device operations |


## Live direct metadata pass over 38 indexed main-root PRs

Direct `get_pr_info` was performed for all 38 IDs in the indexed root roster (as well as independent checks for #516 and stacked #525–#528/#537). **Only #534 reported `mergeable=true`** at query time; the other 37 indexed root PRs reported `mergeable=false`. This is a structural flag, **not** a code safety verdict, and can change with new commits. #534 is an isolated synthetic Android recovery diagnostic, **not** a physical B01 restore proof; do not merge on the basis of its mergeability flag alone.

Root roster by risk class for subsequent patch-level review:
- B01/B04/B05/data and Android: #543, #534, #532, #524, #523, #522, #521, #520, #519, #517, #509, #479, #469, #452, #168, #14, #9.
- Physical hive/sectional/inventory/journal: #453, #451, #200, #187, #86, #81, #60, #54, #43.
- Media/video: #157, #1.
- Docs, governance and research: #533, #529, #381, #191, #189, #188, #156, #96, #90, #7.

For this pass, code-level patches were selectively examined for #8, #60, #516, #529 and #533; the other candidates' actual implementation and test semantics remain **REVIEW_REQUIRED**. All 358 stacked PRs need dependency-level review before any retarget/merge, regardless of `mergeable` status. This limits the meaning of the word “audit” to confirmed metadata enumeration and specifically evidenced deep samples, not blanket certification.

## Safety and integration policy
1. No wholesale merges, rebases, retargets or deletions of stacked dependencies. Validate base/head live immediately before any operation, review actual diff against current main and confirm whether unique behavior is already present.
2. Any port that touches backups, restore, IndexedDB, Service Worker, video, hive profile or critical operations requires negative/regression tests and CI on exact new SHA.
3. **B01 independent full restore, B04/B05 device signer/rollback, #442 video recognition and deletion, B07 sectional profile activation remain blocked/frozen.** A passing debug build does not prove physical OnePlus operation.
4. Approval to work with PRs covers documented selective merges/closures but **not** release, production deployment, changes to real user data, original-video deletion or unsafe migrations.
5. For a superset/superseded historical PR, keep its branch/commits; document preserved unique requirements and evidence before closing.

## Next bounded audit cycle
- No #516 port is required: current main already contains the exact guarded read-only behavior and tests. Select next root candidate only after fresh-source comparison.
- Work down remaining 38 root candidates with code/semantic review, exact-head CI and conflict checks; classify as MERGEABLE_SAFE, SELECTIVE_PORT, BLOCKED or SUPERSEDED with detailed evidence.
- Resolve 358 stacked branches topologically only after their parent chains and critical data invariants are reviewed.
- Update the live census, `PROJECT_STATUS.md`, journal, and metrics after each verified macrocycle. No false claim of complete enumeration or of deeply clearing 396 indexed PRs.

**Release not authorized; no user data, branches, original video, deployment or device were modified.**
