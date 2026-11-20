# Offline Android bee inference — evidence gates (2026-11-20)

## Проверенные источники и область применимости

- ONNX Runtime Web: https://onnxruntime.ai/docs/get-started/with-javascript/web.html — таблица совместимости подтверждает браузерный CPU/WASM backend для Chrome/Edge Android. Не доказывает пригодность конкретной сети, памяти устройства или офлайн-кеша.
- https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html — многопоточный WASM требует поддержки браузера и crossOriginIsolated; для первичного Android испытания безопаснее однопоточный WASM CPU без предположений о COOP/COEP.
- Honey Bee Society https://huggingface.co/Honey-Bee-Society/honeybee_ml_v1 — карточка указывает Apache-2.0 и **image-level classification** honeybee/bumblebee/vespidae. Это исследовательский кандидат для классификации, **не детектор координат и не трекер пересечений**. Нельзя считать 97.5% заявленной image classification accuracy доказательством precision/recall входа-выхода на летке; происхождение/условия конкретных весов и Android-экспорт отдельно проверить.
- Предыдущий сравнительный аудит: `docs/VIDEO-BEE-MODEL-CANDIDATE-AUDIT.md`. Ни один из перечисленных источников не утверждён как полноценный разрешённый bee object detector с проверенной точностью Android.

## Критерии допуска конкретного model artifact

1. Явная лицензия **конкретных весов**, исходник и версия, условия redistribution и коммерческого/не-коммерческого использования; отдельно код и training data. Не выводить право на веса из лицензии runtime или репозитория.
2. File SHA-256 + размер + стабильный идентификатор версии/архитектуры. Текущий `PasekaVideoModelArtifact.verifyModelArtifact()` доказывает только совпадение бинарника и заявленного SHA, **не** юридическую допустимость.
3. Подходящий output: bounding boxes на Apis mellifera в кадрах летка, confidence + отсутствие detection ≠ успешное распознавание; tracking continuity и измерение in/out — отдельные независимые компоненты.
4. CPU/WASM Android физический тест при offline reload на исходном устройстве. Замер cold start, memory pressure/crash, времени inference для кадров требуемого размера с известной конфигурацией устройства, версий Android/System WebView и SHA модели.
5. Отдельная оценка размеченных роликов при разных условиях освещения, перекрытиях и плотности пчёл (precision/recall, track ID switches, uncertainty/unknown). Численные пороги нужно установить по измерениям, а не выдумывать.
6. Source-bound durable ledger только после реального validated recognition и явных product acceptance gates. Защита all-copy Android/MediaStore/backup и безопасный cleanup — **другая операция**.

## Что уже можно измерить без модели

- `js/android-wasm-capability-probe.js`: доступность WebAssembly, не Android model readiness.
- `js/offline-inference-benchmark.js`: deterministic timing **внедрённого** локального synthetic adapter, не бенчмарк реального детектора. Результат `synthetic_timing_only` никогда не разрешает recognition/cleanup.
- Подставной adapter может исказить любые цифры. Ни одна синтетическая величина не переносится на реальный Android без действительного model session и физической проверки.

## Запреты

Нет загрузки внешней модели, запросов к серверу, использования платных инструментов, записи изображений, подключения в UI или SW, изменения IndexedDB и удаления оригиналов. Не интегрировать модель с недоказанной лицензией, не преобразовывать пустой результат в «completed».
