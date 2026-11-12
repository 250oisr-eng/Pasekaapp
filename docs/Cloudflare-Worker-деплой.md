# Развёртывание Cloudflare Worker

Worker приложения — отдельный серверный компонент. Публикация GitHub Pages и сборка Android APK его не обновляют.

## Однократная настройка

1. В Cloudflare открой **My Profile → API Tokens → Create Token**.
2. Создай токен с правом **Account → Workers Scripts → Edit** для аккаунта, в котором размещён Worker. Не используй Global API Key.
3. Скопируй Account ID из Cloudflare Dashboard.
4. В GitHub открой репозиторий **Settings → Secrets and variables → Actions** и добавь два Repository secrets:
   - `CLOUDFLARE_API_TOKEN` — созданный API token;
   - `CLOUDFLARE_ACCOUNT_ID` — Account ID.
5. Не отправляй эти значения в чат и не записывай их в файлы репозитория.

## Развёртывание

1. Открой GitHub → **Actions → Deploy Cloudflare Worker**.
2. Нажми **Run workflow** для ветки `main`.
3. Дождись успешного завершения шагов Deploy Worker и Verify Worker CORS endpoint.

Workflow развёртывает `cloudflare/worker.js` по конфигурации `cloudflare/wrangler.jsonc`. После развёртывания проверяется preflight-запрос с разрешённого адреса приложения; ожидаемый ответ — HTTP 204.

## Что именно проверяет smoke test

Проверяется, что Worker доступен по адресу `https://pasekaapp.250oisr.workers.dev/` и отвечает на CORS preflight для приложения. Это не заменяет проверку авторизованного запроса к Workers AI: для неё нужен действующий пользовательский JWT и реальный запрос из приложения.

Адрес Worker в клиенте уже настроен на этот URL. Если Cloudflare развернёт Worker в другой аккаунт/поддомен, нужно синхронно изменить `AI_FUNCTION_URL` в `index.html`.

Развёртывание запускается вручную, а не при каждом коммите, чтобы изменения Worker не публиковались без отдельного запуска.
