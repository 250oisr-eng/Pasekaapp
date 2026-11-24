# PROJECT_STATUS — Пасека 2.0

**2026-11-24.** Live `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`. Нормативный цикл F0–F7 и запреты — [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). История изменений — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## Подтверждённое состояние

- #471–#477 **MERGED** (архив read-only, IDB guards, Varroa/journal rollback, SW v317 private/no-store install fail-closed). Проверенный exact-main SHA `0e62ced6...`: Fast #45476750153, Android #45476750242, Governance #45476750196 **SUCCESS**. Никакого production deploy.
- [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478) — тесты lifecycle SW, **NOT_IN_MAIN**. На SHA `a5e7ab8d539f0110beb482425bd6fd144769d14e` Android #45483004363, Governance #45483004397 **SUCCESS**, но точный новый HEAD проверять отдельно.
- **OnePlus USER_REPORTED_DEVICE_PASS:** NE2213 Android 16, `ru.paseka.journal` v1.0, `base.apk` 8 350 003 bytes, SHA-256 `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6`; встроенный SW v315. Два офлайн-открытия и сохранность улья, семьи, двух заметок после нескольких reboot PASS. **Активный SW и upgrade v315→v317 NOT_TESTED.**
- **V3/V5/V6 read-only evidence:** установленный v315 не содержит полного экспортного UI/модуля `disaster-archive.js`. `run-as` доступен; каталоги WebView/IndexedDB/Local Storage/databases/files существуют. Само содержимое не копировалось; backup/restore НЕ доказаны. Локальный `apksigner.jar` есть, доступного Java нет; signer `NOT_VERIFIED` (не доказана несовместимость).

## B01: обнаружен дефект архива (исправление до новой копии)

- **24.11.2026, PC-only USER_REPORTED_JSON:** `PASEKA_B01_LOCAL_ARCHIVE_AUDIT_V1=BLOCKED`; TAR в `D:\\PasekaBackup` имеет прежний SHA-256 и размер, но Windows tar.exe сообщает `Damaged tar archive (bad header checksum)`. Размер **5 119 715 % 512 = 227**: заведомо не кратен базовому блоку TAR. Из-за ошибки stderr PowerShell `tarListExitCode=null` — это не доказательство конкретного exit code. **TAR повреждён / непригоден как подтверждённый backup. Не удалять оригинал и не применять restore.**
- Предыдущий V2 capture ложно принял короткий `tar -tf` и 17 заголовков за валидный архив. Первопричина повреждения байтов в канале tar/adb/Windows **НЕ УСТАНОВЛЕНА**. До повторного считывания с телефона нужен полный локальный forensic header walk и усиление проверки потокового копирования (TAR 512 boundary, zero EOF blocks, stderr, hashes, байтовое чтение). Подготовлен **PC-only** ZIP `PASEKA-B01-PC-TAR-forensic-readonly-v2.zip`, SHA-256 `ed8f49f68263a2f3e26fbfaa96cc2491bda5ac81455ed4e8fbdb5a484ca8eaf4`; физический запуск на Windows НЕ ПРОВЕРЕН, в архив не пишет.
- [Draft #479](https://github.com/250oisr-eng/Pasekaapp/pull/479) документация; никакой телефонный повтор/установка APK/восстановление пока не выполнять.

## Активная работа B01 → B11

- [Документированный gate кандидата внешней копии](docs/P0-B01-ONEPLUS-SNAPSHOT-CANDIDATE-GATE-2026-11-24.md) подготовлен отдельно от Draft #478: один Windows/USB/ADB пакет, identity SHA gate, `run-as`, проверка отсутствия процесса, **только при явном CAPTURE** бинарный TAR app-private sandbox в локальную пользовательскую папку, контроль структуры/хеша. Никогда не передавать TAR в чат. Без остановки процесса, установки APK или очистки.
- Первый запуск bundle V1 по JSON пользователя остановился `PIDOF_RESULT_AMBIGUOUS` **до CAPTURE**, файл не создан, телефон не изменён. Исправленный сводный **V2** ZIP SHA-256 `8508c8dfed8fc7e91c1a72e1496521f60f1b2e1f54af0503a7cc4d5c3bdf4bd0` дополнительно проверяет пустой `pidof` через `ps -A` и сохраняет STOP при неоднозначности. ZIP/статические условия проверены, **реальный запуск V2 NOT_TESTED**, `fullBackupVerified=false`. TAR не равен восстановлению, внешний MediaStore не включён. V2 USER_REPORTED_PASS (создание файла, НЕ целостности): архив-кандидат записан в `D:\\PasekaBackup` (TAR 5 119 715 байт, 17 элементов, SHA-256 `70ac319f8641cee92494bb54f329d574d3a5ef040c67a5b5cef68e9a45c072de`), телефон не изменён, `restoreTested=false`. Подготовлена одна **PC-only** read-only ZIP-проверка SHA/структуры без подключения OnePlus (ZIP `5d3c6fb7f2f3c54f01674b318679e45f854facbf6252b3a8160e22435cdd32f2`); запуск на Windows NOT_TESTED. Не объявлять полный backup или restore до независимого испытания.
- **Draft #469** signer, **Draft #452** restore; PASEKA02 deletion [#442](https://github.com/250oisr-eng/Pasekaapp/issues/442) **FROZEN**. [Реестр B01–B15](docs/РЕЕСТР-БЛОКЕРОВ.md).

**Запрет:** никаких merge без отдельного разрешения, публикации, production deploy/DB, удаления пользовательских записей и медиа, live restore и APK upgrade. Не объявлять `DEVICE_BACKUP_VERIFIED` по метаданным.
