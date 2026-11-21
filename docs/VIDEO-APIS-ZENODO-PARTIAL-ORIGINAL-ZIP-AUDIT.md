## 2026-11-21 — реальный ZIP Zenodo Apis mellifera: 2823 исходных JPG/TXT по каталогу, 1 CRC/SHA пара (Draft #322)

- **Верифицированный первоисточник:** [Zenodo v2](https://zenodo.org/records/23276947), DOI 10.5281/zenodo.23276947; издательская API-карточка подтверждает научный вид **Apis mellifera**, права **CC BY 4.0**, ZIP размером **2 005 232 875 байт** и заявленный MD5 `3b1dfaed60310045358a6e4391df89cc`. Полный MD5 2-ГБ архива **не пересчитан**.
- Настоящий ZIP central index (5647 элементов) проверен через ограниченные HTTP byte ranges: **2823 JPG + 2823 YOLO TXT + classes.txt**. Все 2823 JPG/TXT по basename попарно совпадают, все даты кадров точно совпали с исходными SHA-верифицированными авторскими split TXT: **2795** in-hive frames и **28** handheld. Из ZIP получены и ZIP CRC-проверены оригинальные `img-20240107_220407--312.jpg` (621231 байт, SOF 1920x1080) и соответствующий TXT (38 байт, 1 YOLO bbox класса 0; geometry valid). Измеренные SHA256: JPG `8eaebe87ab7d28e5e70d679bf2ef63c48f2790b34524c4443bd8a2478b53f401`; TXT `c9ca49a9252af21a09a86fbbfdeeb12e4c765a774f526233fc32155b7ba2faf2`.
- Исходный архив использует Windows backslash в ZIP-именах (например, `dataset\classes.txt`). Аналитическая нормализация разделителей исправлена **без извлечения или переименования исходных байтов**; абсолютные пути, drive/UNC, traversal и коллизии после нормализации блокируются. Воспроизводимый [CI #44923936313](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44923936313) **SUCCESS, 22/22 synthetic tests + оригинальный ZIP catalog + первая CRC/SHA пара**. Повтор [#44923991236](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44923991236) SUCCESS.
- Официальный Zenodo JSON record реально проверен: [CI #44923991250](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44923991250) **SUCCESS, 11/11 synthetic tests + exact DOI/taxon/license/size/MD5 metadata**; внутренний ZIP-member endpoint ответил HTTP **403**. Издательский MD5 остаётся только metadata claim, а не independently verified checksum.
- Третий metadata-only allowlist source `zenodo-varroa-in-hive-v2` добавлен к BEEHIVE/pollen-beedata, только вид Apis mellifera, лицензия CC BY 4.0. [Source gate CI #44924124286](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44924124286) **SUCCESS, 22/22 tests** на кодовом SHA `6c6c21078a1350d5da6d9e449c41f686a6907098`. **Metadata eligible не означает разрешённое обучение**.
- **Остаётся непроверенным:** полный архивный MD5, индивидуальные исходные байты **2822** JPG/TXT, полный JPEG pixel decode, физическая session/camera независимость, независимая точность детектора, реальный in/out/U-turn GT на летке и офлайн Android inference. Код приложения, IndexedDB, backup, SW, оригинальные пользовательские видео не затрагивались, автоудаление/обучение/деплой/слияние PR запрещены. Следующий этап — дополнительные исходные байты, полноценная проверка близких дублей и независимый видеобенчмарк входов/выходов Apis mellifera.

---

Нижеследующие прежние сетевые failure/timeout остаются **историческими контрольными точками** и НЕ отменяют последующие подтверждённые SUCCESS на перечисленных SHA.

---

## Фактические HTTP и CI результаты 2026-11-21 — центральный каталог доступен частично, JPG/TXT не удостоверены

- **Проверенный исходник:** строго https://zenodo.org/records/23276947/files/dataset_2823_images_labels.zip?download=1, `Apis mellifera`, версия 2, CC BY 4.0. На [GitHub CI #44918667190](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44918667190): подлинный ответ `206 Content-Range: bytes 0-0/2005232875`, полный размер **2 005 232 875 байт**, проверены 7 тестов fail-closed. Издательский MD5 `3b1dfaed60310045358a6e4391df89cc` — пока **не проверен по содержимому всего ZIP**.
- Первая попытка [#44918790439](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44918790439) **FAILURE**: получен настоящий ZIP EOCD из хвоста, но прямой запрос центрального каталога истёк по тайм-ауту. Код не скачивал полный архив.
- Повторная попытка [#44918946022](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44918946022) **SUCCESS только как проверка безопасности**, **исходный JPG/TXT всё ещё НЕ подтверждён**: официальный 1-byte probe уже вернул TimeoutError; JSON содержал `originalZipMemberJpegAndTxtCrcVerified=false` и `blockReason`. Это не считать SUCCESS исходникового аудита.
- Другая попытка [#44918956954](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44918956954) **FAILURE**: настоящий ZIP EOCD разобран, сообщил **5647 записей центрального каталога** и **505 007 байт его размера**; отдельные HTTP Range запросы по 128 KiB для каталога снова завершились TimeoutError, **ни один JPG/TXT не получен и не сверён**.
- Последняя версия кода различает `sourceInputOrigin=synthetic_fixture`, недоступный оригинальный запрос, оригинальный EOCD и **только реально CRC-верифицированную пару JPG/TXT**. Задача source-byte CI теперь **явно FAIL** при `blockReason`, а не объявляет успешный аудит из-за прошедших synthetic tests. Синтетические юнит-тесты, сеть, оригинальные JPEG и GT событий — раздельные статусы.
- Никаких байтов пользовательских видео и изображений в коде/PR нет; оригинальный ZIP не загружался целиком. Даже при будущем успешном чтении одного JPG/TXT это не удостоверит MD5 архива, все 2823 изображения, независимость съёмок или in/out-U-turn GT. **Обучение, подсчёт и автоудаление запрещены.**

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
