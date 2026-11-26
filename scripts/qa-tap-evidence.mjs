// Read-only integrity gate for the existing complete Node TAP regression suite.
// Selective rewrite of the useful summary classification in historical PR #532.
// No GitHub network calls, phone access, archive access, releases or file writes.
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LOG_BYTES = 16 * 1024 * 1024;
const FIELDS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];

export function assessTapSummary(raw) {
  const unknown = { status: 'NOT_VERIFIED', tests: null, pass: null,
    fail: null, cancelled: null, skipped: null, todo: null,
    physicalDeviceVerified: false, independentRestoreVerified: false,
    videoDeletionAuthorized: false, releaseAuthorized: false };

  if (typeof raw !== 'string' || raw.length === 0 ||
      !/^TAP version 13\r?$/m.test(raw)) return unknown;

  // Require exactly one final full-suite summary. This rejects truncated logs,
  // concatenated runs and ambiguous evidence instead of selecting the last PASS.
  const starts = [...raw.matchAll(/^# tests [0-9]+\r?$/gm)];
  if (starts.length !== 1) return unknown;
  const footer = raw.slice(starts[0].index);
  const values = {};
  for (const field of FIELDS) {
    const matches = [...footer.matchAll(new RegExp('^# ' + field + ' ([0-9]+)\\r?$', 'gm'))];
    if (matches.length !== 1) return unknown;
    const value = Number(matches[0][1]);
    if (!Number.isSafeInteger(value)) return unknown;
    values[field] = value;
  }
  if (values.tests <= 0 ||
      values.tests !== values.pass + values.fail + values.cancelled +
        values.skipped + values.todo) return unknown;

  const status = values.fail > 0 ? 'FAIL' :
    (values.cancelled > 0 || values.skipped > 0 || values.todo > 0)
      ? 'PARTIAL' : 'PASS_SYNTHETIC';
  return { ...values, status,
    physicalDeviceVerified: false, independentRestoreVerified: false,
    videoDeletionAuthorized: false, releaseAuthorized: false };
}

export function assessTapFile(path) {
  if (typeof path !== 'string' || !path) throw new Error('TAP_PATH_REQUIRED');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() ||
      stat.size <= 0 || stat.size > MAX_LOG_BYTES)
    throw new Error('INVALID_TAP_FILE');
  return assessTapSummary(readFileSync(path, 'utf8'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('TAP_PATH_REQUIRED');
    const evidence = assessTapFile(process.argv[2]);
    console.log('PASEKA_CI_TAP_EVIDENCE ' + JSON.stringify(evidence));
    if (evidence.status !== 'PASS_SYNTHETIC') process.exitCode = 1;
  } catch {
    // No path, test payload, credentials, or raw log bytes are printed.
    console.error('PASEKA_CI_TAP_EVIDENCE {"status":"NOT_VERIFIED","gate":"BLOCKED"}');
    process.exitCode = 1;
  }
}
