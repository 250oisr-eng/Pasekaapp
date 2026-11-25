import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const ps=readFileSync(join(root,'tools/b01-oneplus-safe-v9/B01-ONEPLUS-SAFE-V9.ps1'),'utf8');
const cmd=readFileSync(join(root,'tools/b01-oneplus-safe-v9/START.cmd'),'utf8');
const readme=readFileSync(join(root,'tools/b01-oneplus-safe-v9/README.txt'),'utf8');

test('B01 V9 requires recent host adb and shell v2 with separated stdout/stderr',()=>{
  assert.match(ps,/New-Object Diagnostics\.ProcessStartInfo/);
  assert.match(ps,/RedirectStandardOutput=\$true/);
  assert.match(ps,/RedirectStandardError=\$true/);
  assert.match(ps,/StandardOutput\.BaseStream\.Read/);
  assert.match(ps,/SHELL_V2_NOT_NEGOTIATED/);
  assert.match(ps,/ADB_TOO_OLD/);
  assert.doesNotMatch(ps,/exec-out|\sshell\s-T\b/i);
});
test('B01 V9 requires public TAR before private read',()=>{
  const pub=ps.indexOf("$report.stage='PUBLIC_TAR_GATE'");
  const confirmation=ps.indexOf("$answer=Read-Host 'Action'");
  const privateCapture=ps.indexOf("$private=GrabTar");
  assert.ok(pub>0 && confirmation>pub && privateCapture>confirmation);
  assert.match(ps, /\$answer -cne 'CAPTURE'/);
  assert.match(ps, /Is-AppStopped/g);
});
test('B01 V9 rejects invalid header, truncation, nonzero trailer, and failed adb',()=>{
  for(const text of ['INVALID_TAR_HEADER_CHECKSUM','TAR_PAYLOAD_TRUNCATED','TAR_NONZERO_AFTER_EOF','TAR_MISSING_ENTRIES_OR_EOF','_ADB_EXIT_OR_STDERR','STDOUT_SIZE_LIMIT_EXCEEDED'])assert.ok(ps.includes(text),text);
  assert.match(ps, /FileMode\]::CreateNew/);
  assert.match(ps, /Get-FileHash -LiteralPath/);
});
test('B01 V9 no known dangerous Android mutations or network',()=>{
  const invocations=[...ps.matchAll(/shell ([^\r\n]+)/g)].map(x=>x[1]);
  assert.ok(invocations.length>3);
  for(const x of invocations) assert.doesNotMatch(x,/\b(pm clear|install|uninstall|force-stop|rm\s|reboot|su|push|pull|settings put|content delete|am force-stop)\b/i);
  assert.doesNotMatch(ps,/Invoke-WebRequest|Start-BitsTransfer|DownloadFile\(|http[s]?:\/\//i);
});
test('B01 V9 report never claims full backup, independent restore, or media coverage',()=>{
  assert.match(ps,/backupCompleteness = 'NOT_VERIFIED'/);
  assert.match(ps,/independentRestore = 'NOT_TESTED'/);
  assert.match(ps,/mediaStoreGalleryCoverage = 'NOT_TESTED'/);
  assert.match(readme,/NEVER upload \.tar/);
  assert.match(cmd,/ExecutionPolicy Bypass/);
});
