# B15 — Cloudflare Worker: только одобренная версия из main

**Дата:** 2026-11-25. **F0–F2:** решение LIMITED_SAFE_DRAFT. Точная база `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`. Источник — пользовательские правила о запрете необъявленной публикации, [AGENTS.md](../AGENTS.md) и [F0–F7](СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md).

## Дефект и ограничение

`.github/workflows/pages-manual-release.yml` требует явные `release_sha` + `PUBLISH-PASEKA`, запускается только из `main`, предварительно проверяет Git ancestry. В отличие от него `.github/workflows/deploy-cloudflare-worker.yml` ранее разрешал `workflow_dispatch` **из произвольной ветки без одобренного SHA или подтверждающей строки**. Это риск случайной/непроверенной публикации Worker, хотя факт такого запуска не обнаружен и права пользователя на публикацию не предоставлены.

## F3 инварианты

- **До** любых действий со Cloudflare token/аккаунтом убедиться: событие только `workflow_dispatch`, текущая ветка запуска `refs/heads/main`, буквальное подтверждение `PUBLISH-CLOUDFLARE`, строгий 40-символьный lowercase SHA, существующий commit из истории `origin/main`.
- Подлежащие публикации файлы брать из `release_sha` (не из плавающего main и не из произвольной ветки). Ручное одобрение конкретного SHA пользователь даёт **вне** GitHub input; ввод в Actions не заменяет право на production deployment.
- Не принимать `pull_request`, `push`, `schedule`, `repository_dispatch`, `workflow_run`, `workflow_call`, `release` или неявные внешние запуски для production workflow. Секреты не логировать, не открывать вне job deploy.
- Остальные CI не должны получать `wrangler-action`, `deploy-pages`, `pages:write`, `id-token:write` и иные возможности публикации без отдельного аудита. Явно разрешённые вручную Cloudflare и Pages ворота сохранены.
- `main`, пользовательские данные, OP, IndexedDB, APK и PWA не затрагиваются. Нет изменений тарифа или платных сервисов.

## F4–F7

- Минимальный workflow fix: два обязательных input `release_sha` и `confirmation`, job-level main-only condition, безопасная проверка SHA/ancestry до чтения secrets, checkout указанного одобренного SHA, затем прежний Wrangler и прежняя CORS проверка.
- Негативные тесты в Node: отсутствие автотриггеров, проверка `main`/SHA/подтверждения, порядок verification → checkout release SHA → secrets → deploy, fail-closed при попытке добавить deployment в обычные CI. Проверить точный branch HEAD через Fast/Android/Docs CI; наличие условий не равно доказательству о невозможности ручного обхода при злоупотреблении административными правами.
- Физический Cloudflare deploy и интеграция в `main` **не выполняются**. Статус `IMPLEMENTED_DRAFT` до точного CI; после PASS `READY_FOR_MERGE_REVIEW`, но слияние и публикация требуют отдельных разрешений пользователя. Откат возможен до публикации без воздействия на production; при выпуске нужна независимая процедура rollback одобренного SHA.
