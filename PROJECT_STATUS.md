# PROJECT_STATUS — Пасека 2.0

**2026-11-25.** Live `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`; действующие [AGENTS.md](AGENTS.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md), [контроль](docs/PROJECT-CONTROL.md). Это состояние **ветки Draft**, не main.

## Текущая интеграция

- #471–#477 **MERGED**; read-only export, IndexedDB protections, journal guards, SW v317 в main без публикации. Main Fast #45476750153, Android #45476750242, Governance #45476750196 **SUCCESS** на точном SHA.
- **Draft #478** B11: fail-closed удаление только старых versioned cache keys, SW v318, [Fast #45493963043](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45493963043) на code+test SHA и [Android #45494369418](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45494369418), [Governance #45494369444](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45494369444) на финальном SHA — SUCCESS; NOT_IN_MAIN.
- **Draft #479** B01: USB/ПК-работа приостановлена по просьбе пользователя (ПК временно недоступен). OnePlus NE2213, Android 16, `ru.paseka.journal` v315, APK SHA `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6`; улей/семья/две записи на месте после offline/reboot. Четыре synthetic ADB transfer PASS, но public TAR 1090 bytes INVALID, host ADB 1.0.32. Старые приватные TAR повреждены, backup/restore **BLOCKED**; ничего не удалять/восстанавливать/обновлять.
- **Draft #480** B15 (этот макроцикл): `.github/workflows/deploy-cloudflare-worker.yml` теперь требует workflow_dispatch только из main, точный одобренный SHA + `PUBLISH-CLOUDFLARE`, git ancestry до раскрытия secrets и checkout конкретного SHA; негативные tests `tests/deployment-safety.test.mjs`, [контракт](docs/P1-B15-CLOUDFLARE-MANUAL-RELEASE-GATE-2026-11-25.md). Code SHA `6ad83a14e4921baea237b552c6047480ed3a35e6` Fast #45495992070 **SUCCESS**, Android финальный/docs HEAD проверять отдельно. Это защита **в Draft**, не изменение production.

## Следующие ограничения

- **B01, B04/B05, B06/B10, B11 физически BLOCKED/NOT_VERIFIED**; лицензированные веса и удаление видео **FROZEN #442**. **Draft #469** (signing/bootstrap) и **Draft #452** (full restore) не объединены. B08: live open PR count **393** (включая #480); не сливать цепочки массово.
- Следующее без ПК: завершить exact-head CI и риск-анализ #480, затем выборочно инвентаризировать B08 и продолжить только независимые тесты B09. Без разрешения пользователя **нельзя** merge, production deployment, устанавливать APK, менять данные/MediaStore, восстановить или удалить архивы.
