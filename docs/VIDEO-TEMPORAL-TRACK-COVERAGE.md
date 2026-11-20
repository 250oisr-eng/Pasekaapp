# Временная полнота трека пчелы (staging-only, 2026-11-20)

Из отдельных JPEG, выбранных на 15, 30 и 45 секунде одноминутного видео, **невозможно доказать**, что объекты на этих кадрах — одна и та же пчела. Поэтому число удачных `bbox` или одно пересечение линии нельзя интерпретировать как проверенный `in/out` поток.

`js/video-temporal-coverage.js` — тестовый gate, не детектор. Получает уже установленные сторонним tracker `trackId` и массив timestamp/center/confidence, а также **обязательную явно заданную политику** `{maxGapSec,minObservations}`. Не устанавливает произвольное значение частоты кадров без измерений. Блокирует мало точек, пропуски больше допустимого интервала, nonmonotonic timestamps, дубли и смену ID, некорректные координаты и confidence.

Даже непрерывная последовательность даёт `stage:'unverified_temporal_coverage'`, `identityVerified:false`, `recognitionSucceeded:false`, `cleanupAuthorized:false`. Проверка последовательности одного заявленного ID не доказывает, что модель не перепутала две пчелы. Для этого нужен независимый benchmark ID switches/identity metrics на real honeybee footage.

Staging module не загружается UI/SW, не считывает оригинал и не влияет на database, backup, cleanup или описание состояния пасеки. Тесты проверяют разреженные кадры, фактическую временную полноту, ID switches, invalid policy, и отсутствие сетевых или storage побочных эффектов.
