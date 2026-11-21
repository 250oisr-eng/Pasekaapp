#!/usr/bin/env python3
"""Negative-only tests for offline Platform-Tools ZIP staging; no real ADB or phone."""
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile
root=Path(__file__).resolve().parents[1]
script=root/'tools/android-restore335-offline-platformtools-stage.ps1'
with tempfile.TemporaryDirectory(prefix='paseka-platformtools-negative-') as folder:
    dir=Path(folder)
    evil=dir/'bin'
    evil.mkdir()
    adb=evil/'adb'
    adb.write_text('#!/bin/sh\nprintf "UNEXPECTED_ADB_CALLED"\nexit 93\n',encoding='utf-8')
    adb.chmod(0o755)
    env={**os.environ,'PATH':str(evil)+os.pathsep+os.environ['PATH'],'TEMP':str(dir)}
    def run(path):
        result=subprocess.run(['pwsh','-NoProfile','-File',str(script),'-ZipPath',str(path)],
                              capture_output=True,text=True,env=env,timeout=30)
        print(result.stdout)
        if result.stderr:print(result.stderr)
        assert result.returncode==2,result.stdout
        assert 'ANDROID_CONNECTION_NOT_ATTEMPTED_NO_SYSTEM_CHANGES_NO_DELETE' in result.stdout
        assert 'UNEXPECTED_ADB_CALLED' not in result.stdout
        return result.stdout
    assert 'OFFICIAL_GOOGLE_ZIP_MISSING_DOWNLOAD_FIRST' in run(dir/'missing.zip')
    required=('platform-tools/adb.exe','platform-tools/AdbWinApi.dll','platform-tools/AdbWinUsbApi.dll')
    for case,entries in {
        'traversal':list(required)+['platform-tools/../../outside.dat'],
        'backslash':list(required)+['platform-tools\\evil'],
        'missing_dll':['platform-tools/adb.exe','platform-tools/AdbWinApi.dll','platform-tools/pad.dat'],
        'duplicate':list(required)+['platform-tools/adb.exe'],
    }.items():
        archive=dir/(case+'.zip')
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED) as z:
            for name in entries:
                z.writestr(name,b'X'*409600)
        out=run(archive)
        expected={'traversal':'ZIP_UNSAFE_ENTRY','backslash':'ZIP_UNSAFE_ENTRY',
                  'missing_dll':'ZIP_REQUIRED_FILE_MISSING_platform-tools/AdbWinUsbApi.dll',
                  'duplicate':'ZIP_DUPLICATE_ENTRY'}[case]
        assert expected in out,(case,out)

    # An official-style ZIP often contains a distinct empty root directory.
    # The directory must pass structural inspection. The dummy adb.exe is not
    # executable as a Windows PE binary and must still fail before any device I/O.
    archive=dir/'official_style_root_marker.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED) as z:
        z.writestr('platform-tools/',b'')
        for name in required:
            z.writestr(name,b'X'*409600)
    out=run(archive)
    assert 'STAGE: 2/3 EXTRACT_FRESH_ISOLATED_WINDOWS_FOLDER' in out,out
    assert 'STAGE: 3/3 VERSION_ONLY_NO_DEVICE_CONNECTION' in out,out
    assert 'ZIP_UNSAFE_ENTRY' not in out,out
    assert 'UNEXPECTED_ADB_CALLED' not in out
    # Still fail-closed for a non-empty purported directory marker.
    archive=dir/'unsafe_root_marker.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED) as z:
        z.writestr('platform-tools/',b'NOT_A_DIRECTORY')
        for name in required:
            z.writestr(name,b'X'*409600)
    out=run(archive)
    assert 'ZIP_DIRECTORY_HAS_CONTENT' in out,out
print('RESTORE335_OFFLINE_PLATFORMTOOLS_NEGATIVE_MOCK_PASS')
