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
