# Реестр происхождения весов модели — безопасная подготовка (2026-11-20)

## Вывод по публичным кандидатам

- https://github.com/mattnudi/bee-detection — опубликованы специализированные YOLOv5 веса, но публичная страница сама по себе не доказывает право использования, распространения весов и правомерность датасета. **License evidence incomplete**.
- https://huggingface.co/maryammeda/apiarist-honey-bee-detector — карточка указывает Apache-2.0, но также сообщает `Base weights: yolov8s.pt` и training dataset Roboflow. Необходимо независимо установить права на исходные веса, подготовленный checkpoint, разметку/датасет. Модель для фотографий рамок, не признана подходящей для леткового tracking. **License evidence requires manual review**.
- Официальная лицензия Ultralytics / зависимостей проверяется отдельно, а не выводится автоматически из тега третьей стороны. Нельзя скрывать copyleft, ограничения на передачу или переиспользование.

Источники: https://huggingface.co/maryammeda/apiarist-honey-bee-detector ; https://github.com/mattnudi/bee-detection ; https://github.com/ultralytics/yolov5 .

## Реализация gate

`js/video-model-provenance-gate.js` принимает только декларацию evidence manifest, а не веса. Требуются: идентификатор/версия, SHA256+bytes конкретных весов, URL источника и указание лицензии весов с URL доказательства, происхождение базовых весов и лицензия с доказательством, происхождение обучающего датасета и его лицензия с доказательством, ONNX формат и задача honeybee_object_detection.

- Отсутствующие поля / небезопасные URL / несоответствие задачи → отказ `incomplete_provenance`.
- Полный manifest → только `provenance_review_required`, **не** юридическое подтверждение. URL и декларации могут быть ложными, а SPDX labels не подтверждают право на конкретный файл.
- Не проверяет содержимое ссылок, не скачивает модель, не создает IO, не фиксирует источники после review, не включает inference. Existing `verifyModelArtifact()` остаётся отдельным SHA guard.
- Всегда `licenseVerified=false`, `modelApproved=false`, `canRunInference=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`.

## Дальнейший критерий

Независимая сверка конкретного checkpoint с лицензией upstream, условиями training data и разрешением на использование/redistribution; затем проверенный ONNX, SHA-256, воспроизводимый формат и benchmark на физическом Android. Только подтверждённое end-to-end распознавание и отдельная проверка всех копий могут обосновать дальнейшую разработку deletion. Нынешнее удаление оригиналов запрещено.
