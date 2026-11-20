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
