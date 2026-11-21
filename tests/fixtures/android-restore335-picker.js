// Isolated APK only. The restore module verifies the full pinned digest before opening IndexedDB.
(function (root) {
  'use strict';
  root.addEventListener('DOMContentLoaded', () => {
    const picker = root.document.getElementById('archive');
    const result = root.document.getElementById('result');
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      if (!file || picker.disabled) return;
      if (file.size !== 3158) {
        result.textContent = 'Нужен исходный тестовый архив размером 3158 байт.';
        picker.value = '';
        return;
      }
      picker.disabled = true;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const proof = await root.PasekaIsolatedRestore335.run(bytes);
        result.textContent = JSON.stringify({status:'PASS', archiveSha256:proof.archiveSha256,
          videoCount:proof.videoCount, reopenedIndexedDB:true, mp4Decoder:'NOT_TESTED',
          recognitionSucceeded:false, cleanupAuthorized:false});
      } catch (error) {
        result.textContent = JSON.stringify({status:'BLOCKED', code:error.code || 'FILE_OR_RESTORE_FAILED',
          cleanupAuthorized:false});
      }
    });
  });
})(window);
