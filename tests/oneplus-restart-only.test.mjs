import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {summarizeDiagnosticLine} from '../tools/oneplus-recovery/inspect-restart-only.mjs';
const PACKAGE='ru.paseka.journal.disasterproof2';
const common={schema:'paseka-oneplus-p0-disaster-v1',packageId:PACKAGE,
 isolated:true,productionApp:'NOT_ACCESSED',productionDatabase:'NOT_ACCESSED',
 originalVideos:'NOT_ACCESSED',autoDelete:'NOT_ATTEMPTED'};
const line=payload=>'I/chromium(12): PASEKA_P0_DISASTER_PROOF_RESULT '+JSON.stringify(payload);
test('fresh isolated second-stage proof is recognized only for correct exact package and scope',()=>{
 const p={...common,status:'PASS',code:'P0_DISASTER_PHYSICAL_RESTART_PASS'};
 assert.deepEqual(summarizeDiagnosticLine(line(p)),{kind:'RESTART_PASS'});
 for(const q of [
  {...p,packageId:'ru.paseka.journal'},
  {...p,productionDatabase:'ACCESSED'},
  {...p,originalVideos:'ACCESSED'},
  {...p,code:'P0_DISASTER_WEBVIEW_RESTORE_PASS'},
  {...p,isolated:false}
 ])assert.equal(summarizeDiagnosticLine(line(q)),null);
});
test('internal BLOCKED returns ONLY allowlisted reason, never raw error stack',()=>{
 const p={...common,status:'BLOCKED',code:'P0_DISASTER_PROOF_FAILED',
  detail:'Error: App database not available\nuser-secret-should-not-appear',
  checks:[{name:'error',status:'BLOCKED',detail:'private contents'}]};
 const result=summarizeDiagnosticLine(line(p));
 assert.deepEqual(result,{kind:'DEVICE_RESTART_BLOCKED',
  reason:'APP_DATABASE_BOOTSTRAP_UNAVAILABLE',failedCheckNames:['error']});
 assert.doesNotMatch(JSON.stringify(result),/secret|private/);
 const unknown=summarizeDiagnosticLine(line({...p,detail:'secret only'}));
 assert.equal(unknown.reason,'UNCLASSIFIED_DEVICE_ERROR');
});
test('unparseable/truncated logcat tag never counts as a PASS',()=>{
 assert.equal(summarizeDiagnosticLine('unrelated android log'),null);
 assert.deepEqual(summarizeDiagnosticLine('I/chromium: PASEKA_P0_DISASTER_PROOF_RESULT {"status":"PASS"'),
  {kind:'DIAGNOSTIC_TAG_UNPARSEABLE'});
});
test('Windows restart-only CMD and runtime never install, erase or access production',async()=>{
 const cmd=await readFile(new URL('../tools/oneplus-recovery/ПРОВЕРИТЬ-ПЕРЕЗАПУСК-БЕЗ-УСТАНОВКИ.cmd',import.meta.url),'utf8');
 const runner=await readFile(new URL('../tools/oneplus-recovery/inspect-restart-only.mjs',import.meta.url),'utf8');
 assert.match(cmd,/ONEPLUS-RESTART-ONLY-RESULT\.json/);
 assert.match(cmd,/inspect-restart-only\.mjs/);
 assert.match(runner,/parsePackagePresence\(p,PACKAGE\)/);
 assert.match(runner,/\['-d','shell','am','force-stop',PACKAGE\]/);
 assert.match(runner,/\['-d','shell','am','start','-n',PACKAGE\+'\/\.MainActivity'\]/);
 assert.doesNotMatch(runner,/command\(adb,\['-d','(?:install|uninstall|push|pull|reboot)'/);
 assert.doesNotMatch(runner,/pm','clear|deleteDatabase|rm -rf|process\.env\.ADB_SERIAL/);
 assert.match(runner,/writeFile\(resolve\(HERE,REPORT\),JSON\.stringify\(report,null,2\)\+'\\n',\{flag:'wx'\}\)/);
 const yml=await readFile(new URL('../.github/workflows/android-disaster-physical.yml',import.meta.url),'utf8');
 assert.match(yml,/Copy-Item 'tools\/oneplus-recovery\/inspect-restart-only\.mjs' 'oneplus-kit\/'/);
 assert.match(yml,/Copy-Item 'tools\/oneplus-recovery\/ПРОВЕРИТЬ-ПЕРЕЗАПУСК-БЕЗ-УСТАНОВКИ\.cmd' 'oneplus-kit\/'/);
});
