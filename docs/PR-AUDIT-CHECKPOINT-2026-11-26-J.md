# PR audit J — final synchronized indexed portfolio, 26 November 2026

**Verified main after #579:** `cedcb63441b09a08fd78fd22e5b2a65687da1f5e`. Detailed machine-readable membership/graph: [PR-AUDIT-LIVE-GRAPH-2026-11-26-I.json](PR-AUDIT-LIVE-GRAPH-2026-11-26-I.json). The preceding [checkpoint I](PR-AUDIT-CHECKPOINT-2026-11-26-I.md) is a dated historical snapshot before #533 was closed.

## Reconciled indexed PR queue
- Fresh 15 disjoint daily GitHub Search buckets return **391 unique indexed OPEN PR IDs** after #533 was closed and #579 merged. **33 historically main-root and 358 historically stacked**. No duplicate result IDs; daily maximum 88, no truncated 100-count bucket.
- *Do not claim GitHub REST exhaustive list*: earlier directly available #516 was missing from search, and search results can lag. Each row says `indexedState=OPEN`; stored head/base/parent SHA for non-verified rows are explicitly historical.
- Every one of the **358 historical stacked nodes** is enumerated with previously recorded parent and root, but no blanket review of its code/CI occurred. Historical graph: **0 cycles, max 142 parent steps**; 6 open descendants of closed #60; **69** with no associated open parent PR across five branches, all five verified present in GitHub. Direct current base/head checks on **29** representative PRs are recorded; 329 stacked/root remaining direct-head metadata checks and most semantic diffs are still outstanding.
- The graph must be processed topologically and semantically. Do not equate `mergeable=true` on a child with safe main integration, or auto-close branches rooted in closed #60.

## Verified changes in this audit macrocycle

| PR | Action | Exact-head checks | Result |
|---|---|---|---|
| [#577](https://github.com/250oisr-eng/Pasekaapp/pull/577) | Isolated local TAR header reader and negative tests from old #509 | Android #45886634965 SUCCESS, Governance #45886635009 SUCCESS on `422d169c6f8b3932a1b4782231bdbde2cbcdf849` | MERGED `aa9fc17702730f9b5dc2931edee18e78c867478b` |
| [#509](https://github.com/250oisr-eng/Pasekaapp/pull/509) | Old source ported without historical status | #577 checks above | CLOSED, NOT MERGED, branch retained |
| [#578](https://github.com/250oisr-eng/Pasekaapp/pull/578) | Live indexed 392-row graph, ancestor risk and current SHA samples | Governance #45887092019 SUCCESS on `852b2a496fb8ba8e7d7fbc691b27980f4c8f150a` | MERGED `e6509702cac8ab26101855780b0db97ff3bf0540` |
| [#579](https://github.com/250oisr-eng/Pasekaapp/pull/579) | Unique WIP/diagnostic STOP/CI distinctions from old #533 into existing F0–F7 | Governance #45887287260 SUCCESS on `9b44124d7bf9a783f43dfb02d846ea6742804682` | MERGED `cedcb63441b09a08fd78fd22e5b2a65687da1f5e` |
| [#533](https://github.com/250oisr-eng/Pasekaapp/pull/533) | Historic stale full docs branch replaced by narrow port | #579 checks above | CLOSED, NOT MERGED, branch retained |

For #577, Android/debug APK CI succeeded; no test demonstrates original-video recovery, independent full archive restore, real installed Windows/OnePlus behavior, or release. For docs-only #578/#579, Android builds are not required by the docs-only scope.

## Current gates and next sequence

**B01** independent full backup and restore, **B04/B05** owner signing key / safe installed upgrade, **B06/#442** real bee recognition and original-video deletion, and **B07** new sectional profile activation remain BLOCKED/FROZEN. No actual user data, device, video, production or release action occurred. Prioritize individual diff review of the 33 historical main-root candidates; then reconcile the 358 stacked branches by verified parent chains, preserving source and history. After each future closure, update the indexed count without asserting it is a mathematically exhaustive REST list.
