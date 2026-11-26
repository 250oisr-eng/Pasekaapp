# PR audit K — 33 historically main-root PRs, 26 November 2026

**Verified protected main after #583:** `f306b35074b19c4d0bb2ae01e3a535f14cc29b04`. Full per-root names, verified old-head SHA, changed-file counts, dispositions and evidence limits: [PR-AUDIT-ROOTS-2026-11-26-K.json](PR-AUDIT-ROOTS-2026-11-26-K.json). Updated indexed graph: [PR-AUDIT-LIVE-GRAPH-2026-11-26-I.json](PR-AUDIT-LIVE-GRAPH-2026-11-26-I.json).

## Scope and evidence quality

- All **33 historically root PR IDs** were checked through the live PR endpoint; **31** open root source patches were fetched and their changed-file structure inspected. Two sources (#519/#520) had already been CLOSED without merge after selective code ports #581/#582.
- Deep targeted source semantics were examined for **#157, #200, #521, #532**. Reviewing changed files and spotting potentially unique paths **does not certify every line** of every large patch. All risk classes below are *triage*, not blanket code approval.
- The standalone four-body honey validation bug was **confirmed in main** and safely fixed by fresh-main #583. CI on exact PR HEAD `da147b94aaa4ad3ae9959a2a7771fefaa538c958`: [Android #45889321180](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45889321180) SUCCESS (full Node tests, APK build, debug/no-upgrade signer gate); [Governance #45889321099](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45889321099) SUCCESS. #583 MERGED into `f306b35074b19c4d0bb2ae01e3a535f14cc29b04`; old #200 CLOSED WITHOUT MERGE; branch and history retained. Sectional profile B07 is **not activated**.
- **#157 must not be merged as written**: current historical `canDeleteMediaOriginal(job)` becomes true from persisted-result/job fields, without #442 V0–V6/full independent archive/owner cleanup permission. This is a concrete safety defect. PR is kept open as original source, annotated HOLD_UNSAFE.
- **#521** has an isolated read-only V7 TAR metadata classifier with explicit false recovery/upgrade fields. This is not a new independent full recovery proof; do not generate recurring synthetic B01 tests without new evidence.
- **#532** has unique QA tools, but its `qa/tracked-drafts.json` hardcodes already historical/closed PR IDs and its workflow and matrix require comparison with current main and active gates. No direct bulk merge; consider only a current-root source-port after test/manifest adaptation.

## Root disposition matrix

| Class | Number | Original root PR IDs | Action |
|---|---:|---|---|
| Unsafe media deletion / #442 | 2 | #1, #157 | HOLD, never enable cleanup by historic code |
| Historic source and policy documents | 10 | #7, #81, #86, #90, #96, #156, #188, #191, #381, #529 | Preserve unique evidence; selectively reconcile updated requirements |
| P0 backup/restore/device/legacy coupled | 11 | #9, #14, #168, #451, #452, #469, #522, #523, #524, #534, #543 | No bulk merge; review per module and require B01/Android proofs as appropriate |
| P1 sectional/physical technology | 2 | #54, #453 | Domain/source cross-check, profile B07 not activated |
| Isolated selective code-review candidates | 5 | #187, #189, #479, #521, #532 | Recheck unique current-main behavior, tests, privacy, and dependency conflict before fresh-main ports |
| Source code already selectively integrated | 3 | #200, #519, #520 | CLOSED without merge after #583, #581, #582 respectively |

## Indexed PR portfolio after safe closures

New disjoint daily GitHub Search: **388 unique indexed open PRs** after #200/#519/#520 CLOSED. Of historical root IDs **30 remain OPEN** and **358 remain stacked**. Search-index completeness is **not guaranteed** (historical #516 directly open was absent from search); the 388 number is not an authoritative exhaustively paginated REST count. Historical stacked parent graph remains 0 cycles, up to 142 parent steps and 69 dependents of five non-open-parent branches. Those facts are not semantic code reviews or safe merge approval.

## Next bounded integration order

1. Reconcile #532's read-only QA evidence checker with the *current* open-PR manifest without adding a stale, brittle CI workflow; only port a necessary independent proof capability with negative tests. Do not equate exact code SHA CI with main integration or device behavior.
2. Review #187's UI/browser tests on current main before any HTML transplant; preserve working accessibility and mobile layout.
3. Reconcile #54/#453 physical model and source DOCX in a separate source-driven cycle; all new-section operations require local validation and confirmation.
4. Keep #1/#157 video deletion, #168/#452/#469 archive/restoration and #522/#543 physical OnePlus flows frozen/blocked unless their explicit evidence gates change. Do not close unique source branches merely for age or conflict.
5. Refresh root and stacked metadata upon every safe port and closure, preserve old commits and actual CI evidence, and maintain concise status/journal/metrics.

**No physical OnePlus access, independent real restore, original video deletion, production deploy, app publication or user-data changes.**
