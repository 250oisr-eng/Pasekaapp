# P1 B11 — независимые source-bound регрессии

**Дата:** 2026-11-25. **Основа:** main `bf2c451106e8c0cea71ad94c84b8ccb4d65ff8b3`. Действуют [AGENTS.md](../AGENTS.md), [PROJECT-CONTROL](PROJECT-CONTROL.md), [F0–F7](СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md).

## F0–F2: наблюдаемый пробел

Two additional VM tests of actual sw.js: an HTTP 404 on a shell file prevents skipWaiting while keeping old cache, and private/no-store responses block installation. No runtime SW change, no Pages deploy and no installed OnePlus change. Device offline proof NOT_VERIFIED.

## F3–F7: граница и критерии

Тесты используют исходный модуль из main и полностью синтетические данные. Изменений runtime и производства нет. После создания Draft PR проверить Node/Android/Governance именно на его точном HEAD SHA. При сбое установить первопричину и исправить только узкий тест. Успешный CI не означает физического восстановленного архива, обновления телефона, доказанного offline или разрешённого релиза. До независимого evidence не менять production DB и не удалять оригиналы.
