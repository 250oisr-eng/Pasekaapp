## 2026-11-22 — A09 доказательная матрица Android permissions/network

- [ANDROID-A09-PERMISSION-AND-NETWORK-AUDIT-2026-11-22.md](ANDROID-A09-PERMISSION-AND-NETWORK-AUDIT-2026-11-22.md) — разделяет доказанную CI проверку permissions внутри APK и отсутствующий аудит установленного пакета на устройстве и сетевого трафика; фиксирует обязательный two-button Copy UX и запреты реальных медиа/удаления.

---

## 2026-11-22 — обязательное UX копирования и изолированный A08 process-kill

- [../AGENTS.md](../AGENTS.md) и [ПРАВИЛА-РАЗРАБОТКИ.md](ПРАВИЛА-РАЗРАБОТКИ.md) — общий обязательный стандарт диагностики «Провести тест» → «Копировать результат» для PASS/BLOCKED и большие автономные циклы без ручного выделения JSON.
- [ANDROID-A08-PROCESS-KILL-PREFLIGHT-2026-11-22.md](ANDROID-A08-PROCESS-KILL-PREFLIGHT-2026-11-22.md) — строгие ограничения двухфазного синтетического A08: нативный Process.killProcess только собственного PID, повторное открытие, сверка nonce/PID/IndexedDB SHA, запрет реального restore/cleanup и отличие от Android force-stop.
- [../diagnostics/archive-a08/runner.js](../diagnostics/archive-a08/runner.js) — автономный A08 state machine, [../scripts/install-android-a08-native-plugin.mjs](../scripts/install-android-a08-native-plugin.mjs) — изолированный нативный plugin, [../tests/android-a08-process-kill.test.mjs](../tests/android-a08-process-kill.test.mjs) — регрессионные тесты, [../.github/workflows/android-a08-process-kill-apk.yml](../.github/workflows/android-a08-process-kill-apk.yml) — отдельная сборка APK.

---

## 2026-11-22 — допуск моделей пчёл: проверка лицензий, весов и назначения

- [VIDEO-BEE-DETECTOR-CANDIDATE-REVIEW-2026-11-22.md](VIDEO-BEE-DETECTOR-CANDIDATE-REVIEW-2026-11-22.md) — сравнительный аудит кандидатов Matt Nudi, Apiarist, Honey-Bee-Society и Gratheon, доказательная цепочка до Android offline inference, отсутствие разрешения на распознавание и удаление видео.
- [../js/video-detector-candidate-gate.js](../js/video-detector-candidate-gate.js) — изолированный fail-closed gate, не подключённый к UI; даже полный заявленный manifest не разрешает скачивание/запуск весов или очистку.

---

## 2026-11-22 — Restore335: пустой private files/ после dd; запрет на повторную запись

- [../PROJECT_STATUS.md](../PROJECT_STATUS.md) — физический v2 OnePlus подтвердил private `files/` с нулём записей, но `stat` возвращает 67 stdout байт при exit=0 и файл пока без SHA; исходный PASEKA01 сохранён.
- [ПЛАН-РАЗРАБОТКИ.md](ПЛАН-РАЗРАБОТКИ.md) — следующий не пишущий gate `tools/android-restore335-dd-zero-count-parser-readonly.ps1` (Toybox `if=/dev/null count=0`, без `of=`): проверить CI на exact SHA перед физической командой. Запрет на прежний one-shot `dd`, очистку и restore.

---

## RESTORE335 — 2026-11-21: следующий read-only gate private metadata v2

- [../PROJECT_STATUS.md](../PROJECT_STATUS.md) — физически `files/` подтверждён, `fileproof335-input.paseka` статус `UNKNOWN_OR_ABSENT`; исходный PASEKA01 SHA подтверждён, Toybox dd help флаги есть, запись повторять нельзя.
- [ПЛАН-РАЗРАБОТКИ.md](ПЛАН-РАЗРАБОТКИ.md) — только `tools/android-restore335-post-dd-failure-readonly-v2.ps1` и регрессионный CI на exact SHA перед физическим чтением; никакого restart/restore/cleanup и удаления видео.

---

## 2026-11-21 — RESTORE335 physical dd failure: только read-only состояние приватного тестового файла

- Последняя достоверная контрольная точка и следующий gate — [../PROJECT_STATUS.md](../PROJECT_STATUS.md): pinned ADB 1.0.41/stdin SHA PASS, затем one-shot `EXCLUSIVE_TEST_PRIVATE_INPUT_STAGE_FAILED` после mkdir. Нельзя повторять запись/удалять файлы.
- [ПЛАН-РАЗРАБОТКИ.md](ПЛАН-РАЗРАБОТКИ.md) — порядок восстановления после отказа: только скрипт `tools/android-restore335-post-dd-failure-readonly.ps1` с реальным CI/физическим отчётом, затем отдельный gate пустой IndexedDB. `2 MP4 restore/decoder/recognition/cleanup` ещё не подтверждены.

---

## 2026-11-21 — два синтетических видео-подобных блока: изолированный физический stop/relaunch

- [ANDROID-PASEKA02-PHYSICAL-TEST-PROTOCOL.md](ANDROID-PASEKA02-PHYSICAL-TEST-PROTOCOL.md) — обновлённый безопасный **PASEKA01** сценарий `tools/android_synthetic_two_video_stop.ps1`, автоматически создающий отдельный контейнер с двумя *не воспроизводимыми* синтетическими blob и проверяющий внешнюю SHA-неизменность до/после остановки только тестового Android-пакета. Это не проверка app-export, IndexedDB или Camera/MediaStore.
- В `../PROJECT_STATUS.md` записан фактический PASS предыдущего физического пустого архива и состояние нового теста (на телефоне пока NOT TESTED). Научно-технологические запреты и безопасное хранение оригиналов продолжают действовать.

## 2026-11-21 — обязательная автономность физической проверки и подтверждённый экспорт Android

- Постоянное правило для **всех** испытаний на телефоне и ПК записано в `../AGENTS.md` и `ПРАВИЛА-РАЗРАБОТКИ.md`: один безопасный заранее проверенный сценарий, минимум действий пользователя, отдельное подтверждение рискованных операций, один итоговый отчёт `PASS/FAIL/BLOCKED/NOT TESTED`.
- Пользователь сообщил об успешном экспорте архива в тестовой APK Android 16; действительный формат сборки `PASEKA01`, целостность файла, его SHA и IndexedDB пока не проверены. Контрольная точка — `../PROJECT_STATUS.md`; методика — `ANDROID-PASEKA02-PHYSICAL-TEST-PROTOCOL.md` с обязательной поправкой о PASEKA01.

## 2026-11-21 — контроль ответа авторов и безопасность временного видео

- [VIDEO-RETENTION-ARCHIVE-INTEGRATION-AUDIT-2026-11-21.md](VIDEO-RETENTION-ARCHIVE-INTEGRATION-AUDIT-2026-11-21.md) — совместимость распознавания, временных оригиналов, архива, восстановления и Android внешних копий; следующий независимый интеграционный тест.
- В `AGENTS.md` закреплён ежедневный условный контроль ответа авторов по 1194 событиям. Отсутствие ответа не блокирует независимую работу и не даёт разрешений на использование данных.

## 2026-11-21 — внешний исходный набор ручных пчелиных событий: license/revision gate

- [VIDEO-EXTERNAL-MANUAL-BEE-EVENT-LABELS-RESEARCH.md](VIDEO-EXTERNAL-MANUAL-BEE-EVENT-LABELS-RESEARCH.md) — источник Nieves-Rivera et al. (2026), два реальных CSV по 1422 ручных событий, 177 различий классификации, отсутствующий LICENSE и непроверенное выделение 1194 эталонных событий. Не тренировать и не использовать для in/out без доказательств.

---

## 2026-11-21 — реальные переходы относительно авторского polygon ≠ вход/выход пчелы

- [VIDEO-PUBLIC-FAN-POLYGON-BOUNDARY-DIAGNOSTIC.md](VIDEO-PUBLIC-FAN-POLYGON-BOUNDARY-DIAGNOSTIC.md) — 6000 tracking кадров, 237 GT polygon transitions, 43 быстрых возврата, 833 разрыва; отсутствие независимых in/out меток, полный запрет продвижения в приложенческий счётчик и cleanup.

---

## 2026-11-21 — проверка source-frame overlap для честного обучающего split

- [VIDEO-MENDELEY-V6-CROSS-ANNOTATION-ALIGNMENT.md](VIDEO-MENDELEY-V6-CROSS-ANNOTATION-ALIGNMENT.md) — 12 оригинальных JPEG/YOLO против 6000 исходных fan MP4 кадров; выбор кандидата по пикселям, затем независимое сравнение bbox, out-of-frame исходной разметки, консервативный запрет train/test leakage.

---

## 2026-11-21 — реальный MP4, классический motion-only контроль

- [VIDEO-PUBLIC-FAN-REAL-MOTION-BASELINE.md](VIDEO-PUBLIC-FAN-REAL-MOTION-BASELINE.md) — SHA-проверка двух оригинальных файлов Mendeley v6, 6000 декодированных кадров, реально измеренная недопустимая точность простой детекции движения; нейросеть/очистка видео не разрешены.

---

## 2026-11-21 — оценка доступных весов детектора

- [VIDEO-DETECTOR-WEIGHTS-CANDIDATE-REVIEW.md](VIDEO-DETECTOR-WEIGHTS-CANDIDATE-REVIEW.md) — два текущих публичных кандидата, пробелы прав на веса/зависимости, риски переноса «соторамка → леток» и границы безопасного следующего исследования.

---

## 2026-11-21 — интерфейс независимой проверки реального детектора

- [VIDEO-EXTERNAL-DETECTOR-EVIDENCE-GATE.md](VIDEO-EXTERNAL-DETECTOR-EVIDENCE-GATE.md) — fail-closed вход реальных покадровых bbox (6000 кадров), локальная сверка MP4/TXT/model SHA, ограниченная офлайн-оценка и запрет ложного признания модели готовой.

---

## 2026-11-21 — эталонные контрольные суммы издателя

[Подробная сверка и воспроизведение](VIDEO-MENDELEY-V6-PUBLISHER-CHECKSUMS.md) — издательские SHA, результаты повторных чтений и границы проверки происхождения кадров.

---

## 2026-11-20 — три связанные меры против ложного train/test и подмены source v6

- `VIDEO-MENDELEY-V6-SCENE-SIMILARITY-AND-SPLIT-GATE.md` — фактические SHA+64-bit dHash по 16 original JPEG (8 within/112 across, dHash threshold **не** proof), offline metadata-only merge до 7200 исходных JPEG/TXT из проверенных CSV, fail-closed structural group split без доказанной video/session independence, 38 tests и CI; требования landing board ROI/tracks/line crossing.

## 2026-11-20 — реальные размеры YOLO пчёл перед выбором детектора

- `VIDEO-MENDELEY-V6-REAL-BOX-GEOMETRY.md` — измеренная геометрия 113 original bee bbox из 16 SHA-pinned v6 TXT, табличные данные letterbox 640/960/1280, маленькие объекты, источник 50 fps video frames, различение геометрии и несуществующих model metrics, план независимого benchmark.

## 2026-11-20 — 16 исходных кадров Mendeley v6 с реальными SHA

- `VIDEO-MENDELEY-V6-16-REAL-PAIR-AUDIT.md` — исходный CSV пользователя SHA, восемь оригинальных групп x две JPG/YOLO пары, live CI 16 JPEG full decode/113 bee bbox, самостоятельные SHA pins всех 32 файлов, пробел source-video independence и следующий законный реальный training stage.

## 2026-11-20 — CSV-пакет оригинальных ссылок Mendeley v6

- `VIDEO-MENDELEY-V6-BOUNDED-CSV-STAGING.md` — безопасный до 16 paired JPG+YOLO public-files CSV stage, 13 synthetic regressions и реальный CI одной пары, ограничения storage/URL/SHA/full decode, статус независимости ulейных записей и дальнейший реальный training data step.

## 2026-11-20 — первая реальная Mendeley v6 пара для будущего обучения

- `VIDEO-MENDELEY-V6-REAL-PAIR-VERIFICATION.md` — подлинные публичные URL JPEG/TXT, measured actual SHA+sizes, 1920×1080, 7 YOLO bee boxes, успешный COCO unassigned importer, SHA-pinned live GitHub CI и следующий grouped independent dataset step.

## 2026-11-20 — доступ к исходному Mendeley v6 набору

- `VIDEO-MENDELEY-V6-ACCESS-AUDIT.md` — шесть HTTP 401 официального API, ограниченная сетевая диагностика без скачивания данных, отличие оригинала v6 от Roboflow v5 и один конкретный шаг получения минимального оригинального образца.

## 2026-11-20 — главный исследовательский источник для видео летка

- `VIDEO-MENDELEY-V6-DETECTION-TRAINING-PATH.md` — первичный Mendeley v6 dataset (CC BY 4.0, восемь улейных коллекций), offline YOLO-to-unassigned COCO, недоказанные source video/session IDs, план честного детектора/трекинга и Android inference.

# Управление проектом «Пасека»

Этот файл — входная точка для продолжения разработки.

| Документ | Назначение |
|---|---|
| ../PROJECT_STATUS.md | Главный оперативный журнал: текущее состояние, последний завершённый этап, проверенные SHA/CI, блокеры и следующий шаг |
| ../AGENTS.md | Правила для разработчика и AI-агента при работе с репозиторием |
| ПАСПОРТ-ПРОЕКТА.md | Цель, границы и иерархия источников |
| ПРАВИЛА-РАЗРАБОТКИ.md | Контроль изменений, PR, тесты и защита функций |
| ПОЛИТИКА-БЕСПЛАТНЫХ-СРЕДСТВ.md | Запрет платных опций, условия бесплатных лимитов и работа с Qwen/DeepSeek |
| ТЗ-ТЕХПРОЦЕССА.md | Проверяемые требования к технологическому модулю |
| АРХИТЕКТУРА-ПРИЛОЖЕНИЯ.md | Текущая архитектура и целевые границы технологического модуля |
| ПЛАН-РАЗРАБОТКИ.md | Этапы, статусы и контрольные точки |
| PASEKA-ARCHIVE-FORMAT-v1.md | Спецификация переносимого .paseka: структура, лимиты, контрольные суммы, staging и rollback |
| КАРТА-ОТКРЫТЫХ-PR-2026-11-17.md | Снимок открытых PR, base/head SHA, зависимости, конфликты и CI |
| СВЕРКА-ТЕХПРОЦЕССА-С-ИСТОЧНИКОМ.md | Сопоставление исходного DOCX, OP-01…OP-14 и текущей реализации |
| АУДИТ-PR-54-58-2026-11-16.md | Подтверждённые дефекты, воспроизведение, риски и план исправлений PR #54–58 |
| СОСТОЯНИЕ-ПРОЕКТА.md | Актуальное состояние, SHA, PR, ограничения и следующий шаг |
| ЖУРНАЛ-ИЗМЕНЕНИЙ.md | История решений и изменений |
| VIDEO-PRIVATE-CAMERA-LIFECYCLE.md | Fail-closed stop/error/timeout cleanup приватной записи камеры, test-only Android lifecycle |
| VIDEO-PRIVATE-CAMERA-STAGING.md | Неактивный MediaRecorder in-app capture, отсутствие внешней Gallery по интерфейсу, требуются Android physical tests |
| VIDEO-TEMPORAL-TRACK-COVERAGE.md | Недостаточность sparse video frames для подтверждения tracking ID; явная политика временной полноты |
| VIDEO-ENTRANCE-CROSSING-EVIDENCE.md | Калиброванная линия летка; test-only direction estimates с fail-closed ambiguous cases |
| VIDEO-DETECTOR-BENCHMARK.md | Staging-only IoU/precision/recall тест, не подтверждение реальной модели или качества треков |
| VIDEO-MODEL-ARTIFACT-INTEGRITY.md | Локальный SHA preflight весов модели, запрет считать хэш доказательством лицензии или готового inference |
| VIDEO-BEE-MODEL-CANDIDATE-AUDIT.md | Сравнение bee detection/tracking моделей и датасетов, лицензий и readiness gate без загрузки весов |
| VIDEO-ANDROID-EXTERNAL-COPY-PROVENANCE.md | File input Android Camera/Gallery provenance unknown, нет права внешнего удаления |
| VIDEO-END-TO-END-SAFETY-INVARIANTS.md | Сквозные no-delete/no-completion регрессионные тесты, не аппаратный end-to-end |
| VIDEO-OBSERVATION-PIPELINE-STAGING.md | Неактивный local-only pipeline с source identity/hash повторной проверкой после асинхронного model draft |
| VIDEO-INFERENCE-PROVIDER-EVALUATION.md | Варианты бесплатного offline runtime, ограничения лицензии и staging-only observation draft |
| VIDEO-ARCHIVE-V2-CONTRACT.md | Проект (не реализация) формата полного архива с ledger/tombstones и fail-closed восстановлением |
| VIDEO-ARCHIVE-V2-RESTORE-READINESS.md | Карта защищённых IndexedDB stores, результаты сквозного v2 dry-run и блокеры будущего stage/commit/rollback |
| ENTRANCE-VIDEO-DELETE-GUARD.md | Безусловный запрет ручного удаления леткового оригинала до проверенного распознавания и all-copy cleanup |
| JOURNAL-VIDEO-SOURCE-EVIDENCE.md | Стабильные ID, SHA и размер новых журналовых видео без миграции старых записей; PWA offline и тесты |
| VIDEO-ARCHIVE-V2-COPY-INVENTORY.md | Readonly инвентаризация копий видео в protected stores; cleanup всегда запрещён |
| VIDEO-ARCHIVE-V2-QUARANTINE-ROLLBACK.md | Изолированный атомарный откат entrance-only с перемещением Blob в protected quarantine и запретом cleanup |
| VIDEO-ARCHIVE-V2-ENTRANCE-ATOMIC.md | Тестовый атомарный входной PASEKA02 entrance-only commit с protected rollback snapshot, но без права на rollback/cleanup |
| VIDEO-ARCHIVE-V2-ABORTED-ADD.md | Реальные тестовые IDB add-запросы с проверенными archive Blob под обязательным abort; нет durable записи |
| VIDEO-ARCHIVE-V2-PINNED-SOURCE.md | Изолированная репетиция работы с неизменяемыми SHA-проверенными архивными Blob-срезами без права на commit/delete |
| VIDEO-ARCHIVE-V2-STAGING-VERIFY.md | Повторная SHA-проверка staged оригиналов с отменяемой write-lock; не является разрешением на restore/delete |
| VIDEO-ARCHIVE-V2-PENDING-STAGING.md | Изолированный атомарный staging проверенных pending originals без права на restore, rollback или cleanup |
| VIDEO-ARCHIVE-V2-PENDING-IDENTITY.md | Отдельный fail-closed gate против коллизий новых pending originals с локальными видео до и под aborted write-lock |
| VIDEO-ARCHIVE-V2-METADATA-ATOMIC.md | Изолированный строгий атомарный импорт/откат PASEKA02 без видео и без имеющихся protected backups, ручная диагностика recovery |
| ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md | Протокол восстановления контекста в новом чате |

- `VIDEO-RECOGNITION-CLEANUP-STATE-CONTRACT.md` — проект fail-closed состояний распознавания, сохранения результата и последующего удаления оригинала; не реализация и не разрешение удаления.

- `VIDEO-RECOGNITION-DURABLE-LEDGER.md` — изолированный test-only SHA-verified ledger результатов; не подключает AI, UI или удаление видео.


- `VIDEO-FRAME-PREPARATION-STAGING.md` — неактивная локальная подготовка JPEG кадров с проверкой SHA, освобождением URL и строгим отказом от AI/удаления.


- `VIDEO-QUEUE-SOURCE-INTEGRITY.md` — строгие переходы очереди; запрет подмены оригинала через details и запрет fake completed.

## Главный журнал состояния — PROJECT_STATUS.md

Корневой `PROJECT_STATUS.md` — первая точка восстановления проекта после обрыва или перехода в новый чат. В начале работы прочитать его, затем обязательно сверить указанные SHA, PR, CI и состояние Lovable с реальными сервисами. После каждого логически завершённого этапа обновлять файл в том же PR, что и соответствующие изменения. Сохранять историю важных контрольных точек; не записывать неподтверждённые предположения как факты. При расхождении приоритет у фактического состояния GitHub/Lovable, после чего журнал корректируется.

`docs/СОСТОЯНИЕ-ПРОЕКТА.md`, `docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md` и `docs/ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md` сохраняются как подробные проектные документы и история. Они дополняют, но не заменяют корневой `PROJECT_STATUS.md`.

## Обязательное правило

Политика бесплатных средств обязательна для всех технических и продуктовых решений. До выбора сервиса сверяться с docs/ПОЛИТИКА-БЕСПЛАТНЫХ-СРЕДСТВ.md; платные опции и автоматические списания запрещены.


Ни один рабочий сеанс не считается завершённым, пока не обновлено состояние проекта и журнал изменений. В новом чате работа начинается с чтения документов, а не с предположений из истории переписки.

Документы управления не заменяют исходный DOCX. Если требуется заново проверить точную формулировку или смысл, открыть оригинальный источник.

## Единый порядок разработки

Обязательные правила приоритизации, инвентаризации PR, последовательной интеграции, критериев готовности и жизненного цикла задачи закреплены в `AGENTS.md` и разделе 11 `docs/ПРАВИЛА-РАЗРАБОТКИ.md`. При открытии нового чата сначала восстановить актуальное состояние из репозитория и GitHub, затем продолжать один главный приоритет; переписка не заменяет эти документы.

## Полномочия на слияние и публикацию

Агент самостоятельно изменяет код, тесты и документацию, создаёт рабочие ветки и Draft PR. Это разрешение не включает слияние PR, публикацию приложения/PWA или production deployment. Для каждого такого действия требуется отдельное явное подтверждение пользователя, даже если CI и остальные проверки успешны. Изменения production-базы и схемы также требуют отдельного подтверждения, проверенной резервной копии и плана восстановления. Необратимые операции с пользовательскими данными запрещены. Эти ограничения имеют приоритет над более ранними историческими записями о полномочиях.
