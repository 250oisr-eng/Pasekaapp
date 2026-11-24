# PROJECT_STATUS — Пасека 2.0

**2026-11-25.** Live `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`; нормативный цикл [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md), [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md). Фактический GitHub SHA/CI выше исторических документов.

## Интеграция и факты

- #471–#477 **MERGED**, включая read-only экспорт для **нового main** и SW v317, но **без публикации**. Проверки exact-main: Fast #45476750153, Android #45476750242, Governance #45476750196 **SUCCESS**.
- [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478), тесты SW offline/cache lifecycle — **NOT_IN_MAIN**. HEAD `a5e7ab8d539f0110beb482425bd6fd144769d14e` Android #45483004363, Governance #45483004397 **SUCCESS**. Не сливать без разрешения.
- [Draft #479](https://github.com/250oisr-eng/Pasekaapp/pull/479) — диагностика **B01** сохранности данных. Предыдущий точный HEAD `9c668ba3e679025a7adefd1ff8b719870fb78a24`: Governance #45487422591 **SUCCESS**. Новый docs HEAD требует собственной проверки.
- OnePlus NE2213, Android 16, установлен `ru.paseka.journal` v315 SW, base.apk SHA-256 `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6`. Пользователь дважды открывал приложение офлайн; улей, семья, 2 заметки сохранились после нескольких перезагрузок. `run-as` PASS; WebView/IndexedDB/Local Storage каталоги существуют. Нет активного SW proof, полного экспорта в установленном APK, подтверждённой подписи или миграции v315→v317.

## B01 — текущая цепочка

- V2 пользовательская попытка USB TAR дала файл `5 119 715` байт, SHA-256 `70ac319f8641cee92494bb54f329d574d3a5ef040c67a5b5cef68e9a45c072de`, но **PC-only forensic = BLOCKED**: `length mod 512=227`, после 17 валидных заголовков первый неверный в блоке 20, `BAD_HEADER_CHECKSUM`, отсутствует конец TAR. Файл непригоден как доказанный backup. V3 строгий capture тоже **BLOCKED / STRICT_TAR_INVALID_BLOCK_LENGTH**; может остаться частичный локальный TAR. Телефон не изменялся. Не удалять и не восстанавливать.
- **Windows synthetic USER_REPORTED_PASS**: `PASEKA_B01_WINDOWS_BINARY_TRANSPORT_SELFTEST_V1` — локальные 5 МиБ успешно упакованы через `cmd.exe` redirection в 5 253 120-байтный TAR, синтетический payload SHA совпал, кратность 512 доказана. Значит **Windows-редирект для этой фикстуры работает**; причина испорченных Android TAR всё ещё UNKNOWN.
- **Следующий один блок:** ZIP `PASEKA-B01-Android-ADB-synthetic-transport-gate-v1.zip`, SHA-256 `6aebffc427012c150e8c64a7f247db19826777ac3e87c78ccf345625997ea0d6`; проверяет 5 MiB `/dev/zero` через plain `adb exec-out` и `run-as`, плюс TAR **только публичного** `/system/build.prop`. ZIP CRC, статические safety guards и локальные синтетические отрицательные проверки **PASS**; **Windows/OnePlus запуск ещё NOT_TESTED**. Нет `CAPTURE`, не читает и не меняет app private данные, Android/сеть/установку. Один JSON по завершении.
- После результата либо исправить ADB/Android transport, либо готовить новый строгий **сверяемый на обеих сторонах** backup. Пока **B01 BLOCKED_BAD_ARCHIVE**, `completeBackupVerified=false`, `restoreTested=false`. Подробности — [доказательство B01](docs/P0-B01-ONEPLUS-SNAPSHOT-CANDIDATE-GATE-2026-11-24.md), [реестр B01–B15](docs/РЕЕСТР-БЛОКЕРОВ.md), [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

- **Android synthetic probe V1 (USER_REPORTED_BLOCKED):** `PASEKA_B01_ADB_SYNTHETIC_TRANSPORT_V1`, `errorCode` с `LITERALPATH`, все три теста `NOT_TESTED`, `run-as=true`, app data не читались, телефон не менялся. Найден дефект Windows PowerShell 5.1: `New-Item -LiteralPath` (неподдерживаемый параметр) при создании TEMP до первого ADB transfer. **Исправленный V2 ZIP** `PASEKA-B01-Android-ADB-synthetic-transport-gate-v2.zip` SHA-256 `8995365bcc0493c10466b95df33f677a9d50155c1529f8b300929e88d8f41e66` использует `.NET Directory.CreateDirectory` и строгий разбор stderr; ZIP CRC/статический allowlist PASS, **Windows/OnePlus V2 NOT_TESTED**. Один повторный пакет, без `CAPTURE` и без чтения IndexedDB. Прежние B01/B11 BLOCKED.

## Оставшиеся решения

- **Draft #469** (реальная подпись APK: `NOT_VERIFIED` из-за отсутствия локальной Java), **Draft #452** (restore UI не слит). B06/B10 лицензированная модель и настоящее видео PASEKA02, issue [#442](https://github.com/250oisr-eng/Pasekaapp/issues/442) **FROZEN**. B11 обновление v315→v317 **BLOCKED** до доказанного независимого backup/restore и разрешения пользователя.
- Без отдельного разрешения **никаких merge, production deployment, APK update, restore/clear, удаления пользовательских данных, архивов или медиа**. Реальная пасека важнее скорости.
