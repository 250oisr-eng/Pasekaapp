#!/usr/bin/env python3
"""CI-only synthetic no-stdin toybox test; never touches physical Android."""
from pathlib import Path
import hashlib,os,subprocess,tempfile
root=Path(__file__).resolve().parents[1]
script=(root/'tools/android-restore335-toybox-no-stdin-readonly.ps1').read_text(encoding='utf-8')
pinned='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
source=b'PASEKA01'+bytes(range(256))*12+bytes(range(78))
mock_sha=hashlib.sha256(source).hexdigest()
mock=r'''#!/usr/bin/env python3
import hashlib,os,sys
from pathlib import Path
args=sys.argv[1:]
base=Path(os.environ['RESTORE335_MOCK_HOME'])
with (base/'calls.txt').open('a') as f:f.write(repr(args)+'\n')
mode=os.environ['RESTORE335_MODE']
pkg='ru.paseka.journal.archive.restoreproof335'
old='ru.paseka.journal.archive.fileproof329'
if args==['devices','-l']:
    print('List of devices attached\nebdb131f device product:NE2213 model:NE2213')
elif args==['-d','shell','getprop','ro.product.model']:print('NE2213')
elif args==['-d','shell','getprop','ro.build.version.sdk']:print('36')
elif args in (['-d','shell','pm','path',old],['-d','shell','pm','path',pkg]):
    print('package:/data/app/test/base.apk')
elif args==['-d','exec-out','cat','/sdcard/Download/PasekaProof329/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka']:
    sys.stdout.buffer.write((base/'source.bin').read_bytes())
elif args==['version']:
    print('Android Debug Bridge version 1.0.41\nVersion 36.0.0')
elif args==['-d','exec-out','run-as',pkg,'/system/bin/toybox','sha256sum','/dev/null']:
    empty=hashlib.sha256(b'').hexdigest()
    if mode=='pass':print(empty+'  /dev/null')
    elif mode=='diagnostic':print('run-as: command not available')
    elif mode=='wrong_sha':print('0'*64+'  /dev/null')
    elif mode=='silent':pass
    else:sys.exit(94)
else:
    print('UNEXPECTED COMMAND '+repr(args),file=sys.stderr)
    sys.exit(95)
'''
with tempfile.TemporaryDirectory(prefix='restore335-toybox-ci-') as td:
    base=Path(td)
    bin=base/'bin';bin.mkdir()
    a=bin/'adb';a.write_text(mock);a.chmod(0o755)
    script_path=base/'probe.ps1';script_path.write_text(script.replace(pinned,mock_sha))
    for mode,detail,exitcode in [
        ('pass','RESTORE335_NO_STDIN_TOYBOX_PROBE_PASS',0),
        ('diagnostic','RUN_AS_TOYBOX_DIGEST_INVALID',2),
        ('wrong_sha','RUN_AS_TOYBOX_EMPTY_SHA_MISMATCH',2),
        ('silent','RUN_AS_TOYBOX_DIGEST_INVALID',2),
        ('source_corrupt','ORIGINAL_PINNED_SHA_FAILED',2)]:
        data=source if mode!='source_corrupt' else source[:-1]+b'!'
        (base/'source.bin').write_bytes(data)
        c=base/'calls.txt'
        if c.exists():c.unlink()
        env={**os.environ,'PATH':str(bin)+os.pathsep+os.environ['PATH'],
             'RESTORE335_MOCK_HOME':str(base),'RESTORE335_MODE':mode}
        result=subprocess.run(['pwsh','-NoProfile','-File',str(script_path)],
                              capture_output=True,text=True,env=env,timeout=50)
        print(mode,result.stdout)
        if result.stderr:print(result.stderr)
        assert result.returncode==exitcode,(mode,result.stdout,result.stderr)
        assert detail in result.stdout,(mode,result.stdout)
        calls=c.read_text()
        assert "exec-in" not in calls and "'-T'" not in calls
        assert all(x not in calls for x in ('install','uninstall','rm','mkdir','push','pull','clear','am start'))
        assert ("'/dev/null'" in calls)==(mode!='source_corrupt')
        assert (base/'source.bin').read_bytes()==data
print('RESTORE335_TOYBOX_NO_STDIN_MOCK_PASS')
