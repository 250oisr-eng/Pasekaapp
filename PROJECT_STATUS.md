# PROJECT_STATUS — Пасека 2.0

**2026-11-24.** Живой `main=04fabd9b0ea184b23f5ee8a573f0b4d8a99ba9e1`, после разрешённого merge #474/#475/#476. Состояние подтверждено GitHub, [реестр B01–B15](docs/РЕЕСТР-БЛОКЕРОВ.md) и [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## Подтверждено

- **#472/#473/#471 MERGED:** read-only архив `paseka-v1`, fail-closed сохранность старых Blob, обязательные IDB stores и управление рисками. Полный live restore UI выключен.
- **#474 MERGED:** read-only docs-only push-main CI без права Pages deployment.
- **#475 MERGED:** Varroa/journal rollback, защита от повторного submit и изоляция по улью; точный merge SHA `81537a6...` Fast/Android/Docs SUCCESS.
- **#476 MERGED:** тесты legacy IDB v1/v2→v3, сохранности Blob/ArrayBuffer, atomic abort и newer-schema guard; последний `main=04fabd9b0ea184b23f5ee8a573f0b4d8a99ba9e1` [Fast #45474625284](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45474625284), [Android #45474625192](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45474625192), [Governance #45474625209](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45474625209) — **SUCCESS**.
- **Текущий Draft B11:** [исходный риск](docs/P1-B11-SW-PRIVATE-CACHE-INSTALL-GATE-2026-11-24.md): прежний `sw.js` использовал `cache.addAll` без ограничения `Cache-Control: private/no-store`. В рабочей ветке v317 установка fail-closed, добавлены 3 теста; точный HEAD CI и номер PR нужно подтвердить.
- **Draft #469:** B04 реальные OnePlus APK package/signature UNKNOWN, защищённого signing key нет. **Draft #452:** прежний full restore не объединён. **Issue #442** PASEKA02 real-video detection/auto-cleanup **FROZEN**.

## Следующие ограничения

B01 полный внешний архив/restore, B04/B05 installed signer/durable key, B06 лицензированные реальные веса, B10 real video, B11 cold offline/upgrade, B14 физические метрики — НЕ ПОДТВЕРЖДЕНЫ. P1 OP/new hive profile не активировать без локальных валидаторов и оригинала технологии.

**Без отдельного разрешения:** никаких merge новых PR, Pages/deployment, установки APK, изменений production IndexedDB, восстановления или удаления записей/видео. Устройство OnePlus не затрагивалось.
