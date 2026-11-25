# PROJECT_STATUS — Пасека 2.0

**25.11.2026.** Живая исходная `main=fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2`. Устаревшие SHA, прежние диагностики V8–V12 и история MERGED — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и Git. Источники: [AGENTS](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md).

## Активная задача B01 P0 — приватный кандидат REAL, полный restore не доказан

- Физический OnePlus **25.11.2026 09:50:22Z**, исходный `b01-v9-result(5).json`: **`CANDIDATE_ONLY`**, `PRIVATE_TAR_STRUCTURALLY_VALID_RESTORE_NOT_VERIFIED`. `exec-out`, **5 113 856 байт**, **144** TAR-записей, SHA-256 ранее заявлен в отчёте устройства; независимый rehash **выполнен позднее в V16**; WebView path hints **76**, `databases/` hints **0** (не доказывает отсутствие IndexedDB). Публичный TAR 2048 байт, `EXEC_OUT` PASS. Manifest reported written, candidate outside test folder on fixed local PC; личные данные и TAR в Git/CI не копировались.
- Вывод: **захват приватного кандидата пройден на телефоне**; физический `B01-RESULT.json` V15 отдельно не представлен, но ребёнок V9.1 подтверждает ключевые размеры/транспорт. **Полный backup, независимое Android восстановление и Gallery/MediaStore NOT_VERIFIED. B01 BLOCKED**; оригиналы медиа не удалять и APK не менять.
- [Draft #522](https://github.com/250oisr-eng/Pasekaapp/pull/522): отдельный **V16** — один независимый ZIP, `START.cmd`, `B01-RESULT.json`. Без USB/ADB ищет постоянный candidate вне тестов, проверяет манифест + SHA + структуру, безопасно реконструирует регулярные файлы в новом изолированном каталоге ПК и побайтово сравнивает результаты. Запрещает ссылки/traversal/unsafe names/duplicates, маркирует неуспешную реконструкцию. Это **PC_ONLY**, не восстановление Android/WebView.
- **V16 hardening 25.11:** обнаружен и исправлен конфликт пути TAR `file` + `file/child`: теперь проверяется на стадии READONLY_TAR_PREFLIGHT, **до** создания папки PC reconstruction. Добавлен отдельный Windows synthetic regression `FILE_PARENT_CONFLICT`, проверяющий `BLOCKED`, ноль созданных восстановленных папок и отсутствие ложного `fullBackupVerified`. Кодовый SHA `6d292829ffff2e36fcf6db3418560a1df30dbdef`; CI для SHA проверяется отдельно. Реальный кандидат OnePlus не читался.
- **ФИЗИЧЕСКИЙ V16 PC PASS — пользовательский `B01-RESULT(1).json` (25.11.2026):** `PC_RECONSTRUCTION_PASS_NOT_FULL_BACKUP`, `stage=COMPLETE`; кандидат **5 113 856 B**, SHA-256 повторно вычислен и совпал с манифестом, **144 TAR members = 96 files + 47 dirs + 1 root**, **96/96 файлов побайтово сравнены**, **5 013 064 B** восстановлено на ПК, `originalTarUnmodified=SHA256_MATCH_AFTER`; `indexedDbPathHints=8`, `webviewPathHints=76`. Отчёт структурно проверен по загруженному JSON, **не** независимым чтением приватного TAR в этом сеансе. `appRestored=NOT_TESTED`, `independentRestore=NOT_TESTED`, `fullBackupVerified=false`, Gallery/MediaStore/video completeness NOT_TESTED. Приватный SHA, пути и содержимое в Git не помещать.
- Пользователь удаляет старые **тесты**, но не кандидат `%USERPROFILE%\\PASEKA-B01-KEEP-PRIVATE-CANDIDATES`. Тест не зависит от прежних ZIP/PS1/JSON. Ни частный TAR, ни манифест, ни локально восстановленные приватные файлы не отправлять в чат.

## Незавершённые зависимости

- **B04/B05 P0:** нет доказанной совместимости установленного signing certificate и доступного ключа; **Draft #469** — не интегрирован. APK upgrade запрещён до B01 и безопасного rollback.
- **B06/B10 / FROZEN #442:** лицензия весов и реальная детекция/видеоконвейер не подтверждены; удаление видео запрещено.
- **P1:** неинтегрированные Draft PR и физическая модель OP01–14; новый профиль не активировать до поддержки всего оборудования и регрессий. Не смешивать с Farrar.
- **Проверенные ранее #504–#507 в main:** отдельные защиты bootstrap и локальные JSON/export checkers; не являются доказательством полного восстановления. **Draft #452** остаётся историческим незавершённым источником backup, не повторять его вручную.

## Следующее действие

1. **Завершено:** V16 Windows, Governance, Android CI SUCCESS на `3d72ee8a8249584922050821521b4437491159d2`; реальный PC-only V16 SHA и 96/96 byte readback PASS по отчёту пользователя.
2. **Далее:** без вмешательства в live OnePlus проверить возможность независимого восстановления WebView/IndexedDB на изолированной тестовой цели по отдельному безопасному плану; не считать уже выполненную PC-реконструкцию доказательством Android restore.
3. **Отдельно:** инвентаризация Gallery/MediaStore и оригинальных видео, полнота всех источников; B01 остаётся BLOCKED до полной проверки.
4. Продолжать независимые P1 задачи без merge/release/видеоудаления.

**Никаких merge без разрешения, production deploy, изменения реальных данных, установки APK и видеоудаления.** CI не заменяет физическое доказательство.
