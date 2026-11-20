# Прямой бесплатный набор Boxes on Bees and Pollen — ограниченная ZIP Range-проверка

Дата: 2026-11-20. Реальный источник: https://lila.science/datasets/boxes-on-bees-and-pollen .

## Почему сменился источник

Mendeley Data public REST `https://api.data.mendeley.com/datasets/8gb9r2yhfc?version=6` вернул **HTTP 401** из GitHub Actions (workflow #44732273439) при запросе без токена. Официальная документация API описывает OAuth2. Пароли, токены, платные регистрации и обход контроля доступа не использовать. Python parser unit tests 8/8 прошли; HTTP-запрос завершился отказом, который **не считается успешным CI**.

LILA открыто публикует архив `boxes-on-bees-2021.zip` через три публичных облачных зеркала. Карточка LILA заявляет:
- 4 993 изображения, примерно 50 000 аннотаций `bee` и `pollen`;
- разметка **Pascal VOC XML**, а не YOLO, поэтому прежний YOLO→COCO конвертер не принимает её без отдельного безопасного парсера;
- лицензия данных **Community Data License Agreement — Permissive variant**;
- архив размером ориентировочно 2 GB. Фактический размер, SHA-256 архива, вложенные notices/лицензии и целостность **пока не проверены**;
- контекст — honey bees у летков, что ближе к нашей цели, чем общий классификатор насекомых.

Заявленная на сайте лицензия и ссылки на общедоступный ZIP — основание для **ограниченного исследования**, а не готовое подтверждение прав на любые чужие модельные веса.

## Что проверяет тестовый инструмент

`tools/probe_lila_bee_zip_range.py` использует два **жёстко зафиксированных** публичных адреса из LILA:
1. Google Cloud: `https://storage.googleapis.com/public-datasets-lila/boxes-on-bees/boxes-on-bees-2021.zip`
2. Public AWS: `https://us-west-2.opendata.source.coop.s3.amazonaws.com/agentmorris/lila-wildlife/boxes-on-bees/boxes-on-bees-2021.zip`

- HEAD сверяет статус и заявленный размер без чтения тела.
- GET запрашивает строго `Range: bytes=0-63`. Перед чтением проверяются **206 Partial Content** и точный `Content-Range: bytes 0-63/N`, иначе тело ответа **не читается** (важно: 200 OK мог бы вернуть 2 GB).
- Читаются максимум 65 байтов, требуется 64 байта и стандартное начало ZIP (`PK`). Возвращается SHA-256 **только 64 байтов заголовка**, не всего архива.
- Запрещены redirects, произвольные URL, платные источники, запись/распаковка файлов, секреты и приватные видеозаписи.
- Если первый источник отклоняет Range/недоступен, пробуется второй; результат каждого отказа виден без утечки внутренних URL.
- Тесты: 7 изолированных Python cases + Node bridge в `npm test`. Отдельный исследовательский GH workflow `.github/workflows/bee-public-lila-zip-header.yml` запускается только в PR и ограничен 3 минутами, `contents:read`, без платных сервисов.

**Любой успешный ответ:** `archiveDownloaded=false`, `archiveSha256Verified=false`, `archiveContentsInspected=false`, `licenseVerified=false`, `trainingAuthorized=false`, `modelApproved=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`.

## Следующий реальный шаг

Если Range работает, безопасно исследовать ZIP central directory и отдельный небольшой VOC XML на независимом публичном источнике, не выкачивая все 2 GB. Перед распаковкой, конвертацией в COCO и обучением нужно подтвердить лицензию именно архивных материалов, корректность XML аннотаций, настоящие source-group holdout и подходящий размер модели. Ранее созданный `tools/inspect_bee_archive.py` сможет полностью проверить ZIP, только когда целый архив законно получен.

Это **не** inference, не реальная точность, не физическое испытание Android и не разрешение удалять оригинальное видео.
