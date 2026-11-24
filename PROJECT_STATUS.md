# PROJECT_STATUS — Пасека 2.0

**2026-11-24.** Подтверждённый `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d` после разрешённой интеграции #477. Live SHA и CI имеют приоритет.

## Подтверждено

- **#472/#473/#471 MERGED:** read-only архив `paseka-v1`, fail-closed сохранность старых Blob, обязательные IDB stores и управление рисками. Полный live restore UI выключен.
- **#474 MERGED:** read-only docs-only push-main CI без права Pages deployment.
- **#475 MERGED:** Varroa/journal rollback, защита от повторного submit и изоляция по улью; точный merge SHA `81537a6...` Fast/Android/Docs SUCCESS.
- **#476 MERGED:** тесты legacy IDB v1/v2→v3, сохранности Blob/ArrayBuffer, atomic abort и newer-schema guard; последний `main=04fabd9b0ea184b23f5ee8a573f0b4d8a99ba9e1` [Fast #45474625284](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45474625284), [Android #45474625192](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45474625192), [Governance #45474625209](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45474625209) — **SUCCESS**.
- **#477 MERGED / B11 install gate IN_MAIN:** Service Worker v317 отклоняет private/no-store/отсутствующие shell assets при установке; новый `main=0e62ced6...`. Exact-main [Fast #45476750153](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45476750153), [Android #45476750242](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45476750242), [Governance #45476750196](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45476750196) **completed/success**. Реальные offline/upgrade и device backup всё ещё **NOT_VERIFIED**.
- **Draft #469:** B04 реальные OnePlus APK package/signature UNKNOWN, защищённого signing key нет. **Draft #452:** прежний full restore не объединён. **Issue #442** PASEKA02 real-video detection/auto-cleanup **FROZEN**.

- **Draft #478 / B11 follow-up:** VM regression проверяет холодный offline shell fallback, отсутствие перехвата API/cross-origin/POST и очистку только старого Paseka shell cache при активации. Основа — проверенный #477 main; SHA первого code commit `f30d8c889fdc4f3112063597a514f23f4aa25676`. Его собственный CI и последующий финальный HEAD требуют проверки; **NOT_IN_MAIN, DEVICE_NOT_VERIFIED**. Не сливать без отдельного разрешения.

## Следующие ограничения

B01 полный внешний архив/restore, B04/B05 installed signer/durable key, B06 лицензированные реальные веса, B10 real video, B11 cold offline/upgrade, B14 физические метрики — НЕ ПОДТВЕРЖДЕНЫ. P1 OP/new hive profile не активировать без локальных валидаторов и оригинала технологии.

**Без отдельного разрешения:** никаких merge новых PR, Pages/deployment, установки APK, изменений production IndexedDB, восстановления или удаления записей/видео. Устройство OnePlus не затрагивалось.
