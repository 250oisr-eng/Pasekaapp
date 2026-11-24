import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function auditPasekaJsonTransfer(raw, expected = {}) {
  const failures = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'BLOCKED', failures: ['The JSON root must be an object'], warnings: [], counts: null };
  }
  if (raw.app !== 'Paseka') {
    failures.push('Export must include app:"Paseka"; unknown/legacy files need separate review');
  }
  const state = raw.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    failures.push('Export must include a state object');
    return { status: 'BLOCKED', failures, warnings, counts: null };
  }
  const schemaVersion=state.meta?.schemaVersion;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > 15) {
    failures.push('Unsupported or unknown JSON schema version: blocked until independent migration review');
  }
  const byType = Object.fromEntries(['hives', 'families', 'records'].map(name => [name, state[name]]));
  for (const [name, rows] of Object.entries(byType)) {
    if (!Array.isArray(rows)) failures.push('Missing or non-array section: ' + name);
    else if (rows.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
      failures.push('Non-object entry in ' + name);
    }
  }
  if (failures.length) return { status: 'BLOCKED', failures, warnings, counts: null };

  const ids = {};
  for (const [name, rows] of Object.entries(byType)) {
    const seen = new Set();
    for (const [index, item] of rows.entries()) {
      if (typeof item.id !== 'string' || !item.id.trim()) {
        failures.push('Missing identifier in ' + name);
      } else if (seen.has(item.id)) {
        failures.push('Duplicate identifier in ' + name + ' at row ' + index);
      } else {
        seen.add(item.id);
      }
    }
    ids[name] = seen;
  }
  for (const [index, family] of byType.families.entries()) {
    if (family.hive && !ids.hives.has(family.hive)) {
      warnings.push('Family references an unavailable hive at row ' + index);
    }
  }
  for (const [index, record] of byType.records.entries()) {
    if (record.hive && !ids.hives.has(record.hive)) {
      warnings.push('Record references an unavailable hive at row ' + index);
    }
    if (record.family && !ids.families.has(record.family)) {
      warnings.push('Record references an unavailable/archived family at row ' + index);
    }
    if (record.media != null && !Array.isArray(record.media)) {
      failures.push('Journal media must be an array when present at row ' + index);
    }
  }
  const counts = Object.fromEntries(Object.entries(byType).map(([name, rows]) => [name, rows.length]));
  for (const [name, expectedCount] of Object.entries(expected)) {
    if (!(name in counts) || !Number.isSafeInteger(expectedCount) || expectedCount < 0) {
      failures.push('Invalid expected count: ' + name);
    } else if (counts[name] !== expectedCount) {
      failures.push('Unexpected ' + name + ' count: ' + counts[name] + ' (expected ' + expectedCount + ')');
    }
  }
  // Never claim JSON includes the separate entrance_media IndexedDB object store.
  warnings.push('JSON state export excludes the separate entrance_media video store. Full media disaster recovery is NOT proven.');
  return {
    status: failures.length ? 'BLOCKED' : warnings.length > 1 ? 'REVIEW_REQUIRED' : 'JSON_STATE_PREFLIGHT_ONLY',
    failures, warnings, counts,
    schemaVersion: Number.isInteger(state.meta?.schemaVersion) ? state.meta.schemaVersion : null,
    // No journal texts, names, user IDs, or private file contents in report.
  };
}

export function auditFile(path, expected) {
  if (!path || !path.toLowerCase().endsWith('.json')) {
    throw new Error('BLOCKED: provide a real exported .json file, not ZIP or APK');
  }
  // Local read-only operation: no network, import, install or overwrite.
  return auditPasekaJsonTransfer(JSON.parse(readFileSync(resolve(path), 'utf8')), expected);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const expected = {};
    for (const option of process.argv.slice(3)) {
      const m = /^--expect-(hives|families|records)=(\d+)$/.exec(option);
      if (!m) throw new Error('BLOCKED: invalid expectation flag');
      expected[m[1]] = Number(m[2]);
    }
    const result = auditFile(process.argv[2], expected);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'JSON_STATE_PREFLIGHT_ONLY') process.exitCode = 1;
  } catch (error) {
    console.error('BLOCKED: ' + (error.message || String(error)));
    process.exitCode = 1;
  }
}
