# PROJECT_STATUS — Пасека 2.0

**26.11.2026 · live main `a8ffa6148823c21395001210132ed347a9131b23`.** Основные правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL.md](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Историю и старые SHA хранить в журнале.

## Решение пользователя от 26.11.2026 и последовательная очередь

- **[#538](https://github.com/250oisr-eng/Pasekaapp/pull/538) MERGED**: точный main `d74e5eb8877c62763023f34e231c2ebf5050cefe`, Fast #45856804420, Governance #45856804305, Android #45856804426 — SUCCESS. Добавлены только синтетические тесты атомарного отката IndexedDB, без изменения runtime. **Отдельная задача разработки функции контроля нехватки памяти отменена пользователем.** Не возвращаться к тестам памяти на устройстве ради неё. Базовые механизмы целостности и обработки ошибок сохраняются.
- **[#514](https://github.com/250oisr-eng/Pasekaapp/pull/514) MERGED**: read-only видеожурнал, защита от stale IndexedDB ответов/ошибок и безопасные видео-ID; main `fb73a5bda488e67a610cce7f459a48c827666a0d`. Real OnePlus/видео NOT_TESTED.
- **[#515](https://github.com/250oisr-eng/Pasekaapp/pull/515) MERGED; [#530](https://github.com/250oisr-eng/Pasekaapp/pull/530) MERGED**: SW v320, main `a8ffa6148823c21395001210132ed347a9131b23`, prior exact PR CI success; no physical cold-offline. **[#545](https://github.com/250oisr-eng/Pasekaapp/pull/545) REVIEW**: оборудование Р/К, code SHA `48ecc12dce5043a3308f7c2cf7e1bdb60dac141d`, actual code CI pending. После разрешённого merge #545 — отдельная проверка/слияние зависимого #547, затем #546 → #544 → #548 → #510 → #531.
- Готовность к интеграционному review ≠ слияние. Публикация, установка на OnePlus и проверка реальных видео не проводились.

## Замороженные зависимости (не тормозят независимую разработку)

- **B01 / P0 old OnePlus FROZEN:** старый APK и данные оставить без изменений; никакого USB/ADB варианта, установки APK или удаления. JSON v315 и MTP не заменяют full app-private backup с отдельными видео.
- **B04/B05 P0 BLOCKED:** installed signer/ключ/rollback не доказаны. **Draft #469** не разрешает upgrade.
- **B06/B10 #442 FROZEN:** лицензированная модель и реальное распознавание/автоудаление оригиналов не доказаны. [#512](https://github.com/250oisr-eng/Pasekaapp/pull/512) MERGED на main для защиты от удаления, но не установлен на OnePlus.
- **B07 P1:** физический sectional профиль и OP11–14 не активированы; исходный DOCX + пользовательские уточнения обязательны. **Draft #452** не является завершённым физическим восстановлением.
- **B09 физический риск:** синтетические fake-indexeddb тесты не равны реальным quota, crash/power loss и независимому restore на устройстве.

**MERGE #545 AND DEPENDENT #547 ONLY AFTER THEIR EXACT-HEAD CI / NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.**
