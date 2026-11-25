# B05 — фактический сертификат CI debug APK против OnePlus V5 (25.11.2026)

## F0–F2
Установленный `ru.paseka.journal` на OnePlus NE2213 прошёл физический `apksigner verify` по V5: SHA-256 сертификата `9b10baf04e1e09bfe2d58e72b1c1eecf04b48f532940b5e91a3083bd73ddb0aa`. В `main` CI собирает `assembleDebug`, но факт подписи собранного бинарника этим же сертификатом не установлен. B05 private key custody неизвестен. Из сравнения debug-сертификатов нельзя делать вывод о защищённом долгосрочном ключе.

F2 LIMITED_SAFE_DRAFT; независимое изменение только Android CI и локальных pure tests. Нет keystore, пароля, Android deploy, реального телефона, B01 restore или user data.

## Реализация
`scripts/audit-ci-debug-apk-signer.mjs` после `assembleDebug` вызывает официальный Android SDK `apksigner verify --print-certs` на **только что собранном** APK и `aapt dump badging` на этом же файле. Сверяет ID пакета, единственный сертификат SHA256 и V5 verified reference. В консоль попадает только публичный SHA и статус `CI_DEBUG_CERT_DIFFERS_FROM_INSTALLED` либо `CI_DEBUG_CERT_MATCHES_INSTALLED_METADATA_ONLY`. Совпадение не разрешает upgrade; несовпадение не ломает обычный debug build, но исключает подмену DEBUG как совместимого пакета. Отсутствие инструмента или некорректная подпись — CI FAIL-CLOSED.

## F5 доказательства и ограничения
Пять новых синтетических regression tests проверяют сравнение, множественные signer, пакет, вызовы официальных утилит, отсутствие install/private key. Новый CI проверяет **реальный собранный debug APK**, но `deviceInstalled=false`, `signedReleaseCandidateVerified=false`, `privateKeyCustodyVerified=false`, `deviceUpgradeAuthorized=false`. Exact SHA/run outcome должен быть прочитан из GitHub, а не предполагаться.

## Подтверждённый CI binary result — 25.11.2026

В Android CI [#45571119849](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45571119849) официальный `apksigner verify --print-certs` успешно проверил реальный собранный `android/app/build/outputs/apk/debug/app-debug.apk`, пакет `ru.paseka.journal`, versionCode=1. Получено `CI_DEBUG_CERT_DIFFERS_FROM_INSTALLED`: сертификат CI SHA-256 `c26be541646150290a25bdd0d55c4c24ae3098cc1f69ccd9bec220b869495f22`, установленный OnePlus V5 SHA-256 `9b10baf04e1e09bfe2d58e72b1c1eecf04b48f532940b5e91a3083bd73ddb0aa`. Совпадение `false`; `deviceInstalled=false` и `deviceUpgradeAuthorized=false`. Android build **SUCCESS** — это корректный результат диагностики несовместимости, а не разрешение установки.

Обычный GitHub debug APK не является совместимым обновлением для текущего установленного OnePlus. Нельзя обходить mismatch удалением/очисткой приложения или созданием нового ключа для старого package ID. Требуется настоящий ранее использованный приватный ключ (B05) и B01 внешнее резервное копирование.

## F6–F7
Нет разрешения merge/release и установки; B01 backup/recovery BLOCKED, B05 key custody BLOCKED, #442 cleanup FROZEN. При отсутствии старого ключа CI debug signer НЕ становится автоматически производственным ключом и нельзя менять package ID/удалять приложение ради обхода.
