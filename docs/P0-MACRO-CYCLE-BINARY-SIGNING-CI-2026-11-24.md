# P0 — масштабированный автономный цикл: два реальных QA APK, repeat-signing и проверка расхождения restore PR

Дата: 2026-11-24. Уровень доказательства: `CI_EXACT_SHA_PASS + EPHEMERAL_BINARY_SIGNING_PROOF`, **не** `DURABLE_KEY_PROVISIONED`, **не** `DEVICE_TRANSFER_PASS`.

## Результаты крупного цикла

1. Актуальное состояние: `main` остаётся вне изменений, Draft [#469](https://github.com/250oisr-eng/Pasekaapp/pull/469) не объединён; полный аварийный restore находится отдельно в Draft [#452](https://github.com/250oisr-eng/Pasekaapp/pull/452). Подтверждён пользователем первый запуск OnePlus с сохранённым ульем, семьёй и двумя записями после офлайн-перезапуска — `USER_REPORTED_DEVICE_PASS`. Эти записи **существуют** и не затрагивались.
2. В `.github/workflows/android-debug.yml` добавлен отдельный CI job **`isolated_qa_signature_proof`**. Он запускается **только** на `pull_request` с точной рабочей веткой `fix/p0-first-launch-startup-write-gate-2026-11-24`, собирает отдельный `ru.paseka.journal.firstuseqa` до генерации native Gradle, требует Android API 35, запускает подпись реальных APK, **не публикует бинарные файлы этого QA job**, не использует production secrets, и удаляет временный ключ при завершении.
3. `scripts/qa-ephemeral-two-apk-signing-smoke.mjs`: генерирует на временном CI runner одноразовый RSA-keystore вне Git, извлекает certificate SHA-256 через `keytool`, затем дважды подписывает **один реальный изолированный Android APK** отдельными выходными файлами с одним fingerprint pin. Обе фактические криптографические проверки делаются Android SDK `apksigner verify --print-certs`; проверяются packageId, versionCode и равенство сертификатов. Временные APK и keystore не загружаются в Actions artifacts и удаляются в `finally`.
4. `scripts/sign-isolated-qa-apk.mjs`: **исправлен** запуск дочернего процесса с явно переданным `env` вместо скрытого `process.env`; временная CI-конфигурация не меняет глобальное окружение процесса. Приватный долговременный ключ ещё **не предоставлен и не создан**; этот скрипт является безопасным инструментом, но не доказательством наличия пригодного ключа для выпуска.
5. `scripts/check-oneplus-upgrade.mjs`: исправлен парсер реального современного вывода `apksigner`, поддерживает `V3.0 Signer: certificate SHA-256 digest` / `V2.0 Signer` и прежний `Signer #1`, с тестами. Без этого реальный QA smoke сначала давал BLOCKED, несмотря на успешную подпись.
6. `scripts/require-android15-qa.mjs`: fail-closed конфигурация min/target/compile API 35. `scripts/prepare-oneplus-first-use-config.mjs`: явное разрешение `pull_request` при точном `GITHUB_HEAD_REF`; отказ для чужих веток и основного packageId.
7. Добавлены `tests/qa-ephemeral-binary-signing.test.mjs` и связанные проверки. Рабочий Android workflow теперь реагирует на **все** изменения `scripts/**`, а не только на два ранее перечисленных файла.
8. Выполнена read-only оценка зависимого Draft #452. Относительно `main` на проверенной базе `ecea1c3c50801250d42f49366e00e1e9e96d556f` его commit graph **diverged, ahead 122 / behind 21**. Относительно PR #469 (code SHA `37065f873dea9f9ead208f9442b2e06328808180`) **diverged, ahead 122 / behind 128**. Это **не доказательство конкретных merge conflicts**, но означает, что #452 нельзя механически считать готовым к интеграции в #469/main. В #452 действительно есть `js/disaster-archive.js` для `paseka-idb-full-v1`, Blob/File из IndexedDB и atomic restore в одной базе; проверка реального внешнего backup/restore пользовательских видео на текущем OnePlus по-прежнему **NOT_TESTED**.

## Промежуточные ошибки не скрыты

| Actions run | Доказанный исход | Причина |
|---|---|---|
| [#45439867332](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45439867332) | `build` PASS (689/689), `isolated_qa_signature_proof` FAIL | Старый парсер принимал `Signer #1`, реальный apksigner выдавал `V3.0 Signer` |
| [#45440405934](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45440405934) | QA job FAIL; диагностический публичный сертификат подтвердил формат | Точный формат сертификата установлен; временную диагностику впоследствии удалили |
| [#45440882236](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45440882236) | **build + isolated QA PASS**, 689/689 | Первое бинарное доказательство `EPHEMERAL_TWO_BINARY_SIGNING_PROOF`, `matchedCertificate: true` |
| [#45441512631](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45441512631) | build PASS; isolated QA FAIL | Во время ужесточения передачи env второй вызов временно ещё использовал process.env. Исправлено; регрессия требует одинаковый env два раза |
| **[#45441911572](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45441911572)** | **ОБА jobs completed/success** | Exact code+test SHA `829be6d8a0de28266d345ffe496a8dd0e649f916`, **690/690 tests PASS, fail 0**, Gradle BUILD SUCCESSFUL в обоих jobs. Вывод QA job: `EPHEMERAL_TWO_BINARY_SIGNING_PROOF`, `packageName=ru.paseka.journal.firstuseqa`, `versionCode=1`, `matchedCertificate=true`, `requiresExternalDurableKey=true`, `upgradeOnOnePlus=false` |

Final GitHub Actions artifact: **только обычный `paseka-debug-apk` из стандартного job**, ID `14943682043`, ZIP digest `sha256:378d505ea57cd6525e2ea3f3fdbd4ff8ffc840e20e9cd88ebe9daa3947ea1d0d`, expires 2026-12-08T16:52:09Z. Этот artifact **не изолированный подписанный QA APK и не одобрен для установки на OnePlus**. Подписанные временным ключом APK не сохранялись как download.

## Стоп-факторы и дальнейшая работа

- `EPHEMERAL_BINARY_SIGNING_PROOF=PASS` демонстрирует правильный механизм подписи **в рамках одного запуска**, не долговременную стабильность между CI runners. Для дальнейших выпусков нужен защищённый **постоянный закрытый QA signing key с резервным хранением вне GitHub**, отдельное разрешение на подготовку реального кандидата и успешная проверка сертификатов двух последовательных builds.
- Подписи уже известных штатных debug APK `ru.paseka.journal` различаются (см. `P0-ANDROID-APK-SIGNING-CONFLICT-2026-11-24.md`), поэтому существующую OnePlus установку нельзя обновить простым APK с другой подписью. Перенос — только в отдельный packageId, после проверенного полного/достаточного пользовательского архива и реального восстановления на независимом стенде с оригиналами.
- Ветку #452 необходимо **сначала отдельно согласовать и перепроверить относительно актуальных main/#469**, включая совместимость данных, реальные оригиналы видео, прошлые миграции, snapshot/restore и Android; merge без отдельного разрешения запрещён.
- PASEKA02 automatic delete остаётся `FROZEN` #442, данных на OnePlus не удаляли. Ни слияния PR, ни релиза, ни deploy, ни production DB изменений не было.

## Следующий безопасный большой цикл

Полная карта объединения #452 с актуальным кодом и обязательными сквозными миграциями/бэкапом — **read-only до отдельной реализации**; затем независимый isolated-Android backup/restore E2E без обращения к OnePlus, сборка постоянного QA signed candidate только при наличии защищённого signing key. Не повторять искусственные мини-PR вместо доказательного эксплуатационного маршрута.
