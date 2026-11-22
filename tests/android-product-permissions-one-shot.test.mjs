import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../tools/android-product-permissions-one-shot.ps1',import.meta.url),'utf8');
test('pinned GitHub Actions artifact, binary SHA, and two separate package identities',()=>{
 for(const exact of [
 '45032633730','paseka-product-installed-permissions-readonly-apk',
 '04fdba8e71f57bf896ca2af43149437d101d5ffc15f24d30c6f7bcf351bf1216',
 "ru.paseka.journal.diagnostic.productpermsv1","$product='ru.paseka.journal'",
 "Get-FileHash","-Algorithm SHA256",
 "DIAGNOSTIC_ALREADY_PRESENT_NO_REINSTALL",
 "EXACTLY_ONE_AUTHORIZED_USB_DEVICE_REQUIRED",
 "CLEANUP_OR_RESTORE_AUTHORIZED: FALSE"
 ])assert.ok(script.includes(exact),exact);
});
test('no uninstall, overwrite, force-stop, restore, or media mutation on Android',()=>{
 const executable=script.replace(/^\s*#.*$/gm,'');
 for(const pattern of [
 /\bpm\s+clear\b/i,/\buninstall\b/i,/\bforce-stop\b/i,
 /['"]-r['"]/,/\bMediaStore\b/i,/\b(run-as|exec-in|push|pull|rm)\b/i,
 /['"]monkey['"][^\n]*\$product/,/['"]install['"][^\n]*\$product/,
 /['"]-d['"]\s*,\s*['"]install['"]\s*,\s*['"]-r['"]/
 ])assert.doesNotMatch(executable,pattern);
 assert.match(script,/['"]install['"]\s*,\s*\$apk\.FullName/);
 assert.match(script,/['"]monkey['"]\s*,\s*['"]-p['"]\s*,\s*\$diagnostic/);
 assert.match(script,/PRODUCT_NOT_INSTALLED_NO_TEST/);
 assert.match(script,/DIAGNOSTIC_APPEARED_NO_REINSTALL/);
});
test('report does not overclaim physical permission audit after install and launch',()=>{
 assert.match(script,/PHYSICAL_PERMISSION_AUDIT: NOT_TESTED_UNTIL_TWO_BUTTON_REPORT/);
 assert.match(script,/NO_UNINSTALL_NO_RESET_NO_PRODUCT_CHANGE_NO_VIDEO_DELETE/);
 assert.doesNotMatch(script,/PHYSICAL_PERMISSION_AUDIT: PASS/);
});
