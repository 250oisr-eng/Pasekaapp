# PROJECT_STATUS — Пасека 2.0

**2026-11-25.** `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`; текущая ветка — изолированный Draft. Нормы [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md) и [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md).

## Актуальные факты и PR

- #471–#477 **MERGED**, read-only export, IndexedDB/Varroa/journal guards, SW v317; exact-main Fast #45476750153, Android #45476750242, Docs #45476750196 **SUCCESS**. Без публикации.
- [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478): B11 SW v318 ограниченное удаление versioned caches, code Fast PASS, final Android #45494369418 + Docs #45494369444 SUCCESS, NOT_IN_MAIN.
- [Draft #479](https://github.com/250oisr-eng/Pasekaapp/pull/479): B01 **PAUSED** до ПК. Установленный OnePlus NE2213 `ru.paseka.journal` v315, APK SHA `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6`; улей/семья/2 записи сохранены после offline/reboot. 4 synthetic ADB zeros PASS, public TAR 1090 bytes invalid, 2 приватных TAR повреждены, real full backup/restore NOT_VERIFIED. Не повторять USB без нового ресурса.
- [Draft #480](https://github.com/250oisr-eng/Pasekaapp/pull/480): B15 ручная Cloudflare публикация только с `main`, точным `release_sha` и подтверждением. Fast code #45495992070, final Android #45496201683 + Docs #45496201473 SUCCESS; no deploy.
- [Draft #481](https://github.com/250oisr-eng/Pasekaapp/pull/481): B08 полный read-only PR inventory + negative tests. Fast #45496538943, final Android #45496870257 + Docs #45496870566 SUCCESS. Открытых PR **396** после #483 (GitHub page4=96), root/main 43; не делать массовый merge.
- [Draft #482](https://github.com/250oisr-eng/Pasekaapp/pull/482): узкий main-based Cloudflare request body bound из старого #52; Fast code #45497203026, final Android #45497433414 + Docs #45497433509 SUCCESS; Worker **не опубликован**.
- [Draft #483](https://github.com/250oisr-eng/Pasekaapp/pull/483): **текущий B09** — 6 синтетических негативных/позитивных тестов реальных функций `openDB/readMain/readAutoBackup`: существующая повреждённая v3 не пересоздаётся, данные/Blob остаются при reopen; request success с последующим transaction abort не принимается как подтверждение. Никаких runtime/схема/DB изменений. Code SHA `56fe53bb91d780e3ef24c26c25d90ba31606cf3e`: Fast #45497667563 SUCCESS, exact final CI проверить.

## Следующий независимый этап и запреты

- B01 full backup/restore, B04/B05 installed signer/key и физический B11 upgrade **BLOCKED**; B06/B10 PASEKA02 лицензированная видео-модель/автоудаление **FROZEN #442**. **Draft #469** startup/signing и **Draft #452** full restore не слиты.
- Продолжать без ПК только после проверки CI #483 и приоритизированного анализа других старых PR на `main`. Нет разрешения на merge PR, release/Pages/Cloudflare deploy, установку/очистку APK, restore, изменение production IndexedDB, удаление оригиналов/архивов. Зелёный CI не равен физическому восстановлению.
