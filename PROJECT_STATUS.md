# PROJECT_STATUS — Пасека 2.0

**2026-11-25.** `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`. Действуют [AGENTS.md](AGENTS.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md) и [PROJECT-CONTROL](docs/PROJECT-CONTROL.md). Активная ветка — Draft, не main.

## Подтверждённое состояние

- #471–#477 **MERGED**, main Fast #45476750153, Android #45476750242, Governance #45476750196 SUCCESS, без публикации.
- [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478) — SW v318 сохранность пользовательских/будущих кешей; точный final Android #45494369418 и Governance #45494369444 SUCCESS, Fast code #45493963043 SUCCESS. NOT_IN_MAIN.
- [Draft #479](https://github.com/250oisr-eng/Pasekaapp/pull/479) — B01 PC/USB исследование **PAUSED** (ПК временно недоступен). OnePlus NE2213 Android 16 `ru.paseka.journal` v315, APK SHA `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6`. Улей/семья/две записи сохранены после offline/reboot. Четыре zero-stream ADB PASS, public TAR 1090 bytes INVALID, host ADB 1.0.32. Реальный полный backup/restore и signer NOT_VERIFIED.
- [Draft #480](https://github.com/250oisr-eng/Pasekaapp/pull/480) — B15 защита Cloudflare выпуска main SHA + подтверждение. Fast code #45495992070, Android final #45496201683, Governance final #45496201473 SUCCESS. Не merged.
- [Draft #481](https://github.com/250oisr-eng/Pasekaapp/pull/481) — B08 полная read-only инвентаризация открытых PR; Fast code #45496538943, Android final #45496870257, Governance final #45496870566 SUCCESS. До #481 было 393 open PR, после #481 — 394, после нового #482 — **395** (GitHub page4=95). Главная очередь: отдельные main-based security и data ports, не слияния длинных стеков.
- [Draft #482](https://github.com/250oisr-eng/Pasekaapp/pull/482) — текущая точечная B08 security-перенос из старого #52 (863 behind main): Cloudflare `request.text()` заменён на ограниченное чтение потоковых байтов `readBoundedBody(request,270000)`, 90 000-символьный предел сохранён, 413/400 fail-closed; [контракт](docs/P1-B08-CLOUDFLARE-BOUNDED-BODY-PORT-2026-11-25.md). Code SHA `4b900914ec8ffac35bc99d81487b1ef04c9f24c9` Fast #45497203026 SUCCESS; Android/финальный HEAD CI требует отдельной проверки. Worker **НЕ опубликован**.

## Ограничения и очередь

- B01 восстановление, B04/B05 подпись и хранение ключей, B11 обновление телефона BLOCKED; B06/B10 лицензированные модель/видео/автоудаление **FROZEN #442**; B09 миграции только синтетически проверены. **Draft #469** startup/signing и **Draft #452** старый restore не слиты.
- Следующее без ПК: завершить #482 CI, затем отдельные B09 negative migration/atomicity проверки без изменения production schema, при обнаружении недостающих случаев. Никакого merge без отдельного разрешения, production deployment/Pages/Worker release, APK install/uninstall/clear, restore или удаления любых пользовательских данных.
