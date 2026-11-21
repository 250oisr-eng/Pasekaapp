#!/usr/bin/env python3
"""CI-only simulation of Android exec-out misleading missing-file stdout."""
import hashlib, os, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
script=(ROOT/'tools/android-restore335-private-path-readonly.ps1').read_text()
original=b'PASEKA01'+bytes(range(256))*12+bytes(range(78))
assert len(original)==3158
real_sha='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
mock_sha=hashlib.sha256(original).hexdigest()
mock=r'''#!/usr/bin/env python3
import os,sys
from pathlib import Path
args=sys.argv[1:]
p='ru.paseka.journal.archive.restoreproof335'
old='ru.paseka.journal.archive.fileproof329'
source=Path(os.environ['RESTORE335_MOCK_SOURCE']).read_bytes()
if args==['devices','-l']:
    sys.stdout.buffer.write(b'List of devices attached\nebdb131f device product:NE2213 model:NE2213 device:OP516FL1\n')
elif args==['-d','shell','getprop','ro.product.model']:
    print('NE2213')
elif args==['-d','shell','getprop','ro.build.version.sdk']:
    print('36')
elif args in (['-d','shell','pm','path',p],['-d','shell','pm','path',old]):
    print('package:/data/app/isolated/base.apk')
elif args[:3]==['-d','exec-out','cat']:
    sys.stdout.buffer.write(source)
elif args==['-d','exec-out','run-as',p,'pwd']:
    print('/data/user/0/'+p)
elif len(args)==7 and args[:6]==['-d','exec-out','run-as',p,'ls','-ld']:
    # This mimics the observed adb exec-out behavior: tool error text on stdout, exit=0.
    print('ls: '+args[-1]+': No such file or directory')
else:
    print('UNEXPECTED_COMMAND',repr(args),file=sys.stderr)
    sys.exit(90)
'''
with tempfile.TemporaryDirectory(prefix='restore335-readonly-ci-') as name:
    base=Path(name)
    source=base/'source.bin'
    source.write_bytes(original)
    bin=base/'bin';bin.mkdir()
    adb=bin/'adb';adb.write_text(mock);adb.chmod(0o755)
    ps=base/'script.ps1';ps.write_text(script.replace(real_sha,mock_sha))
    env={**os.environ,'PATH':str(bin)+os.pathsep+os.environ['PATH'],'RESTORE335_MOCK_SOURCE':str(source)}
    result=subprocess.run(['pwsh','-NoProfile','-File',str(ps)],env=env,text=True,capture_output=True,timeout=45)
    print(result.stdout)
    if result.stderr:print(result.stderr)
    assert result.returncode==0,result.stderr
    assert 'ORIGINAL_ARCHIVE: SHA256_PASS_3158_BYTES' in result.stdout
    assert 'PATH_files: NOT_FOUND' in result.stdout
    assert 'PATH_files_fileproof335-input_paseka: NOT_FOUND' in result.stdout
    assert 'PATH_files_restore335-report_json: NOT_FOUND' in result.stdout
    assert 'STATUS: RESTORE335_PRIVATE_PATH_AUDIT_READONLY_COMPLETE' in result.stdout
    assert source.read_bytes()==original
print('RESTORE335_PRIVATE_PATH_MOCK_PASS')
