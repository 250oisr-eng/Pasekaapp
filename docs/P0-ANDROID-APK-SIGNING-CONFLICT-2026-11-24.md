## 2026-11-24 — B04/B05: независимый read-only аудит установленного APK (новое дополнение)

- В [Draft #469](https://github.com/250oisr-eng/Pasekaapp/pull/469) добавлен `node scripts/check-oneplus-upgrade.mjs --installed-only`. В отличие от старой проверки `--compare-files` и `runPreflight(candidate.apk)` этот режим **не требует APK-кандидат** и читает только установленный пакет: один авторизованный ADB, `pm path ru.paseka.journal`, временный `adb pull base.apk`, `aapt dump badging`, `apksigner verify --print-certs`. После чтения временный файл удаляется. **Не выполняет установку, очистку, экспорт частных записей или изменение базы.**
- Проверяется строго `ru.paseka.journal`, один подписант и допустимый `versionCode`; отсутствие телефона/подписи, неоднозначность идентификаторов или ошибки ADB/SDK → `BLOCKED`. Тесты используют подменённые команды и проверяют запрет записи. Это **не фактическое чтение OnePlus**.
- Полный разбор: а) произвольный CI debug signer → несовместим с прежним ключом, отклонить; б) извлечь прежний private key только при наличии законных средств/контролируемого хранилища, данных о наличии нет; в) read-only установленная подпись — подготовлена команда; г) новый защищённый долгосрочный ключ + внешняя резервная копия — возможен, но отсутствует и не должен генерироваться в публичном CI; д) отдельный `ru.paseka.journal.firstuseqa` с доказанной сохранностью источника — независимая альтернатива, без стабильного ключа и физического gate **BLOCKED**; е) синтетическое QA key smoke — не заменяет ключ владельца.
- **Решение о заморозке:** `B04_EXTERNAL_DEVICE_PROOF=BLOCKED` до реально авторизованного ADB и полученного fingerprints *установленного* пакета; `B05_EXTERNAL_KEY_CUSTODY=BLOCKED` до предоставления защищённого, резервированного долгоживущего QA ключа вне Git/CI. До новых ресурсов повторные synthetic-only циклы не проводить. Можно автономно дорабатывать отдельные независимые P1 задачи. Права на merge/release/реальный APK отсутствуют.
- CI на новом коде требует отдельной проверки по точному SHA; статус не повышать только из-за новой команды.

---

## 6. Автоматическая офлайн-проверка пары будущих APK (без телефона)

В Draft #469 реализовано `node scripts/check-oneplus-upgrade.mjs --compare-files old.apk new.apk`. Требования: Node.js и Android SDK Build Tools с `aapt` и `apksigner`, локальные **распакованные APK**, а не ZIP GitHub Actions. Проверяются `packageName`, `versionCode`, certificate fingerprints через системный инструмент `apksigner verify --print-certs`. При несовпадении — `BLOCKED`, без установок, ADB и изменения данных. На Windows для проверки подписи используется `java -jar <Android SDK>/build-tools/<version>/lib/apksigner.jar`.

- Этот режим **не устанавливает** APK и не является полным тестом backup/restore, режима полёта, миграций или гарантией fingerprint реально установленной сборки OnePlus.
- CI exact code SHA `84b6277e78b24bda8aa4fe2f39d70e7ef377e174`, [#45405378314](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45405378314): **676/676 PASS, Android BUILD SUCCESSFUL**. В тестах проверено, что ZIP и неполные параметры нельзя передать как APK.
- Кодовые изменения для предупреждений о JSON: `index.html`; контрольные тесты: `tests/json-backup-scope-ui.test.mjs`. Отдельные видео `entrance_media` не являются частью обычного JSON export. Нет доказанного разрешения на перенос пользовательских данных между разными appId.

---

## 5. Повторное подтверждение: третья сборка тоже имеет новую подпись

- [Android CI #45404872099](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45404872099), exact code+tests SHA `f377130c1f9a9b0c33ef13de7f03d480239bbea4`: **completed/success, 675/675 PASS, Gradle BUILD SUCCESSFUL**, artifact `paseka-debug-apk` ID `14925680411`, срок действия до `2026-12-08T13:35:52Z`.
- Оригинальный GitHub ZIP скачан, его SHA-256 `052229b2d07847b2f74bc47650c63889291dac7da90d31e570ee466ea0678e64` **совпал** с GitHub digest.
- SHA-256 вложенного `app-debug.apk`: `12693116ec67d237716d249f8d5b9a7cc997c0a5c481be7bebf68d79158d468a`.
- SHA-256 сертификата APK v2 signer: **`d5c6e897bf1edf368b587e02c2980b41bdf9c1b68d2f018e833fccdb71fc4e71`** — отличается и от baseline `9b10baf0...`, и от предыдущего кандидата `df54ef93...`.
- Это **три независимых фактически разных signing certificate**, а не теоретическое опасение. Текущий CI создаёт артефакты, для которых **не доказано** наличие общего ключа; последние три конкретные APK непригодны как взаимные in-place upgrades при одинаковом packageId.
- Важно: user-device installed signer по-прежнему `NOT_TESTED` — на устройстве приложение не переустановлено и хранилище сохранено.

---

# P0 — фактическое несовпадение подписи Android APK и безопасная стратегия следующего кандидата

Дата: 2026-11-24. Статус: **SIGNATURE_DRIFT_CONFIRMED; DIRECT_UPGRADE_BLOCKED**.

## 1. Точные источники бинарных файлов

Исследованы **оригинальные** ZIP-artifacts GitHub Actions и вложенные в них `app-debug.apk` — не скриншоты, имитации или синтетические сертификаты.

| Артефакт | Исходный Actions run / SHA | Artifact ID | ZIP SHA-256 | APK SHA-256 | SHA-256 сертификата подписи APK v2 |
|---|---|---|---|---|---|
| Baseline, выданный для первого испытания OnePlus | [#45375657672](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45375657672), `13ddf5627138a3fa684a40d461702ab60be1d22b` | `14911122035` | `0926b42cfd48a4b1e85de40b97aca27062bc3345c50ddde5aa274a93ec6f7549` | `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6` | `9b10baf04e1e09bfe2d58e72b1c1eecf04b48f532940b5e91a3083bd73ddb0aa` |
| Latest compared new candidate | [#45400013138](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45400013138), `de58296b0903083347323557723950db6c69dd6f` | `14922458781` | `db18770bfd75d2f7c733f1936d4280c40b77b33a1d77aaba626b4e8fbbbc632b` | `df8bdaa6e06db1225e2b171936cf4315e08b1a0ca289450fd5ed68bb88746513` | `df54ef93131837a896fdbe621fd4a341f5223d94fa8f096573926de24e6ddcd8` |

Проверка: локально распакованы ZIP, `sha256sum` ZIP подтвердил **точное совпадение** с `digest` GitHub Actions для обоих. Для каждого APK прочитан его ZIP central directory offset, `APK Sig Block 42`, ID блока APK Signature Scheme v2 `0x7109871a`, извлечён DER сертификата из первого signer, рассчитан SHA-256 сертификата. Оба сертификата имеют subject `CN=Android Debug, O=Android, C=US`, но **разные fingerprint**. Это чтение сертификатов из подписного блока; независимая полная криптографическая проверка схемы подписи через `apksigner verify` не выполнялась.

## 2. Что это доказывает, а что не доказывает

- **Доказано:** два конкретных артефакта подписаны **разными сертификатами**; у Android нет оснований принимать APK с новым, другим сертификатом как обычное обновление того же packageId. Для данных двух кандидатов `DIRECT_UPGRADE=BLOCKED`.
- Установка исходного APK на OnePlus была **подтверждена словами пользователя** после предоставления ссылки на baseline #45375657672; независимое считывание фактического APK телефона и его fingerprint через ADB **НЕ производилось**. Поэтому формулировка «установленный APK имеет fingerprint baseline» остаётся условной до device proof.
- CI `./gradlew assembleDebug` без подтверждённого долгоживущего signing key может давать новый debug certificate на разных runners. Два различных fingerprint **наблюдаются**; из одного наблюдения нельзя гарантировать поведение всех будущих runner.
- Пройденный пользовательский first-use / offline E2E на OnePlus **PASS** остаётся действительным; эта проблема касается **будущих обновлений**, а не текущего сохранения.
- Наличие JSON backup в UI не равнозначно доказанному полному restore оригинальных видео; P0 full restore отдельно в [Draft #452](https://github.com/250oisr-eng/Pasekaapp/pull/452), PASEKA02 cleanup [#442](https://github.com/250oisr-eng/Pasekaapp/issues/442) остаётся FROZEN.

## 3. Безопасные действия и запреты

1. **Не устанавливать** новый APK из #45400013138 поверх исходной сборки; не предлагать `adb uninstall`, `pm clear`, factory reset или удаление тестовых записей.
2. Для возможности штатного обновления в будущем нужен **стабильный закрытый signing key**, хранимый вне Git, и однообразная подписывающая конфигурация для всех будущих approved builds; публичный репозиторий не должен хранить приватный ключ, пароли и base64-keystore. Простое добавление нового ключа **не даст** обновить уже установленный APK, подписанный прежним неизвестным debug ключом.
3. Если исходный приватный signing key недоступен, рассматривать **параллельный пакет с другим appId** и перенос только через доказанное резервное копирование/восстановление. Старый пакет и его данные оставить на OnePlus для rollback. Это план, **не разрешение на публикацию, импорт или установку**.
4. До переноса искусственного улья, семьи и заметок: проверить UI экспорт JSON из текущей версии, целостность и импорт на **другом изолированном стенде**, полную связность и офлайн-перезапуск; видео и неизученные источники не считать перенесёнными. Полный restore #452 нельзя объявить проверенным по CI первого запуска.
5. Следующий технический gate: выяснить реальную `packageName`, `versionCode` и `signing SHA-256` установленного APK **read-only** через `scripts/check-oneplus-upgrade.mjs`, когда доступен ADB; если подтверждается baseline fingerprint, не предлагать прямой upgrade. Нет необходимости немедленно привлекать пользователя: до этого независимые CI / review работают без телефона.

## 4. Статусы

| Проверка | Статус |
|---|---|
| User-reported first-use + offline OnePlus | PASS |
| ZIP Artifact provenance | CONFIRMED обеих сборок |
| APK v2 certificate fingerprint each artifact | CONFIRMED |
| Совпадение fingerprint двух артефактов | **FAIL** (не совпадают) |
| Fingerprint физически установленного APK | NOT_TESTED |
| Безопасное прямое обновление baseline → candidate | **BLOCKED** |
| Backup + full restore на реальном устройстве | NOT_TESTED |
| Data-preserving parallel-app migration | NOT_TESTED |
| Merge / release / deploy | NOT_AUTHORIZED |

