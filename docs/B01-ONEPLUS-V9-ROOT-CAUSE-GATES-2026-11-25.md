# B01 / P0 — Windows OnePlus V9: устранение класса загрязнения TAR

Дата: 2026-11-25. **Новый PC-инструмент, не изменение установленного APK.** Base main: `fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2`. Draft PR: [#522](https://github.com/250oisr-eng/Pasekaapp/pull/522).

## F0–F2. Доказательства и контракт

Первичный физический источник: пользовательский JSON `paseka-oneplus-app-private-backup-readonly-v8` от 2026-11-25T08:10:45Z: `BLOCKED`, `LOCAL_TAR_VERIFY`, `INVALID_TAR_HEADER_CHECKSUM`, `runAsAvailable=true`, `lastAdbExitCode=0`, `archiveCreated=false`, `archiveBytes=0` (принятых байт), `independentRestore=NOT_TESTED`. Физический OnePlus NE2213, целевое приложение `ru.paseka.journal`.

Ранее (Draft #479) физический V6 подтвердил 16 B + 5 MiB точных нулей plain/run-as, но публичный TAR имел 1090 B (1024+66), `adb 1.0.32` / `shell_v2` не был согласован. Источник Android AOSP (adb/daemon/shell_service.cpp) описывает raw протокол как объединяющий stdout и stderr: https://android.googlesource.com/platform/packages/modules/adb/+/refs/tags/aml_adb_331113120/daemon/shell_service.cpp. AOSP `shell,v2` отдельно передаёт stdout/stderr и удалённый exit: https://android.googlesource.com/platform/packages/modules/adb/+/c362e05a76d7238f684234fe4ad6768c0c461b8d/SERVICES.TXT. Наличие такого механизма **не доказывает** его вклад именно в V8: точный исходный V8 ZIP и повреждённый поток в доступных входных данных отсутствуют.

Предлагаемое изменение: **не чинить неизвестный V8 вслепую, а убрать потенциальный raw stream failure mode**. Новый `tools/b01-oneplus-safe-v9/B01-ONEPLUS-SAFE-V9.ps1` требует отдельный официальный host ADB >=1.0.41 с `shell_v2`, не использует `exec-out` raw, `cmd.exe` или PowerShell текстовое перенаправление для бинарных данных. Запускает `adb.exe` через .NET ProcessStartInfo, `StandardOutput.BaseStream` сохраняет binary, stderr читается параллельно; exit 0 сам по себе не PASS. Android `run-as` помещает дочернюю команду в приватный каталог пакета (AOSP: https://android.googlesource.com/platform/system/core.git/+/refs/heads/master/run-as/run-as.cpp).

## Safety / user path

- Один авторизованный NE2213; строгий `run-as ru.paseka.journal pwd`, `ps -A` до/после, если приложение RUNNING/UNKNOWN — `BLOCKED`. Без force-stop.
- Только публичные читаемые `/system/build.prop` или `/system/etc/hosts` сначала: host exit/stderr + 512-байтная кратность, каждый октальный checksum и размер, минимум 2 EOF-блока; private files ещё не читались.
- Лишь после literal `CAPTURE`: новый каталог `results/run-*`, `FileMode.CreateNew`, 8-GiB верхний предел, проверка каждого header/payload offset/EOF, SHA-256 и только счётчики подсказок WebView/SQLite в отчёте. Старые архивы не перезаписываются; не логируются имена элементов TAR.
- Никаких install/uninstall/clear/forceStop/restore/original video delete, Android writes, сетевой передачи или чтения Gallery/MediaStore.
- Даже структурно валидный TAR = `STRUCTURALLY_VALID_CANDIDATE_RESTORE_NOT_VERIFIED`, не `fullBackupVerified`. TAR-header checksum не защищает содержимое payload, поэтому независимый restore, media inventory, источниковые SHA и соответствие истории/Blob пока REQUIRED/BLOCKED.
- Неправильная структура/неподходящая версия adb/неопределённый процесс/отсутствующие storage hints/ненулевой stderr — fail closed.

## Тесты / границы готовности

- `tests/b01-v9-capture-contract.test.mjs`: 5 статических contract tests (только наличие и порядок guards). Локально: 5/5 PASS. Не свидетельство Windows/Android.
- Windows PowerShell 5.1 в GitHub Actions на полностью синтетическом `tests/b01-v9-MockAdb.cs`: 8 сценариев — `PASS` только для корректного synthetic TAR, семь негативных отклонены: BAD_HEADER, BAD_PRIVATE_HEADER, RUNNING, OLD_ADB, NO_SHELL_V2, REMOTE_ERROR, BAD_COVERAGE. Run [#45575886776](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45575886776) SUCCESS на кодовом `c4eeb62c1a6d2a5566646a16fee4752b67c99195`. **Реальный ADB/OnePlus не запускался.**
- Бинарный TAR источника не отправлять в чат/Git/CI. Предыдущие неполные TAR сохранять, но не применять для восстановления.
- До B01 closure: физический Windows+OnePlus публичный gate, приватный кандидат с доказательством согласованности/байт, инвентаризация всех оригинальных медиа и **независимый restore на отдельной пустой цели**. Только после этого можно обсуждать APK upgrade, media lifecycle и release.

**Статус F0–F5:** `IMPLEMENTED_DRAFT`, Windows synthetic CI verified; **F6 physical = NOT_TESTED**, **F7 main integration = NOT_DONE**, **B01=BLOCKED**, `NO_VIDEO_DELETE`.
