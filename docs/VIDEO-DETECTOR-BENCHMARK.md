# Тестовый измеритель качества обнаружения пчёл (2026-11-20)

Статус: неактивный инструмент для будущей оценки моделей. Никакая модель пока не загружается, обучается, оценивается на реальных видео или автоматически выбирается.

## Алгоритм
`js/video-detector-benchmark.js` принимает разметку `groundTruth` и `predicted` по кадрам, с классами `bee/drone/wasp/hornet/dead_bee/unknown` и нормированными прямоугольниками [x,y,w,h]. Применяет фильтр confidence и жадное one-to-one сопоставление по IoU **только в пределах одного класса и кадра**, считает TP/FP/FN, precision и recall в целом и по классам. При отсутствии обнаружений denominator не подменяется нулём: precision/recall могут быть `null`.

Отдельные изображения сами по себе не измеряют direction `in/out`, качество связывания треков, пыльцу, поведение пчёл или состояние матки. Оценка на тестовой фикстуре **не означает** качество модели на съёмках летка. Значения threshold 0.5 по умолчанию — техническая настройка подсчёта, не утверждённый порог достаточной точности. Этот модуль **не рассчитывает mAP** и не должен так называться.

Все payload bounded: максимум 100 кадров и 500 объектов в каждом списке на кадр, strict bbox/confidence/class, уникальный frame ID. Без inference, доступа к данным ульев, веба, IndexedDB, удаления и записи оригиналов. При invalid input — `modelValidated:false`. Даже при идеальной оценке возвращает `modelValidated:false`, `trackingValidated:false`, `pollenValidated:false`, `cleanupAuthorized:false`. Отдельной доверенной проверки benchmark dataset и model weights пока нет.

## Проверка и следующий этап

`tests/video-detector-benchmark.test.mjs`: правильный perfect match, double detection, class mismatch, FN/FP, пустой denominator, reject bad bbox/confidence/duplicate frames и отсутствие подключения к UI. Следующая задача: получить настоящий размеченный independent holdout dataset с понятной лицензией, подтвердить hashes весов, проверить реальные accuracy, tracking temporal coverage и Android performance. До этого не объявлять модель валидированной и не запускать удаление видео.
