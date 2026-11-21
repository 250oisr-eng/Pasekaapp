# Apis mellifera — выборочный аудит исходных JPG/TXT внутри ZIP Zenodo v2

Дата: 2026-11-21. Исследовательская задача: получить проверяемые реальные байты *Apis mellifera* без загрузки полного архива около 2 ГБ и без доступа к пользовательскому видео.

## Первоисточник и права

- Официальная запись издателя Zenodo: https://zenodo.org/records/23276947, DOI 10.5281/zenodo.23276947, версия 2 от 2026-10-10; научный вид **Apis mellifera** по карточке издателя; **CC BY 4.0**.
- Оригинальный ZIP: `dataset_2823_images_labels.zip`; издатель сообщает полный MD5 `3b1dfaed60310045358a6e4391df89cc`. **Этот MD5 НЕ проверен по всем байтам**: для доказательства пришлось бы прочитать исходные 2 005 232 875 байт.
- По статье/описанию: 2795 исходных кадров из улья и 28 дополнительных handheld фотографий; разметка YOLO object detection, class 0/1 описывают визуальное наличие клеща у **пчелы**, а не GT направления, входа или выхода.
- Авторский пин 13 небольших файлов и 9 day-heldout мета-планов находится в Draft #321; source `Soda0603/varroa-in-hive-imaging` pinned Git commit `136cc6fefa993719131128132bb7c0a4deccbad9`.

## Проверенный ответ сервера

[GitHub Actions #44918667190](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44918667190) **SUCCESS** (7/7 synthetic тестов + живой запрос к Zenodo): запрос `GET Range: bytes=0-0` на **точный оригинальный официальный URL** вернул `HTTP 206` и `Content-Range: bytes 0-0/2005232875`; прочитан **только один байт** `P` из `PK`. Это доказывает поддержанный способ обращения к первоисточнику и фактический размер, **но не делает изображения, разметку или MD5 проверенными**.

## Безопасный формат следующей проверки

- `tools/probe_apis_zenodo_zip_range.py`: однобайтовый fail-closed пробник; никогда не переключается с HTTP 206 на полный HTTP 200 download, фиксированный URL, без авторизации.
- `tools/audit_apis_zenodo_bounded_original_sample.py`: читает только ZIP EOCD и центральный каталог ограниченными `Range` запросами, затем **ровно одну** детерминированно выбранную пару реальных исходных `img-*.jpg` + `img-*.txt`. Ограничен размер одного запроса (8 MiB) и исходного элемента (12 MiB); запрещает path traversal, нестандартные методы ZIP, неподтверждённую структуру, неверную длину/CRC и неожиданный HTTP-ответ. Достаёт размеры исходного JPEG из SOF, сводит настоящие YOLO классы/геометрию и вычисляет SHA-256 только выборочных оригинальных JPG/TXT, не распаковывая весь архив.
- `tests/test_probe_apis_zenodo_zip_range.py` и `tests/test_audit_apis_zenodo_bounded_original_sample.py`: только синтетические отрицательные тесты для ZIP/JPEG/YOLO/HTTP Range, включая отказ от HTTP 200.
- Два бесплатных CI: `.github/workflows/probe-apis-zenodo-zip-range.yml` и `.github/workflows/audit-apis-zenodo-bounded-original-sample.yml`.
- Итог `originalZipMemberJpegAndTxtCrcVerified=true` допустим **только если реальный CI фактически прочитает и проверит исходные байты одного JPEG + его TXT**. Даже тогда `wholeArchiveMd5Verified=false`, `jpegPixelsFullyDecoded=false`, `sessionIndependentEvaluationEstablished=false`, `actualBeeEntranceInOutGroundTruthValidated=false`, `modelTrainingAllowed=false`, `userVideoCleanupAuthorized=false`.

### Требующие подтверждения факты

Точный состав ZIP/число исходных JPG в каталоге и контрольные суммы выбранной пары будут внесены только после завершения реального CI. В случае отказа Zenodo поддерживать следующие диапазоны флаг допуска остается false, архив целиком автоматически не скачивается.

**Следующий проектный приоритет:** после байтового аудита показать, как проверить независимость реальных исходных кадров по датам/камерам и ближним дублям; отдельно получить Apis mellifera видеособытия с независимыми in/out и разворотами. Не менять приложение, IndexedDB, backup и политику хранения видео по результатам исследовательского скрипта.
