# GitHub Pages — разделение разработки и публикации (23.11.2026)

Статус: **MANUAL WORKFLOW IN DRAFT; PAGES ADMIN SOURCE NOT SWITCHED**. Issue #444. Никакие новые production-публикации этим документом/PR не разрешаются.

## 1. Доказанная первопричина

- После разрешённого слияния PR #443 GitHub автоматически запустил workflow **pages build and deployment** [#45126883908](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45126883908) на main merge SHA `f981e36d807d9cfb6c6077b7e3575f9abd42daf8`. Job `build`, `deploy` и `report-build-status` завершились `success`.
- В `main/.github/workflows` есть только `quality.yml`, `android-debug.yml` и `deploy-cloudflare-worker.yml`, причём Cloudflare Worker допускает только `workflow_dispatch`; автоматическое Pages-развёртывание НЕ определено нашим workflow YAML.
- Следовательно, опубликование было GitHub-managed Pages: вероятно, source `Deploy from a branch` на `main`. **Точное значение настройки Settings → Pages до переключения из текущего подключения прочитать нельзя**, поэтому не записывать `source=main` как административно подтверждённый факт.
- GitHub connector `get_repo` возвращает `permissions.admin=true`, но не предоставляет операции `GET/PUT /repos/.../pages`; обычный `fetch` отклоняет эти API URLs. Подключённый браузерный сервис TinyFish без доступного бесплатного баланса; платное пополнение запрещено. Техническая проблема не решается коммитом YAML в `main`.

Документы GitHub:
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/rest/pages/pages

## 2. Новая архитектура без автоматического выпуска

Файл `.github/workflows/pages-manual-release.yml` (сейчас ТОЛЬКО в main-based Draft) — **единственный предлагаемый Pages-публикационный процесс**, запускаемый только `workflow_dispatch`.

1. Никаких `push`, `pull_request`, `schedule`, `repository_dispatch` triggers. Запускать только на `refs/heads/main`.
2. Потребовать 40-символьный нижний hex SHA (конкретный публично одобренный релиз) и ручной ввод `PUBLISH-PASEKA`. SHA проверяется как объект `commit` и предок текущего `origin/main`. Нет публикации по плавающему `HEAD`.
3. Проверить через GitHub Pages REST, что `build_type=workflow`; неизвестный/недоступный ответ даёт **FAIL CLOSED**.
4. Скачать именно этот SHA, выполнить `npm ci`, полный `npm test`, `npm run web:prepare`.
5. `scripts/verify-pages-release-assets.mjs` проверяет единственный browser-output `www` (index, manifest, SW, icon, JS), точное совпадение байтов с проверяемым SHA, отсутствие симлинков, недостающих или лишних файлов. Нельзя загрузить `./` репозитория с тестами, исходной историей, секретами.
6. `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4` и `actions/deploy-pages@v4` используются только после успешного preflight. `deploy` зависит от `build`, имеет ограниченные permissions `pages:write`, `id-token:write` и защищённое окружение `github-pages`.
7. Публикацию запускает пользователь только **после отдельного явного разрешения в чате на конкретный SHA**. Наличие кнопки Actions не заменяет это требование. При необходимости настроить environment reviewers (доступность зависит от тарифных правил репозитория).
8. Возврат к прошлой версии — только отдельный явно утверждённый ручной выпуск точного ранее опубликованного SHA. Не переписывать пользовательскую IndexedDB и не удалять резервные копии при возврате UI.

## 3. Переход без повторения инцидента #443

**Шаг A — уже сделан в Draft, БЕЗ выпуска:**
- Изолированный main-based Draft `fix/pages-manual-release-gate-2026-11-23` с workflow, verifier, регрессиями и этим документом. Остаётся Draft.
- `main`, Pages Settings, Cloudflare, существующий публичный URL не менялись.

**Шаг B — ОДНО действие администратора (текущий технический блокер):**
1. Открыть [Settings → Pages](https://github.com/250oisr-eng/Pasekaapp/settings/pages).
2. В разделе `Build and deployment → Source` выбрать **`GitHub Actions`** (вместо `Deploy from a branch`). **Не нажимать на предложенный шаблон, не создавать auto-push workflow, не запускать выпуск.**
3. Подтвердить значение настройки текстом или скриншотом. Контроль GitHub source должен показать `GitHub Actions`, либо надёжный API `build_type=workflow`.
4. Это изменение **не должно запускать публикующий workflow из этой ветки**, потому что workflow пока только в Draft. Сохранить существующий опубликованный сайт; если GitHub самостоятельно инициирует другой deploy, зафиксировать run и прекратить остальные действия.

**Шаг C — машинная проверка до любого merge:**
- Проверить конфигурацию источника, отсутствие пользовательских `push`-triggered Pages workflows в `main` и текущие Actions run IDs.
- Пока источник не подтверждён `GitHub Actions`, issue #444 **OPEN** и новые merge в main **ЗАПРЕЩЕНЫ**.
- После подтверждения и успешной проверки PR пользователь может отдельно разрешить **merge этого конкретного PR**. Он не выпускает сайт, поскольку публикационный workflow manual-only. До этого `main` не менять.
- Последующие функциональные PR требуют собственного отдельного разрешения на merge; прошедший CI не является разрешением.
- Отдельное ручное deployment-одобрение на конкретный SHA требуется лишь когда пользователь решит обновить опубликованный сайт.

## 4. Приёмочные критерии issue #444

- [ ] GitHub Pages source фактически равен `GitHub Actions` (**сейчас НЕ ПРОВЕРЕНО / пользовательское admin-действие**).
- [x] Main-based Draft с `workflow_dispatch` без авто-триггеров создан.
- [x] Точный SHA, подтверждение, ancestry, проверка Pages source и tests/asset byte-integrity до deploy реализованы в Draft.
- [ ] Exact code/test SHA: полный Fast/Android CI SUCCESS, без недоказанных заявлений (проверять по текущему run).
- [ ] Пользователь отдельно разрешил merge этого PR (не равнозначно публикации).
- [ ] После переключения контролируемый обычный main merge не инициировал Pages deploy (подтвердить без специального пробного deploy; при одобренном merge проверить фактический список workflow runs).
- [ ] Окружение `github-pages` и ручной выпуск проверены только после отдельного разрешения пользователя на реальный release.
- [ ] Issue #444 закрывать лишь при доказанном административном изменении и безопасной интеграции, не просто при успешном CI.

При невозможности пункта B: **оставить Draft, не делать merge и не заявлять проблему решённой**. Это единственная операция, которую сейчас нельзя выполнить без GUI/Pages Admin API; пользовательские технологические данные и устройство не нужны.
