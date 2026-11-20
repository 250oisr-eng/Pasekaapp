# Выбор бесплатного video inference и границы доверия к его результату (2026-11-20)

## Факты текущего приложения
- `cloudflare/worker.js` обслуживает текстовые `question/context/history` и возвращает `answer/provider/model`; не распознаёт кадры и не подписывает результат, привязанный к исходному Blob.
- `js/entrance-frame-preparation.js` — staging-only JPEG-препроцессинг, `js/entrance-analysis.js` содержит метрики для готовых track data. Нет обученной/проверенной bee detection+tracking модели.
- Поэтому успешный HTTP-ответ, текст ИИ, валидный JSON или заполненные пользователем поля `completed` **не доказывают распознавание видео**.

## Исследование доступных вариантов
1. **ONNX Runtime Web** — WebAssembly CPU inference в Chromium/Android и возможная GPU/WebGPU оптимизация на совместимых устройствах; позволяет inference без выгрузки кадров на сервер и работу offline после получения совместимой модели/runtime. Источник: https://onnxruntime.ai/docs/get-started/with-javascript/web.html и https://onnxruntime.ai/docs/tutorials/web/. **Не является готовой моделью bee detection**.
2. **MediaPipe Tasks Vision** — браузерный runtime для vision задач, требует соответствующих весов модели и проверки возможностей конкретной задачи; https://developers.google.com/mediapipe/solutions/vision/object_detector/web_js . Нельзя автоматически предполагать, что модель распознаёт пчёл/ос/пыльцу, направление полёта и треки.
3. **Ultralytics YOLO** — требует отдельной проверки соблюдения лицензии AGPL-3.0 либо коммерческой лицензии, а бесплатные облачные welcome credits не являются постоянным бесплатным эксплуатационным бюджетом. https://www.ultralytics.com/license и https://www.ultralytics.com/pricing . В проект не добавлен.

**Решение этого этапа:** никаких runtime npm зависимостей, remote API calls, uploads, облачного training или лицензированного model weights. Базовый технический кандидат для последующей проверки — ONNX Runtime Web WASM + отдельная лицензированная model с проверенным качеством на видео летка. Совместимость Android и latency не подтверждены; физический benchmark необходим. Это направление, **не утверждённый выбор модели**.

## Новый test-only контракт наблюдений
`js/video-model-evidence.js` принимает только *observational draft* с source+SHA+bytes, model id/version/weightsSha256/execution, 2–4 frame metadata и ограниченными структурированными track observations. Невалидные идентификаторы, timestamps, классификации, duplicate track ID, изображение/base64 payload в frame metadata или неподходящие confidence/direction отклоняются.

Важно: даже идеально оформленный payload возвращает `recognitionSucceeded:false`, `reviewRequired:true`, `cleanupAuthorized:false`, `stage:'untrusted_observation_draft'`. Никакой JSON от неподтверждённого provider не даёт права объявить `completed` или записать как доказанный результат в durable ledger. Достоверность model weights и качество detection являются отдельными задачами. Реальная пользовательская операция на пасеке требует отдельного подтверждения.

`tests/video-model-evidence.test.mjs`: positive shape, negative chat text, missing source/model proof, invalid frame/track evidence, no network/IDB/UI. Модуль не загружается в `index.html` или `sw.js`.

## Требования перед активацией
- Найти легально используемый pretrained/обученный bee detector, подтвердить источник весов, лицензию и SHA.
- Проверить качество на реальных видео летка, откалибровать направления, tracking и неопределённость; не выдавать ложные биологические диагнозы.
- Проверить Android/Chromium WebAssembly memory/latency/offline и приватность; исходное видео не отправлять без отдельного согласия.
- Добавить иной, независимый, ревизионно-защищённый механизм превращения *доказанного* inference в durable ledger с подтверждением результата пользователем. До этого cleanup blocked.
