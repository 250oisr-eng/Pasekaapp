import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs,selectOneDevice,runBackup} from '../scripts/backup-oneplus-cold-sandbox.mjs';

test('strict parsing prevents arguments that could become ADB options',()=>{
 assert.deepEqual(parseArgs(['--dest','E:\\Backup']),{dest:'E:\\Backup'});
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
const args=process.argv.slice(2);
const mode=process.env.FAKE_ADB_MODE||'ok';
if(args[0]==='devices') {
 process.stdout.write('List of devices attached\\n'+(mode==='many'?'A device\\nB device\\n':'NE2213 device product:test\\n'));process.exit(0);
}
if(args[0]!=='-s'||args[1]!=='NE2213')process.exit(51);
const tail=args.slice(2).join(' ');
if(tail==='shell pidof ru.paseka.journal')process.exit(mode==='running'?0:1);
if(tail==='shell ps -A -o NAME') {
 process.stdout.write('NAME\\n'+(mode==='remote'?'ru.paseka.journal:remote\\n':''));process.exit(0);
}
if(tail==='shell run-as ru.paseka.journal pwd'){
 if(mode==='denied')process.exit(1);
 process.stdout.write('/data/user/0/ru.paseka.journal\\n');process.exit(0);
}
if(tail==='shell run-as ru.paseka.journal ls -ld app_webview'){
 process.stdout.write('drwx app_webview\\n');process.exit(0);
}
if(tail==='exec-out run-as ru.paseka.journal tar -cf - .'){
 if(mode==='tar_fail')process.exit(4);
 const result=spawnSync('tar',['-cf','-','.'],{cwd:process.env.FAKE_PRIVATE_DIR,encoding:null});
 if(result.status!==0)process.exit(5);
 process.stdout.write(result.stdout);process.exit(0);
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
