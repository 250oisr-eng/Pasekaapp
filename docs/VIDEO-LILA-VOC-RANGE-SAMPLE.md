## Фактически проверенная парная JPEG + VOC разметка (2026-11-20)

На exact SHA `d708583c01c99d0979caaa9c530d1dbefe3cd72e` workflow #44733392890 **completed/success**: 10/10 Python fixture tests прошли, затем публичный GCP источник выдал настоящий парный sample.

- 9986 ZIP entries, 4993 XML candidates.
- `ML-Data/Chueried_HempBox_1.xml` SHA256 `eb405f671bc546d8d1cc16f9e97a108896a7984570dd11f01c71f42d30601879`.
- Парный `ML-Data/Chueried_HempBox_1.jpg` — 1158291 байт, SHA256 `f5e80e1d95d230de30efe6b2fd4a0eaa9338f4c248f1c8d0baa55c028803cb6d`.
- Pascal VOC `width=1920, height=1080`, `bee=5`, JPEG SOF заголовок подтверждает те же 1920x1080. **Это не полное декодирование JPEG и не проверка всей разметки**.
- HTTP Range всего 2126445 байт, full ZIP/JPEG dataset не скачивался. В ZIP центральном каталоге не выявлены отдельные licence/readme/notice filenames; опубликованная CDLA Permissive license на сайте LILA — самостоятельный источник, не подтверждение архивных embedded notices.
- У всех выводов `licenseVerified=false`, `trainingAuthorized=false`, `modelApproved=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`. User original deletion остаётся заблокированным.

---

# Чтение настоящего публичного LILA ZIP по диапазонам: каталог и Pascal VOC

Дата: 2026-11-20. Цель — подтвердить фактическую структуру открытого архива без скачивания его целиком.

## Проверенный предыдущий этап

- Draft #271 exact SHA `ea2c690d16d02bf6376991cfcc8cca13e554c32b`: public ZIP header workflow #44732672991 **completed/success**, Python offline regression **7/7**, сервер GCP выдал HTTP **206** для диапазона 0–63 и ZIP magic, `Content-Range` сообщил **2 076 021 293** байта. Android workflow #44732672760 **completed/success**, isolated archive #44732672727 **skipped**.
- Эти 64 байта — не файл, не доказательство целостности всего ZIP и не лицензия.

## Новый изолированный инструмент

`tools/sample_lila_voc_range.py` использует только зафиксированный публичный Google Cloud объект `https://storage.googleapis.com/public-datasets-lila/boxes-on-bees/boxes-on-bees-2021.zip`.

1. HEAD подтверждает Content-Length без тела.
2. Загружается **только хвост ZIP** (не более 65 557 байтов), ищется End of Central Directory.
3. По offsets и bounds читается **центральный каталог ZIP**, ограниченный 3 MiB, максимум 20 000 записей. Отклоняются path traversal, дубликаты, symlink, encrypted entries, unsupported compression, ZIP64/multidisk и неправильные размеры.
4. Из каталога выводятся только названия потенциальных документов LICENSE/NOTICE/README/attribution — **не автоматическая интерпретация лицензии**.
5. Выбирается до восьми небольших XML-кандидатов, каждый максимум 128 KiB в сжатом и распакованном виде. Через отдельные HTTP Range читается локальный ZIP header и сжатое содержимое; проверяется CRC32 и uncompressed size, затем парсится Pascal VOC `annotation / size / object / bndbox`. XML с DOCTYPE и ENTITY отвергается. Никакие JPG не скачиваются.
6. Общий лимит трафика на ответах — **4 MiB**. Сервер обязан вернуть `206 Partial Content` и точные `Content-Range`; при `200 OK` тело запрещено читать. Нет downloads всего архива и нет дисковой распаковки.

Вывод содержит лишь количество записей, число XML-кандидатов, имена licence-файлов, хеш одного небольшого XML, размеры и число bbox по классам, общие фактически прочитанные байты. Если источник не поддерживает Range или формат отличается, проверка завершается failure без подмены данных.

Флаги всегда `archiveDownloaded=false`, `archiveHashVerified=false`, `archiveLicensesRead=false`, `licenseVerified=false`, `trainingAuthorized=false`, `modelApproved=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`.

Тесты: `tests/test_sample_lila_voc_range.py` (7 синтетических ZIP cases), bridge `tests/public-lila-voc-sample.test.mjs` к `npm test` и отдельный бесплатный исследовательский GitHub `pull_request` workflow `.github/workflows/bee-public-lila-voc-sample.yml`.

## После успешной проверки

Теперь можно будет обоснованно написать отдельный **Pascal VOC → COCO** конвертер для изображений и bbox (существующий `tools/prepare-bee-coco.mjs` поддерживает нормализованные YOLO bbox, а не VOC XML). Для обучения YOLOX потребуются реально полученные, проверенные и лицензированные изображения и аннотации, атрибуция, split по независимым источникам, обучение с нуля, независимая оценка, ONNX экспорт и физический Android offline benchmark. Точность реального распознавания и удаление видео в этот этап не входят.

Примечание: публичный веб-сайт LILA указывает лицензию CDLA Permissive; реальные notices/условия архива нельзя считать изученными только на основании списка имён файлов.
