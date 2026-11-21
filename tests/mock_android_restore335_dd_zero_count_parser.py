#!/usr/bin/env python3
"""Real pwsh with fake ADB; zero-count read-only dd parser probe and protected files."""
import hashlib,os,subprocess,tempfile
from pathlib import Path
script=(Path(__file__).resolve().parents[1]/'tools/android-restore335-dd-zero-count-parser-readonly.ps1').read_text(encoding='utf8')
pin='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
adb_pin='bae5ce98846b19caa74a34900850caa8b21d01976932b2ad83baeb5de5651aee'
source=b'PASEKA01'+bytes(range(256))*12+bytes(range(78))
assert len(source)==3158
mock=r'''#!/usr/bin/env python3
import os,sys
from pathlib import Path
args=sys.argv[1:]
home=Path(os.environ['PASEKA_DD_PARSER_MOCK'])
mode=os.environ['PASEKA_DD_PARSER_MODE']
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
    n=int((home/'source_reads').read_text())
    (home/'source_reads').write_text(str(n+1))
    data=(home/'original').read_bytes()
    if mode=='source_changed' and n: data=data[:-1]+b'!'
    sys.stdout.buffer.write(data)
elif args==['-d','exec-out','run-as',pkg,'/system/bin/toybox','pwd']:
    print('/data/user/0/'+pkg)
elif args==['-d','exec-out','run-as',pkg,'/system/bin/toybox','stat','-c','%F','files']:
    print('directory')
elif args==['-d','exec-out','run-as',pkg,'/system/bin/toybox','ls','-A','files']:
    if mode=='existing_file':print('fileproof335-input.paseka')
elif args==['-d','exec-out','run-as',pkg,'/system/bin/toybox','stat','-c','%F','files/fileproof335-input.paseka']:
    # Show that ADB exit 0 can carry a read-only command diagnostic on stdout.
    print("stat: can't stat 'files/fileproof335-input.paseka': No such file or directory")
elif args==['-d','exec-out','run-as',pkg,'/system/bin/toybox','dd','--help']:
    print('dd help: conv=excl,fsync; status=none')
elif args==['-d','exec-out','run-as',pkg,'/system/bin/toybox','dd','if=/dev/null','count=0','status=none']:
    if mode=='baseline_error': print('dd: bad argument count=0')
elif args==['-d','exec-out','run-as',pkg,'/system/bin/toybox','dd','if=/dev/null','count=0','conv=excl','status=none']:
    if mode=='unsupported_stdout0':
        print('dd: bad conv=excl')
    elif mode=='unsupported_stderr':
        print('dd: bad conv=excl',file=sys.stderr);sys.exit(1)
    elif mode=='unrecognized':
        print('dd: ambiguous output')
else:
    print('UNEXPECTED_ADB_COMMAND '+repr(args),file=sys.stderr);sys.exit(99)
'''
with tempfile.TemporaryDirectory(prefix='paseka-dd-readonly-ci-') as root:
    home=Path(root)
    fake=home/'pinned_adb'
    fake.write_text(mock,encoding='utf8');fake.chmod(0o755)
    ps=home/'probe.ps1'
    ps.write_text(script.replace(pin,hashlib.sha256(source).hexdigest())
                        .replace(adb_pin,hashlib.sha256(fake.read_bytes()).hexdigest()))
    for mode,expected,exit_code in [
        ('unsupported_stdout0','DD_CONV_EXCL_ARGUMENT: REJECTED_BY_PARSER',0),
        ('unsupported_stderr','DD_CONV_EXCL_ARGUMENT: REJECTED_BY_PARSER',0),
        ('supported','DD_CONV_EXCL_ARGUMENT: ACCEPTED_FOR_ZERO_COUNT',0),
        ('unrecognized','DD_CONV_EXCL_ARGUMENT: UNVERIFIED',0),
        ('baseline_error','DD_ZERO_COUNT_BASELINE_INVALID',2),
        ('existing_file','PRIVATE_FILES_NOT_CONFIRMED_EMPTY',2),
        ('source_changed','ORIGINAL_SOURCE_CHANGED',2),
        ('source_bad','ORIGINAL_PINNED_SHA_FAILED',2)
    ]:
        original=source[:-1]+b'!' if mode=='source_bad' else source
        (home/'original').write_bytes(original)
        (home/'source_reads').write_text('0')
        protected=home/'protected-contents'
        protected.write_bytes(b'PRESERVE-PHONE-DATA')
        calls=home/'calls.txt'
        if calls.exists():calls.unlink()
        env={**os.environ,'PASEKA_DD_PARSER_MOCK':str(home),'PASEKA_DD_PARSER_MODE':mode}
        result=subprocess.run(['pwsh','-NoProfile','-File',str(ps),'-AdbPath',str(fake)],
                              capture_output=True,text=True,env=env,timeout=45)
        print(mode,result.stdout,result.stderr)
        assert result.returncode==exit_code,(mode,result.stdout,result.stderr)
        assert expected in result.stdout,(mode,result.stdout)
        if exit_code==0:
            assert 'STATUS: RESTORE335_DD_ZERO_COUNT_PARSER_READONLY_COMPLETE' in result.stdout
            assert 'ORIGINAL_SOURCE_POST_PROBE: SHA256_PASS_3158_BYTES' in result.stdout
        commandlog=calls.read_text()
        assert not any(x in commandlog for x in ("'mkdir'","'rm'","'install'","'push'","'pull'","'uninstall'","'am'","'clear'","'of="))
        assert "'count=0'" in commandlog if mode not in ('source_bad','existing_file') else "'count=0'" not in commandlog
        assert protected.read_bytes()==b'PRESERVE-PHONE-DATA'
        assert (home/'original').read_bytes()==original
print('RESTORE335_DD_PARSER_ZERO_COUNT_READONLY_MOCK_PASS')
