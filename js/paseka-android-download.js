(function (global) {
  'use strict';

  const MIME = 'application/vnd.paseka.archive';
  const CHUNK_BYTES = 256 * 1024;

  function readBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать блок архива'));
      reader.onload = () => {
        const value = String(reader.result || '');
        const comma = value.indexOf(',');
        if (comma < 0) reject(new Error('Не удалось подготовить блок архива'));
        else resolve(value.slice(comma + 1));
      };
      reader.readAsDataURL(blob);
    });
  }

  async function saveToAndroidDownloads(blob, filename, onProgress) {
    // An empty or invalid payload must not create a public Downloads entry.
    // Never report a zero-byte file as a successfully saved full archive.
    if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 1 ||
        typeof blob.slice !== 'function') {
      throw new Error('Полный архив пуст или повреждён. Сохранение отменено.');
    }
    const bridge = global.PasekaArchiveDownload;
    if (!bridge || typeof bridge.beginFile !== 'function' ||
        typeof bridge.appendChunk !== 'function' || typeof bridge.finishFile !== 'function') {
      throw new Error('Android-модуль сохранения файлов не подключён. Обнови тестовую сборку.');
    }

    const sessionId = bridge.beginFile(filename, MIME);
    if (!sessionId) {
      throw new Error(bridge.getLastError?.() || 'Android не смог создать файл в папке «Загрузки/Пасека».');
    }

    try {
      const total = Math.max(1, Math.ceil(blob.size / CHUNK_BYTES));
      for (let offset = 0, index = 0; offset < blob.size; offset += CHUNK_BYTES, index += 1) {
        const base64 = await readBase64(blob.slice(offset, Math.min(blob.size, offset + CHUNK_BYTES)));
        if (!bridge.appendChunk(sessionId, base64)) {
          throw new Error(bridge.getLastError?.() || 'Android не записал очередной блок архива.');
        }
        if (typeof onProgress === 'function') onProgress(index + 1, total);
      }
      const uri = bridge.finishFile(sessionId);
      if (!uri) throw new Error(bridge.getLastError?.() || 'Android не завершил сохранение архива.');
      return uri;
    } catch (error) {
      try { bridge.cancelFile(sessionId); } catch (_) {}
      throw error;
    }
  }

  global.PasekaAndroidDownload = Object.freeze({ saveToAndroidDownloads });
})(window);
