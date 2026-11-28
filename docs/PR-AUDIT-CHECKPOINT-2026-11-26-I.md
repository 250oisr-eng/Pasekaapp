# PR audit I — indexed census and 358-chain dependency reconciliation

**26 November 2026. Snapshot main:** `aa9fc17702730f9b5dc2931edee18e78c867478b` (verified #577 squash merge). Machine-readable per-PR list: [PR-AUDIT-LIVE-GRAPH-2026-11-26-I.json](PR-AUDIT-LIVE-GRAPH-2026-11-26-I.json).

## Live membership and explicit limits

- Fifteen disjoint GitHub `is:pr is:open created:YYYY-MM-DD` queries (12–26 November), all under 100 results per bucket, yielded **392 unique indexed open PRs** after #577 MERGED and #509 CLOSED; no duplicates in the search responses. GitHub Search is known to have omitted a directly OPEN #516 earlier; hence **392 is indexed membership, not independently paginated exhaustive GitHub REST enumeration**.
- Of those 392, **34 historically direct to main** and **358 historically stacked**. No newly created unrecognized ID relative to the old 411-row inventory; current live head/base for **29 sampled PRs** was fetched directly by `get_pr_info`. For the other rows, old base/head/path/depth are explicitly *historical* and need fresh check before action. **Not 358 semantic code reviews, not CI sign-off.**
- On the historical 358-node graph: **0 cycles**, maximum parent traversal depth **142**, with **6 open descendants of CLOSED #60**. Direct #61/#68 inspection confirms preserved dependent branches; closing #60 did not delete the base. Never retarget all six automatically.
- **69 PRs use one of five baselines lacking an associated open parent PR**: `review-base/archive-ledger-212-2026-11-22` (36), `perf/p2-video-metadata-cursor-2026-11-23` (16), `fix/sectional-op06-laying-observation-2026-11-16` (12), `fix/indexeddb-recovery-commit-flag-2026-11-16` (3), `fix/p0-block-entrance-original-video-delete-main-20261125` (2). All five literal branch names **exist in GitHub** per live `search_branches`. This does **not** show parent PR merged, safe, current or that orphan code is already in main.
- Direct head/base samples spanning archive, video, sectional, hardware, docs, B01 recovery and orphan chains: #1, #2, #9, #10, #54, #55, #61, #68, #71, #100, #157, #158, #168, #169, #174, #200, #201, #381, #382, #424, #441, #453, #454, #513, #518, #524, #525, #534, #537. Actual SHA and base for these 29 are embedded in JSON.

## Root and chain processing order

1. **P0 data loss / archive / identity:** avoid bulk merge of #168 (and its large descendants), #9, #524/#525–#528 and #534/#537. B01 physical original backup and independent recovery stay BLOCKED. Distinguish isolated test tools from real data restoration.
2. **P0 video / safety:** #1 and descendants, #157 and descendants; #442 auto video cleanup FROZEN without V0–V6 and distinct authorization.
3. **P1 technology / equipment:** #54, #200, #453 and descendants; reconcile user DOCX and runtime/profile/physical model before any activation or UI write.
4. **Other chains:** #381 Android-docs and orphan base groups; review unique tests and historic reports on current main without blindly importing old status, cache, migration or app shells.
5. For each chosen chain: fresh PR HEAD, base, ancestor ancestry, file list, patch semantics and current-main behavior, tests/CI exact HEAD, rollback compatibility. Only then MARK `SELECTIVE_PORT`, `SAFE_MERGE`, `SUPERSEDED` or `HOLD` and take a corresponding GitHub action.

## Completed source-port result #509 / #577

Historical [#509](https://github.com/250oisr-eng/Pasekaapp/pull/509) is now CLOSED WITHOUT MERGE after isolated [#577](https://github.com/250oisr-eng/Pasekaapp/pull/577) **MERGED** `aa9fc17702730f9b5dc2931edee18e78c867478b`. Exact #577 test HEAD `422d169c6f8b3932a1b4782231bdbde2cbcdf849`: [Android #45886634965](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45886634965) **SUCCESS**, [Governance #45886635009](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45886635009) **SUCCESS**. Added no-extraction local TAR header reader and negative tests; **not** archive completeness or physical restore proof. Source branch/commits retained, no phone access, user data or media deletion.

**Safety:** no mass merge, auto-retarget, branch deletion, rewrite, production deployment, OnePlus install, full restore or original media cleanup. CI on code does not prove physical OnePlus or backup/restore.
