#!/usr/bin/env python3
"""Run actual pwsh diagnostic against the earlier mock ADB; NO Android access."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import hashlib

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('mock_restore335', ROOT/'tests/mock_android_restoreproof335_device.py')
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
script=(ROOT/'tools/android-restoreproof335-readonly-diagnostic.ps1').read_text(encoding='utf-8')
source=b'PASEKA01'+bytes(range(256))*12+bytes(range(78))
assert len(source)==3158
digest=hashlib.sha256(source).hexdigest()
assert digest != '4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
with tempfile.TemporaryDirectory(prefix='paseka-restore335-diagnostic-') as tmp:
    base=Path(tmp)
    bin_dir=base/'bin'
    bin_dir.mkdir()
    adb=bin_dir/'adb'
    adb.write_text(mod.mock_source,encoding='utf-8')
    adb.chmod(0o755)
    (base/'source.bin').write_bytes(source)
    (base/'installed.marker').write_text('test-only-installed')
    env=dict(os.environ)
    env['PATH']=str(bin_dir)+os.pathsep+env['PATH']
    env['RESTORE335_MOCK_HOME']=str(base)
    patched=base/'readonly.ps1'
    patched.write_text(script.replace('4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186',digest),encoding='utf-8')
    def run():
        result=subprocess.run(['pwsh','-NoProfile','-File',str(patched)],capture_output=True,text=True,env=env,timeout=35)
        print(result.stdout)
        if result.stderr:print(result.stderr)
        return result
    (base/'private.bin').write_bytes(source[:-1]+b'!')
    result=run()
    assert result.returncode==0
    assert 'ORIGINAL_SHA256: PASS' in result.stdout
    assert 'PRIVATE_STAGING_STATUS: MISMATCH_NO_WRITE' in result.stdout
    assert 'FIRST_DIFFERENT_BYTE_OFFSET: 3157' in result.stdout
    assert 'LENGTH_DELTA: 0' in result.stdout
    assert (base/'private.bin').read_bytes()==source[:-1]+b'!'
    (base/'private.bin').write_bytes(source)
    result=run()
    assert result.returncode==0
    assert 'PRIVATE_STAGING_STATUS: PASS_READ_ONLY' in result.stdout
    assert 'PRIVATE_MATCHES_ORIGINAL: YES' in result.stdout
    (base/'source.bin').write_bytes(source[:-1]+b'!')
    result=run()
    assert result.returncode==2
    assert 'ORIGINAL_NOT_PINNED_ABORT' in result.stdout
    assert 'PRIVATE_STAGING_STATUS:' not in result.stdout
    assert (base/'private.bin').read_bytes()==source
    (base/'source.bin').write_bytes(source)
    import json
    commands=[json.loads(x) for x in (base/'calls.jsonl').read_text().splitlines()]
    assert all('install' not in x and 'exec-in' not in x and 'uninstall' not in x for x in commands)
print('RESTORE335_READONLY_MOCK_PASS')
