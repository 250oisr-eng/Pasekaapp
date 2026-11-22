# Android A08 — синтетический тест сохранности после уничтожения процесса

Статус: физический Android A08 SYNTHETIC-ONLY PASS по пользовательскому отчёту от 2026-11-22; Android force-stop, реальный архив и удаление видео NOT_TESTED.

Цель — на физическом Android проверить **другое свойство**, чем ранее пройденные A01/A04/A05/A06/A07/A10: сохранение ранее подтверждённых SHA-256 синтетических IndexedDB Blob и метаданных после **уничтожения процесса своего диагностического приложения**. Не смешивать с force-stop пакета через Settings/ADB: `Process.killProcess(myPid())` завершает собственный процесс, но **не** устанавливает Android stopped state.

Процедура: «Провести тест» → запись только в собственной отдельной IndexedDB → проверка хэшей → сохранение ожидаемого SHA/nonce как synthetic checkpoint → вызов отдельного нативного Android plugin для сохранения nonce + PID в собственных SharedPreferences и уничтожения **только своего PID** → пользователь снова открывает диагностический APK → приложение автоматически проверяет, что PID изменился, nonce совпал, а IndexedDB данные/хэши сохранились → «Копировать результат» → вставка полного JSON в чат. Если остановка не подтверждена — BLOCKED, **никогда PASS без доказательства**.

Требования:
- Новый package `ru.paseka.journal.diagnostic.archivea08v1`; не обновлять предыдущий diagnostic APK с другим debug-сертификатом.
- Никакого INTERNET, CAMERA, READ_MEDIA, backup/restore, удаления, обращения к видео, другим приложениям или пользовательскому архиву.
- Секретные/видеоданные не копируются; только синтетический размер, SHA, статус и контрольные признаки. Существующие synthetic записи другого формата не перезаписывать.
- Нативный код жёстко проверяет packageId перед kill; завершает только текущий процесс. Не использовать `am force-stop`, не изменять другие процессы.
- A08_PASS относится **только** к собственному isolated synthetic IndexedDB. `realArchiveRestore:NOT_TESTED`, `cleanupAuthorized:false`, `restoreAuthorized:false`, `archiveSafe:false` всегда.
- Для CI — unit tests на двухфазную state machine и ограничение package/permissions; CI не подтверждает физическое завершение процесса. Физический телефон нужен ровно для одного сценария перезапуска; итоговый отчёт копируется кнопкой.


## 2026-11-22 — PHYSICAL PASS: A08 синтетические Blob пережили уничтожение процесса

- Пользователь прислал полный JSON с физического Android: `status:PASS`, `code:A08_SYNTHETIC_PROCESS_KILL_VERIFIED`, `packageId:ru.paseka.journal.diagnostic.archivea08v1`, `suite:ARCHIVE_A08_PROCESS_KILL_V1`. Подтверждены `A08_SYNTHETIC_BLOB_HASH_AFTER_PROCESS_KILL:PASS`, `A08_NATIVE_PID_CHANGED:PASS`, `scenariosVerified:[A08_PROCESS_KILL_SYNTHETIC_ONLY]`, `processKillVerified:true`, `syntheticBlobHashVerified:true`.
- Это именно **пользовательский отчёт с физического устройства** о завершении **своего процесса приложения** с новым PID и неизменным SHA-256 синтетических Blob после повторного открытия; отдельно от CI и от простого `db.close()`. **НЕ** доказывает Android `am force-stop`: `androidForceStopVerified:false`, `A08_ANDROID_FORCE_STOP` указан среди неиспытанных.
- Продолжают действовать `scenariosNotTested:[A02_REAL_PASEKA01,A03_REAL_PASEKA02,A09_NETWORK_PERMISSION_DEVICE_AUDIT,A08_ANDROID_FORCE_STOP]`; `beeRecognition:NOT_TESTED`, `realArchiveRestore:NOT_TESTED`, `realVideoAccess:NOT_ATTEMPTED`, `externalMediaAccess:NOT_ATTEMPTED`, `videoDeletion:NOT_ATTEMPTED`, `networkRequests:NOT_ATTEMPTED`, `userDataModified:false`. `cleanupAuthorized:false`, `restoreAuthorized:false`, `archiveSafe:false`.
- Базовый code SHA A08 `964df091e6b9457510d613e427ff10f59f4e76f8`: isolated CI #45008175643 **success**, общий Android CI #45008175656 **success**; физический PASS независим и имеет более узкую область, чем реальный архив. Следующая безопасная работа — A09 аудит разрешений и сетевых возможностей на физическом Android; ни один вывод не должен автоматически разрешать архивное восстановление/удаление.

---

