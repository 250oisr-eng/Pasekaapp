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
