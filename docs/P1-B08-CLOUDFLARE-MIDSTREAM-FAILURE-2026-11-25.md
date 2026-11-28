# P1 B08 — независимые source-bound регрессии

**Дата:** 2026-11-25. **Основа:** main `bf2c451106e8c0cea71ad94c84b8ccb4d65ff8b3`. Действуют [AGENTS.md](../AGENTS.md), [PROJECT-CONTROL](PROJECT-CONTROL.md), [F0–F7](СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md).

## F0–F2: наблюдаемый пробел

Two negative tests of actual readBoundedBody from Cloudflare Worker: a midstream read error after valid bytes cannot yield truncated request content; zero-byte cap rejects nonempty input. No Worker deploy or production secrets. Real provider response not tested.

## F3–F7: граница и критерии

Тесты используют исходный модуль из main и полностью синтетические данные. Изменений runtime и производства нет. После создания Draft PR проверить Node/Android/Governance именно на его точном HEAD SHA. При сбое установить первопричину и исправить только узкий тест. Успешный CI не означает физического восстановленного архива, обновления телефона, доказанного offline или разрешённого релиза. До независимого evidence не менять production DB и не удалять оригиналы.
