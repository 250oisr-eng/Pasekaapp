#!/usr/bin/env python3
"""Real pwsh with synthetic ADB: create-only run-as private input, never overwrite."""
import hashlib,os,subprocess,tempfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
ps=(root/'tools/android-restore335-modern-adb-exclusive-stage.ps1').read_text(encoding='utf-8')
sha_source='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
sha_adb='bae5ce98846b19caa74a34900850caa8b21d01976932b2ad83baeb5de5651aee'
source=b'PASEKA01'+bytes(range(256))*12+bytes(range(78))
assert len(source)==3158
mock=r'''#!/usr/bin/env python3
import hashlib,os,sys
from pathlib import Path
args=sys.argv[1:]
root=Path(os.environ['RESTORE335_EXCL_MOCK_HOME'])
mode=os.environ['RESTORE335_EXCL_MODE']
pkg='ru.paseka.journal.archive.restoreproof335'
old='ru.paseka.journal.archive.fileproof329'
f=root/'private'/'files'
with (root/'calls.txt').open('a') as log:log.write(repr(args)+'\n')
if args==['version']:print('Android Debug Bridge version 1.0.41')
elif args==['devices','-l']:print('List of devices attached\nebdb131f device product:NE2213 model:NE2213')
elif args==['-d','shell','getprop','ro.product.model']:print('OTHER' if mode=='wrong_model' else 'NE2213')
elif args==['-d','shell','getprop','ro.build.version.sdk']:print('36')
elif args in (['-d','shell','pm','path',old],['-d','shell','pm','path',pkg]):
    print('package:/data/app/test/base.apk')
elif args==['-d','exec-out','cat','/sdcard/Download/PasekaProof329/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka']:
    counter=root/'source_reads'
    n=int(counter.read_text()) if counter.exists() else 0
    counter.write_text(str(n+1))
    data=(root/'original').read_bytes()
    if mode=='source_changed_after' and n: data=data[:-1]+b'!'
    sys.stdout.buffer.write(data)
elif args==['-d','exec-out','run-as',pkg,'/system/bin/toybox','pwd']:
    print('/data/user/0/'+pkg)
elif args==['-d','exec-out','run-as',pkg,'/system/bin/toybox','mkdir','-m','700','files']:
    if f.exists():
        print('mkdir: File exists')
    elif mode=='mkdir_stderr':
        print('mkdir: permission denied',file=sys.stderr)
    else:
        f.mkdir(parents=True)
elif args==['-d','shell','-T','run-as',pkg,'/system/bin/toybox','dd',
            'of=files/fileproof335-input.paseka','bs=3158','conv=excl,fsync','status=none']:
    target=f/'fileproof335-input.paseka'
    if mode=='dd_stderr':
        print('dd: permission denied',file=sys.stderr)
    else:
        data=sys.stdin.buffer.read()
        if mode=='stream_corrupt': data=data[:-1]+b'!'
        try:
            with target.open('xb') as output:output.write(data)
        except FileExistsError:
            print('dd: File exists')
elif args==['-d','exec-out','run-as',pkg,'/system/bin/toybox','cat','files/fileproof335-input.paseka']:
    target=f/'fileproof335-input.paseka'
    if target.exists():sys.stdout.buffer.write(target.read_bytes())
    else:print('cat: No such file or directory')
else:
    print('UNEXPECTED_COMMAND '+repr(args),file=sys.stderr)
    sys.exit(95)
'''
with tempfile.TemporaryDirectory(prefix='restore335-exclusive-ci-') as tmp:
    home=Path(tmp)
    executable=home/'pinned_mock'
    executable.write_text(mock,encoding='utf-8')
    executable.chmod(0o755)
    alt=home/'old_adb'
    alt.write_text('#!/bin/sh\nprintf "OLD_ADB_CALLED"\nexit 91\n')
    alt.chmod(0o755)
    script=home/'stage.ps1'
    script.write_text(ps.replace(sha_source,hashlib.sha256(source).hexdigest())
                        .replace(sha_adb,hashlib.sha256(executable.read_bytes()).hexdigest()))
    for mode,expected,code in [
        ('pass','RESTORE335_PRIVATE_INPUT_EXCLUSIVE_STAGE_PASS',0),
        ('wrong_model','EXPECTED_NE2213_API36',2),
        ('source_corrupt','ORIGINAL_PINNED_SHA_FAILED',2),
        ('existing_dir','TEST_PRIVATE_FILES_DIRECTORY_ALREADY_EXISTS_OR_UNCERTAIN',2),
        ('mkdir_stderr','TEST_PRIVATE_FILES_DIRECTORY_ALREADY_EXISTS_OR_UNCERTAIN',2),
        ('dd_stderr','EXCLUSIVE_TEST_PRIVATE_INPUT_STAGE_FAILED',2),
        ('stream_corrupt','EXCLUSIVE_TEST_INPUT_READBACK_SHA_FAILED',2),
        ('source_changed_after','ORIGINAL_SOURCE_POST_STAGE_SHA_FAILED',2),
    ]:
        private=home/'private'
        if private.exists():
            # This fixture is on the ephemeral CI runner, never user's device.
            import shutil
            shutil.rmtree(private)
        private.mkdir()
        (home/'original').write_bytes(source if mode!='source_corrupt' else source[:-1]+b'!')
        (home/'source_reads').write_text('0')
        if mode=='existing_dir':
            (private/'files').mkdir()
            (private/'files'/'protected').write_bytes(b'do not touch')
        calls=home/'calls.txt'
        if calls.exists():calls.unlink()
        env={**os.environ,'PATH':str(home)+os.pathsep+os.environ['PATH'],
             'RESTORE335_EXCL_MOCK_HOME':str(home),'RESTORE335_EXCL_MODE':mode}
        result=subprocess.run(['pwsh','-NoProfile','-File',str(script),'-AdbPath',str(executable)],
                              env=env,capture_output=True,text=True,timeout=45)
        print(mode,result.stdout)
        if result.stderr:print(result.stderr)
        assert result.returncode==code,(mode,result.stdout,result.stderr)
        assert expected in result.stdout,(mode,result.stdout)
        assert 'OLD_ADB_CALLED' not in result.stdout+result.stderr
        target=private/'files'/'fileproof335-input.paseka'
        if mode=='pass':
            assert target.read_bytes()==source
            assert 'PRIVATE_TEST_INPUT: SHA256_PASS_3158_BYTES' in result.stdout
            assert 'ORIGINAL_SOURCE_POST_STAGE: SHA256_PASS_3158_BYTES' in result.stdout
            # A second attempt fails closed; the first private file stays exact.
            duplicate=subprocess.run(['pwsh','-NoProfile','-File',str(script),
                                      '-AdbPath',str(executable)],
                                      env=env,capture_output=True,text=True,timeout=45)
            assert duplicate.returncode==2 and 'TEST_PRIVATE_FILES_DIRECTORY_ALREADY_EXISTS_OR_UNCERTAIN' in duplicate.stdout
            assert target.read_bytes()==source
        if mode=='existing_dir':
            assert (private/'files'/'protected').read_bytes()==b'do not touch'
            assert not target.exists()
        if mode in ('wrong_model','source_corrupt','mkdir_stderr'):
            assert not target.exists()
        assert (home/'original').read_bytes()==(source if mode!='source_corrupt' else source[:-1]+b'!')
        calls_text=calls.read_text()
        assert all(x not in calls_text for x in ('install','uninstall','rm','clear','am start','push','pull'))
        if mode in ('wrong_model','source_corrupt','existing_dir','mkdir_stderr'):
            assert "'conv=excl,fsync'" not in calls_text
        if mode not in ('wrong_model','source_corrupt','existing_dir','mkdir_stderr'):
            assert "'conv=excl,fsync'" in calls_text
    print('RESTORE335_EXCLUSIVE_PRIVATE_STAGE_MOCK_PASS')
