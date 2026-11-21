"""Exercise the expression shipped to the phone in a real desktop Chromium."""
import os
import subprocess
import hashlib
import shutil
import tempfile
import socket
from pathlib import Path
import unittest
from playwright.sync_api import sync_playwright, Error

ROOT = Path(__file__).resolve().parents[1]
EXPRESSION = (ROOT / 'tools/check-restored-picker-frames.ps1').read_text().split("$expression=@'\n")[1].split("\n'@")[0]
SEED = """async (mode) => {
 const req=indexedDB.open(PasekaIsolatedRestore335.DATABASE,1);
 req.onupgradeneeded=()=>req.result.createObjectStore('entrance_media',{keyPath:'id'});
 const db=await new Promise((ok,no)=>{req.onsuccess=()=>ok(req.result);req.onerror=no});
 const tx=db.transaction('entrance_media','readwrite');
 for(const fixture of PasekaTwoMp4ProofFixtures){
  const bytes=Uint8Array.from(atob(fixture.base64),c=>c.charCodeAt(0));
  if(mode==='corrupt') bytes[0]^=255;
  tx.objectStore('entrance_media').add({id:fixture.id,blob:new Blob([bytes],{type:'video/mp4'})});
 }
 await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=no}); db.close();
}"""


class FramesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        with socket.socket() as bound:
            bound.bind(('127.0.0.1', 0))
            cls.port = bound.getsockname()[1]
        cls.browser = cls.pw.chromium.launch(executable_path=os.environ.get('CHROME_BIN'),
            args=[f'--remote-debugging-port={cls.port}'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def setUp(self):
        page = self.browser.new_page()
        self.addCleanup(page.close)
        page.route('https://localhost/', lambda route: route.fulfill(
            content_type='text/html', body='<input id="archive" type="file">'))
        page.goto('https://localhost/')
        for name in ['android-fileproof335-isolated-restore.js', 'android-two-mp4-proof-fixtures.js']:
            page.add_script_tag(content=(ROOT / 'tests/fixtures' / name).read_text())
        self.page = page

    def test_missing_database_stays_absent(self):
        with self.assertRaisesRegex(Error, 'RESTORED_DATABASE_REQUIRED'):
            self.page.evaluate(EXPRESSION)
        self.assertEqual(self.page.evaluate('indexedDB.databases()'), [])

    def test_corrupt_blob_is_rejected(self):
        self.page.evaluate(SEED, 'corrupt')
        with self.assertRaisesRegex(Error, 'RESTORED_SHA_MISMATCH'):
            self.page.evaluate(EXPRESSION)

    def test_decode_both_pinned_frames(self):
        self.page.evaluate(SEED, 'valid')
        try:
            report = self.page.evaluate(EXPRESSION)
        except Error as exc:
            if 'MEDIA_ERROR_4_android-proof-black' in str(exc):
                self.skipTest('Desktop browser reported unsupported MPEG-4 Part 2')
            raise
        self.assertEqual(report, {
            'status': 'PASS', 'decodedFrames': ['android-proof-black', 'android-proof-white'],
            'cleanupAuthorized': False})

    def test_host_protocol_with_mock_usb_and_real_browser_endpoint(self):
        self.page.evaluate(SEED, 'valid')
        if not shutil.which('pwsh'):
            self.skipTest('PowerShell required for host protocol')
        with tempfile.TemporaryDirectory() as temp:
            fake = Path(temp) / 'adb'
            fake.write_text("""#!/usr/bin/env python3
import sys
commands = {
 ('shell','getprop','ro.product.model'): 'NE2213',
 ('shell','getprop','ro.build.version.sdk'): '36',
 ('shell','pm','path','ru.paseka.journal.archive.restorepicker'): 'package:/data/app/test/base.apk',
 ('shell','sha256sum','/data/app/test/base.apk'): '447362148694101f55ba789ae27b10ca3faf57a1b3b1c07307bf9e7b290ca5d7  /data/app/test/base.apk',
 ('shell','am','start','-W','-n','ru.paseka.journal.archive.restorepicker/.MainActivity'): 'Status: ok',
 ('shell','pidof','ru.paseka.journal.archive.restorepicker'): '100',
 ('forward','tcp:0','localabstract:webview_devtools_remote_100'): 'PORT',
 ('forward','--remove','tcp:PORT'): '',
}
if sys.argv[1]!='-d':sys.exit(2)
print(commands[tuple(sys.argv[2:])])
""".replace('PORT', str(self.port)))
            fake.chmod(0o755)
            original = (ROOT / 'tools/check-restored-picker-frames.ps1').read_text()
            script = Path(temp) / 'test.ps1'
            script.write_text(original.replace('bae5ce98846b19caa74a34900850caa8b21d01976932b2ad83baeb5de5651aee',
                                                hashlib.sha256(fake.read_bytes()).hexdigest()))
            proc = subprocess.Popen(['pwsh','-NoProfile','-File',str(script),'-AdbPath',str(fake)],
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            # Keep Playwright's route handler alive while the second client evaluates.
            for _ in range(300):
                if proc.poll() is not None:
                    break
                self.page.wait_for_timeout(200)
            output = proc.communicate(timeout=5)[0]
            if proc.returncode == 2:
                self.assertIn('MEDIA_ERROR_4_android-proof-black', output, output)
            else:
                self.assertEqual(proc.returncode, 0, output)
                self.assertIn('PASS: two restored MP4 frames decoded', output)
