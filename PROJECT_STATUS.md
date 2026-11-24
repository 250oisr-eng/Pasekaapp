# PROJECT_STATUS — Пасека 2.0

**2026-11-25.** Live `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`; нормы [AGENTS.md](AGENTS.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md). Изменения этой ветки Draft **не находятся в main**.

## Актуальные зависимости

- #471–#477 **MERGED**, на точном main Fast #45476750153, Android #45476750242, Governance #45476750196 SUCCESS. Публикации и APK обновления не было.
- [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478) B11 SW v318 безопасное удаление cache keys: Fast code+tests #45493963043 SUCCESS, final Android #45494369418 и Docs #45494369444 SUCCESS; NOT_IN_MAIN/NOT_RELEASED.
- [Draft #479](https://github.com/250oisr-eng/Pasekaapp/pull/479) B01: ПК недоступен, физические USB тесты **PAUSED**. На OnePlus NE2213 `ru.paseka.journal` v315 и пользовательские улей/семья/две заметки целы после offline/reboot; старые приватные TAR повреждены, 4 синтетических потока через ADB PASS, публичный TAR 1090 bytes INVALID. Полного backup/restore и signer нет, нельзя менять APK и удалять файлы.
- [Draft #480](https://github.com/250oisr-eng/Pasekaapp/pull/480) B15: защита Cloudflare release подтверждённым main SHA + `PUBLISH-CLOUDFLARE`; code SHA `6ad83a14e4921baea237b552c6047480ed3a35e6` Fast #45495992070 и Android #45495991865 SUCCESS; docs SHA `2a86a44303a829ab7676ea00d2c6a4dcd3cb6f87` Android #45496201683 / Governance #45496201473 SUCCESS. NOT_IN_MAIN.
- [Draft #481](https://github.com/250oisr-eng/Pasekaapp/pull/481) **активная B08:** read-only полная GitHub пагинация и `tests/read-only-pr-triage.test.mjs`, [очередь кандидатов](docs/P1-B08-OPEN-PR-TRIAGE-2026-11-25.md). Первоначально 393 PR (40 main-root), после создания #481 394 PR (41 main-root) по новому page4=94. `#52` Cloudflare request body cap — следующий отдельный semantic port; не объединять сильно отставший PR целиком. **Exact final CI проверить**.

## Границы

- B01/B04/B05: backup/signer/custody BLOCKED; B06/B10 модель и реальные видео **FROZEN #442**; B09 legacy IDB синтетически проверен, физически НЕ ПРОВЕРЕН; B11 device update BLOCKED.
- **Draft #469** старый startup/signing и **Draft #452** old restore не объединены. B08 массовые merges/закрытия запрещены.
- Без отдельного разрешения: **никакого merge, deploy/Pages/Cloudflare release, APK install, изменений production DB/видео, restore или удаления пользовательских данных**. Следующий автономный шаг без ПК — завершить #481 CI, затем main-based port #52 и регрессии.

- **Параллельная B08 интеграционная очередь (25.11):** [матрица пяти независимых Draft](docs/P1-B08-DRAFT-INTEGRATION-ORDER-2026-11-25.md) #478/#482/#483/#484/#485 с exact-main GitHub compare, отдельными functional diffs и общими документальными конфликтными зонами. Счётчики behind=0; это не доказательство отсутствия merge conflicts. Нет разрешений на merge, release или работу с данными. Документальный SHA `c8cf24bb2683c94dd3f435c55590c061d87781b2`; финальный CI проверить.
