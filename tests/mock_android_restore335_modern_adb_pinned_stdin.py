#!/usr/bin/env python3
"""Exact pwsh + mock explicit adb binary, old binary decoy, all fail-closed gates."""
import hashlib,os,subprocess,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
script=(root/'tools/android-restore335-modern-adb-pinned-stdin-readonly.ps1').read_text()
pinned='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
adb_pinned='bae5ce98846b19caa74a34900850caa8b21d01976932b2ad83baeb5de5651aee'
source=b'PASEKA01'+bytes(range(256))*12+bytes(range(78))
assert len(source)==3158
mock=r'''#!/usr/bin/env python3
import hashlib,os,sys
from pathlib import Path
args=sys.argv[1:]
home=Path(os.environ['RESTORE335_MODERN_MOCK_HOME'])
mode=os.environ['RESTORE335_MODERN_MOCK_MODE']
pkg='ru.paseka.journal.archive.restoreproof335'
old='ru.paseka.journal.archive.fileproof329'
with (home/'calls.txt').open('a') as f:f.write(repr(args)+'\n')
if args==['version']:print('Android Debug Bridge version 1.0.41')
elif args==['devices','-l']:print('List of devices attached\nebdb131f device product:NE2213 model:NE2213')
elif args==['-d','shell','getprop','ro.product.model']:print('NE2213')
elif args==['-d','shell','getprop','ro.build.version.sdk']:print('36')
elif args in (['-d','shell','pm','path',pkg],['-d','shell','pm','path',old]):
    print('package:/data/app/isolated/base.apk')
elif args==['-d','exec-out','cat','/sdcard/Download/PasekaProof329/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka']:
    sys.stdout.buffer.write((home/'archive.bin').read_bytes())
elif args==['-d','shell','-T','run-as',pkg,'/system/bin/toybox','sha256sum','-']:
    data=sys.stdin.buffer.read()
    if mode=='stdin_corrupt':data=data[:-1]+b'!'
    if mode=='diagnostic':print('/system/bin/sh: command not found')
    else:print(hashlib.sha256(data).hexdigest()+'  -')
else:
    print('UNEXPECTED '+repr(args),file=sys.stderr)
    sys.exit(90)
'''
with tempfile.TemporaryDirectory(prefix='paseka-modern-adb-mock-') as d:
    home=Path(d)
    staged=home/'platform-tools';staged.mkdir()
    adb=staged/'adb_mock'
    adb.write_text(mock);adb.chmod(0o755)
    old=home/'adb';old.write_text('#!/bin/sh\nprintf "OLD_ADB_CALLED"\nexit 91\n');old.chmod(0o755)
    ps=home/'probe.ps1'
    ps.write_text(script.replace(pinned,hashlib.sha256(source).hexdigest())
                   .replace(adb_pinned,hashlib.sha256(adb.read_bytes()).hexdigest()))
    for mode,expect,exit_code in [
        ('pass','RESTORE335_MODERN_ADB_READONLY_STDIN_PASS',0),
        ('stdin_corrupt','STDIN_SHA256_MISMATCH',2),
        ('diagnostic','STDIN_SHA256_OUTPUT_INVALID',2),
        ('source_corrupt','ORIGINAL_PINNED_SHA_FAILED',2)]:
        data=source if mode!='source_corrupt' else source[:-1]+b'!'
        (home/'archive.bin').write_bytes(data)
        calls=home/'calls.txt'
        if calls.exists():calls.unlink()
        env={**os.environ,'PATH':str(home)+os.pathsep+os.environ['PATH'],
             'RESTORE335_MODERN_MOCK_HOME':str(home),'RESTORE335_MODERN_MOCK_MODE':mode}
        cmd=['pwsh','-NoProfile','-File',str(ps),'-AdbPath',str(adb)]
        result=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=45)
        print(mode,result.stdout,result.stderr)
        assert result.returncode==exit_code,(mode,result.stdout,result.stderr)
        assert expect in result.stdout,(mode,result.stdout)
        assert 'OLD_ADB_CALLED' not in result.stdout+result.stderr
        calls_text=calls.read_text()
        assert ('sha256sum' in calls_text)==(mode!='source_corrupt')
        assert "'-T'" in calls_text if mode!='source_corrupt' else "'-T'" not in calls_text
        assert all(x not in calls_text for x in ('install','uninstall','rm','mkdir','push','pull','clear','am start'))
        assert (home/'archive.bin').read_bytes()==data
    # Provenance mismatch fails before even ADB version/device contact.
    ps_bad=home/'bad.ps1'
    ps_bad.write_text(script)
    calls=home/'calls.txt'
    calls.unlink()
    result=subprocess.run(['pwsh','-NoProfile','-File',str(ps_bad),'-AdbPath',str(adb)],
                          env=env,capture_output=True,text=True,timeout=40)
    assert result.returncode==2 and 'PINNED_ADB_SHA256_MISMATCH' in result.stdout,result.stdout
    assert not calls.exists()
print('RESTORE335_MODERN_ADB_PINNED_SHA_MOCK_PASS')
