# Публичные метаданные Mendeley v6: проверка из GitHub Actions

Дата: 2026-11-20. Доказанный исходный блокер: обращения к `api.data.mendeley.com` и `data.mendeley.com` из текущего контейнера завершаются DNS-ошибкой. Веб-просмотр также не извлёк фактические JSON API. Это ограничение среды, не доказательство отсутствия опубликованного набора.

## Что реализовано

- `tools/probe_public_mendeley.py`: **только** три GET-запроса к официальному `https://api.data.mendeley.com`, строго dataset ID `8gb9r2yhfc`, version 6. Запросы `/datasets/{id}`, `/datasets/{id}/files`, `/datasets/{id}/zip` с параметром `version=6`. Запрет редиректов и произвольных адресов; таймаут 12 секунд; ограничение JSON 2 MiB на endpoint.
- Вывод: название лицензии **по декларации API**, наличие описанных файлов, первые 50 метаданных имён/размеров/SHA-256, ZIP status/size/SHA. Не печатать подписанные `download_url`, токены или ссылки на скачивание. Не сохранять payload и не загружать архивы, изображения и видео.
- `tests/test_probe_public_mendeley.py` — шесть офлайн-тестов парсера и ограничений; `tests/public-mendeley-metadata.test.mjs` включает эти проверки в уже действующий `npm test`.
- `.github/workflows/bee-public-dataset-metadata.yml` — отдельная исследовательская проверка `pull_request` только при изменении файлов probe/tests/workflow. Разрешение GitHub `contents:read`, без секретов, публикации или production, без платных API/машин. Используется обычный hosted `ubuntu-latest`, ограничение времени 3 минуты. CI завершится **ошибкой**, если публичный API не отвечает или формат неожиданный — не маскировать такую ошибку успешным результатом.

## Точное значение проверки

Даже если endpoint вернул правдоподобный CC BY 4.0 и SHA архива, это ещё **не** означает получение архивных байтов, проверку вложенного LICENSE, права на исходные изображения и метки, работоспособность ML модели или право на пользовательские видео.

Скрипт всегда возвращает:
`archiveDownloaded=false`, `fileLicensesInspected=false`, `licenseVerified=false`, `trainingAuthorized=false`, `modelApproved=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`.

Флаг `fileListPossiblyPartial=true` означает, что первая выборка метаданных не подтверждает полноту списка (API может разбивать список на страницы).

## Достоверные источники

- Официальный API: https://data.mendeley.com/api/docs/ (разделы Get public dataset, Get files of a public dataset, Get zip archive metadata).
- Общедоступная карточка v6: https://data.mendeley.com/datasets/8gb9r2yhfc/6 .
- Отдельное требование: перед фактическим training изучить zip/readme/лицензии и право использования самой разметки, а не только метку в API.

## Следующий самостоятельный этап

Сверить реальный workflow на точном SHA PR. Если API из GitHub Actions доступен, взять идентификаторы/размеры/хеши только как метаданные и найти допустимый архив для последующей контролируемой загрузки в отдельную среду с ограниченными ресурсами. Если недоступен — зафиксировать HTTP/DNS блокер и не использовать поддельные файлы в качестве обучения. Ни `main`, ни пользовательские видео, ни production/удаление оригиналов этот этап не затрагивает.
