# Первая подлинная пара Mendeley v6: actual JPEG + YOLO annotation

Дата: 2026-11-20. Версия: **6**, DOI `10.17632/8gb9r2yhfc.6`. Статус: **доказана локальная конвертация одной настоящей пары**; не обученная модель и не видеотрекинг.

## Получение без пароля, оплаты и полного архива

Пользователь с помощью браузерного Work нашёл в открытом разделе Files точные адреса:

- `detection/_bee_20230609a/images/20230609a1002.jpg` — https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/dadabae0-6bbc-4636-b70c-47dae981adba/file_downloaded
- `detection/_bee_20230609a/labels/20230609a1002.txt` — https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/882b3086-fb80-49fa-99fc-780623481ad6/file_downloaded

Публичная TXT прямая ссылка реально отдала **семь** YOLO `class=0` строк при отдельной read-only проверке. Для реальных JPG/TXT байтов использовался GitHub-hosted job, **не** пользовательский Android/MediaStore, без аккаунта, cookie, токенов и платных сервисов. Архив `Download All` (~7,21 ГБ на публичном сайте) **не загружался**.

## Измерения с реальных байтов

На code SHA `f5cdb9c224a23584f0dcc20452f7f8afd8956c75`, job [#44749236895](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44749236895) **completed/success**:

| Измерение | Настоящий файл |
|---|---|
| `20230609a1002.jpg` | 940530 байт |
| JPEG SHA-256 | `dcccf2db87e3f964870cfd84a65ad0ba9e81e992194b8f2fa18c16107fea41f3` |
| JPEG header | 1920 × 1080 |
| `20230609a1002.txt` | 266 байт |
| TXT SHA-256 | `ab25e4c0d29898983b78cc8241271ca4a66095332c32c8f0d29aab68d32f68d5` |
| Разметка | 7 рамок `bee` class 0, нормированные 5 значений |
| `build_unassigned()` на этой паре | passed; 1 image, 7 bbox |
| Split/provenance | `unassigned`; session не доказана |

После настоящего чтения хеши зафиксированы в `tools/verify_mendeley_v6_public_pair.py`. Повторная [CI #44749468016](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44749468016) **completed/success** с 11 Python synthetic negative/security tests и повторной реальной SHA-проверкой. Любая замена JPEG или TXT по прежней ссылке теперь вызывает `public_source_sha_changed` и fail-closed.

**Пределы проверки:** JPEG проверен по подписи и метаданным JPEG header, но **не декодирован целиком** через изображение decoder; рамки проверены как YOLO bbox и перенесены в COCO. Не было наглядного визуального аудита правильности каждой рамки, не получены исходные MP4/видео-сессии, не проверены оставшиеся 7199 кадров, нет независимого holdout и train/test independence. 7 обнаруженных размеченных пчёл в кадре **не** являются 7 входами/выходами.

## Включённое безопасное повторение

`tools/verify_mendeley_v6_public_pair.py`:
- пинит две публичные ссылки, допускает только Mendeley origin и точный публичный EU S3 CDN hostname при HTTPS redirect;
- применяет 2 MiB лимит на JPG и 32 KiB лимит на TXT, таймаут, проверку Content-Length, финальный origin и настоящий SHA-256;
- создаёт **только временные файлы** в GitHub runner и удаляет их сразу после конвертации; не публикует изображения ни в Git, ни в artifacts;
- вызывает существующий `prepare_mendeley_v6_yolo_unassigned.build_unassigned()` на настоящей вложенной структуре `detection/_bee_20230609a/{images,labels}`;
- выдаёт только JSON с измерениями и запрещающими флагами, не просит паролей и не скачивает полный набор.

`tests/test_verify_mendeley_v6_public_pair.py` содержит 11 искусственных негативных сценариев. Node bridge включает их в общую регрессию. Workflow `.github/workflows/verify-mendeley-v6-real-pair.yml` проверяет ещё и настоящие два публичных файла.

## Лицензия и авторство

Исходный датасет: **Tomyslav Sledevic**, *Labeled dataset for bee detection and direction estimation on beehive landing boards*, **Version 6**, Mendeley Data, DOI [10.17632/8gb9r2yhfc.6](https://doi.org/10.17632/8gb9r2yhfc.6). Публичная карточка обозначает лицензию **CC BY 4.0** https://creativecommons.org/licenses/by/4.0/. Атрибуция и маркировка изменений необходимы при распространении производных данных. Лицензия статьи может быть иной; не переносить её на данные и не считать лицензию датасета лицензией сторонних model weights.

## Следующий реальный блок

1. Добыть без оплаты законный список ссылок минимум по нескольким разным улейным сериям и, по возможности, исходным MP4, либо получить все исходные группы через официальный Downloads, не затрагивая видео пользователя. Одной пары недостаточно для обучения.
2. На реальных файлах проверить полный JPEG decode и соответствие меток кадрам, точные counts, group/session identity, повторы SHA и provenance. На основании source session построить независимые grouped train/validation/test.
3. Обучать бесплатную лицензионно пригодную compact model и мерить detector quality. Отдельно реальный track ID / in-out benchmark на Android, перед любым удалением.
4. Пока `trainingAuthorized=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`. Android оригиналы пользователя и база не менялись, `main`/production/merge запрещены.

**Этап доказал реальный доступ и реальный импорт одной пары, а не готовое обучающее множество или детектор.**
