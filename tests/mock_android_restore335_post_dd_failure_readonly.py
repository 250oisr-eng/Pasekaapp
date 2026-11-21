#!/usr/bin/env python3
"""Real pwsh + mocked ADB: post-failure inspection without device mutations."""
import hashlib,os,subprocess,tempfile
from pathlib import Path

repo=Path(__file__).resolve().parents[1]
ps=(repo/'tools/android-restore335-post-dd-failure-readonly.ps1').read_text(encoding='utf8')
pin='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
adb_sha='bae5ce98846b19caa74a34900850caa8b21d01976932b2ad83baeb5de5651aee'
source=b'PASEKA01'+bytes(range(256))*12+bytes(range(78))
assert len(source)==3158
mock=r'''#!/usr/bin/env python3
import os,sys
from pathlib import Path
a=sys.argv[1:]
home=Path(os.environ['RESTORE335_AUDIT_HOME'])
mode=os.environ['RESTORE335_AUDIT_MODE']
pkg='ru.paseka.journal.archive.restoreproof335'
old='ru.paseka.journal.archive.fileproof329'
files=home/'private'/'files'
target=files/'fileproof335-input.paseka'
with (home/'calls.txt').open('a') as log:log.write(repr(a)+'\n')
if a==['version']:print('Android Debug Bridge version 1.0.41')
elif a==['devices','-l']:print('List of devices attached\nebdb131f device product:NE2213 model:NE2213')
elif a==['-d','shell','getprop','ro.product.model']:print('NE2213')
elif a==['-d','shell','getprop','ro.build.version.sdk']:print('36')
elif a in (['-d','shell','pm','path',pkg],['-d','shell','pm','path',old]):
    print('package:/data/app/isolated/base.apk')
elif a==['-d','exec-out','cat','/sdcard/Download/PasekaProof329/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka']:
    nfile=home/'source_reads'
    n=int(nfile.read_text())
    nfile.write_text(str(n+1))
    data=(home/'original').read_bytes()
    if mode=='changed_external' and n>0:data=data[:-1]+b'!'
    sys.stdout.buffer.write(data)
elif a==['-d','exec-out','run-as',pkg,'/system/bin/toybox','pwd']:
    print('/data/user/0/'+pkg)
elif len(a)==8 and a[:7]==['-d','exec-out','run-as',pkg,'/system/bin/toybox','stat','-c']:
    fmt=a[7] # This branch deliberately excluded because commands include the path.
    sys.exit(95)
elif len(a)==9 and a[:7]==['-d','exec-out','run-as',pkg,'/system/bin/toybox','stat','-c']:
    fmt,path=a[7:]
    if path=='files':
        print('stat: missing' if mode=='missing_dir' else 'directory')
    elif path=='files/fileproof335-input.paseka':
        if mode in ('missing_dir','missing','stat_bad'):print('stat: No such file or directory')
        elif mode=='symlink':
            print('symbolic link' if fmt=='%F' else '3158')
        elif fmt=='%F':print('regular file')
        elif fmt=='%s':print(target.stat().st_size)
        else:sys.exit(91)
    else:sys.exit(92)
elif a==['-d','exec-out','run-as',pkg,'/system/bin/toybox','cat','files/fileproof335-input.paseka']:
    if mode in ('symlink','missing','missing_dir','stat_bad'):
        print('UNEXPECTED_CAT_READ',file=sys.stderr);sys.exit(90)
    sys.stdout.buffer.write(target.read_bytes())
elif a==['-d','exec-out','run-as',pkg,'/system/bin/toybox','dd','--help']:
    if mode=='dd_help_unavailable':
        print('dd: bad usage');sys.exit(1)
    print('usage: dd conv=excl,fsync status=noxfer,none')
else:
    print('UNEXPECTED_ADB '+repr(a),file=sys.stderr)
    sys.exit(93)
'''
with tempfile.TemporaryDirectory(prefix='paseka-dd-audit-ci-') as tmp:
    home=Path(tmp)
    mockadb=home/'pinned_mock'
    mockadb.write_text(mock,encoding='utf8');mockadb.chmod(0o755)
    substitute=ps.replace(pin,hashlib.sha256(source).hexdigest()).replace(adb_sha,hashlib.sha256(mockadb.read_bytes()).hexdigest())
    script=home/'audit.ps1';script.write_text(substitute,encoding='utf8')
    cases=[
        ('complete','PRIVATE_INPUT_STATUS: SHA256_PASS_3158_BYTES',0),
        ('partial','PRIVATE_INPUT_STATUS: INCOMPLETE_OR_UNEXPECTED_SIZE_PRESERVE',0),
        ('wrong_sha','PRIVATE_INPUT_STATUS: SHA_MISMATCH_PRESERVE',0),
        ('missing','PRIVATE_INPUT_STATUS: UNVERIFIED_PRESERVE',0),
        ('missing_dir','PRIVATE_FILES_DIRECTORY: UNKNOWN_OR_ABSENT',0),
        ('symlink','PRIVATE_INPUT_STATUS: BLOCKED_NONREGULAR',0),
        ('stat_bad','PRIVATE_INPUT_STATUS: UNVERIFIED_PRESERVE',0),
        ('dd_help_unavailable','DD_HELP_EXIT_CODE: 1',0),
        ('changed_external','ORIGINAL_SOURCE_CHANGED',2),
        ('original_corrupt','ORIGINAL_PINNED_SHA_FAILED',2)
    ]
    for mode,needle,code in cases:
        private=home/'private'
        import shutil
        if private.exists():shutil.rmtree(private)
        private.mkdir()
        files=private/'files'
        if mode!='missing_dir':files.mkdir()
        if mode not in ('missing','missing_dir','stat_bad','symlink'):
            payload=source
            if mode=='partial':payload=source[:417]
            if mode=='wrong_sha':payload=source[:-1]+b'!'
            (files/'fileproof335-input.paseka').write_bytes(payload)
        external=source if mode!='original_corrupt' else source[:-1]+b'!'
        (home/'original').write_bytes(external)
        (home/'source_reads').write_text('0')
        log=home/'calls.txt'
        if log.exists():log.unlink()
        env={**os.environ,'PATH':str(home)+os.pathsep+os.environ['PATH'],
             'RESTORE335_AUDIT_HOME':str(home),'RESTORE335_AUDIT_MODE':mode}
        result=subprocess.run(['pwsh','-NoProfile','-File',str(script),'-AdbPath',str(mockadb)],
                              capture_output=True,text=True,timeout=50,env=env)
        print(mode,result.stdout)
        if result.stderr:print(result.stderr)
        assert result.returncode==code,(mode,result.stdout,result.stderr)
        assert needle in result.stdout,(mode,result.stdout)
        if code==0:
            assert 'STATUS: RESTORE335_POST_FAILURE_READONLY_AUDIT_COMPLETE' in result.stdout
            assert 'ORIGINAL_SOURCE_POST_FAILURE: SHA256_PASS_3158_BYTES' in result.stdout
        calls=log.read_text()
        assert not any(x in calls for x in ("'-T'","'mkdir'","'of='","'install'","'uninstall'","'push'","'pull'","'am'","'clear'","'rm'"))
        assert calls.count("'dd', '--help'")==(0 if mode=='original_corrupt' else 1)
        if mode in ('symlink','missing','missing_dir','stat_bad'):
            assert "'cat', 'files/fileproof335-input.paseka'" not in calls
        assert (home/'original').read_bytes()==external
        if mode not in ('missing','missing_dir','stat_bad','symlink'):
            expected=source
            if mode=='partial':expected=source[:417]
            if mode=='wrong_sha':expected=source[:-1]+b'!'
            assert (files/'fileproof335-input.paseka').read_bytes()==expected
print('RESTORE335_POST_DD_FAILURE_READONLY_MOCK_PASS')
