import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,chmod,access,copyFile,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspectPartial,headerCheck} from '../scripts/inspect-oneplus-partial-tar.mjs';
import {createHash} from 'node:crypto';
import {parseArgs,selectOneDevice,runBackup} from '../scripts/backup-oneplus-cold-sandbox.mjs';
import {diagnose} from '../scripts/diagnose-oneplus-process-readonly.mjs';
import {classifyPidof,classifyPs} from '../scripts/oneplus-process-probe.mjs';
import {StrictBase64Decoder} from '../scripts/oneplus-strict-base64.mjs';
import {encodedShellArgs,classifyEncodedProbe,isModernAdbClient,hasShellV2Feature} from '../scripts/oneplus-encoded-shell.mjs';
import {inspectEncodedShell} from '../scripts/probe-oneplus-encoded-shell.mjs';
import {Readable} from 'node:stream';

test('strict parsing prevents arguments that could become ADB options',()=>{
 assert.deepEqual(parseArgs(['--dest','E:\\Backup']),{dest:'E:\\Backup',allowForceStop:false});
 assert.deepEqual(parseArgs(['--dest','E:\\Backup','--allow-force-stop']),{dest:'E:\\Backup',allowForceStop:true});
 for(const args of [[],['--dest'],['--dest','--delete'],['--unknown','E:\\Backup'],
                    ['--dest','x','--other','y']])assert.throws(()=>parseArgs(args));
});
test('ADB picks exactly one authorized device',()=>{
 assert.equal(selectOneDevice('List of devices attached\nNE2213 device product:foo\n'),'NE2213');
 for(const list of [
  'List of devices attached\n',
  'List of devices attached\nA device\nB device\n',
  'List of devices attached\nA unauthorized\n',
  'List of devices attached\nA offline\n',
  'List of devices attached\nA	device\nB	unauthorized\n',
  'arbitrary output'
 ])assert.throws(()=>selectOneDevice(list));
});
async function fakeEnvironment(t){
 const root=await mkdtemp(join(tmpdir(),'paseka-cold-test-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const src=join(root,'private'),dest=join(root,'export');
 await mkdir(join(src,'app_webview','Default','IndexedDB','https_localhost_0.indexeddb.leveldb'),{recursive:true});
 await mkdir(dest);
 const payload=Buffer.from([0,1,254,255,12,90]);
 const original=join(src,'app_webview','Default','IndexedDB','https_localhost_0.indexeddb.leveldb','000003.log');
 await writeFile(original,payload);
 const stub=join(root,'adb-fixture');
 const fake=`#!/usr/bin/env node
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const marker=process.env.FAKE_STOP_MARKER;
const args=process.argv.slice(2);
const mode=process.env.FAKE_ADB_MODE||'ok';
if(args[0]==='version') {
 process.stdout.write('Android Debug Bridge version '+(mode==='old_client'?'1.0.32':'1.0.41')+'\\nVersion 37.0.3\\n');process.exit(0);
}
if(args[0]==='devices') {
 process.stdout.write('List of devices attached\\n'+(mode==='many'?'A device\\nB device\\n':'NE2213 device product:test\\n'));process.exit(0);
}
if(args[0]!=='-s'||args[1]!=='NE2213')process.exit(51);
const tail=args.slice(2).join(' ');
if(tail==='features'){
 process.stdout.write(mode==='no_shell_v2'?'stat_v2,cmd\\n':'shell_v2,stat_v2,cmd\\n');process.exit(0);
}
if(tail==='shell pidof ru.paseka.journal'){if(mode==='running' && (!marker||!fs.existsSync(marker))){process.stdout.write('1234\\n');process.exit(0);}process.exit(mode==='psfallback'?0:1);}
if(tail==='shell ps -A'){
 if(mode==='psfallback'){process.stdout.write('USER PID PPID VSZ RSS WCHAN ADDR S NAME\\nuser 123 1 100 100 0 0 S another.app\\n');process.exit(0);}
 process.exit(60);
}
if(tail==='shell ps -A -o NAME') {
 if(mode==='psfallback')process.exit(1);
 process.stdout.write('NAME\\nother.app\\n'+(mode==='remote' && (!marker||!fs.existsSync(marker))?'ru.paseka.journal:remote\\n':''));process.exit(0);
}
if(tail==='shell am force-stop ru.paseka.journal'){
 if(mode==='stop_denied')process.exit(1);
 if(marker)fs.writeFileSync(marker,'yes');
 process.exit(0);
}
if(tail==='shell run-as ru.paseka.journal pwd'){
 if(mode==='denied')process.exit(1);
 process.stdout.write('/data/user/0/ru.paseka.journal\\n');process.exit(0);
}
if(tail==='shell run-as ru.paseka.journal ls -ld app_webview'){
 process.stdout.write('drwx app_webview\\n');process.exit(0);
}
if(mode==='probe_corrupt' && tail.includes('PASEKA_BASE64_PROBE_V1') && !tail.includes('test -d app_webview')){
 if(tail.includes('| base64'))process.stdout.write(Buffer.from('PASEKA_BASE64_PROBE_V1').toString('base64')+'\\n');
 else process.stdout.write('PASEKA_BASE64_PROBE_V1');
 process.exit(0);
}
if(tail==="shell -T run-as ru.paseka.journal sh -c 'set -o pipefail; test -d app_webview || exit 47; printf PASEKA_BASE64_PROBE_V1 | base64'"){
 if(mode==='probe_corrupt'){process.stdout.write('BROKEN');process.exit(0);}
 if(mode==='probe_denied'){process.exit(1);}
 if(mode==='probe_stderr'){process.stderr.write('private diagnostic message');}
 process.stdout.write(Buffer.from('PASEKA_BASE64_PROBE_V1').toString('base64')+'\\n');process.exit(0);
}
if(tail==="shell -T run-as ru.paseka.journal sh -c 'set -o pipefail; test -d app_webview || exit 47; tar -cf - . | base64'"){
 if(mode==='tar_fail') {process.stderr.write('private/internal/file/name');process.exit(4);}
 if(mode==='tar_stderr') {process.stderr.write('private/internal/file/name');}
 if(mode==='tar_tiny') {process.stdout.write(Buffer.from('short').toString('base64'));process.exit(0);}
 if(mode==='tar_partial_failure') {
  process.stdout.write(Buffer.alloc(1024,2).toString('base64'));
  process.stderr.write('private/internal/file/name');process.exit(5);
 }
 const result=spawnSync('tar',['-cf','-','.'],{cwd:process.env.FAKE_PRIVATE_DIR,encoding:null});
 if(result.status!==0)process.exit(5);
 if(mode==='base64_bad') {process.stdout.write('not-valid-base64?');process.exit(0);}
 process.stdout.write(result.stdout.toString('base64'));process.exit(0);
}
process.exit(60);
`;
 await writeFile(stub,fake);await chmod(stub,0o755);
 return {root,src,dest,stub,original,payload};
}
test('fake ADB cold snapshot retains original bytes and writes SHA-matched local tar only', {skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const old=process.env.FAKE_PRIVATE_DIR;process.env.FAKE_PRIVATE_DIR=f.src;
 try{
  const before=await readFile(f.original);
  const result=await runBackup(f.dest,{adbCommand:f.stub});
  assert.equal(result.status,'APP_PRIVATE_COLD_TAR_ARCHIVED_RESTORE_NOT_TESTED');
  assert.equal(result.indexedDbPathEnumerated,true);
  assert.equal(result.independentPhysicalRestoreVerified,false);
  assert.equal(result.installedApplicationChanged,false);
  assert.equal(result.originalsDeleted,false);
  const data=await readFile(join(f.dest,result.file));
  assert.equal(createHash('sha256').update(data).digest('hex'),result.sha256);
  assert.deepEqual(await readFile(f.original),before);
  assert.ok((await readdir(f.dest)).some(x=>x.endsWith('.json')));
  assert.doesNotMatch(JSON.stringify(result),/\/data\/user\/0|private|000003\.log/);
 }finally{
  if(old===undefined)delete process.env.FAKE_PRIVATE_DIR;
  else process.env.FAKE_PRIVATE_DIR=old;
 }
});
test('running app, multiple devices, and denied run-as abort before backup', {skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const old=process.env.FAKE_ADB_MODE;
 try{
  for(const mode of ['running','remote','many','denied']){
   process.env.FAKE_ADB_MODE=mode;
   await assert.rejects(runBackup(f.dest,{adbCommand:f.stub}));
   assert.deepEqual(await readdir(f.dest),[]);
  }
 }finally{if(old===undefined)delete process.env.FAKE_ADB_MODE;else process.env.FAKE_ADB_MODE=old;}
});

test('device detection reports specific safe codes, not private data',()=>{
 const variants=[
  ['List of devices attached\n','ADB_NO_DEVICE'],
  ['List of devices attached\nA device\nB device\n','ADB_MULTIPLE_DEVICES'],
  ['List of devices attached\nNE2213 unauthorized\n','ADB_DEVICE_UNAUTHORIZED'],
  ['List of devices attached\nNE2213 offline\n','ADB_DEVICE_NOT_READY'],
  ['invalid response','ADB_DEVICE_LIST_INVALID']
 ];
 for(const [raw,code] of variants){
  assert.throws(()=>selectOneDevice(raw),error=>error.message===code);
 }
});
test('Windows PowerShell wrapper does not merge native stderr into terminating error records',async()=>{
 const text=await readFile(new URL('../tools/b01-oneplus-cold-backup/choose-backup-destination.ps1',import.meta.url),'utf8');
 assert.match(text,/\$lines\s*=\s*&\s*\$node\s+\$script\s+--dest/);
 assert.doesNotMatch(text,/\$lines\s*=.*2>&1/);
 assert.match(text,/Failure code:/);
 const runner=await readFile(new URL('../scripts/backup-oneplus-cold-sandbox.mjs',import.meta.url),'utf8');
 assert.match(runner,/console\.log\(JSON\.stringify\(\{schema:'paseka-oneplus-cold-sandbox-backup-v1'/);
});

test('targeted force-stop requires opt-in and is reported truthfully', {skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const before={mode:process.env.FAKE_ADB_MODE,marker:process.env.FAKE_STOP_MARKER,private:process.env.FAKE_PRIVATE_DIR};
 const mark=join(f.root,'force-stop-consent-marker');
 try{
  process.env.FAKE_ADB_MODE='running';
  process.env.FAKE_STOP_MARKER=mark;
  process.env.FAKE_PRIVATE_DIR=f.src;
  await assert.rejects(runBackup(f.dest,{adbCommand:f.stub}),/APP_MUST_BE_STOPPED_MANUALLY/);
  await assert.rejects(access(mark));
  assert.deepEqual(await readdir(f.dest),[]);
  const result=await runBackup(f.dest,{adbCommand:f.stub,allowForceStop:true});
  assert.equal(result.status,'APP_PRIVATE_COLD_TAR_ARCHIVED_RESTORE_NOT_TESTED');
  assert.equal(result.deviceForcedStopped,true);
  assert.equal(result.originalsDeleted,false);
  assert.equal((await readFile(mark,'utf8')),'yes');
  assert.deepEqual(await readFile(f.original),f.payload);
 }finally{
  for(const [key,value] of Object.entries({FAKE_ADB_MODE:before.mode,FAKE_STOP_MARKER:before.marker,FAKE_PRIVATE_DIR:before.private})){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
test('an already stopped app must never be force-stopped even with opt-in',{skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const before={mode:process.env.FAKE_ADB_MODE,marker:process.env.FAKE_STOP_MARKER,private:process.env.FAKE_PRIVATE_DIR};
 const mark=join(f.root,'unexpected-stop');
 try{
  process.env.FAKE_ADB_MODE='ok';
  process.env.FAKE_STOP_MARKER=mark;
  process.env.FAKE_PRIVATE_DIR=f.src;
  const result=await runBackup(f.dest,{adbCommand:f.stub,allowForceStop:true});
  assert.equal(result.deviceForcedStopped,false);
  await assert.rejects(access(mark));
 }finally{
  for(const [key,value] of Object.entries({FAKE_ADB_MODE:before.mode,FAKE_STOP_MARKER:before.marker,FAKE_PRIVATE_DIR:before.private})){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
test('GUI consent defaults to No and applies only to the target package',async()=>{
 const ps=await readFile(new URL('../tools/b01-oneplus-cold-backup/choose-backup-destination.ps1',import.meta.url),'utf8');
 assert.match(ps,/MessageBoxDefaultButton\]::Button2/);
 assert.match(ps,/DialogResult\]::Yes/);
 assert.match(ps,/--allow-force-stop/);
 const script=await readFile(new URL('../scripts/backup-oneplus-cold-sandbox.mjs',import.meta.url),'utf8');
 assert.match(script,/\['shell','am','force-stop',PACKAGE\]/);
 assert.doesNotMatch(script,/\['shell','pm','clear'/);
});

test('read-only process diagnosis reports two distinct signals without ADB mutations',{skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const previous={mode:process.env.FAKE_ADB_MODE,mark:process.env.FAKE_STOP_MARKER};
 const marker=join(f.root,'must-not-create-stop-marker');
 try {
  process.env.FAKE_ADB_MODE='remote';process.env.FAKE_STOP_MARKER=marker;
  const report=await diagnose({adb:f.stub,pauseMs:1});
  assert.equal(report.schema,'paseka-oneplus-process-readonly-diagnostic-v1');
  assert.equal(report.status,'PROCESS_STATE_CONFLICT');
  assert.equal(report.first.pidof.state,'ABSENT');
  assert.equal(report.first.ps.state,'PRESENT');
  assert.equal(report.runAsAvailable,true);
  assert.equal(report.appWebviewAccessible,true);
  assert.equal(report.forceStopAttempted,false);
  assert.equal(report.archiveAttempted,false);
  assert.equal(report.phoneDataModified,false);
  await assert.rejects(access(marker));
  assert.deepEqual(await readdir(f.dest),[]);
  assert.ok(!JSON.stringify(report).includes(f.root));
 }finally {
  if(previous.mode===undefined)delete process.env.FAKE_ADB_MODE;else process.env.FAKE_ADB_MODE=previous.mode;
  if(previous.mark===undefined)delete process.env.FAKE_STOP_MARKER;else process.env.FAKE_STOP_MARKER=previous.mark;
 }
});
test('stopped app is diagnosed, with no archive and no force-stop',{skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const prev=process.env.FAKE_ADB_MODE;process.env.FAKE_ADB_MODE='ok';
 try{
  const r=await diagnose({adb:f.stub,pauseMs:1});
  assert.equal(r.status,'PROCESS_STATE_MEASURED');
  assert.equal(r.second.pidof.state,'ABSENT');
  assert.equal(r.second.ps.state,'ABSENT');
  assert.equal(r.independentRestoreVerified,false);
  assert.deepEqual(await readdir(f.dest),[]);
 }finally{if(prev===undefined)delete process.env.FAKE_ADB_MODE;else process.env.FAKE_ADB_MODE=prev;}
});
test('diagnostic Windows kit never calls force-stop or archive',async()=>{
 const ps=await readFile(new URL('../tools/b01-oneplus-cold-backup/run-diagnosis.ps1',import.meta.url),'utf8');
 const runner=await readFile(new URL('../scripts/diagnose-oneplus-process-readonly.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(ps,/--allow-force-stop|pm clear|uninstall/i);
 assert.doesNotMatch(runner,/am','force-stop|exec-out|tar','-cf|writeFile|unlink/i);
 assert.match(ps,/diagnose-oneplus-process-readonly\.mjs/);
});

test('Android process output variants are parsed fail-closed',()=>{
 assert.equal(classifyPidof({code:0,output:''}).reason,'EMPTY_SUCCESS');
 assert.equal(classifyPidof({code:1,output:''}).state,'ABSENT');
 assert.equal(classifyPidof({code:0,output:'15 22\n'}).state,'PRESENT');
 assert.equal(classifyPidof({code:127,output:''}).state,'UNKNOWN');
 assert.equal(classifyPs({code:1,output:''}).state,'UNKNOWN');
 assert.equal(classifyPs({code:0,output:'NAME\nother.app\nru.paseka.journal:remote\n'},'names').state,'PRESENT');
 assert.equal(classifyPs({code:0,output:'USER PID PPID VSZ RSS WCHAN ADDR S NAME\nu0_a42 123 1 99 99 0 0 S com.example.app\n'},'full').state,'ABSENT');
 assert.equal(classifyPs({code:0,output:''},'full').state,'UNKNOWN');
});

test('Android toybox ps -o NAME unsupported and empty-success pidof: full ps fallback proves stopped safely',{skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const before={mode:process.env.FAKE_ADB_MODE,private:process.env.FAKE_PRIVATE_DIR};
 try {
   process.env.FAKE_ADB_MODE='psfallback';process.env.FAKE_PRIVATE_DIR=f.src;
   const diag=await diagnose({adb:f.stub,pauseMs:1});
   assert.equal(diag.status,'PROCESS_STATE_MEASURED');
   assert.equal(diag.first.state,'ABSENT');
   assert.equal(diag.first.pidof.reason,'EMPTY_SUCCESS');
   assert.equal(diag.first.ps.state,'UNKNOWN');
   assert.equal(diag.first.psFallback.state,'ABSENT');
   const b=await runBackup(f.dest,{adbCommand:f.stub});
   assert.equal(b.status,'APP_PRIVATE_COLD_TAR_ARCHIVED_RESTORE_NOT_TESTED');
   assert.equal(b.deviceForcedStopped,false);
   assert.deepEqual(await readFile(f.original),f.payload);
 }finally {
  if(before.mode===undefined)delete process.env.FAKE_ADB_MODE;else process.env.FAKE_ADB_MODE=before.mode;
  if(before.private===undefined)delete process.env.FAKE_PRIVATE_DIR;else process.env.FAKE_PRIVATE_DIR=before.private;
 }
});

test('nonzero Android tar exit is reported with safe stage and bytes, private stderr withheld',{skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const old={mode:process.env.FAKE_ADB_MODE,private:process.env.FAKE_PRIVATE_DIR};
 try {
  process.env.FAKE_PRIVATE_DIR=f.src;
  for (const mode of ['tar_fail','tar_partial_failure','tar_tiny']) {
   process.env.FAKE_ADB_MODE=mode;
   await assert.rejects(runBackup(f.dest,{adbCommand:f.stub}),err=>{
     assert.ok(['ANDROID_TAR_COMMAND_FAILED','ANDROID_TAR_EMPTY_OR_TOO_SMALL','ANDROID_TAR_ALIGNMENT_INVALID'].includes(err.message));
     assert.equal(err.safeEvidence.stage,'ANDROID_TAR_TRANSFER');
     assert.equal(typeof err.safeEvidence.transferredBytes,'number');
     assert.equal(err.safeEvidence.stderrSeen,mode!=='tar_tiny');
     assert.equal(err.safeEvidence.stderrCategory,mode==='tar_tiny'?'NONE':'OTHER_REDACTED');
     assert.ok(!JSON.stringify(err.safeEvidence).includes('private/internal'));
     return true;
   });
   assert.ok((await readdir(f.dest)).every(name=>name.endsWith('.tar.partial')));
   assert.deepEqual(await readFile(f.original),f.payload);
  }
 } finally {
  if(old.mode===undefined)delete process.env.FAKE_ADB_MODE;else process.env.FAKE_ADB_MODE=old.mode;
  if(old.private===undefined)delete process.env.FAKE_PRIVATE_DIR;else process.env.FAKE_PRIVATE_DIR=old.private;
 }
});
test('physical failure code remains specific in Windows stdout JSON, not raw stderr',async()=>{
 const source=await readFile(new URL('../scripts/backup-oneplus-cold-sandbox.mjs',import.meta.url),'utf8');
 assert.match(source,/evidence:e\.safeEvidence\|\|null/);
 assert.doesNotMatch(source,/console\.error\(.*stderr/i);
 assert.match(source,/ANDROID_TAR_COMMAND_FAILED/);
 assert.match(source,/ANDROID_TAR_ALIGNMENT_INVALID/);
});

test('Windows wrapper exposes only redacted TAR failure category and counts',async()=>{
 const ps=await readFile(new URL('../tools/b01-oneplus-cold-backup/choose-backup-destination.ps1',import.meta.url),'utf8');
 assert.match(ps,/Tar exit code:/);
 assert.match(ps,/Bytes received:/);
 assert.match(ps,/Tar stderr category:/);
 assert.match(ps,/Private stderr, filenames and source paths are intentionally withheld/);
});

test('read-only TAR inspector distinguishes complete TAR, nonaligned extra bytes and truncated data',{skip:process.platform==='win32'},async t=>{
 const root=await mkdtemp(join(tmpdir(),'paseka-partial-tar-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const source=join(root,'src');await mkdir(source);
 await writeFile(join(source,'data.bin'),Buffer.alloc(8000,7));
 const good=join(root,'good.tar.partial');
 execFileSync('tar',['-cf',good,'-C',source,'.']);
 const original=await readFile(good);
 const verified=await inspectPartial(good);
 assert.equal(verified.status,'TAR_STRUCTURE_CHECKED_LOCAL_ONLY');
 assert.equal(verified.endMarkerFound,true);
 assert.equal(verified.reason,null);
 assert.equal(verified.contentsExtracted,false);
 assert.equal(verified.originalsChanged,false);
 const junk=join(root,'extra.tar.partial');
 await copyFile(good,junk);
 await appendFile(junk,Buffer.alloc(230,33));
 const extra=await inspectPartial(junk);
 assert.equal(extra.status,'TAR_INCOMPLETE_OR_INVALID');
 assert.equal(extra.remainder512,230);
 assert.equal(extra.reason,'NONZERO_DATA_AFTER_TAR_END');
 assert.equal(extra.endMarkerFound,true);
 const truncated=join(root,'trunc.tar.partial');
 await writeFile(truncated,original.subarray(0,600));
 const broken=await inspectPartial(truncated);
 assert.equal(broken.status,'TAR_INCOMPLETE_OR_INVALID');
 assert.equal(broken.endMarkerFound,false);
 await assert.rejects(inspectPartial(join(root,'missing.tar.partial')));
 assert.deepEqual(await readFile(good),original);
});
test('tampered TAR header is rejected by checksum without disclosing archived filenames',()=>{
 const buf=Buffer.alloc(512,0);
 buf.write('private-customer-record',0,'ascii');
 const c=headerCheck(buf);
 assert.equal(c.valid,false);
 assert.equal(c.reason,'INVALID_HEADER_CHECKSUM_FIELD');
});

test('offline forensic TAR resync finds a 230-byte inserted segment without changing original',{skip:process.platform==='win32'},async t=>{
 const root=await mkdtemp(join(tmpdir(),'paseka-tar-shift-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const src=join(root,'src');await mkdir(src);
 await writeFile(join(src,'first.bin'),Buffer.alloc(64,21));
 await writeFile(join(src,'second.bin'),Buffer.alloc(45,99));
 const tar=join(root,'original.tar.partial');
 execFileSync('tar',['-cf',tar,'-C',src,'.']);
 const original=await readFile(tar);
 // A GNU tar with root-dir header and first-file header. Walk to the
 // second file header without relying on filename disclosure.
 let offset=0;
 for(let n=0;n<2;n++){
  const h=headerCheck(original.subarray(offset,offset+512));
  assert.equal(h.valid,true);
  offset+=512+Math.ceil(h.payload/512)*512;
 }
 assert.equal(headerCheck(original.subarray(offset,offset+512)).valid,true);
 const shifted=join(root,'shifted.tar.partial');
 const injected=Buffer.alloc(230,0x51);
 await writeFile(shifted,Buffer.concat([original.subarray(0,offset),injected,original.subarray(offset)]));
 const out=await inspectPartial(shifted);
 assert.equal(out.status,'TAR_INCOMPLETE_OR_INVALID');
 assert.equal(out.reason,'INVALID_HEADER_CHECKSUM_FIELD');
 assert.equal(out.invalidHeaderOffset,offset);
 assert.ok(out.resyncCandidateShifts.includes(230));
 assert.equal(out.headersVerified,2);
 assert.equal(out.remainder512,230);
 assert.equal(out.contentsExtracted,false);
 assert.deepEqual(await readFile(tar),original);
});
test('offline partial inspector exposes no archive names in JSON',{skip:process.platform==='win32'},async t=>{
 const root=await mkdtemp(join(tmpdir(),'paseka-tar-private-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const src=join(root,'src');await mkdir(src);
 const privateFile='not-for-chat-private-apiary-events.txt';
 await writeFile(join(src,privateFile),'private');
 const tar=join(root,'local.tar.partial');
 execFileSync('tar',['-cf',tar,'-C',src,'.']);
 const report=JSON.stringify(await inspectPartial(tar));
 assert.ok(!report.includes(privateFile));
 assert.ok(!report.includes(src));
});

test('forensic tracer follows two independent +1 header shifts without restoring or editing',{skip:process.platform==='win32'},async t=>{
 const root=await mkdtemp(join(tmpdir(),'paseka-trace-drift-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const src=join(root,'src');await mkdir(src);
 for(let i=0;i<5;i++)await writeFile(join(src,'file-'+i+'.bin'),Buffer.alloc(10+i,51));
 const p=join(root,'original.tar.partial');
 execFileSync('tar',['-cf',p,'-C',src,'.']);
 const original=await readFile(p);
 const headerOffsets=[];
 for(let pos=0;pos+512<=original.length;){
  const h=headerCheck(original.subarray(pos,pos+512));
  assert.equal(h.valid,true);
  if(h.zero)break;
  headerOffsets.push(pos);
  pos+=512+Math.ceil(h.payload/512)*512;
 }
 assert.ok(headerOffsets.length>=5);
 const offsetA=headerOffsets[2],offsetB=headerOffsets[4];
 const shifted=Buffer.concat([
  original.subarray(0,offsetA),Buffer.from([0x41]),
  original.subarray(offsetA,offsetB),Buffer.from([0x42]),
  original.subarray(offsetB)
 ]);
 const target=join(root,'twoshifts.tar.partial');
 await writeFile(target,shifted);
 const report=await inspectPartial(target);
 assert.equal(report.status,'TAR_INCOMPLETE_OR_INVALID');
 assert.equal(report.invalidHeaderOffset,offsetA);
 assert.equal(report.driftTrace.shiftEvents,2);
 assert.equal(report.driftTrace.netShift,2);
 assert.equal(report.driftTrace.result,'SHIFTED_END_MARKERS_FOUND_NOT_A_BACKUP');
 assert.deepEqual(report.driftTrace.sampleOffsets,[{expectedOffset:offsetA,relativeShift:1},{expectedOffset:offsetB+1,relativeShift:1}]);
 assert.equal(report.contentsExtracted,false);
 assert.equal(report.sourceModified,false);
 assert.deepEqual(await readFile(p),original);
});

test('strict base64 decoder works across arbitrary chunks, tolerates CRLF, and rejects inserted bytes',async()=>{
 const payload=Buffer.concat([Buffer.alloc(5000,0),Buffer.from([0,10,13,255]),Buffer.alloc(128,255)]);
 const encoded=payload.toString('base64').replace(/.{76}/g,'$&\r\n');
 const chunks=[];
 for(let i=0;i<encoded.length;i+=7)chunks.push(Buffer.from(encoded.slice(i,i+7),'latin1'));
 async function decode(items){
  const outputs=[];for await(const chunk of Readable.from(items).pipe(new StrictBase64Decoder()))outputs.push(chunk);
  return Buffer.concat(outputs);
 }
 assert.deepEqual(await decode(chunks),payload);
 await assert.rejects(decode([Buffer.from(encoded.slice(0,40)+'?'+encoded.slice(40))]),/BASE64_TRANSPORT_CORRUPTED/);
 await assert.rejects(decode([Buffer.from(encoded.slice(0,encoded.length-1))]),/BASE64_TRANSPORT_TRUNCATED/);
 await assert.rejects(decode([Buffer.from('YQ==YQ==')]),/BASE64_TRANSPORT_CORRUPTED/);
});
test('simulated invalid encoded ADB TAR is never promoted into a backup',{skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const old={mode:process.env.FAKE_ADB_MODE,private:process.env.FAKE_PRIVATE_DIR};
 try{
  process.env.FAKE_ADB_MODE='base64_bad';process.env.FAKE_PRIVATE_DIR=f.src;
  await assert.rejects(runBackup(f.dest,{adbCommand:f.stub}),err=>{
   assert.equal(err.message,'BASE64_TRANSPORT_INVALID');
   assert.ok(err.safeEvidence.encodedBytes>0);
   assert.equal(err.safeEvidence.transferredBytes,0);
   assert.equal(err.safeEvidence.transportReason,'BASE64_TRANSPORT_INVALID_CHAR');
   assert.ok(!JSON.stringify(err.safeEvidence).includes('private'));
   return true;
  });
  assert.ok((await readdir(f.dest)).every(x=>x.endsWith('.partial')));
  assert.deepEqual(await readFile(f.original),f.payload);
 }finally{
  if(old.mode===undefined)delete process.env.FAKE_ADB_MODE;else process.env.FAKE_ADB_MODE=old.mode;
  if(old.private===undefined)delete process.env.FAKE_PRIVATE_DIR;else process.env.FAKE_PRIVATE_DIR=old.private;
 }
});

test('numbered BASE64 errors are reported in Windows CLI rather than generic DEVICE_BACKUP_BLOCKED',async()=>{
 const code=await readFile(new URL('../scripts/backup-oneplus-cold-sandbox.mjs',import.meta.url),'utf8');
 const ps=await readFile(new URL('../tools/b01-oneplus-cold-backup/choose-backup-destination.ps1',import.meta.url),'utf8');
 assert.match(code,/\^\[A-Z\]\[A-Z0-9_\]\*\$/);
 assert.match(ps,/Base64 input bytes:/);
 assert.match(ps,/Base64 failure reason:/);
});

test('encoded transport preflight is read-only and refuses mismatch before any TAR file',{skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const old=process.env.FAKE_ADB_MODE;
 try{
  for(const [mode,expected] of [['probe_corrupt','BASE64_PREFLIGHT_DIFFERENT_BASE64'],['probe_denied','BASE64_PREFLIGHT_COMMAND_FAILED']]){
   process.env.FAKE_ADB_MODE=mode;
   await assert.rejects(runBackup(f.dest,{adbCommand:f.stub}),err=>err.message===expected);
   assert.deepEqual(await readdir(f.dest),[]);
  }
  assert.deepEqual(await readFile(f.original),f.payload);
 }finally{
  if(old===undefined)delete process.env.FAKE_ADB_MODE;else process.env.FAKE_ADB_MODE=old;
 }
});

test('ADB Shell v2 -T preserves quoted complete sh -c, no exec-out fallback',()=>{
 const probe=encodedShellArgs('NE2213','probe');
 const archive=encodedShellArgs('NE2213','archive');
 assert.deepEqual(probe.slice(2,4),['shell','-T']);
 assert.deepEqual(archive.slice(2,4),['shell','-T']);
 assert.equal(probe.includes('exec-out'),false);
 assert.equal(archive.includes('exec-out'),false);
 assert.match(probe.at(-1),/^'set -o pipefail; test -d app_webview/);
 assert.match(probe.at(-1),/base64'$/);
 assert.match(archive.at(-1),/^'set -o pipefail; test -d app_webview/);
 assert.match(archive.at(-1),/tar -cf - \. \| base64'$/);
 assert.equal(archive[archive.length-2],'-c');
 assert.equal(archive.filter(x=>x==='tar').length,0);
 assert.throws(()=>encodedShellArgs('NE2213;rm -rf /','archive'),/INVALID_DEVICE_SERIAL/);
 assert.throws(()=>encodedShellArgs('NE2213','other'),/INVALID_ENCODED_COMMAND/);
});
test('read-only quoted Android shell probe reports safe measurements and never TAR',{skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const saved=process.env.FAKE_ADB_MODE;
 try{
  process.env.FAKE_ADB_MODE='ok';
  const success=await inspectEncodedShell({adb:f.stub});
  assert.equal(success.status,'PASS');
  assert.equal(success.privateDataRead,false);
  assert.equal(success.backupAttempted,false);
  assert.deepEqual(await readdir(f.dest),[]);
  for(const [mode,reason] of [['probe_corrupt','BASE64_PREFLIGHT_DIFFERENT_BASE64'],
                               ['probe_denied','BASE64_PREFLIGHT_COMMAND_FAILED']]){
   process.env.FAKE_ADB_MODE=mode;
   const bad=await inspectEncodedShell({adb:f.stub});
   assert.equal(bad.status,'BLOCKED');
   assert.equal(bad.reason,reason);
   assert.equal(bad.backupAttempted,false);
   assert.deepEqual(await readdir(f.dest),[]);
  }
 }finally{
  if(saved===undefined)delete process.env.FAKE_ADB_MODE;else process.env.FAKE_ADB_MODE=saved;
 }
});
test('safe classification reports only shape and never echoes probe output',()=>{
 const result=classifyEncodedProbe({code:0,output:'NOT PRIVATE/USER/PATH??'});
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'BASE64_PREFLIGHT_NON_BASE64_OUTPUT');
 assert.equal(result.privateDataRead,false);
 assert.equal(JSON.stringify(result).includes('PRIVATE/USER/PATH'),false);
});

test('Shell v2 preflight never accepts remote stderr or output with extra text',()=>{
 const expected=Buffer.from('PASEKA_BASE64_PROBE_V1').toString('base64');
 assert.equal(classifyEncodedProbe({code:0,output:expected+'\n'}).status,'PASS');
 const stderr=classifyEncodedProbe({code:0,output:expected+'\n',stderrBytes:38});
 assert.equal(stderr.status,'BLOCKED');
 assert.equal(stderr.reason,'BASE64_PREFLIGHT_REMOTE_STDERR');
 assert.equal(stderr.stderrSeen,true);
 assert.equal(classifyEncodedProbe({code:0,output:'noise?\n'+expected}).reason,'BASE64_PREFLIGHT_NON_BASE64_OUTPUT');
});
test('failed public probe executes no matrix and never accesses private files',{skip:process.platform==='win32'},async t=>{
 const env=await fakeEnvironment(t);
 const saved=process.env.FAKE_ADB_MODE;
 try{
  for(const [mode,reason] of [['probe_corrupt','BASE64_PREFLIGHT_DIFFERENT_BASE64'],
                               ['probe_denied','BASE64_PREFLIGHT_COMMAND_FAILED'],
                               ['probe_stderr','BASE64_PREFLIGHT_REMOTE_STDERR']]){
   process.env.FAKE_ADB_MODE=mode;
   const report=await inspectEncodedShell({adb:env.stub});
   assert.equal(report.status,'BLOCKED');
   assert.equal(report.reason,reason);
   assert.deepEqual(report.variants,[]);
   assert.equal(report.allPrivateReadsAvoided,true);
   assert.deepEqual(await readdir(env.dest),[]);
   assert.deepEqual(await readFile(env.original),env.payload);
  }
 }finally{if(saved===undefined)delete process.env.FAKE_ADB_MODE;else process.env.FAKE_ADB_MODE=saved;}
});
test('remote TAR stderr is never mixed into valid Base64 or promoted into backup',{skip:process.platform==='win32'},async t=>{
 const env=await fakeEnvironment(t);
 const saved={mode:process.env.FAKE_ADB_MODE,src:process.env.FAKE_PRIVATE_DIR};
 try{
  process.env.FAKE_ADB_MODE='tar_stderr';process.env.FAKE_PRIVATE_DIR=env.src;
  await assert.rejects(runBackup(env.dest,{adbCommand:env.stub}),err=>{
   assert.equal(err.message,'ANDROID_TAR_REMOTE_STDERR');
   assert.equal(err.safeEvidence.stderrSeen,true);
   assert.ok(err.safeEvidence.transferredBytes>0);
   assert.ok(!JSON.stringify(err.safeEvidence).includes('private/internal/file/name'));
   return true;
  });
  assert.equal((await readdir(env.dest)).every(x=>x.endsWith('.partial')),true);
  assert.deepEqual(await readFile(env.original),env.payload);
 }finally{
  if(saved.mode===undefined)delete process.env.FAKE_ADB_MODE;else process.env.FAKE_ADB_MODE=saved.mode;
  if(saved.src===undefined)delete process.env.FAKE_PRIVATE_DIR;else process.env.FAKE_PRIVATE_DIR=saved.src;
 }
});

test('public host ADB version + negotiated shell_v2 feature are mandatory',()=>{
 for(const old of ['Android Debug Bridge version 1.0.31','Android Debug Bridge version 1.0.40',
                   "untrusted binary","/system/bin/sh: chvt: can't find tty"]){
  assert.equal(isModernAdbClient(old),false);
 }
 assert.equal(isModernAdbClient('Android Debug Bridge version 1.0.41\nVersion 37.0.3'),true);
 assert.equal(hasShellV2Feature('shell_v2,stat_v2,cmd\n'),true);
 assert.equal(hasShellV2Feature('cmd,stat_v2'),false);
});
test('legacy host adb and missing device shell_v2 reject before TAR or original reads',{skip:process.platform==='win32'},async t=>{
 const f=await fakeEnvironment(t);
 const saved=process.env.FAKE_ADB_MODE;
 try{
  for(const [mode,code] of [['old_client','ADB_HOST_CLIENT_INCOMPATIBLE'],
                            ['no_shell_v2','ADB_DEVICE_NO_SHELL_V2']]){
   process.env.FAKE_ADB_MODE=mode;
   await assert.rejects(runBackup(f.dest,{adbCommand:f.stub}),error=>error.message===code);
   await assert.rejects(inspectEncodedShell({adb:f.stub}),error=>error.message===code);
   assert.deepEqual(await readdir(f.dest),[]);
   assert.deepEqual(await readFile(f.original),f.payload);
  }
 }finally{
  if(saved===undefined)delete process.env.FAKE_ADB_MODE;else process.env.FAKE_ADB_MODE=saved;
 }
});
test('Windows kit prefers separately installed Google adb ahead of stale PATH',async()=>{
 const ps=await readFile(new URL('../tools/b01-oneplus-cold-backup/choose-backup-destination.ps1',import.meta.url),'utf8');
 const file=await readFile(new URL('../tools/b01-oneplus-cold-backup/GET-OFFICIAL-ADB.txt',import.meta.url),'utf8');
 const local=ps.indexOf("Join-Path $PSScriptRoot 'platform-tools");
 const sdk=ps.indexOf("Join-Path $env:LOCALAPPDATA 'Android");
 const path=ps.indexOf('Get-Command adb.exe');
 assert.ok(local>=0 && sdk>local && path>sdk);
 assert.match(ps,/ADB_HOST_CLIENT_INCOMPATIBLE/);
 assert.match(file,/developer.android.com\/tools\/releases\/platform-tools/);
 assert.match(file,/AdbWinApi\.dll/);
 assert.doesNotMatch(ps,/Invoke-WebRequest|DownloadFile|curl/);
});
