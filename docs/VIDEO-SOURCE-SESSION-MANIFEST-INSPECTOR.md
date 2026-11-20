## Усиление: SHA-256 исходной видеозаписи (2026-11-20)

Для любой строки с `split=train|validation|test` теперь обязательно поле `sourceRecordingSha256` — **64 строчных hex-символа** для исходного видео. У `unassigned` оно строго `null`. Это обратимо для staging-манифестов: старые записи без поля остаются допустимыми только как `unassigned` после явного добавления `null`; старые *назначенные* записи без hash теперь fail-closed, намеренно.

Валидатор отклоняет:
- одну `sourceSessionId`, которая указывает на разные `sourceRecordingSha256`;
- один `sourceRecordingSha256` под различными session IDs (даже внутри одного split);
- один и тот же source video hash между разными split, даже если видео переименовали;
- отсутствие/битый hash исходного видео и недопустимое присвоение hash записи `unassigned`.

Пример **исключительно синтетической** записи: `{imageSha256: "aaa…(64)", split:"train", sourceSessionId:"video-01", sourceRecordingSha256:"bbb…(64)", evidence:{uri:"https://example.org/manifest",description:"Asserted source video mapping"}}`.

`declaredRecordingHashes` считает только уникальные **заявленные** записи. Даже одинаковые хеши в двух записях могут быть произвольно подставленными пользователем: инструмент *не читает и не хеширует реальные видеобайты*, не открывает URI, не удостоверяет provenance и не создаёт разрешённый split. Все `Verified/Authorized/Approved` остаются false. Ни пользовательские видео, ни каталог файлов не изменяются.

Дополнительный контекст: работа 2026 года по Apis mellifera у летка описывает 11 независимых семей в исходных тренировочных видеосессиях, 1003 исходных изображений и 22529 bbox (https://pmc.ncbi.nlm.nih.gov/articles/PMC13607679/). Это исследовательский кандидат; статья не доказывает доступность файлов, их лицензию или реальные SHA. Не переносить результаты напрямую на устройство.

# Source-session manifest inspector — staging only

Дата: 2026-11-20. Граница: offline Node.js инструмент проверки **структуры объявленных** сведений; не доверенная верификация происхождения кадров.

## Схема

Входной COCO — результат `convert_bee_voc_unassigned.py` с `info.split="unassigned"`, `info.trainingAuthorized=false`, и `images[].sha256` (SHA-256 реальных локальных bytes). Отдельный *внешний* manifest:

```json
{
  "schemaVersion": 1,
  "records": [
    {
      "imageSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "split": "unassigned",
      "sourceSessionId": null,
      "sourceRecordingSha256": null,
      "evidence": null
    }
  ]
}
```

Если авторитетные метаданные исходных записей получены отдельно, допустима декларация `split: train|validation|test` с `sourceSessionId` и `evidence: {uri:"https://...",description:"..."}`. **Пример выше не является настоящей исходной записью**. Наличие внешней ссылки или корректно заполненного поля не доказывает ни достоверность связи файла с сессией, ни права на его использование.

## Поведение

`inspectSourceManifest(coco,manifest)` из `tools/inspect-source-session-manifest.mjs`:
- требует точного покрытия всех изображений COCO, неизменённых `imageSha256`, неповторяющихся ID и SHA;
- отклоняет неизвестный SHA, неполное покрытие, неопределённую структуру, невалидные split и недоказательные автоматические group IDs;
- не разрешает присвоить одну `sourceSessionId` разным выборкам (утечка одной заявленной видеосессии между train, validation, test);
- для `unassigned` требует `sourceSessionId=null,evidence=null`;
- для назначенной выборки требует syntactically-valid source ID + внешнюю HTTPS ссылку и описание;
- всегда возвращает `sourceIdentityVerified=false`, `independentHoldoutVerified=false`, `licenseVerified=false`, `trainingAuthorized=false`, `modelApproved=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`.

**Нельзя** интерпретировать `structurallyValid=true` как разрешение на обучение, честный независимый holdout, внедрение детектора, активацию счёта пчёл или удаление записей. Заявленный mapping может быть ложным, даже если проверка прошла: внешние URL в этом инструменте **не открываются**. Не реализует CV/YOLOX/ONNX. В runtime, Service Worker, IndexedDB и UI не подключается.

## Поиск первичного источника, сравнение альтернатив

- LILA `Boxes on Bees and Pollen`: 4993 Pascal VOC пар, заявлена CDLA Permissive; карточка не публикует проверяемую image→original-session таблицу. https://lila.science/datasets/boxes-on-bees-and-pollen
- VnBeeTracking: заявлены 5 исходных видео, отдельные `Image_Label` и `GroundTruth`; **academic/non-commercial research only**, поэтому не считать автоматически подходящим для распространяемого приложения. https://sigm-seee.github.io/datasets/VnBeeTracking.html
- BEE24: 36 видео, 446908 MOT аннотаций, публичная карточка и репозиторий; **конкретная лицензия и объём разрешённых действий пока не проверены**, не скачивать/обучать без аудита. https://holmescao.github.io/datasets/BEE24
- PollenDataset: кадры выделены из видео конкретной пасеки, файл License в репозитории, но это *классификация пыльцы на crops*, не GT пересечения летка. https://github.com/piperod/PollenDataset

Вывод: текущий LILA набор — только `unassigned`; альтернативные наборы являются кандидатами для проверки прав и подлинной привязки видео/кадров, **не утверждёнными training data**.

## Проверки

`node --test tests/source-session-manifest.test.mjs` и общий `npm test` в Android GitHub workflow. Regression suite содержит 14 изолированных случаев, включая отрицательные проверки отсутствующего/подменённого SHA, пересечения source sessions, неполноты, фиктивного права на обучение, изоляции от runtime и неизменности флагов доступа.

Нет использования видеозаписей пользователя, сети, секретов, тренировочных весов, платных сервисов, удаления или data migrations.

## Дополнительный аудит условий лицензирования (20.11.2026)

- **BEE24:** официальный сайт набора https://holmescao.github.io/datasets/BEE24 публикует 36 роликов, 446908 annotations, ссылку на скачивание и правила цитирования, но **не содержит явно сформулированной лицензии на сам набор**. Код репозитория TOPICTrack https://github.com/holmescao/TOPICTrack обозначен MIT; лицензия **кода** не должна переноситься на отдельный датасет, предобученные `topictrack_bee.pth.tar` или `bee_AGW.pth`. Любые веса и файлы набора оставлены неавторизованными, хотя опубликованы ссылки для скачивания.
- **VnBeeTracking:** https://sigm-seee.github.io/datasets/VnBeeTracking.html прямо указывает academic research only и non-commercial. Не использовать в распространяемой версии приложения без отдельного разрешения правообладателя. Источник описывает пять исходных видео и разметку с ID, но это не отменяет ограничений использования.
- **LILA:** https://lila.science/datasets/boxes-on-bees-and-pollen публикует CDLA-Permissive на карточке, пример XML/JPEG и ссылку на публичный архив. Доказанного image SHA → видеосессия mapping, необходимого для независимых train/test, всё ещё нет.

Решение: **ни один из трёх кандидатов не проходит одновременно оба gate: подлинное независимое происхождение кадров и подтверждённые права на запланированное использование**. Следующий этап — проверяемое разрешение авторов BEE24, либо получение первичной source-session таблицы для LILA; результат структурного инспектора нельзя считать завершённым аудиторским разрешением.
