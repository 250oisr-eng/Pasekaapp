#!/usr/bin/env python3
"""Mock real PowerShell-to-ADB stdin, including misleading stdout and modified stdin."""
import hashlib,os,subprocess,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
original_script=(root/'tools/android-restore335-stdin-sha-readonly.ps1').read_text(encoding='utf-8')
pinned='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
source=b'PASEKA01'+bytes(range(256))*12+bytes(range(78))
assert len(source)==3158
mock_sha=hashlib.sha256(source).hexdigest()
mock=r'''#!/usr/bin/env python3
import hashlib,os,sys
from pathlib import Path
args=sys.argv[1:]
p='ru.paseka.journal.archive.restoreproof335'
old='ru.paseka.journal.archive.fileproof329'
base=Path(os.environ['RESTORE335_MOCK_HOME'])
with (base/'calls.txt').open('a') as f:f.write(repr(args)+'\n')
mode=os.environ['RESTORE335_MOCK_MODE']
src=(base/'archive.bin').read_bytes()
if args==['devices','-l']:
    print('List of devices attached\nebdb131f device product:NE2213 model:NE2213 device:OP516FL1')
elif args==['version']:
    print('Android Debug Bridge version '+('1.0.32' if mode=='old_adb' else '1.0.41'))
elif args==['-d','shell','getprop','ro.product.model']:print('NE2213')
elif args==['-d','shell','getprop','ro.build.version.sdk']:print('36')
elif args in (['-d','shell','pm','path',p],['-d','shell','pm','path',old]):
    print('package:/data/app/isolated/base.apk')
elif args==['-d','exec-out','cat','/sdcard/Download/PasekaProof329/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka']:
    sys.stdout.buffer.write(src)
elif args==['-d','shell','run-as',p,'/system/bin/toybox','sha256sum','-']:
    data=sys.stdin.buffer.read()
    if mode=='stdin_corrupt':data=data[:-1]+b'!'
    if mode in ('stdout_diagnostic','device_command_error','diagnostic_redacted'):
        sys.stdout.write('sha256sum: no such file or directory\n' if mode=='stdout_diagnostic' else ('run-as: command failure\n' if mode=='device_command_error' else 'run-as: non-ascii-ñ\n'))
    else:
        print(hashlib.sha256(data).hexdigest()+'  -')
else:
    print('UNEXPECTED COMMAND '+repr(args),file=sys.stderr)
    sys.exit(95)
'''
with tempfile.TemporaryDirectory(prefix='restore335-stdin-ci-') as td:
    base=Path(td)
    (base/'archive.bin').write_bytes(source)
    bindir=base/'bin';bindir.mkdir()
    adb=bindir/'adb';adb.write_text(mock);adb.chmod(0o755)
    ps=base/'probe.ps1';ps.write_text(original_script.replace(pinned,mock_sha))
    for mode, expected, code in [
        ('pass','RESTORE335_READONLY_STDIN_TRANSPORT_PASS',0),
        ('stdin_corrupt','STDIN_SHA256_MISMATCH',2),
        ('stdout_diagnostic','STDIN_SHA256_OUTPUT_INVALID',2),
        ('device_command_error','STDIN_SHA256_OUTPUT_INVALID',2),
        ('diagnostic_redacted','STDIN_SHA256_OUTPUT_INVALID',2),
        ('source_corrupt','ORIGINAL_PINNED_SHA_FAILED',2),
        ('old_adb','HOST_ADB_TOO_OLD_REQUIRES_1_0_41_OR_NEWER',2)
    ]:
        archive=source if mode!='source_corrupt' else source[:-1]+b'!'
        (base/'archive.bin').write_bytes(archive)
        calls=base/'calls.txt'
        if calls.exists():calls.unlink()
        env={**os.environ,'PATH':str(bindir)+os.pathsep+os.environ['PATH'],
             'RESTORE335_MOCK_HOME':str(base),'RESTORE335_MOCK_MODE':mode}
        result=subprocess.run(['pwsh','-NoProfile','-File',str(ps)],
                              env=env,capture_output=True,text=True,timeout=45)
        print(mode, result.stdout)
        if result.stderr:print(result.stderr)
        assert result.returncode==code,(mode,result.stderr,result.stdout)
        assert expected in result.stdout,(mode,result.stdout)
        if mode not in ('source_corrupt','old_adb'):
            assert 'REMOTE_EXIT_CODE: 0' in result.stdout
            assert 'REMOTE_STDOUT_BYTES:' in result.stdout
            assert 'REMOTE_STDOUT_SHA256:' in result.stdout
        if mode in ('stdout_diagnostic','device_command_error','diagnostic_redacted'):
            assert 'REMOTE_OUTPUT_CLASS: COMMAND_DIAGNOSTIC' in result.stdout
        if mode == 'device_command_error':
            assert 'REMOTE_DIAGNOSTIC: run-as: command failure' in result.stdout
        if mode == 'diagnostic_redacted':
            assert 'REMOTE_DIAGNOSTIC: REDACTED' in result.stdout
        if mode == 'pass':
            assert 'REMOTE_OUTPUT_CLASS' not in result.stdout
        assert 'NO_INSTALL_NO_WRITE_NO_LAUNCH_NO_RESET_NO_DELETE' in result.stdout if code else 'PRIVATE_PATH_WRITE: NOT_ATTEMPTED' in result.stdout
        calls_text=calls.read_text()
        assert all(word not in calls_text for word in ('install','uninstall','rm','mkdir','am start','clear','sh -c','push','pull'))
        assert ('sha256sum' in calls_text)==(mode not in ('source_corrupt','old_adb'))
        assert "'-T'" not in calls_text
        assert ("'/system/bin/toybox'" in calls_text)==(mode not in ('source_corrupt','old_adb'))
        if mode == 'old_adb':
            assert 'STAGE: 2/3 ORIGINAL_ARCHIVE_IN_MEMORY_SHA' not in result.stdout
        assert (base/'archive.bin').read_bytes()==archive
print('RESTORE335_STDIN_SHA_READONLY_MOCK_PASS')
