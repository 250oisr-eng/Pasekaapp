# B03 — изолированная интеграция P0-архива на актуальном main

Дата: 2026-11-24. Исходный `main`: `d179da9a2d93ae193adaaaed7e4435ca42dc2cc5`. Источники: Draft [#452](https://github.com/250oisr-eng/Pasekaapp/pull/452) (движок архива и B01/B02), [#469](https://github.com/250oisr-eng/Pasekaapp/pull/469) (независимый Android signing/first-use), текущий main с G0-инвентаризацией. **Только отдельный Draft PR, без merge/release.**

## Почему старый PR целиком нельзя переносить

- #452 на момент сверки 141 ahead / 22 behind; #469 115 ahead / 1 behind от main. Оба меняют `index.html`, `tests/regression.test.mjs`, проектные документы. Наличие пересечения ещё не доказывает текстовый конфликт, но исключает безопасный безаудитный merge.
- Исторические CI старой ветки доказывают лишь соответствующие SHA; новые B01/B02 проверки после исправлений не имели подтверждённых результатов CI.
- #469 содержит отдельные first-launch и APK signing изменения, которые не должны попадать в этот P0 архивный перенос.
- В main уже есть read-only `G0` и `js/p0-source-inventory.js`; удалять его ради старого `index.html` недопустимо.

## Минимальная совместимая поставка

1. Скопирован проверяемый код `js/disaster-archive.js` из актуального #452, включая fail-closed для live бинарных оригиналов B02 и read-only `verifyRestoredArchive` B01. Не меняются база/схема/операции/видео.
2. `index.html` изменяется **точечно от live main**: добавить JS, только кнопки скачивания полного архива и **чтения скачанного файла**. Текущее G0 и старые JSON действия остаются. Полное destructive restore в UI **не включено**, так как B01 физически не доказан.
3. `sw.js`: обновлён только `paseka-shell-v315` → v316 и добавлен ровно один `./js/disaster-archive.js` в shell whitelist, сохраняя изоляцию origin и no-store защиту.
4. `tests/disaster-archive.test.mjs` адаптированы под main-based UI: атомарный restore проверяется **только на изолированных synthetic DB**, а интерфейс явно не разрешает destructive восстановление; тесты Blob same-size/mime, история, rollback, independent file and reread сохраняются.
5. `tests/regression.test.mjs`: только ожидания v316; остальные регрессии неизменны.

## Границы доказательства и блокеры

- **B03:** семантическое согласование P0 с main выполнено в отдельном Draft; exact-SHA CI, полный diff/регрессии и отдельное разрешение на merge обязательны. После проверок можно обозначить `READY_FOR_MERGE_REVIEW`, но не `IN_MAIN`.
- **B01:** внешний независимый носитель, все Android OS media, реальное физическое восстановление `NOT_VERIFIED`; UI restore заблокирован. Read-only экспорт не доказывает фактическое сохранение файла на носитель.
- **B02:** в коде защита fail-closed запрещает перезапись существующих Blob/File внутри финальной readwrite транзакции; аварийная физическая проверка `NOT_VERIFIED`.
- **B04/B05:** обновление OnePlus и стабильный signing key не затрагиваются.
- **B06 #442:** видео auto-delete и реальная детекция `FROZEN`; отсутствуют новые права удаления.
- Потребление памяти `getAll()` и base64 крупных видео ещё не проверено на физическом устройстве; риск OOM/quota сохраняется.

## Следующий gate

Проверить `npm test`, Android build и SW boundary на **новом SHA** через CI. При провале исправить только текущий PR; при невозможности запуска CI — пометить `NOT_VERIFIED` и не объявлять готовым к интеграции. Следующая независимая задача после этих ворот — B04/B05 signing, не возвращаться к синтетическому PASEKA02.

## Результат последней точной проверки (кодовый SHA)

`f2bf7842ad38dd2220b55d1e16a77fdf862e4596`:
- [Android #45462990179](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45462990179): `completed/success`, **693/693 tests PASS**, `BUILD SUCCESSFUL`, upload debug APK PASS.
- [Governance #45462990244](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45462990244): `completed/success`.
- Реально прошедшие неуспешные стадии до исправления: отменённый Android #45462545345; failure Android #45462624604 (invalid regex) и #45462833880 (три non-binary fixture). Каждая причина исправлена; code/test проверен заново на SHA выше.
- Stage `READY_FOR_MERGE_REVIEW / NOT_IN_MAIN`; после изменения только документации HEAD может отличаться, сравнивать `compare` на изменения кода. Ни merge, ни release, ни физический B01 не разрешены.
