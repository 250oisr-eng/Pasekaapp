# Сквозные invariants безопасности видео (2026-11-20)

Изолированный `tests/video-end-to-end-safety-invariants.test.mjs` проверяет сразу несколько существующих границ на **одном** проверяемом commit: queue completed без реального proof невозможен; старый delete eligibility helper всегда false; model observation draft не говорит `recognitionSucceeded`; staging pipeline не разрешает cleanup; direct delete не открывает IndexedDB; queue не подменяет source Blob/ID/SHA/bytes; тестовые staging-модули не подцеплены к живому index или Service Worker.

Это тестовая сеть регрессий, **не end-to-end аппаратное тестирование**, не настоящая модель и не доказательство полного all-copy cleanup. Успешный тест не подтверждает, что камеры Android не сохранили оригинал в Gallery/MediaStore.

Никакие реальные видео не читаются или изменяются: используются только тестовые объекты и fake-db. Базы, миграции и автоудаление не затронуты. Правило пользователя «после распознавания оригинал удаляется» ещё не реализовано. Перед активацией нужны работающий лицензированный inference, trustworthy recognition ledger, Android provenance/copies, защищённый recovery протокол и тестирование на телефоне.
