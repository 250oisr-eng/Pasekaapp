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

