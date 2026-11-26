# P1 — staged installation of two honey-body pairs (selective root PR #200)

**Date:** 26 November 2026. **F0–F2:** On main `70e9cec1be2d6b5aea032b55c1c91fa9de0840ae`, generic `validateHiveAssemblyProfile` enforced `all-or-none` across all honey boxes. In a valid 4-body paired configuration, installing the first pair and postponing the second was incorrectly rejected as `honey_pair_mismatch`. The user independently confirmed honey bodies are installed in pairs, total 2 or 4. This patch is a narrow correction of profile validation, not a physical operation or automatic confirmation.

**F3:** Where `profile.honey.installation==='paired'` and there are exactly four honey box keys and four installation flags, evaluate each consecutive pair and forbid installing the second pair before the first. For two-body and other paired profiles, preserve prior all-or-none behavior. For `independent` profiles, retain existing freedom. Existing length, boolean flag, box geometry and winter constraints are unchanged.

**F4:** This does not activate the sectional-multiqueen profile, change stored IndexedDB schema, create/move inventory records, authorize physical OP-07, or infer a completed operation from an estimated date. Any actual installation still needs user confirmation and downstream local physical validation. Do not mix Farrar-specific handling with new sectional technology.

**F5:** Regression suite checks allowed 0 / first pair / both pairs, incomplete and reversed pairs, malformed counts/flags/frames, two-body profiles, independent profiles, a three-body legacy paired profile, and no mutations. Require Android/Node and Governance on exact final HEAD, then F6 integration only by separately authorized PR merge. F7 release and production remain separate.

**Safety gates:** B01 full backup and independent recovery, B07 profile activation and #442 original video deletion remain BLOCKED/FROZEN. No actual user data or OnePlus operations.
