# PROJECT_STATUS — Пасека 2.0

**24.11.2026: B09 после интеграции B13.** Последний проверенный базовый `main=81537a665dadb1cdab09fe27e11d76321a959eef`; live GitHub имеет приоритет. [Реестр B01–B15](docs/РЕЕСТР-БЛОКЕРОВ.md) · [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) · [внешние ворота](docs/P0-P2-ПЛАН-ЗАКРЫТИЯ-БЛОКЕРОВ-И-ДЕЙСТВИЯ-ПОЛЬЗОВАТЕЛЯ-2026-11-24.md).

## Интеграция

- **#472/#473/#471 MERGED:** read-only архив `paseka-v1`, Blob guard, обязательные stores v3, правила. Старые реальные данные/видео не изменялись, live restore не включён.
- **#474 MERGED:** read-only governance push-main, без публикации. На SHA `6ec1b20d...`: Fast #45473457920 и Docs #45473457945 **SUCCESS**.
- **#475 MERGED:** B13 журнал Varroa и fail-closed save/rollback с изоляцией ульев. SHA `81537a665dadb1cdab09fe27e11d76321a959eef`; согласованный PR HEAD `4c296752...`: Android **710/710 PASS, BUILD SUCCESSFUL**, Docs SUCCESS. Exact-main Fast/Android/Docs проверяются отдельно.
- **#476 B09:** в текущей ветке находятся тесты v1/v2→v3, v4 VersionError, сохранности Blob/ArrayBuffer и атомарного двух-store transaction abort/guard. До согласования кодовый SHA `a71e69bc47eb5411ef5ff0887b96f47af0464bda`: **701/701 PASS**, Android и Docs SUCCESS. Обновлённый merge-from-main HEAD требует нового Android/Docs CI; фактический статус PR проверять в GitHub.
- **Draft #469:** реальная подпись установленного OnePlus UNKNOWN, защищённого постоянного ключа нет. **Draft #452:** прежний full restore остаётся не объединённым. **Issue #442:** PASEKA02 real bee recognition и auto-delete **FROZEN**.

## Дальнейшие ворота

Проверить exact SHA обновлённого #476 и совместимость с main. После успешного CI — разрешённое последовательное слияние; затем подтвердить точный main CI. B01/B04/B05/B06/B10/B11 физически не закрыты; B07/B08 OP требуют осторожной выборочной интеграции, B14 — измерений, B15 — полного аудита deployments.

**Без отдельного согласия нельзя:** публиковать PWA, устанавливать APK, изменять production IndexedDB, выполнять live restore, очистку или удаление оригиналов. Подтверждение CI не заменяет реальный архив и физический тест OnePlus.
