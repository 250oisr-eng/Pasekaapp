#!/usr/bin/env python3
"""CI-only mock of PowerShell one-shot ADB protocol. No actual Android access."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

SOURCE_SHA = '4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
ARTIFACT_SHA = '28e62f19d80a4ede343041a658da7093b2c106c82a02e0db23f2ccedd5bde176'
APK_SHA = '5ba91f66576e8f859a398655be001d0116819478501981650505ea66a92f496e'
sha = lambda b: hashlib.sha256(b).hexdigest()
mock_source = r'''#!/usr/bin/env python3
import hashlib,json,os,sys
from pathlib import Path
base=Path(os.environ["RESTORE335_MOCK_HOME"])
args=sys.argv[1:]
calls=base/"calls.jsonl"
with calls.open("a") as out:out.write(json.dumps(args)+"\n")
pkg="ru.paseka.journal.archive.restoreproof335"
old="ru.paseka.journal.archive.fileproof329"
source=(base/"source.bin").read_bytes()
private=base/"private.bin"
installed=base/"installed.marker"
launched=base/"launched.marker"
report={"status":"PASS","phase":"ISOLATED_RESTORE335_SHA_PASS","packageId":pkg,
        "archiveSha256":hashlib.sha256(source).hexdigest(),"videoCount":2,
        "sourcePreserved":True,"recognitionSucceeded":False,"cleanupAuthorized":False}
def out(b): sys.stdout.buffer.write(b)
if args==["devices","-l"]:
    out(b"List of devices attached\nebdb131f device product:NE2213 model:NE2213 device:OP516FL1\n")
elif args==["-d","shell","getprop","ro.product.model"]:
    out(b"NE2213\n")
elif args==["-d","shell","getprop","ro.build.version.sdk"]:
    out(b"36\n")
elif args==["-d","shell","pm","path",old]:
    out(b"package:/data/app/old/base.apk\n")
elif args==["-d","shell","pm","path",pkg]:
    if installed.exists():out(b"package:/data/app/new/base.apk\n")
elif args==["-d","exec-out","cat","/sdcard/Download/PasekaProof329/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka"]:
    out(source)
elif len(args)>=3 and args[:2]==["-d","install"]:
    if installed.exists() or len(args)!=3:
        sys.exit(81)
    apk=Path(args[2]).read_bytes()
    if hashlib.sha256(apk).hexdigest()!=(base/"apk.sha").read_text():
        sys.exit(82)
    installed.write_text("installed")
    out(b"Success\n")
elif len(args)>=7 and args[:4]==["-d","exec-in","run-as",pkg]:
    if not installed.exists() or private.exists() or "fileproof335-input.paseka" not in " ".join(args):
        sys.exit(83)
    private.write_bytes(sys.stdin.buffer.read())
elif args==["-d","exec-out","run-as",pkg,"cat","files/fileproof335-input.paseka"]:
    if not private.exists():sys.exit(84)
    out(private.read_bytes())
elif args==["-d","shell","am","start","-n",pkg+"/.MainActivity"]:
    if not private.exists():sys.exit(85)
    launched.write_text("launched")
    out(b"Starting: Intent { cmp=ru.paseka.journal.archive.restoreproof335/.MainActivity }\n")
elif args==["-d","exec-out","run-as",pkg,"cat","files/restore335-report.json"]:
    if not launched.exists():sys.exit(86)
    out(json.dumps(report).encode())
else:
    print("UNEXPECTED MOCK ADB",repr(args),file=sys.stderr)
    sys.exit(99)
'''
def main():
    script_path = Path(__file__).resolve().parents[1] / 'tools' / 'android-restoreproof335-one-shot.ps1'
    original_script=script_path.read_text(encoding='utf-8')
    with tempfile.TemporaryDirectory(prefix='paseka-restore335-ci-') as temporary:
        root=Path(temporary)
        (root/'mockbin').mkdir()
        adb=root/'mockbin'/'adb'
        adb.write_text(mock_source,encoding='utf-8')
        adb.chmod(0o755)
        source=b'PASEKA01'+bytes(range(256))*12+bytes(range(78))
        assert len(source)==3158
        apk=bytes(range(256))*4688
        (root/'source.bin').write_bytes(source)
        (root/'apk.sha').write_text(sha(apk))
        archive=root/'test.zip'
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED) as z:
            z.writestr('app-debug.apk',apk)
        patched=(original_script.replace(SOURCE_SHA,sha(source))
                  .replace(ARTIFACT_SHA,sha(archive.read_bytes()))
                  .replace(APK_SHA,sha(apk)))
        assert patched!=original_script
        stage=root/'patched.ps1'
        stage.write_text(patched,encoding='utf-8')
        env=dict(os.environ)
        env['PATH']=str(root/'mockbin')+os.pathsep+env['PATH']
        env['RESTORE335_MOCK_HOME']=str(root)
        env['TEMP']=str(root)
        result=subprocess.run(['pwsh','-NoProfile','-File',str(stage),'-ZipPath',str(archive)],
                              capture_output=True,text=True,env=env,timeout=80)
        print(result.stdout)
        if result.stderr:print(result.stderr,file=sys.stderr)
        assert result.returncode==0, f"mock preflight status {result.returncode}"
        assert 'RESTORE_PROOF335: ANDROID_SYNTHETIC_PASS' in result.stdout
        assert (root/'source.bin').read_bytes()==source
        assert (root/'private.bin').read_bytes()==source
        calls=[json.loads(line) for line in (root/'calls.jsonl').read_text().splitlines()]
        assert sum(a[:2]==['-d','install'] for a in calls)==1
        assert sum(a[:2]==['-d','exec-in'] for a in calls)==1
        assert sum(a[:3]==['-d','exec-out','cat'] for a in calls)==2
        assert all('uninstall' not in a and 'clear' not in a and '-r' not in a for a in calls)
        # Independently confirm a source mismatch blocks before install.
        for marker in ('installed.marker','private.bin','launched.marker','calls.jsonl'):
            target=root/marker
            if target.exists():target.unlink() # CI TEMP ONLY; never user/device data.
        (root/'source.bin').write_bytes(source[:-1]+b'!')
        failed=subprocess.run(['pwsh','-NoProfile','-File',str(stage),'-ZipPath',str(archive)],
                              capture_output=True,text=True,env=env,timeout=80)
        print(failed.stdout)
        assert failed.returncode==2
        assert 'PINNED_ORIGINAL_CHANGED_OR_MISSING' in failed.stdout
        assert not (root/'installed.marker').exists()
        assert not (root/'private.bin').exists()
    print('MOCK_RESTORE335_STAGING_SAFE_PASS')
if __name__=='__main__':
    main()
