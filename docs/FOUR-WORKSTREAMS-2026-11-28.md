# Four workstreams — 28.11.2026

## 28.11.2026 — четыре направления: согласованный макроцикл

Source main `12436a769f9774af86e83936a36662d9a2b9d85b`: exact main CI 6/6 PASS. All changes below are in existing Draft PRs, no merge/release/production mutation.

- #635 `e12ce8a7ad5f7a936c6f27b916353cc093701f39`: deadout history/evidence, preserves media; 8/8 checks.
- #641 `53498918c5d817fd96afa0d281e34140e4f41012`: voice lifecycle and stale callback guards; 6/6 checks.
- #657 `fab6fc02c077b21e678333608ae8a0b9410cfd69`: ZIP exact size, 138-byte overhead; 7/7 checks.
- #660 `fcb74479e3473b2d797958ed217fc89e4666c3b2`, #662 `aff51ca1fa2eb74d739591e3d8fb7609a23d0448` (1215/1215), #664 `02ada60659d47e660208fe14b35fa07df4eb18cc`, #665 `84ef46d6dfe2c1db4cdbbed4b7679e7cd85f463b` (1224/1224): all exact CI PASS. Combined #663 `fdec0aaa5c9c5ee2c6ede8a1a61adde49b943adf` 1257/1257, 7/7 checks. OP11 read-only, roof pair, frame custody, OP12 lower=2/middle=1/upper=1, OP13 ordinary one-body and separate early flow; geometry 180mm. SW v333; no live profile activation. Four initial failures (isolated fixtures, SW version assertion, missing marking dependency) fixed, not waived. Independent constituent PRs overlap #663: do not merge both without re-evaluating diffs.
- #453 `77ccad2e18e800aa32f4f9524292518c69abdb1b`: detached OP01/03/06 evidence port, ambiguous IDs rejected, Node PASS; remaining exact CI pending at record time. Old UI and unsafe full branch not imported; OP02 existing model retained.
- #644 `18696819bbc469b4c5b1a40ceb372701e355927d`: QA ONLY DO NOT MERGE, combines #663 + #635/#641/#657, 1309/1309, 9/9 checks, isolated `ru.paseka.journal.qa.voice4`. Voice artifact [15262084411](https://github.com/250oisr-eng/Pasekaapp/actions/runs/46143349224/artifacts/15262084411) (old archive name VOICE3), daily QA [15262907413](https://github.com/250oisr-eng/Pasekaapp/actions/runs/46143349238/artifacts/15262907413), expire 05.12.2026 12:12 UTC. #453 later port not in APK. Physical microphone/TalkBack/airplane mode/actual scheduled backup/independent restore NOT_TESTED. Only synthetic disposable QA; never replace production. #650 historical UI QA exact CI 9/9 PASS; no need to test multiple historical packages.

### Remaining technology gates

OP01/02/03 detached models need durable validated save and seasonal scope; OP04–06 coordinator not activated (two-queen mesh removal source unspecified); OP07/08 atomic gated synthetic path; OP09/10 no dedicated complete write path; OP11 preview only (no durable movement/lineage/CAS); OP12 order validators only; OP13 readiness/lineage not full execution; OP14 source scenario, durable commit not complete. B07=false; #442 frozen. No production data changes or independent restore proof. Next: combined runtime non-QA candidate (single SW rotation; avoid duplicate PR merges), remaining OP09/10/14 and OP01–06 persistence, physical QA once on synthetic data; separate permission for any merge.
