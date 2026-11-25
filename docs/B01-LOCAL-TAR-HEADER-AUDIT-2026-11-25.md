# B01 — независимый локальный TAR preflight (25.11.2026)

Исходная физическая проверка: OnePlus NE2213 / Android 16 / ru.paseka.journal vCode 1, APK SHA-256 a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6. ADB и run-as доступны; сертификат не установлен (отсутствует apksigner/Java). Локальный кандидат TAR: 5 119 715 bytes, SHA-256 70ac319f8641cee92494bb54f329d574d3a5ef040c67a5b5cef68e9a45c072de, 17 entries; ранее распознаваемых IndexedDB/LevelDB/SQLite/media путей: 0. Это не подтверждение отсутствия данных на телефоне или в непрозрачном TAR формате.

## Решение F0–F2
* Узкая задача: проверять структуру локального TAR без обращения к устройству/сети/production, не вскрывая содержимое файлов и не подменяя B01.
* Ресурс: Node.js и существующий локальный TAR. Никаких обязательных платных инструментов, нового Android SDK или доступа к личному файлу в CI.
* Режим LIMITED_SAFE_DRAFT. Независимое восстановление и media inventory по-прежнему BLOCKED. Никаких APK upgrades, restore, delete, production writes.

## Код и тесты
* `scripts/audit-oneplus-tar.mjs` ограничивает размер обычного файла 512 MiB, отвергает symlink, неожиданные размеры, checksum/truncation/traversal, требует 2 zero end blocks и сверяет метаданные файла до/после анализа.
* Распечатываются только число файлов, классы путей, статус. Файлы внутри TAR не распаковываются; их содержимое не читается.
* Незнакомые типы TAR metadata требуют review, не считаются доказанной полной совместимостью.
* `tests/audit-oneplus-tar.test.mjs` — 7 синтетических регрессий (положительные, отсутствие IndexedDB, checksum, length, traversal, EOF, bounded payload).
* Локальный запуск этих семи тестов: 7/7 PASS. Отдельно требуется GitHub CI на точном SHA этого Draft.

## Использование (только локальный ПК)
`node scripts/audit-oneplus-tar.mjs "D:\\PasekaBackup\\PASEKA-ONEPLUS-READONLY-CANDIDATE-20261125-000332.tar"`

Этот аудит проверяет индекс заголовков, но **не проверяет байтовую целостность файлов, полноту оригиналов, независимый restore, MediaStore или видео**. Никогда не отправлять оригинальный TAR в PR/CI/чат. При любой неоднозначности оставить B01 BLOCKED.
