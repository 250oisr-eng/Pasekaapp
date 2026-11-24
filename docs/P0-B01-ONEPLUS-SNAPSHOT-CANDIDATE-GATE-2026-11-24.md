# B01 / B11 — единый безопасный блок OnePlus → Windows (кандидат копии)

Дата: 2026-11-24. База `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`. Это **план read-only локального доказательства**, не production rollout, и не свидетельство успешно восстановленного архива.

## Физически подтверждено пользователем до этого этапа

- OnePlus NE2213 Android 16, `ru.paseka.journal` v1.0, установленный base.apk 8 350 003 байта, SHA-256 `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6`; встроенная shell `v315`, `main` shell `v317`. Активный WebView SW и обновление кеша не проверены.
- Отчёты пользователя: офлайн-чтение существующих улья, семьи и двух заметок 2/2 PASS, те же записи сохранены после нескольких полных перезагрузок. Уровень `USER_REPORTED_DEVICE_PASS`; не равно миграции/restore.
- `run-as ru.paseka.journal id` PASS; каталоги `app_webview/Default/IndexedDB`, `Local Storage`, `databases`, `files` присутствуют; содержимое не читалось.
- Установленная v315 не содержит `disaster-archive.js` / полного export UI. `apksigner.jar` найден, но локальная Java не обнаружена; сертификат неизвестен, не объявлять неподписанным.

## Один пакет проверок для пользователя

Локальный отдельно предоставляемый ZIP `PASEKA-B11-consolidated-OnePlus-safe-capture.zip`, SHA-256 ZIP `a809bacd784f16c6f603a55f544a3bf8381a3319a80b9ef8bd4b585ad7e9dcca`; внутри `START-B11-BATCH.cmd`, `B11-BACKUP-CANDIDATE.ps1`, `README.txt`. Процедура без установки Android software; Windows PowerShell 5.1 + ADB.

1. Одно авторизованное USB ADB-устройство модели NE2213, `run-as` владельца приложения; повторный read-only `adb pull` установленного base.apk и SHA-256 identity gate.
2. **Без автоматической остановки процесса:** проверить `pidof ru.paseka.journal`; при наличии процесса — `BLOCKED/APP_PROCESS_RUNNING_NO_CAPTURE`, никаких действий с app process. Пользователь может закрыть приложение самостоятельно и повторить весь блок, не выполняя reset/uninstall.
3. Только при пользовательском буквальном вводе `CAPTURE` — выбрать уже существующую **локальную, не синхронизируемую** папку Windows. Бинарным потоком `adb exec-out run-as ru.paseka.journal tar -cf - .` прочитать каталог private sandbox в **новый** TAR на ПК. Не писать и не удалять файлы телефона.
4. Проверить завершение tar, ненулевую длину, повторно `pidof`, локальный `tar -tf`, вычислить SHA-256. Вывести **только JSON с кодом состояния/байтами/хешем/количеством элементов**. Пути/содержимое файлов пользователя в JSON не выводить. Архив в чат не отправлять.
5. Если любой gate FAIL/UNKNOWN, остановить и не объявлять `fullBackupVerified`. При частичном файле на ПК он остаётся приватным, не считается восстановимой копией.

## Границы доказательства и дополнительные ворота

- Такой TAR — только `CANDIDATE_ARCHIVE_CREATED_RESTORE_NOT_VERIFIED`. Даже отсутствие процесса до/после и успешное чтение TAR **не доказывают согласованность транзакций WebView IndexedDB/SQLite**, тем более восстановление истории, Blob, всех копий и ссылок.
- Системные Gallery, Camera, Downloads, MediaStore, внешние app-specific файлы **не гарантируются**; инвентаризация источников (G0), независимое сопоставление bytes, безопасное защищённое хранение и test restore на отдельном пустом target остаются обязательными.
- TAR может содержать персональные записи/секреты; не сохранять в общую папку, облако или чат. Хранить на зашифрованном защищённом носителе. Не делиться с разработчиком содержимым.
- Android `force-stop`, `install`, `uninstall`, `pm clear`, restore, удаление, production deployment, выпуск v317 не разрешены и в комплект не входят.
- Локальная структурная проверка ZIP (CRC) и статические проверки read-only/opt-in контрактов прошли; **Windows/Android фактический запуск нового блока NOT_TESTED**. Инструмент не способен самостоятельно подтвердить полноту аварийного восстановления.

## Результат пользователя v1 и исправленный сводный пакет v2 (24.11.2026)

- Пользователь запустил v1 и предоставил `PASEKA_B11_CONSOLIDATED_SAFE_CAPTURE_V1`: `BLOCKED / SAFE_CAPTURE_BLOCKED`, `errorCode=PIDOF_RESULT_AMBIGUOUS`; модель `NE2213`, `runAsAvailable=true`, SHA-256 установленного APK совпадает, `archiveCreated=false`, никаких изменений телефона.
- **Причина:** в PowerShell v1 пустой stdout `pidof` при exit code **0** ошибочно считается неоднозначным вместо проверки через вторую команду. Нельзя объявлять процесс остановленным только по пустому stdout — новая версия исправляет это без снятия запрета.
- Подготовлен один исправленный ZIP `PASEKA-B11-consolidated-OnePlus-safe-capture-v2.zip`, SHA-256 ZIP `8508c8dfed8fc7e91c1a72e1496521f60f1b2e1f54af0503a7cc4d5c3bdf4bd0`. Процесс: числовые PID → RUNNING; пустой pidof с exit 0/1 и без stderr подтверждать только по корректному выводу `adb shell ps -A` (PID, NAME; нет `ru.paseka.journal` и процессов `:service`); некорректный/несогласованный вывод → UNKNOWN/BLOCKED.
- Повторить проверку состояния непосредственно перед чтением и после него; при любом RUNNING/UNKNOWN — STOP, файл-кандидат не может считаться проверенным архивом. Явный ввод `CAPTURE` сохраняется. ZIP CRC/структура и статические STOP/read-only проверки прошли **локально**, реальное Windows/OnePlus исполнение **NOT_TESTED**; PowerShell 5.1 не запускался в текущей среде.
- **V1 архив не создал.** Никакой B01 restore/upgrade gate не снят. При v2 PASS без `CAPTURE` также нет backup; при TAR PASS это только приватный кандидат, пока нет независимого restore.

## Следующее решение после отчёта

Если кандидат создан — отдельно спроектировать/проверить изолированный restore, после него установленные signing fingerprint и upgrade policy. Если `APP_PROCESS_RUNNING_NO_CAPTURE` — не обходить stop-gate техническими ухищрениями. Если Java для подписи отсутствует — использовать доступный Android Studio JBR/локальную Java после изучения SDK, без изменения APK.

**Статус:** `SAFE_CONSOLIDATED_BLOCK_PREPARED / DEVICE_NOT_RUN / FULL_RESTORE_BLOCKED`; никакого merge этого Draft PR без отдельного разрешения.
