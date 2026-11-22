## 22 ноября 2026 — расширение поиска по InsectAI Model Zoo: лицензия ПО ≠ лицензия весов

Изучен [InsectAI Model Zoo](https://insectai-cost-action.github.io/model-db/): независимый реестр моделей насекомых. Сам каталог прямо предупреждает, что лицензионные метки копируются из источников и могут быть неточными или устаревшими; артефакты весов каталог не размещает, а показатели качества не воспроизводит ([об ограничениях](https://insectai-cost-action.github.io/model-db/about/)). Следовательно, **никакой каталог не является самостоятельным доказательством прав на конкретный checkpoint**.

- **Grounding DINO**: из первичного [LICENSE](https://github.com/IDEA-Research/GroundingDINO/blob/main/LICENSE) GitHub получен Apache-2.0 для репозитория (blob SHA `f1460f5e6ad1e90abb720a1536a46e3d057686a9`). README публикует ссылку на `groundingdino_swint_ogc.pth` и описание open-vocabulary `image,text → boxes`. Это реальный детектор общего назначения, но авторские оценки COCO не подтверждают детекцию и направление пчёл у летка. Права на точный checkpoint, его SHA-256, Android WebView/CPU/WASM offline performance и независимая field accuracy ещё не проверены. **BLOCKED**.
- **flatbug**: из первичного [LICENSE](https://github.com/darsa-group/flat-bug/blob/master/LICENSE) прочитан MIT код (blob SHA `bee96279e49757f77280f9c8ddf0bf28983dda2d`). [Реестр](https://insectai-cost-action.github.io/model-db/models/flatbug/) отмечает, что **веса содержат уведомление Ultralytics AGPL-3.0**, отдельного LICENSE рядом с весами нет; модель предназначена для top-down изображения насекомых на однородных плоскостях и лабораторных подложках, а не летка. Транзитивные условия и применимость нельзя заменять MIT лицензией обёртки. **BLOCKED**.
- **BioMoth** в каталоге отмечена Apache-2.0, но назначение — моль, не медоносные пчёлы и не траектории летка; не выдвигать в Android без оригинального источника весов и независимого испытания.
- Универсальные крупные vision-language модели (Grounding DINO, CLIP) **не приравниваются** к автономному малому детектору для телефона: пока не измерены конкретные ONNX/TF Lite export, RAM, длительность и ограничения офлайн.

Дополнены `tests/fixtures/bee-detector-candidate-inventory.json` (семь заблокированных кандидатов) и `tests/video-bee-candidate-inventory.test.mjs`: сравнение первичных LICENSE с отдельным, остающимся неизвестным статусом весов; отрицательные утверждения о доступности Android/точности. Никаких весов не скачивалось, не распаковывалось и не запускалось, особенно `.pt/.pth` (могут включать Python pickle).

**Следующее разумное независимое испытание:** отдельно от третьих лиц создать крошечную авторскую синтетическую ONNX-фикстуру для теста самого offline WebView/WASM исполнения; это проверит только runtime без установки чужих весов и **не будет подтверждением детекции пчёл**. После него продолжить поиск юридически пригодного checkpoint и независимого тестового набора летка.

---

## Дополнительная проверка первичных LICENSE и зависимостей — 2026-11-22

Фактически прочитаны файлы в чужих публичных репозиториях (через GitHub, **не** исполнялись их программы и не скачивались веса):

- [AjayJohnAlex/Bee_Detection/LICENSE](https://github.com/AjayJohnAlex/Bee_Detection/blob/main/LICENSE): реальный текст MIT, blob SHA GitHub `891259553e1a6f161d94cdb5d370c9cfaf59e56b`, copyright 2023 Ajay John Alex. [requirements.txt](https://github.com/AjayJohnAlex/Bee_Detection/blob/main/requirements.txt): `ultralytics==8.0.134`, `torch==2.0.1`, `torchvision==0.15.2`, `deep-sort-realtime==1.3.2`, Flask и OpenCV. Наличие MIT для кода репозитория **не доказывает**, что отдельные pretrained weights, базовые YOLO checkpoint и тренирующий датасет имеют такую же лицензию. URL immutable commit ещё не подтверждён. Candidate: blocked.
- [Gratheon/models-gate-tracker/LICENSE](https://github.com/Gratheon/models-gate-tracker/blob/main/LICENSE): текст GPL-3.0, blob SHA GitHub `f288702d2fa16d3cdf0035b15a9fcbc552cd88e7`; README описывает Python/TensorFlow/OpenCV и HTTP upload/server с S3-копией. GPL кода требует отдельного исследования совместимости; **никаких** подтверждённых прав на конкретный `SavedModel`, dataset или Android WebView offline execution. Candidate: blocked.
- [Gratheon/models-bee-detector](https://github.com/Gratheon/models-bee-detector): HTTP/Docker сервис с YOLOv5 и прямым указанием на внешние веса Matt Nudi. Это **не новый независимый источник прав** на `best.pt`; отсутствие доказанной лицензии Matt Nudi переносится как блокер. Candidate: blocked.
- [Ajay repo](https://github.com/AjayJohnAlex/Bee_Detection) сообщает примерно 9664 размеченных изображения и MIT для repo; в отсутствие independently pinned весов и оценки на конкретном летке не считать этим validated detector.

Новая структурированная опись `tests/fixtures/bee-detector-candidate-inventory.json` содержит **только публичные ссылки и явно неподтверждённые статусы**, без бинарных весов, данных пользователя и модельных числовых метрик. `tests/video-bee-candidate-inventory.test.mjs` проверяет, что ни один кандидат нельзя подать в staging-gate как авторизованный и что MIT/GPL код репозитория не транзитивно присваивается весам.

**Следующая целевая проверка:** у автора/правообладателя выбранной модели подтвердить *точную лицензию конкретного файла весов и исходного pretrained checkpoint*, immutable revision, training data license, геометрию входа/выхода и offline conversion. Только после этой проверки — отдельный изолированный Android inference proof на синтетических кадрах с independently pinned ONNX/TF Lite моделью и нулевым доступом к реальным видео.

---

## 2026-11-22 — Gratheon: проверка назначения весов

В [ревизии 21faabd](https://github.com/Gratheon/models-gate-tracker/tree/21faabd0ea2d57f9e0d4434fc47b5af0839fbb81) BeeDetection.py использует контуры OpenCV и fitEllipse, а BeeClassification.py запускает predict_on_batch для классификации подготовленных изображений. В дереве есть SavedModel с переменными, корневой LICENSE содержит GPLv3, Training/BeeDataset подключён отдельным подмодулем BeeAlarmed/BeeDataset. Проверены исходники и метаданные; веса не скачивались. Отдельная модель классификации не решает задачу локализации на полном кадре. Следующий шаг — проверить происхождение весов следующего кандидата для детекции летка. На SHA 23728d707bc3229b5944e6939ca2fc3954424e59 локально прошли 3/3 теста допуска, Android CI #44955879058 успешен, #44955879068 пропущен.

Для #344 получен физический MEDIA_ERROR_4_android-proof-black после сверки SHA, белый кадр не проверялся. PASS трёх кадров H.264 в #347 относится к другой фикстуре. Повтор запусков от пользователя сейчас не требуется.


# Проверка сторонних весов для распознавания пчёл — 22 ноября 2026

**Статус:** исследование, не разрешение на модель, скачивание весов, Android inference или очистку видео.

## Установленные факты и источники

| Кандидат | Проверено по публичной странице | Неподтверждённое / решение |
|---|---|---|
| [Matt Nudi bee-detection](https://github.com/mattnudi/bee-detection) | В GitHub имеются README и `best.pt`; заявлены классы bee/drone/pollenbee/queen и показатели на собственном тесте автора (162 изображения; для bee recall 0.708) | В репозитории не обнаружен явный LICENSE для `best.pt`; данные Roboflow и права на саму модель — разные вопросы; нет Android WebView/ONNX и независимой оценки летка. **BLOCKED** |
| [Apiarist Honey-Bee Detector (YOLOv8s)](https://huggingface.co/maryammeda/apiarist-honey-bee-detector) | Автор указал Apache-2.0 для публикуемой модели; `honey_bee_detector.pt` около 22.5 MB; 4 класса Worker/Drone/Queen/Varroa; исходный базовый `yolov8s.pt`; обучение на 3308 изображениях | Модель прямо описана для **осмотра сотовых рамок**, не летка; применимость к летку неизвестна; база YOLOv8s и её отдельные права/зависимости требуют проверки. Веса содержат PyTorch pickle, не исполнять непроверенную сериализацию. **TASK_MISMATCH / BLOCKED** |
| [Honey-Bee-Society honeybee_ml_v1](https://huggingface.co/Honey-Bee-Society/honeybee_ml_v1) | Авторская карточка Apache-2.0; AutoGluon image **classification** медоносной пчелы/шмеля/ос; размер checkpoint около 383 MB (SHA-256 опубликован на странице) | Не детектор объектов и не трекер направления `in/out`; заявленная accuracy относится к другой задаче; интеграция на Android и источник обучающих изображений не проверены. **TASK_MISMATCH / BLOCKED** |
| [Gratheon models-gate-tracker](https://github.com/Gratheon/models-gate-tracker) | Заявлен трекинг у летка; исходно Python/TensorFlow/OpenCV/Jetson Nano и серверный путь | Нет подтверждённого комплекта лицензия **весов** + model provenance + независимая Android WebView offline сборка. Серверная передача кадров неприемлема по умолчанию. **BLOCKED** |

Лицензия [ONNX Runtime](https://github.com/microsoft/onnxruntime) — MIT, но **не распространяется автоматически** на веса, обучающий датасет или инструменты конвертации. [Ultralytics](https://docs.ultralytics.com/) публикует AGPL-3.0 либо коммерческую Enterprise-лицензию для своего ПО/моделей; совместимость с требуемой бесплатной эксплуатацией и исходной лицензией сторонних весов нельзя считать установленной.

## Доказательная цепочка до допуска

1. Установить конкретный исходный репозиторий **и immutable revision**, точный файл весов и независимо подтверждённые SHA-256/размер.
2. Подтвердить **отдельно** права на конкретные веса, базовую предобученную модель, датасет, зависимости и разрешение распространения в бесплатном Android приложении; сохранить ссылки/тексты лицензий и атрибуцию.
3. Доказать, что модель решает **детекцию на летке**, а не классификацию кадра или осмотр рамок. Нельзя объявлять `zero detections` успешным распознаванием.
4. Подготовить offline Android WebView/WASM smoke test с независимым артефактом и без прав к медиа пользователя; измерить память, скорость, timeout на реальном телефоне.
5. Провести независимый accuracy benchmark для входа/выхода, ошибок detector/track ID и ложных срабатываний. Отдельно — протокол сохранения результата и всех внешних копий видео.
6. Лишь после этого планировать integration review. **Никакой автоматической очистки видео**: реализация должна доказать завершение распознавания, durable запись и корректное удаление только собственных подтверждённых копий с учётом внешнего MediaStore.

## Новая программная защита

`js/video-detector-candidate-gate.js` — **неактивная**, чистая проверка поданной информации о кандидате. При отсутствии хотя бы одного заявленного подтверждения выдаёт причину отказа. Даже полный положительный манифест выдаёт только `evidence_submission_ready_only` и всегда `weightsApproved:false`, `canDownloadWeights:false`, `canRunInference:false`, `recognitionSucceeded:false`, `cleanupAuthorized:false`. Самообъявление полей **не подтверждает факт** лицензирования или качества. Этот модуль не подключён к UI, не загружает/запускает веса и ничего не удаляет.

Тест: `tests/video-detector-candidate-gate.test.mjs`; негативные варианты для каждого доказательного барьера, полный самообъявленный manifest и запрет сетевых/файловых побочных эффектов.

**Итог на дату проверки:** ни один кандидат пока не допущен к реальному inference на пользовательских видео; Android IndexedDB, воспроизведение синтетического MP4 и извлечение JPEG уже подтверждены отдельно физическими результатами, но не эквивалентны распознаванию пчёл.

## 2026-11-22 — проверка весов bee-yolo-tracking

В фиксированной ревизии vladvroust есть одноклассовая конфигурация для пчёл и метка bee. Оба видеосценария загружают общие cfg/yolo.cfg и bin/yolo.weights. В полном дереве этой ревизии требуемого файла и отдельно идентифицируемого обученного checkpoint пчёл не найдено; при проверке список GitHub Releases был пуст. Корневой LICENSE содержит GPLv3. Происхождение конкретных весов, их контрольная сумма и условия распространения остались неподтверждёнными. Решение — исключить эту ревизию из очереди испытаний на устройстве. Следующий кандидат для проверки — maxim2100/bee-detection-classification: сопоставить файл весов с реальной задачей детекции и условиями автора до загрузки.

Проверенные исходники: [process_video.py](https://github.com/vladvroust/bee-yolo-tracking/blob/2d913be3d4035f3c1961fe06d47ed127bcf6fa40/process_video.py), [process_videocam.py](https://github.com/vladvroust/bee-yolo-tracking/blob/2d913be3d4035f3c1961fe06d47ed127bcf6fa40/process_videocam.py), [cfg/tiny-yolo-voc-1c-bee.cfg](https://github.com/vladvroust/bee-yolo-tracking/blob/2d913be3d4035f3c1961fe06d47ed127bcf6fa40/cfg/tiny-yolo-voc-1c-bee.cfg), [labels.txt](https://github.com/vladvroust/bee-yolo-tracking/blob/2d913be3d4035f3c1961fe06d47ed127bcf6fa40/labels.txt), [LICENSE](https://github.com/vladvroust/bee-yolo-tracking/blob/2d913be3d4035f3c1961fe06d47ed127bcf6fa40/LICENSE).

## 2026-11-22 — maxim2100: назначение опубликованных весов

По [конфигурации](https://github.com/maxim2100/bee-detection-classification/blob/4994a19bc2c9fe5d710cd2b87ec6a0b848fc1d04/scripts/env_config.py) оба сценария детекции используют корневой yolov8n.pt. Файл runs/classify/train/weights/best.pt предназначен для классификации вырезок. Полное дерево ревизии 4994a19bc2c9fe5d710cd2b87ec6a0b848fc1d04 содержит один файл .pt, yolov8n.pt (6 549 796 байт, Git blob 0db4ca4b4d25d68a4497220353592645ca4f71bf). Идентификатор Git не является SHA-256 содержимого. Отдельного экспорта TorchScript в дереве нет. [Сценарий обучения](https://github.com/maxim2100/bee-detection-classification/blob/4994a19bc2c9fe5d710cd2b87ec6a0b848fc1d04/scripts/train_yolo_detection.py) использует тот же файл как исходную модель и предусматривает экспорт. Подтверждения, что опубликованный файл содержит результат этого обучения, не найдено.

В [простом сценарии](https://github.com/maxim2100/bee-detection-classification/blob/4994a19bc2c9fe5d710cd2b87ec6a0b848fc1d04/scripts/detect_bees.py) координаты xyxy каждой найденной рамки получают подпись Bee без проверки класса, а для четырёх координат выводится уверенность 1.0. Из подписи нельзя вывести точность модели. В [README](https://github.com/maxim2100/bee-detection-classification/blob/4994a19bc2c9fe5d710cd2b87ec6a0b848fc1d04/README.md) поле лицензии оставлено шаблоном; разрешение на распространение конкретных весов не установлено. Решение: не испытывать эту ревизию на телефоне. Веса не скачивались, код автора не исполнялся. Следующий шаг — искать опубликованный детектор по записи обученных весов с явной лицензией и описанием обучающей выборки летка до проверки Android.

## 2026-11-22 — найден конкретный детектор летка Buzzlytics

В [дереве Buzzlytics](https://github.com/okayxsh/Buzzlytics---CSCI435/tree/d248d76aff72500fe85498d93cfa269eca835d9a) присутствует cv_pipeline/weights/best.pt, Git blob ec7600af3b36b6479f9bd27093f1656f565acf46. Это идентификатор Git, SHA-256 бинарных весов не измерялся. README связывает этот файл с классами bee и pollen_bee. Ноутбук training/colab_train.ipynb начинает обучение с yolov8n.pt. [Авторы VnPollenBee](https://comvis-hust.github.io/datasets/pollenbee.html) описывают съёмку летка сверху и разметку 60 826 объектов. Это подходящая предметная область; метрик независимого подсчёта входа/выхода для «Пасеки» пока нет. В проверенном дереве не найден отдельный файл лицензии; условия распространения конкретного checkpoint и цепочка прав на базовые веса и данные не подтверждены. Кандидат зарегистрирован как BLOCKED. Только метаданные и исходные тексты, без исполнения или загрузки модели для испытаний.

Две смежные публикации не дали воспроизводимого файла весов: [Zenodo 15229457](https://zenodo.org/records/15229457) содержит PDF; [статья о мониторинге летка](https://doi.org/10.3390/biology15090731) указывает доступ к данным по запросу. Следующий шаг — проверить, опубликованы ли модель и условия распространения у первичных авторов VnPollenBee. Повторный тест ONNX на OnePlus не требуется.
