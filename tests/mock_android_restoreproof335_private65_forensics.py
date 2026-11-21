#!/usr/bin/env python3
"""Exercise read-only private 65B forensic preview with real pwsh and fake ADB."""
import hashlib, importlib.util, os, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('mock335',ROOT/'tests/mock_android_restoreproof335_device.py')
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
script=(ROOT/'tools/android-restoreproof335-private65-forensics.ps1').read_text(encoding='utf-8')
synthetic=b'PASEKA01'+bytes(range(256))*12+bytes(range(78))
assert len(synthetic)==3158
sha=hashlib.sha256(synthetic).hexdigest()
with tempfile.TemporaryDirectory(prefix='restore335-forensics-') as name:
    root=Path(name)
    bindir=root/'mock-bin'
    bindir.mkdir()
    adb=bindir/'adb'
    adb.write_text(mod.mock_source,encoding='utf-8')
    adb.chmod(0o755)
    (root/'source.bin').write_bytes(synthetic)
    (root/'installed.marker').write_text('installed')
    (root/'launched.marker').write_text('launched')
    error=b'ANDROID SHELL STDIN TRANSFER ERROR: mocked diagnostic placeholder'
    assert len(error)==65,len(error)
    (root/'private.bin').write_bytes(error)
    test_ps=root/'forensics.ps1'
    test_ps.write_text(script.replace('4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186',sha),encoding='utf-8')
    env={**os.environ,'RESTORE335_MOCK_HOME':str(root),'PATH':str(bindir)+os.pathsep+os.environ['PATH']}
    result=subprocess.run(['pwsh','-NoProfile','-File',str(test_ps)],capture_output=True,text=True,env=env,timeout=35)
    print(result.stdout)
    if result.stderr:print(result.stderr)
    assert result.returncode==0
    assert 'ORIGINAL_SHA256: PASS' in result.stdout
    assert 'PRIVATE_BYTES: 65' in result.stdout
    assert 'PRIVATE_HEX_UP_TO_128:' in result.stdout
    assert 'PRIVATE_ASCII_UP_TO_128: ANDROID SHELL STDIN TRANSFER ERROR:' in result.stdout
    assert 'REPORT_ASCII_UP_TO_128:' not in result.stdout or 'REPORT_HEX_UP_TO_128:' in result.stdout
    assert 'RESTORE335_PRIVATE65_FORENSICS_READONLY_COMPLETE' in result.stdout
    assert (root/'private.bin').read_bytes()==error
    assert (root/'source.bin').read_bytes()==synthetic
print('RESTORE335_PRIVATE65_FORENSICS_MOCK_PASS')
