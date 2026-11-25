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

## 25.11.2026 — физический V9 и исправленный preflight V9.1

Пользовательский `b01-v9-result.json` (`2026-11-25T08:30:04.3973340Z`) показал: `BLOCKED / PREFLIGHT / ADB_READONLY_COMMAND_FAILED`, `adbVersion=1.0.41`, `deviceModel=null`, `shellV2Advertised=false` как ещё не выполненный gate, `publicTar=NOT_TESTED`, `privateTar=NOT_ATTEMPTED`, `phoneWrites=NOT_ATTEMPTED`. Байт приватного TAR не получено, independent restore отсутствует. Из-за объединённого отказа V9 невозможно отличить `devices -l` от `getprop` по этому JSON.

Исходник AOSP [adb_client.cpp](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/client/adb_client.cpp) подтверждает, что ADB-клиент пишет диагностическую последовательность запуска daemon в host stderr; `adb devices -l` может инициировать запуск сервера. Это **возможное объяснение**, а не установленная первопричина V9.

Исправление V9.1 на том же Draft #522: в JSON сохраняются фиксированный `scriptRevision`, `adbProbeId`, код выхода, длина и обезличенный класс stderr, `adbServerStartupObserved`. Для **первого** `adb devices -l` допустим **только** известный полный daemon-startup баннер при exit0, затем однократное повторение: повтор обязан иметь exit0 и пустой stderr. Несоответствие, повторное предупреждение, отказ `getprop` или другие ошибки — `BLOCKED`. Для TAR stderr по-прежнему недопустим. Никакого перезапуска/kill-server по собственной команде, удаления, сетевых запросов, очистки или установки.

Windows PowerShell 5.1 synthetic CI проверил 14 режимов (включая STARTUP_ONCE→принятие synthetic и негативные повторный startup, unknown stderr, ошибка getprop, unauthorized): [run #45577450594](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45577450594) SUCCESS; Governance [#45577450377](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45577450377) SUCCESS на HEAD `69cd80dbb428f64a6c508079185ff4e01486be5a`. Реальное устройство V9.1 **NOT_TESTED**.

Выдан локальный пакет `PASEKA-B01-ONEPLUS-V9.1-ADB-FIX-VERIFIED.zip`, SHA-256 `82f10887efdaefb7fe1288cc948a2caaa9de2865f77325d5dabaad2124454e33`: ZIP CRC и SHA Git blob скрипта `faac2ea1b745237588ab95fc54276e353deccb1f` совпадают с кодом PR. Источник private TAR не загружался, пользователь делится только JSON. `B01=BLOCKED`, full source inventory, independent empty-target restore, Gallery/MediaStore и media cleanup по-прежнему не разрешены.

## 25.11.2026 — физический V9.1: публичный TAR имеет недопустимую длину

Предоставленный пользователем `b01-v9-result(1).json` (2026-11-25T08:38:45.2562294Z) подтвердил `adbVersion=1.0.41`, `shellV2Advertised=true`, `deviceModel=NE2213`, `adbProbeId=PROCESS_LIST / exitCode=0 / stderrClass=NONE`. Проверка достигла `PUBLIC_TAR_GATE` и завершилась `BLOCKED / PUBLIC_TAR_INVALID_TAR_BLOCK_ALIGNMENT_OR_LENGTH_INVALID`; `privateTar=NOT_ATTEMPTED`, `phoneWrites=NOT_ATTEMPTED`, `independentRestore=NOT_TESTED`. Поле `publicTar=NOT_TESTED` означает отсутствие **принятого** TAR, не отсутствие чтения публичного файла.

Ошибка V9.1 отличается от V9 PREFLIGHT и V8 PRIVATE checksum. Точная длина и содержимое публичного TAR в текущем JSON не указаны; нельзя утверждать, что это старый сценарий 1090 байт/66 текстовых байт, ошибка Android tar или порча канала. Игнорировать 512-блоки, добавлять padding либо выключать проверку checksum недопустимо.

Создан отдельный **PC-only V10 offline forensic**: `tools/b01-oneplus-safe-v9/B01-PUBLIC-TAR-FORENSIC-V10.ps1` и `START-PUBLIC-FORENSIC-ONLY.cmd`. Утилита берёт только ранее сохранённый `results/run-*/public-only-v9.tar` (не private candidate), проверяет ограничение 64 MiB, reparse point, неизменность файла, считает общий размер, mod512, первый checksum, нулевые EOF-блоки, классифицирует печатный хвост *без печати текста или путей*. **Не вызывает ADB, не подключается к Android, не удаляет/перезаписывает файлы и не извлекает TAR.**

На Windows PowerShell 5.1 GitHub CI синтетически подтверждены 5 типов файлов: корректный TAR, изменённый header, truncated, 1024 нулевых байта + 66 байт текстового tail (фактический размер тестового примера 1090, только synthetic), и корректный TAR + 66 байт текста. Run [#45578447890](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45578447890) SUCCESS на SHA `8b1f668ea4cb94b36d568e9b843be4982909084f`. Этот тест **не устанавливает**, что реальный OnePlus выдаёт такой tail; нужен один JSON локального исследования существующего файла. На уровне V0–V6/видео/backup ничего не разблокировано.

Следующее решение: классификация публичного TAR по PC JSON. Если `EMPTY_TAR_EOF_PLUS_UNALIGNED_TRAILER` и хвост печатный — расследовать конкретную remote tar команду и stderr **без новых приватных захватов**. Если `UNALIGNED_BYTES` без EOF — расследовать обрыв передачи. Если `BAD_HEADER` — независимый валидатор, формат/кодек. Ни один результат сам по себе не разрешает full restore или deletion.
