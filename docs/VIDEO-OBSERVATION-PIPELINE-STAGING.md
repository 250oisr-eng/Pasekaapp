# Пробный путь локального анализа — только untrusted observations

Статус: staging-only, не подключён к UI/PWA Service Worker; настоящая модель распознавания отсутствует.

`js/video-observation-pipeline.js` связывает два изолированных модуля: локальное получение JPEG-кадров из проверенного Blob (`PasekaEntranceFramePreparation`) и валидацию структуры модельных наблюдений (`PasekaVideoModelEvidence`). Внутри API предусмотрен **только передаваемый извне** on-device `adapter.infer`; в живом приложении он нигде не создаётся и не вызывается.

Перед inference проверяются source ID, SHA-256 и bytes. После асинхронного `infer` повторно проверяются хэш текущего Blob, идентификатор, размер и сохранённый SHA. Любой abort, сбой декодера/модели, несовпадение source evidence либо структура model без weights SHA приводит к явному отрицательному результату, без сохранения.

Даже успешная ветка возвращает только `stage:'untrusted_observation_draft'`, `recognitionSucceeded:false`, `cleanupAuthorized:false`, `reviewRequired:true`. В возвращаемых observations кадры представлены метаданными (время/размер/MIME) **без data URL**. Внутренние ссылки на кадры освобождаются; это не может заставить внешний adapter удалить свои копии, поэтому сторонний adapter запрещено активировать до отдельного privacy review.

**Границы:** никакой IndexedDB write transaction, никакого `recordRecognitionResult`, никаких изменений пасеки, автоматического распознавания, отправки video/frame данных по сети, поставки pretrained model или удаления. Для будущей реальной обработки потребуется отдельная проверенная модель, лицензия/веса, качество треков на съёмках летка, офлайн benchmark Android и независимый durable recognition commit.

`tests/video-observation-pipeline.test.mjs` проверяет позитивный staging-only mock, подмену source после async, cloud-adapter отказ, fake text response, abort, throw и отсутствие network/storage/UI.
