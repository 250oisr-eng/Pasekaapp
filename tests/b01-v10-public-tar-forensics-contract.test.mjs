import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const script=readFileSync(join(root,'tools/b01-oneplus-safe-v9/B01-PUBLIC-TAR-FORENSIC-V10.ps1'),'utf8');
const cmd=readFileSync(join(root,'tools/b01-oneplus-safe-v9/START-PUBLIC-FORENSIC-ONLY.cmd'),'utf8');
test('B01 V10 is PC-only: no adb or device process invocation',()=>{
  assert.match(script,/param\(\[string\]\$ArchivePath = ''\)/);
  assert.doesNotMatch(script,/Invoke-ProcessCapture|adb\.exe|adb\s+shell|run-as|pm clear|force-stop|adb push|adb pull/i);
  assert.doesNotMatch(script,/Invoke-WebRequest|Start-BitsTransfer|DownloadFile\(|Start-Process|\&\s*\$adb|https?:\/\//i);
  assert.match(script,/Get-Item -LiteralPath \$ArchivePath/);
  assert.match(script,/\$item\.Name -cne 'public-only-v9\.tar'/);
  assert.match(script,/SYMLINK_NOT_ALLOWED/);
});
test('B01 V10 bounded read and independent no-export status',()=>{
  assert.match(script,/64 \* 1024 \* 1024/);
  assert.match(script,/PUBLIC_TAR_EXCEEDS_64_MIB/);
  assert.match(script,/SOURCE_FILE_CHANGED_DURING_READ/);
  assert.match(script,/fullBackupVerified = \$false/);
  assert.match(script,/independentRestore = 'NOT_TESTED'/);
  assert.match(script,/privateAppData = 'NOT_READ'/);
  assert.match(script,/tarExtract = 'NOT_ATTEMPTED'/);
  assert.match(script,/network = 'NOT_ATTEMPTED'/);
});
test('B01 V10 classifies block alignment and excludes raw user/source data',()=>{
  for(const x of ['remainder512','firstHeaderChecksum','zeroBlockCount','tailPrintableAscii','EMPTY_TAR_EOF_PLUS_UNALIGNED_TRAILER','NONZERO_AFTER_TAR_EOF','BAD_HEADER']) {
    assert.ok(script.includes(x),x);
  }
  assert.match(script,/archivePath = 'REDACTED'/);
  assert.match(script,/public-tar-v10-/);
  assert.doesNotMatch(script,/Write-Host .*\$tail|archivePath\s*=\s*\$ArchivePath|ConvertTo-Json -InputObject \$bytes/);
  assert.match(cmd,/B01-PUBLIC-TAR-FORENSIC-V10\.ps1/);
});
