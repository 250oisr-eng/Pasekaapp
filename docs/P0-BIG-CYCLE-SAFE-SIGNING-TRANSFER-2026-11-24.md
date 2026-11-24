# P0 — большой цикл: изолированная подпись, перенос JSON и защита восстановления (24.11.2026)

**Статус:** `CODE_AND_TEST_CI_PASS`; `QA_SIGNING_KEY_NOT_PROVISIONED`; `ON_DEVICE_MIGRATION_NOT_TESTED`; `MAIN_UNCHANGED`.

## Что построено

| Контрольный слой | Реализация | Доказательство / граница |
|---|---|---|
| Физический первый запуск | Пользователь сообщил PASS на OnePlus: улей, семья и 2 заметки после офлайн-перезапуска | `USER_REPORTED_DEVICE_PASS`, без чтения ADB или fingerprint установленного APK |
| Входящий JSON | `scripts/audit-oneplus-json-transfer.mjs` | Проверяет формат, известную версию схемы 1–15, идентификаторы, связи, счётчики; не переносит отдельные `entrance_media`; не печатает содержимое заметок |
| Отдельный origin | `tests/isolated-json-origin-restore.test.mjs` | Синтетические source/target, реальный код `restoreBackup`, сохранность 2 записей после повторного открытия target и неизменность source; полные доменные validators заменены test harness |
| Негативный restore | `tests/isolated-json-origin-restore.test.mjs` | Повреждённый `records` не заменяет существующую IndexedDB. В реальной версии должна работать самостоятельная комплексная проверка |
| Отдельный пакет QA | `scripts/prepare-oneplus-first-use-config.mjs` + `tests/isolated-qa-package-config.test.mjs` | Только `ru.paseka.journal.firstuseqa` при явном флаге и ожидаемом branch ref; `main` не допускается |
| Стабильная QA-подпись — код инструмента | `scripts/sign-isolated-qa-apk.mjs` | Только QA package; внешний keystore **вне Git**, явный флаг, password через `env:` в apksigner, pin SHA-256; внешний key **пока отсутствует**, поэтому реальная подпись/повторяемость не проверены |
| Fail-closed signing | `tests/sign-isolated-qa-apk.test.mjs` | Отказ при отсутствии key/флага/fingerprint, несовместимом appId, двойной подписи, попытке перезаписать APK или хранить keystore в Git |
| Existing app upgrade | `scripts/check-oneplus-upgrade.mjs` + binary provenance | Три реально скачанных GitHub APK имели разные signing certificates. Обычное обновление `ru.paseka.journal` **BLOCKED**, никакого удаления данных |

## Точная проверка GitHub

**Кодовый SHA:** `6878def7f050131e65a15c00d5f4af4264bf1d10`. [Android Actions #45438672376](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45438672376) завершился `completed/success`, **686/686 Node tests PASS**, `# fail 0`, Gradle **BUILD SUCCESSFUL**, uploaded artifact `paseka-debug-apk`, ID `14943380507`, expires `2026-12-08T16:35:17Z`, ZIP SHA256 `46786fb83738d6a7778c7c244d37a1ecc7583034071a82231cd9115f52c13048`. Это **не SHA самого APK и не сертификата**. Обычный debug APK не предназначен для обновления OnePlus.

Промежуточные запуски отменялись автоматически при новых коммитах; подтверждение PASS относится только к указанному точному code SHA.

## Критический разрыв и следующий цикл

**Долговременный закрытый ключ отсутствует.** Нельзя объявить стабильную подпись готовой лишь по unit-тестам; инструмент безопасно блокирует запуск без внешней конфигурации. Нельзя помещать keystore, пароли и реальный пользовательский JSON в GitHub или логи.

**При следующем допуске**: отдельно подготовить защищённую цепочку custody для QA-keystore, подтвердить неизменность сертификата на двух реальных **изолированных** бинарных APK и провести перенос резервной копии с настоящими доменными validators на независимом Android-origin. Нынешний источник данных OnePlus сохраняется; существующая установка и её тестовые записи не изменяются. Пробный APK нельзя устанавливать поверх исходного `ru.paseka.journal`.

**Не завершено:** подтверждение подписи реального установленного APK, физический backup/import, полное восстановление с оригинальными видео P0 [#452](https://github.com/250oisr-eng/Pasekaapp/pull/452), видео-распознавание и удаление PASEKA02 [#442](https://github.com/250oisr-eng/Pasekaapp/issues/442). Последнее остаётся FROZEN.

**Полномочия:** только Draft #469, без merge, release, deploy, production DB, удаления файлов или переустановки.
