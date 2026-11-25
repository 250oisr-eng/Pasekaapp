# B06 / V0–V2 — реальный бесплатный путь к детектору пчёл (26.11.2026)

**Статус: F0–F2 FEASIBILITY / CONDITIONAL_GO_FOR_RESEARCH_ONLY. NOT_SHIPPABLE.** Ни загрузка/обучение неизвестных весов, ни запуск пользовательских видео, ни автоматическое удаление не разрешены этим документом. Ветка без runtime и без model binary. Основание: [issue #442](https://github.com/250oisr-eng/Pasekaapp/issues/442) и [Gate V0–V6](СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md#6-специальный-анти-видео-gate-v0v6--закрыт-до-доказательств).

## F0 — что действительно есть

1. **Данные о пчёлах, не модель.** [Mendeley Data, Sledevic, v6, DOI 10.17632/8gb9r2yhfc.6](https://data.mendeley.com/datasets/8gb9r2yhfc/6). В исследовательской ветке [#290](https://github.com/250oisr-eng/Pasekaapp/pull/290) опубликована ссылка на лицензию CC BY 4.0, оригиналы JPEG+YOLO TXT и SHA: 96 реальных новых пар, из них 3 отвергнуты из-за неверной геометрии YOLO, 93 включены в проверенный рабочий реестр (восемь групп, 557 bbox с 16 ранее закреплёнными парами). [Официальная v3-страница](https://data.mendeley.com/datasets/8gb9r2yhfc/3) показывает CC BY 4.0 и 7200 кадров. **В этом цикле прямая страница v6 не была прочитана через web-интерфейс**, поэтому перед любым обучением/распространением необходима самостоятельная неизменяемая запись точной лицензии **v6**, версии и авторской атрибуции; нельзя переносить v3-лицензию автоматически или путать её с лицензией научной статьи CC BY-NC-ND.
2. **Не «готовые» данные для in/out.** В #290 сохранён источник: detection размечает все пчелиные bbox, включая траву и внешнюю стенку. Направление пересечения летка / ин-вых **не размечено этими bbox**. Независимость восьми физических ульев, video session→frame mapping, реальные 1194 события из другой работы и её лицензия не доказаны. Письмо авторам selection/codebook/license/provenance от 21.11.2026 отправлено; на 26.11 в Gmail найдено только исходящее письмо, ответа нет. Не синтезировать классы и не выдавать кадры соседних моментов за независимый тест.
3. **Runtime без модели.** ONNX Runtime Web под MIT [GitHub](https://github.com/microsoft/onnxruntime/blob/main/LICENSE), Android synthetic ADD-2 PASS. Реальный ONNX bee model/детекция на физическом OnePlus NOT_TESTED.
4. **Motion-only не замена детектору.** Исследовательский [#300](https://github.com/250oisr-eng/Pasekaapp/pull/300) обработал оригинальные 6000 кадров/127452 GT bbox и сопоставил только 729 областей IoU≥0.5 при 182421 ложной области (фиксированная модель/настройки). Такой baseline недостаточен для практического распознавания; не делать вид, что его можно развернуть.

## F1 — реальный маршрут без обязательной платы и AGPL-зависимости

| Компонент | Источник / права | Решение |
| --- | --- | --- |
| Набор настоящих bbox | Mendeley v6, по предыдущей проверке CC BY 4.0; 93 реально проверенных JPEG/TXT пар в старой исследовательской цепочке | **CONDITIONAL** до архивирования точного текста лицензии v6, повторной проверки прямых байтов/sha и корректного split по видеосессиям; attribution/changes обязательны |
| Обучающий код | [TensorFlow Lite Model Maker](https://developers.google.com/edge/litert/libraries/modify/object_detection) и [TensorFlow Examples](https://github.com/tensorflow/examples) — код под Apache-2.0 | Перспективный **open source training route** для EfficientDet-Lite0 с экспортом custom TFLite; точные pinned версии/зависимости и CPU/GPU ресурсы ещё не проверены |
| Исходная модель EfficientDet-Lite0 | [Google MediaPipe Object Detector](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector), [LiteRT Community опубликованный int8 TFLite](https://huggingface.co/litert-community/MediaPipe-ObjectDetector-EfficientDet-Lite0) с меткой Apache-2.0 | **НЕ допущенные bee weights**: опубликованный checkpoint обучен на COCO и не имеет отдельной категории «bee». Для fine-tune подтвердить upstream-лицензию **точного файла pretrained weights** и reproducible SHA; модель/карточка посредника не заменяют проверку upstream прав |
| Альтернатива без pretrained weights | Самостоятельно обученные с нуля веса на коде с permissive-лицензией | Юридически проще при подтверждённых правах на данные, но вычислительно тяжелее; точность и стоимость обучения неопределённы; до теста **UNKNOWN_FEASIBILITY**, не заявлять бесплатность GPU |
| Мобильный runtime | [LiteRT Task ObjectDetector](https://developers.google.com/edge/litert/libraries/task_library/object_detector), [MediaPipe ObjectDetector](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector), либо отдельно проверенный MIT ONNX Runtime | Предпочтение автономной локальной обработке без загрузки кадров на сервер; требуется Android plugin/Capacitor proof, offline preload, CPU/energy metrics |

### Кандидаты, НЕ выбранные

- [Matt Nudi `best.pt`](https://github.com/mattnudi/bee-detection): bee weights есть, но отдельная лицензия именно weights и происхождение не подтверждены. Старое исследование #348: BLOCKED.
- [Apiarist YOLOv8s](https://huggingface.co/maryammeda/apiarist-honey-bee-detector): заявлен Apache-2.0 на странице, но дообучен из Ultralytics YOLOv8s, а [Ultralytics](https://www.ultralytics.com/license) указывает AGPL-3.0 для своих моделей по умолчанию; к тому же задача осмотра рамок ≠ вход летка. BLOCKED до отдельного permission/AGPL-compatible релиза.
- [Honey Bee Society](https://huggingface.co/Honey-Bee-Society/honeybee_ml_v1): classifier bee/wasp/bumblebee, **не bbox detector, не tracking, не direction**.
- [Gratheon](https://github.com/Gratheon/models-bee-detector): серверно/Python/Jetson и ветка весов Matt Nudi, лицензия/мобильная пригодность в полном объёме не доказаны.
- [YOLOX source](https://github.com/Megvii-BaseDetection/YOLOX): Apache-2.0 на код, но официальные права на **pretrained checkpoints отдельно оспариваются** в [issue #1915](https://github.com/Megvii-BaseDetection/YOLOX/issues/1915), не считать их разрешёнными автоматически.

## F2 — минимальный доказательный эксперимент, а не ещё одна цепочка synthetic PASS

**Шаг A — юридический и binary provenance gate (без OnePlus):** сохранить точную страницу/метаданные v6 CC BY 4.0 с DOI/version; выписать explicit upstream training software license, source/NOTICE и отдельное разрешение конкретного base checkpoint. Зафиксировать immutable revisions, SHA-256 скачанных **оригинальных** JPG/TXT и (после законной проверки) base weights, размер и источник. Никакого неизвестного `.pt` pickle. Без source evidence STOP V0.

**Шаг B — только оригинальные bbox и честная независимость:** проверить все заявленные source-видеосессии/кадры и разметку, исключить 3 ошибки и дубли; собрать train/validation/test с заранее проверенными по записям независимыми группами, оставить хотя бы одну ранее не использованную сессию/улей для теста. Исторические 93 пары — не достаточное основание объявить независимую метрику. Если независимость доказать нельзя — **research-only fitting**, metrics `NOT_INDEPENDENT`, no deploy.

**Шаг C — один реальный model trial после A+B:** обучить/дообучить `bee bbox` на юридически разрешённом наборе через pinned Apache-licensed tooling, экспортировать TFLite или ONNX, сохранить SHA обеих конкретных моделей/обучающих данных, логи, reproducible inference JSONL и измерить bbox precision/recall на оригинальных **ранее не виденных** кадрах. Если исходный checkpoint не разрешён — не загружать его; обучение с нуля обсуждать отдельно с честной оценкой ресурсов. Никогда не утверждать, что 80 COCO классов включают bees.

**Шаг D — движение отдельно от обнаружения:** закрепить реальные source-video track IDs и разметку `IN`/`OUT`/`UNKNOWN` по пересечению пользователем откалиброванной линии/полигона летка. Сравнить direction event precision/recall, двойные подсчёты, ID-switches и ошибки в минуту на разных условиях; без такой разметки показывать максимум **предварительные bbox без подсчёта**. Ожидание авторской выборки 1194 может помочь, но не блокирует bbox-исследование и не заменяется выдуманной выборкой.

**Шаг E — только на реальном OnePlus, в отдельном appId:** одна вертикальная трасса исходный разрешённый ролик → local offline decode → конкретные SHA weights → bbox → track events → атомарная запись результата. Измерять RAM, температуру, батарею, скорость, возобновление после kill, полный backup/restore. До этих результатов Android inference `NOT_TESTED`.

## Решение/статусы

- **Реальное техническое решение существует:** собственный bee-only детектор на оригинальных лицензированных кадрах, локально на Android, а затем собственный алгоритм отслеживания/направления. Это проверяемый план, **не действующий продукт** и не утверждение достигнутой точности/бесплатной тренировки.
- **V0 частично изучен, но строгий V0 NOT_PASSED:** отсутствует прямой v6 license snapshot и цепочка конкретных будущих pretrained weights; необходима оригинальная лицензия, SHA и независимые метрики. V1/V2 NOT_PASSED.
- **Не начинать с создания ещё одной серии guard/unit PR:** исходные скрипты скачивания/проверки public originals, инвентаря и треков уже существуют в #283, #287, #290, #300, #348. Использовать их по одному, только после устранения конкретной зависимости.
- **V3–V6 + #442 FROZEN**: никакой auto-delete, `cleanupAuthorized=false`, ни один обычный `recognitionCompleted`-флаг не даёт права удалять оригиналы. Даже при отсутствии настоящих данных пасеки физическое доказательство на телефон ещё не получено.
- **Никаких обязательных платных сервисов/подписок.** Бесплатный доступ к ускорителю обучения не гарантируется; если не доступен, честно отметить `COMPUTE_RESOURCE_BLOCKED`.
