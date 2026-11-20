# Составная проверка COCO → source-session manifest → реальный SHA видео

Дата: 2026-11-20. Статус: offline staging-only, **не модель и не разрешение на обучение**.

## Что исправлено

До этого этапа `inspectSourceManifest(coco,manifest)` проверял целостность именований и отсутствие пересечения видеосессий между выборками, а `verifyLocalSourceRecordings(manifest,root,files)` — SHA реальных явно предоставленных локальных файлов. Вторую функцию можно было вызвать напрямую с неконсистентным COCO, так что её успешный результат не означал, что вся цепочка выполнена.

Новая `inspectLocalSourceBundle(coco,manifest,sourceRoot,files)` из `tools/inspect-local-source-bundle.mjs` сначала вызывает структурную проверку, затем только при наличии назначенных записей — потоковую физическую SHA-проверку. Если структурный манифест некорректен, локальная файловая система вообще не читается.

## Отказ при сбое

- Нет известной image SHA, отсутствует файл в COCO, недопустимый split, одна source session в разных split, один recording SHA под разными ID/split: **отказ до чтения видеозаписи**.
- Фактический файл отсутствует, изменён, слишком велик, symlink, подмена размера или содержимого: **отказ в локальной проверке**.
- Все изображения `unassigned`: возвращает `status="unassigned_no_recordings"`, `localBytesMatchDeclarations=false`, `checkedRecordings=0`. Для этого состояния даже не нужен доступный каталог видео; оно **не** даёт зелёный результат.
- Структура корректна и байты совпадают: `status="structure_and_local_bytes_match_declarations"`. Это технический итог внутренней проверки **заявлений** и реальных SHA, а не доказательство происхождения кадров из исходного видео.

## Сохраняющиеся запреты

`sourceIdentityVerified=false`, `independentHoldoutVerified=false`, `licenseVerified=false`, `trainingAuthorized=false`, `modelApproved=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false` всегда, независимо от результата.

Не умеет и не должен: открыть Gallery/MediaStore, менять IndexedDB, запускать обучение/сеть, считывать или удалять видео пользователя, подменять независимый аудит source video→image, распознавать пчёл и считать пересечения летка.

## Проверка

`node --test tests/inspect-local-source-bundle.test.mjs` — восемь сценариев на локальных синтетических файлах/искусственных метаданных: успешное совпадение, ошибка image SHA/флага подготовки, подмена реальных байтов, отсутствие файла, повтор видеозаписи между split, чистый unassigned и изоляция от runtime. В общем PR CI дополнительно выполняются все предыдущие регрессии и сборка Android APK на точном HEAD.

Никаких зависимостей от платных средств и никаких пользовательских данных.
