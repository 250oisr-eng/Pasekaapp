# Mendeley v6 — ограниченный пакетный импорт оригинальных JPG+YOLO из CSV

Дата: 2026-11-20. Статус: **tested research-only staging**. Dataset DOI: [10.17632/8gb9r2yhfc.6](https://doi.org/10.17632/8gb9r2yhfc.6), автор **Tomyslav Sledevic**, данные CC BY 4.0; при распространении производных материалов обязательны атрибуция и маркировка изменений.

## Задача и вход

В версии 6 в публичном Files нет одного отдельного `detection.zip`; оригинальные файлы доступны по отдельным public-files ссылкам. Официальный metadata API дал 6× HTTP 401, но проверенные прямые URL оригинального JPG/TXT работают без аккаунта. Использовать только оригинал версии 6, не подменять зеркалом Roboflow v5.

После того, как Work выгрузит CSV со строками из нескольких ulейных групп, применить:

```bash
python -m pip install --disable-pip-version-check --no-deps Pillow==12.0.0
python tools/stage_mendeley_v6_public_csv.py /path/from-work.csv --output-coco /path/new-unassigned-coco.json
```

CSV в UTF-8, заголовки строго: `hive_group,image_filename,image_url,label_filename,label_url`. Необязательные дополнительные поля `image_sha256,label_sha256` позволяют закрепить уже известные оригинальные байты. Пример **реальной** строки с SHA расположен в `tests/fixtures/mendeley-v6-one-pinned-public-pair.csv`; его не нужно вручную создавать заново.

## Безопасность и ограничители

- Не более **16** пар и **64 KiB** CSV на запуск; только JPEG оригиналов `_bee_20230609a` … `_bee_20230711c`, совпадающие по base filename YOLO `.txt`.
- URL должны иметь точно `https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/{uuid}/file_downloaded`, без query, cookies, bearer tokens или внешних хостов. HTTPS redirects только на точно зарегистрированный Mendeley EU публичный S3 CDN; отказ при неожиданном destination.
- До **8 MiB** на JPG, **256 KiB** на TXT, не более **96 MiB** на все ответы, HTTP timeout и проверка Content-Length. Лимиты — только ограничения пробника; они не утверждают, что остальные реальные кадры соответствуют им.
- Pillow 12.0.0 (свободная лицензия MIT-CMU) полностью декодирует каждый JPG 1920×1080; проверяются SHA pins при их наличии, дубли изображения по SHA, имена файлов, валидность YOLO, запрет повторных IDs.
- Байты исходных JPEG/TXT пишутся **только в временный каталог** исполнения и удаляются при выходе из него. Если задан `--output-coco`, сохраняется только новый JSON с `unassigned` annotations, SHA и названиями; существующий выходной файл **не перезаписывается**.
- Не предполагается внешнее приватное видео, Service Worker, Android MediaStore, синхронизация пользовательских медиа, IndexedDB, изменение app runtime или production.

## Верификация на настоящем датасете

Новый изолированный GitHub workflow [#44756273493](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44756273493) на кодовом SHA `2406506f583a4f8116496da0b80371f6e8eb25de`: **completed/success**.

1. **13** Python tests с искусственными данными проверили негативные и security случаи, включая фальшивые ссылки, хеши, пустую разметку, 2 группы и запрет перезаписи.
2. Из фиксированного реального CSV загружены оригинал `detection/_bee_20230609a/images/20230609a1002.jpg` (940530 байт, SHA `dcccf2db87e3f964870cfd84a65ad0ba9e81e992194b8f2fa18c16107fea41f3`) и YOLO TXT (266 байт, SHA `ab25e4c0d29898983b78cc8241271ca4a66095332c32c8f0d29aab68d32f68d5`).
3. `allOriginalJpegsFullyDecoded=true`; результат ровно **1 image, 7 bbox**, группа `_bee_20230609a`; сохранённый в runner временный COCO проверен как `split=unassigned, trainingAuthorized=false`, затем удалён.

Успех одной реальной пары не доказывает работоспособность на 16 реальных парах, качестве разметки, независимости восьми видеоисточников или пригодности обученной модели.

## Оставшиеся технологические контрольные точки

- Получить от Work CSV из других серий (без передачи паролей и скачивания всего 7,21 ГБ). Данный инструмент сможет проверять эти ссылки сразу.
- Сверить связь `hive_group` с **независимым recording/session provenance**; календарная серия не равна доказанной независимости кадров. Никаких случайных train/val/test split по кадрам не делать.
- Затем получить достаточный законно доступный набор, провести реальное обучение компактного детектора, независимый качественный benchmark, реальный tracking/in-out crossing и тест физического Android offline. И только после доказанной полноты recognition и сохранности результатов отдельно проверять lifecycle удаления исходных пользовательских видео.

`sourceVideoSessionIdsVerified=false`, `independentHoldoutVerified=false`, `trainingAuthorized=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`.

Без слияния PR, публикации или изменения main/production. Изолированный workflow не создаёт image artifacts.
