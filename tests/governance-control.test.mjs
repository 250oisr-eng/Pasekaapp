// npm test / existing Android CI discovers tests/*.test.mjs.
// The governance tests use only Node built-ins, do not mutate user files,
// and verify safeguards even before the new lightweight workflow is integrated.
import '../scripts/governance-tests.mjs';
