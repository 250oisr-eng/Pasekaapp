## CI Draft #248 — точный проверенный SHA (2026-11-20)

- Code/test/docs SHA `1c00bd864dd4c474970af5b3b7c176e22e8e74de`: [Android #44710169905](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44710169905) **completed/success** (регрессионные тесты, Debug APK build, Upload APK); [isolated #44710169955](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44710169955) **skipped**. Android physical test не проводился.
- Блок не активирует реальное AI распознавание, не завершает видеозаписи, не удаляет исходники. Поздние docs-only commits после проверенного SHA не считать автоматически проверенными.

---
## CI #248 — исправлен ложный запрет in-memory Set.add (2026-11-20)

- Первый HEAD `0803b91559fa36484c8e4563d7b582c3e60a0ee4`: Android #44709983851 **failure**, 1004/1005 regression tests passed, APK skipped. Тест ограничения сетевых/DB операций ошибочно счёл `Set.add()` вызовом IndexedDB `.add`.
- Исправлен только тест `tests/video-model-evidence.test.mjs`, SHA `cbb096c1b51b2b6068922b885791c6f3df3dec60`: он теперь явно ищет fetch/XMLHttpRequest/indexedDB/transaction/objectStore/localStorage/sendBeacon. Код модуля не менялся. CI нового SHA требуется отдельно.

---
## Этап — валидация недоверенного результата модели видео (2026-11-20)

- После проверенного Draft #247 открывается ветка `feat/video-model-evidence-contract-2026-11-20`: test-only `js/video-model-evidence.js`, `tests/video-model-evidence.test.mjs`, `docs/VIDEO-INFERENCE-PROVIDER-EVALUATION.md`.
- Не доверять текстовому Worker, JSON без source SHA, дублированным трекам, неподтверждённой модели. Контракт выдаёт только `untrusted_observation_draft`, `reviewRequired:true`, `recognitionSucceeded:false`, `cleanupAuthorized:false` даже при формально валидном payload. Нет реального detection, AI подключения, сети, изменения базы/видео.
- По актуальным официальным документациям технический кандидат — ONNX Runtime Web WASM, но без весов, проверки модели, лицензии и Android benchmark выбор не активирован. MediaPipe возможно, Ultralytics AGPL требует соблюдения условий; бесплатные introductory credits не подходят.
- Следующий шаг — Draft PR и CI точного HEAD; затем отдельная валидация model readiness/параметров provider, без превращения draft в распознанный результат.

---
## Проверенный CI — защита переходов очереди видео (2026-11-20)

- Draft #247: исправленный code/test SHA `95c9eb7e313f0377b016984e793f07083c6d01be`, документальный PR HEAD после фиксации первого CI `811a20fcd61bd6ae20f594fe5ca0c071f8392351`. На HEAD [Android #44709298158](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44709298158) **completed/success**: Run regression tests, Build debug APK, Upload APK successful. [Isolated APK #44709298159](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44709298159) **completed/skipped**.
- Первый GitHub #44709135245 **failure**, 999/1000 тестов: stale assertion ожидал `transition_not_allowed` вместо `recognition_evidence_required`; исправлен исключительно test-only SHA `95c9eb7e...`.
- Source identity/Blob/SHA cannot mutate via queue `details`, completed remains blocked. No recognized result, no AI endpoint integration, no video deletion, no live data/migration, no merge/production. Последующие docs-only commits не считать тестированными на новом SHA автоматически.
- Следующий блок: оценка реального бесплатного video recognizer (возможность браузерной/Android offline inference или строго опционального бесплатного сервиса), его документированная способность распознавать bees/directions/tracks, источник подписи результата, интеграция с durable ledger, all-copy Android cleanup только после независимой верификации.

---
## CI PR #247 — устранена устаревшая проверка ошибки перехода (2026-11-20)

- Первый SHA `f810590d40fbe516e53e691952a6a55727d1a889`, GitHub Android workflow #44709135245 **failure**: 999/1000 тестов passed; единственный старый тест ждал `transition_not_allowed` для `uploading→completed`, новый fail-closed код правильно возвращает `recognition_evidence_required`. Debug APK и upload были skipped.
- Исправлен только test expectation в `tests/entrance-analysis.test.mjs`, SHA `95c9eb7e313f0377b016984e793f07083c6d01be`. Рабочий код source-integrity guard не менялся. Повторить regression и Android Build/Upload на новом точном SHA; до этого не заявлять success.

---
## Этап — сохранность ID/Blob при переходах очереди видео (2026-11-20)

- На основе Draft #246 создана ветка `fix/video-queue-source-integrity-2026-11-20`. В `js/entrance-analysis.js` защищён `transitionVideoQueue`: из `details` больше нельзя подменить `id`, `hiveId`, `bytes`, `blob`, `blobSha256`, result/cleanup flags, а переход в `completed` без доказанного video recognizer безусловно отклоняется с `recognition_evidence_required`.
- `tests/entrance-analysis.test.mjs` проверяет прямую попытку подмены original/source и fake completed; `docs/VIDEO-QUEUE-SOURCE-INTEGRITY.md` фиксирует границу API. Кодовый SHA `f16e38b759115eff60157ea16d1dbb8d1d2db98a`, тестовый SHA `4066397205cd48551595b0b7550ca2b7ca70c2ef`.
- Нет активного распознавания, нет IDB writes, изменений пользовательских данных, удаления/публикации. Новую ветку необходимо оформить Draft PR и проверить CI точного HEAD.

---
## Проверенный CI — staging локальных кадров и fail-closed delete helper (2026-11-20)

- Draft #246 проверен на code/test/docs SHA `9ca75dfd17bbddc53ff4f5aff0031f917c666b6f`: [Android #44708736344](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44708736344) **completed/success** (regression tests, Build Debug APK, Upload APK); [isolated APK #44708736326](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44708736326) **completed/skipped**. Physical Android не проверен.
- Препроцессор не подключён в UI, не выполняет распознавание и не даёт право на удаление; баг legacy `canDeleteVideoOriginal` исправлен безусловным fail-closed.
- Следующий этап — безопасный контракт взаимодействия с реальным распознавателем. Текущий текстовый Worker не годится как доказательство распознавания кадров. Без подтверждённого бесплатного provider, тестов Android и source-bound ledger не включать `completed` или удаление.
- Новые документационные коммиты после code SHA проверяются отдельно; никакого merge/production/живых оригиналов.

---
## Этап — fail-closed legacy deletion helper и локальные временные кадры (2026-11-20)

- Поверх Draft #245 создана ветка `fix/video-preprocessing-failclosed-2026-11-20`. В `js/entrance-analysis.js` неавторитетный helper `canDeleteVideoOriginal` теперь всегда отказывает; отдельный `deleteEntranceVideoBlob` по-прежнему блокирован. Исправлена регрессия в `tests/entrance-analysis.test.mjs`.
- Новый `js/entrance-frame-preparation.js` выполняет SHA/size/source ID preflight и локально декодирует 2–4 JPEG кадров из Blob в памяти, очищает object URL/canvas, не делает сеть/IDB/UI, никогда не выдаёт `recognitionSucceeded` или `cleanupAuthorized`. Это **staging-only**, не видеоаналитика и не интеграция распознавания.
- `tests/entrance-frame-preparation.test.mjs`: offline mock decoder, SHA mismatch, invalid source, abort, JPEG, cleanup, no network, no production load. Документ `docs/VIDEO-FRAME-PREPARATION-STAGING.md`. Последние code/test SHA: `b24df08e8180f9010ee6cf3e4e9f470c723ccfe4`, `0ae28bec72c664685b305b29126cb675aa12b01a`, `2bb0514966c8d7c7cee2265654ada7bfb0bf41f4`, `0eaccafc096bb8c12ec47c789e6c8aff8f51d257`.
- CI на новом HEAD ещё не подтверждён. Следующий шаг: открыть зависимый Draft PR и проверить полный Android workflow и regressions; затем лишь проектировать/проверять реальное video→inference→ledger. `main`, production, реальные видео не менялись.

---
## CI PR #245 — UI не выдаёт статус очереди за распознавание (2026-11-20)

- Проверенный code/test SHA `4a937900ec140c10624db5a04f92fe51c28cefed`; [GitHub Android workflow #44707836309](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707836309) **completed/success**: regression, Debug APK build, Upload APK успешно. [Isolated archive APK #44707836696](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707836696) **skipped**.
- UI-путь для `status='completed'` теперь выводит «Результат распознавания не подтверждён». Файл, статусы в БД, очередь и контроль удаления остались нетронутыми. Это не реализация распознавания и не proof Android physical camera.
- Аудит `cloudflare/worker.js`: текущий Worker принимает JSON `question/context/history`, отправляет текстовые messages в Workers AI и возвращает только `{answer,provider,model}`; действующего video-frame recognition endpoint/подписанного результата нет. Не считать этот ответ доказанным completed. Следующий приоритет — отдельный безопасный план и реализация video→frames→result с точной проверкой источника, бесплатной квотой и физическим Android-тестом. До этого delete blocked.
- Новые docs-only коммиты после проверенного code SHA требуют отдельной проверки при необходимости; никаких merges, production, пользовательских файлов не меняли.

---
## Контрольная точка — честный статус видео летка в UI (2026-11-20)

- На базе #244 создана отдельная рабочая ветка `fix/video-entrance-unverified-status-2026-11-20`. В `index.html` статус `entrance_media.status==='completed'` больше не выводит ложное «Анализ завершён»; вместо него «Результат распознавания не подтверждён». Реального подтверждённого распознавания в этой цепочке пока нет. Показ очереди и видео, блокировка удаления, запись исходников не затронуты.
- В `tests/entrance-video-manual-delete-guard.test.mjs` добавлен отрицательный UI-regression тест на старую надпись и сохранение предупреждения об отсутствии сервера и запрета удаления.
- Code SHA `0604edf41b9743fc2d76e24d978fc10da0d5a8c2`, tests SHA `23a79a5cb1deb2f0754c6993870e8cc3aca1d6e6`. Новая ветка требует отдельного CI. Никакого признания `completed` без ledger, подключения AI, auto-delete, changes production.

---
## CI PR #244 проверен на точном SHA (2026-11-20)

- Code/test/docs SHA `abcd5d3a34446a151a7400e415661f9f9d8b73d9`: [Android workflow #44707536300](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707536300) **completed/success**: regression tests, Build debug APK и Upload APK success. [Isolated archive #44707536160](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707536160) **skipped**.
- Строгая валидация ledger read-back и duplicate identity проверена в регрессионном наборе. На физическом Android устройстве не проверялась, автоудаление не включено.
- Следующий приоритет — убрать неподтверждённое UI-сообщение `Анализ завершён` по одному `entrance_media.status='completed'` без подтверждённого ledger. Исправление только индикации, не включать обработку и delete.

---
## Контрольная точка — строгая fail-closed проверка read-back распознавания (2026-11-20)

- Новый зависимый этап поверх Draft #243 в ветке `fix/video-ledger-read-integrity-2026-11-20`: `js/video-recognition-ledger.js` теперь валидирует целиком каждый persisted entry (источник, videoId, resultId, stateRevisionId, timestamps, digest, размер, evidenceVersion, cleanupState, JSON result), запрещает дубли identity и использует одинаковый guard при чтении и перед записью.
- Отсутствующий ledger возвращает `{ok:false,reason:'ledger_missing',entries:[]}`, а не ошибочно подтверждённый пустой реестр. Повреждение возвращает `ledger_corrupt` без раскрытия потенциально подменённых записей и без модификаций исходников.
- Добавлены тесты отсутствующей записи, повреждённых digest/размера/status/result/timestamps, duplicate и сохранности Blob. Code SHA `8067270989d8a32973574a4938a5e09f42eff09c`, tests SHA `0e8aab280a8860e95e957e3d62a6445b483a3c3e` — **новая проверка CI ещё не подтверждена**.
- Нет UI, AI интеграции, включения удаления, миграций, production. Следующий шаг — точный CI; затем audit реальных AI endpoint и запрет фиктивного `completed` до интеграции.

---
## Проверенный CI PR #243 — test-only ledger и защита от ID collision (2026-11-20)

- Исправленный code/test SHA `3e3c51372f26ce1544fa2e23cf359d5a31eb1fb4`: Android workflow [#44707175152](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707175152) **completed/success**; regression tests, debug APK build и upload прошли. Isolated archive APK [#44707175241](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707175241) **skipped**, не считать успешным тестом.
- Предыдущий SHA `dfd5de3f1928850cb5fee1a94d3bdb3a01bfa5a5` [#44706938052](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44706938052): 988/989 passed, один старый тест требовал `put(storedRecord)` вместо безопасного `add(storedRecord)`. Исправлен только этот тест, введено явное отрицательное ожидание на `put`.
- Следующий приоритет — строгая fail-closed проверка уже сохранённых ledger записей перед будущей интеграцией UI; затем реальный источник распознавания. Нет auto-delete, merge, production, изменений пользовательских видео.
- Последующие docs-only коммиты не объявлять проверенными CI без отдельной проверки; code/test SHA указан выше.

---
## Контрольная точка — исправление CI и коллизий леткового видео (2026-11-20)

- Первый Android CI Draft #243 на SHA `3f6a0dfa092ee2d845d8922e16895351fa733f11`, run #44706715461: **failure**, 988 passed / 1 failed; Android build/upload были skipped. Единственный failing test извлекал `async function putEntranceVideo` начиная с `function`, вызывая SyntaxError при `await`.
- При анализе обнаружена реальная уязвимость: текущий `index.html` сохранял исходник через `entrance_media.put(storedRecord)`, что позволяло перезаписать видео при одинаковом ID. Изменена одна операция на `add(storedRecord)` (commit `53af9aecab221e236db1d1eb2e83ce83e326f126`); регрессионный тест исполняет настоящую async-функцию с SHA-модулем (commit `a86f8f2126cb3088209bf49a692a3bfd43c7f6f2`).
- Повторные тесты и Android CI для нового HEAD ещё требуют проверки. Оригиналы пользователей не менялись; автоматическое удаление, UI интеграция ledger и production запрещены.

---
## Этап — test-only durable ledger распознавания видео (2026-11-20)

- После docs-only Draft #242 создана зависимая ветка `feat/video-recognition-durable-ledger-2026-11-20`. Перенесены из несоединённой экспериментальной ветки без merge: `js/video-recognition-ledger.js` и `tests/video-recognition-ledger.test.mjs`; отдельный контракт `docs/VIDEO-RECOGNITION-DURABLE-LEDGER.md`.
- Функция проверяет SHA-256 исходного видео и state revision, записывает результат в `main/video_recognition_ledger_v1`, при любом успешном результате оставляет `cleanupState=blocked_archive_safety`. Никаких вызовов UI, удаления Blob, схемных миграций или живых операций.
- Открытый риск: метаданные Blob можно подменить несогласованным writer при сохранении прежнего SHA/size после хэширования, а внешние Android/архивные копии ещё не проверены. Запрет удаления #241 сохраняется. CI этого нового HEAD пока не подтверждён; следующий шаг — проверки GitHub на точном SHA, затем интеграция распознавателя отдельным шагом.
- Merge, production, публикация и изменение пользовательских видео не выполнялись.

---

## Контрольная точка — контракт распознавания/очистки видео (2026-11-20)

- На основе Draft #241 создан отдельный docs-only блок: `docs/VIDEO-RECOGNITION-CLEANUP-STATE-CONTRACT.md`. Определены fail-closed состояния pending/in-progress/recognized_durable/cleanup_blocked/cleanup_committed, необходимые доказательства SHA/ledger, учёт внутренних и внешних Android копий, атомарность и запрет resurrection при restore.
- Текущий код **не удаляет** видео после распознавания; распознаватель ещё не подключён в этой цепочке. Контракт ничего не разблокирует, не меняет состояние пользователя, не выдаёт archiveSafe или cleanupAuthorized.
- Перед программным этапом требуется сверить несоединённый ledger стек #213, внедрить только durable recognition без удаления и проверить CI/Android. Основной стек #230–241 остаётся Draft. main, production и реальные оригиналы без изменений.
- Документационные изменения текущей ветки не объявлять CI-verified без workflow на точном HEAD.

---

## Проверенный CI — защита леткового оригинала от преждевременного удаления (2026-11-20)

- Draft PR #241: code/test SHA deb588ce20e5929610050a01b465455e302ed837. Android workflow #44705595782 **completed/success**: Run regression tests, Build debug APK, Upload APK успешны; isolated archive APK #44705595821 **skipped**.
- Первый CI на SHA d9fd43b68218bd9efa3033fb3aff0a1cdd35d53b завершился **failure**: новая regression fixture ошибочно извлекала `async function removeEntranceVideo` без `async`, отчего тестовый `new Function` не мог разобрать `await`. Исправлен test-only extraction SHA deb588ce20e5929610050a01b465455e302ed837; рабочий код блокировки изменять не понадобилось.
- Теперь все вызовы `deleteEntranceVideoBlob` на ветке #241 отклоняются до IndexedDB write; UI-кнопка отключена. Захват/просмотр сохранены. Безопасное удаление после распознавания ещё **не реализовано**. Данный CI не проверяет физическое Android устройство.
- Следующий приоритет: безопасное durable-распознавание и результат/ledger на видео, после чего инвентаризация внутренних+внешних Android копий и строго проверяемая all-copy cleanup. Никаких merges, production, удаления пользовательских видео.
- CI выше подтверждён для code SHA; следующие документационные коммиты проверяются отдельно.

---

## Контрольная точка — блокировка преждевременного удаления леткового видео (2026-11-20)

- Начальное состояние: Draft #240 HEAD fda4f6e5d72b8cd5414ba1bb4ac50ea45888bf13, Android workflow #44704230240 completed/success; isolated archive APK #44704230343 skipped. Ветка #240 остаётся Draft, никаких merges/production.
- В зависимой ветке `fix/video-entrance-manual-delete-guard-2026-11-20` устранён риск прямого удаления нераспознанного оригинала из `entrance_media`: `index.html` теперь показывает disabled «Удаление заблокировано», `deleteEntranceVideoBlob(id)` всегда отклоняет вызов с кодом `ENTRANCE_VIDEO_DELETE_BLOCKED` без открытия IDB readwrite-транзакции; устаревший `removeEntranceVideo` безопасно сообщает об отказе. Capture, preview, list, SHA, журнал и все данные сохранены.
- Добавлен `tests/entrance-video-manual-delete-guard.test.mjs` на прямой delete, старые вызывающие пути, отсутствие транзакции и сохранение записи/просмотра. Новый контракт `docs/ENTRANCE-VIDEO-DELETE-GUARD.md`. Code SHA 20ce483fda164d6c4294f014e400a2594dc9c84d; tests SHA f94812a0a526220f1f294bc6cb4a00d3903cf811.
- CI нового SHA пока не подтверждён. Дальше — Draft PR, точная проверка regression/Android и исследование подтверждённой цепочки распознавания с учётом всех managed и external Android копий. Автоматическая очистка остаётся запрещённой, реальные пользовательские видео не удалялись.

---

## Проверен CI — new journal video source SHA/ID (2026-11-20)

- Draft PR #240: https://github.com/250oisr-eng/Pasekaapp/pull/240. Код и исправленные регрессии SHA `03c620231fd990123914011c9733858b034363e7`. Android workflow #44704005222 **completed/success**: Run regression tests, Build debug APK, Upload APK прошли. Isolated archive APK workflow #44704005147 **skipped**.
- Ранее SHA ef3e35b6ba81519473f15c248df054d00bea732a завершился **failure**: четыре старых теста ожидали v316 cache и старую последовательность скриптов. Исправлены tests/archive-ui-integration.test.mjs и tests/regression.test.mjs, не скрывая ошибки. На исправленном коде CI success.
- Два реальных пути создания новых journal videos получают стабильный ID и SHA-256 Blob/Data URL; old journal media не мигрируются. Offline shell v317 и Android www scripts включают новый модуль.
- Физическая Android проверка камеры, галереи, офлайн ввода и сохранности после рестарта не выполнялась. Автоматическое распознавание и удаление видео не реализованы. CI относится именно к исправленному SHA, последующие docs-only commits требуют собственного статуса.
- Следующий приоритет: guarded recognition ledger + Android внешние copies и безопасный запрет преждевременного удаления; никакого live cleanup, merge или production.

---

## Контрольная точка — новые видео журнала получают устойчивую идентичность (2026-11-20)

- Предыдущий Draft PR #239 `fix/video-archive-v2-legacy-copy-coverage-2026-11-20`: итоговый HEAD 373830645c128c7703632502b9428ded957db3d2, Android workflow #44703389103 completed/success, isolated APK #44703389078 skipped. Ручное удаление видео в действующем UI является отдельным выявленным риском, не изменено.
- Следующий приоритет — source identity именно в реальном capture workflow. Создана зависимая ветка `feat/journal-video-v2-source-evidence-2026-11-20` поверх #239. Новый модуль `js/journal-video-source.js` готовит новые журнальные видео: устойчивый `videoId`, `sourceSha256` по исходному Blob, `sourceBytes`, `sourceEvidenceVersion:1` и Data URL, SHA которого проверяется отдельно и совпадает с исходником. Ошибка или отсутствие SHA не допускает создания медиа.
- `index.html`: `addCapturedVideo` и file-picker путь `recordForm` используют общий SHA-validated preparer. Редактирование старых записей сохраняет прежние media без миграции, а старые без ID по-прежнему блокируют автоматический PASEKA02 import/cleanup.
- `sw.js`: offline cache `paseka-shell-v317` с новым js; `scripts/prepare-web.mjs` уже рекурсивно копирует `js` в Android www. Новые tests/journal-video-source.test.mjs используют настоящие SHA и record-media adapter и проверяют несовместимые legacy records, ошибки FileReader/hash, оба UI пути, offline cache.
- Код SHA d539eb6aa1060dfb4d1b142e481b850ce5a0e389, UI SHA fe86d6addccc6774c226dc8109a306d6a4aa47fd, cache SHA 976a8b279f584e11f07a36ff0561e271df82daf4, test SHA 02fef6fcfd830d27f4f27aa9ba976a5a806511c4. Контракт docs/JOURNAL-VIDEO-SOURCE-EVIDENCE.md.
- CI актуального SHA на момент записи не подтверждён. Следующий шаг — создать Draft PR и проверить regression + Android build по HEAD; при ошибке исправить. Никаких live deletions, changes main, production или merge; физическая проверка Android камеры ещё не проведена.

---

## CI проверен — реальные legacy PASEKA01 + capture UI (2026-11-20)

- Код/тесты/документация на SHA `70e8781c2a4a98cdfc0e060902d41f34172804bc`: Android workflow #44703165651 **completed/success**, regression tests, debug APK, upload успешны. Изолированный archive test APK #44703165708 **skipped**.
- Новый зависимый Draft PR #239: https://github.com/250oisr-eng/Pasekaapp/pull/239. Учитываются PASEKA01 `video`, `rollback_video`, `rollback_state`, `full_backup.previous.state` и реальный legacy journal capture без videoId, который теперь считает копию как identity:null/unidentified_copy. Никаких действий с original Blob или пользовательской базой нет.
- Реальный `index.html` имеет путь ручного удаления леткового оригинала без ledger-условия; риск отмечен, но runtime не изменялся. Не смешивать пользовательский запрос на подтверждённое распознавание с прежней кнопкой ручного удаления.
- Текущая инвентаризация всегда `cleanupAuthorized=false` и `auditComplete=false`. Следующий этап — безопасно согласовать runtime capture и recognition ledger, а также Android внешние копии, прежде чем разрабатывать удаление после распознавания.
- Success относится к указанному SHA. Поздний docs-only commit при появлении будет иметь отдельный CI. Main, production, опубликованное приложение и физические устройства не изменены.

---

## Сверка реального capture UI и исправление подсчёта копий без ID (2026-11-20)

- Прямой аудит `index.html`: летковые видео записываются `handleEntranceVideoFile → putEntranceVideo` в `entrance_media` с SHA-256; сервер распознавания ещё не подключён. В live UI присутствует `removeEntranceVideo → deleteEntranceVideoBlob` с подтверждением пользователя, **без проверки успешного распознавания**. До отдельного разрешённого изменения этот пользовательский путь является риском преждевременного удаления и не относится к автоматической безопасной очистке.
- Видео журналов через `recordForm` сохраняются как `{kind:'video',name,type,data:DataURL}` **без гарантированного videoId, sourceSha256, sourceBytes**; их невозможно безопасно сопоставлять с ledger по identity. Новое исправление инвентаризации всегда считает такую запись как `copy` с `identity:null` и `unidentified_copy`, а не пропускает её.
- В тесты добавлен точный legacy journal capture fixture. Code SHA 32d2230aac6d7f50c7310f450a278b57d1aa88b9; test SHA eb85507b2426fb7319d0e66bfc03b6925392ceb8. Полный CI актуального SHA проверяется отдельно.
- Не изменялся `index.html`, ручное удаление **не вызывалось**, никаких пользовательских файлов/данных не затрагивали. Приоритет: заблокировать преждевременное удаление при согласованном изменении live video lifecycle, после обоснованной матрицы совместимости.

---

## Контрольная точка — PASEKA01 legacy-видеокопии в инвентаризации (2026-11-20)

- Исходный Draft PR #238 HEAD c9d667080d768b3dba8acfb0e56018cde8bf8cc8: Android workflow #44702366437 **completed/success** (регрессионные тесты, debug APK, upload), отдельный isolated archive APK #44702366449 **skipped**. Ветка #238 остаётся Draft, main/production не менялись.
- Проверен реальный код v1 js/paseka-archive-restore.js: `archive_staging` содержит `kind='video'` с `metadata.id`, `blob`, `size`, `chunkSha256`; `kind='rollback_video'` хранит `record.blob`; `kind='rollback_state'` содержит `state`; `kind='state'` хранит непрозрачный JSON Blob, а `full_backup.previous` хранит `{at,state}`.
- В зависимой ветке fix/video-archive-v2-legacy-copy-coverage-2026-11-20 расширен только изолированный readonly `js/video-archive-v2-copy-inventory.js`: теперь известные legacy `video` и `rollback_video` учитываются как оригиналы `entrance_media`, архивные `rollback_state` и `full_backup.previous.state` проверяются на journal video Data URL, непрозрачный state Blob явно блокирует полноту инвентаризации. Chunk SHA старого архива **не** считается полным SHA источника.
- Добавлены регрессии `tests/video-archive-v2-copy-inventory.test.mjs`: legacy copies, recognized tombstone с rollback copy, неизвестные payload, historical state и v2 before/after snapshots. Новый код SHA d408da8e3367c9f8f7518ed00a10d1d523c0dabf, тест SHA cba0c88ded5545f5f0581d94f48bc7b739a87f0e. CI новых SHA ещё не подтверждён.
- Во всех вариантах cleanupAuthorized=false, auditComplete=false, externalCopiesVerified=false. Новое изменение не затрагивает live UI, Android bridge, IndexedDB migrations и пользовательские данные. Следующий шаг: GitHub CI, затем исследование фактических capture/recognition paths и Android MediaStore без активации удаления.

---

## Проверен CI — инвентаризация копий PASEKA02 (2026-11-20)

- Draft PR #238 на точном SHA 4aece72275b4075dbbae557df502c57c14ab1d1f: Android Build #44702184802 **completed/success**, шаги Run regression tests, Build debug APK, Upload APK успешны. Изолированный archive APK run #44702184782 **skipped**, не отдельный успешно пройденный тест.
- Проверка охватывает новый test-only readonly inventory с simulated IndexedDB; физическая проверка Android/Gallery/Downloads не проводилась, legacy backup форматы требуют дополнительного аудита. Cleanup остаётся всегда запрещённым.
- Следующий приоритет — сверка конкретных runtime-модулей capture, recognition и storage и регистрация создания/возможных внешних видео-копий до обсуждения удаления.
- Последующие docs-only SHA требуют отдельной CI-сверки. Main, production и пользовательская база не менялись.

---

## Контрольная точка — инвентаризация управляемых копий PASEKA02 (2026-11-20)

- Предыдущий Draft PR #237 HEAD 8a6ab3543c48697170acb838cd19540d46654f76: Android workflow #44701483418 completed/success (регрессии, APK build и upload); isolated archive APK #44701483368 skipped. Main/production не изменялись; #230–237 остаются Draft.
- Продолжена единая приоритетная задача: создана зависимая ветка feat/video-archive-v2-copy-inventory-2026-11-20. Новый изолированный js/video-archive-v2-copy-inventory.js выполняет одну readonly-транзакцию IndexedDB над main/state, video_recognition_ledger_v1, entrance_media, archive_staging, archive_history и full_backup. Считает отдельно live Blob летка, журнальные data-video вложения, staged originals и quarantine snapshots.
- Все копии помечаются по source+videoId; если признанный удалённым tombstone имеет ещё копию, отмечается deleted_tombstone_has_copy. Для иных legacy backups, неизвестных видео без ID, недействительного ledger или состояния — fail-closed диагностика. Внешние Android Camera/Gallery/Downloads не проверяемы в этой транзакции.
- Выход отчёта только метаданные, не Blob и не Data URL. Во всех состояниях cleanupAuthorized=false, auditComplete=false, archiveSafe=false; никаких writes и удаления не происходит. Это инвентаризация, а не механизм очистки.
- Новые tests/video-archive-v2-copy-inventory.test.mjs проверяют readonly транзакцию, копии в нескольких protected stores, recognized/tombstone conflict, journal data URL, unknown backup, legacy media, ошибки ledger/metadata и read failure. Создан docs/VIDEO-ARCHIVE-V2-COPY-INVENTORY.md. Code SHA c18c3608435b3039b215f60d8aa4cacae80b7b93; test SHA 3222acacde827bb2f93a4aca0ffca944b6ed4265.
- Проверка CI этого нового SHA ещё не подтверждена. Следующее — проверить и исправить CI, затем изучить реальный список источников видео/старых backup и только после доказательства полного контроля копий обсуждать безопасное удаление. Нет merge/production/активации UI/physical Android test.

---

## Проверенный CI — PASEKA02 защищённый rollback в карантин (2026-11-20)

- Draft PR #237: https://github.com/250oisr-eng/Pasekaapp/pull/237. Точный code/test SHA b9adda64aa98508b04202506cb1bbc7bdb5ab1e6, Android workflow #44701259981 completed/success; Run regression tests, Build debug APK и Upload APK пройдены. Изолированный archive test APK workflow #44701259955 skipped, не считается успешной отдельной проверкой.
- CI доказывает только поведение изолированного fake-indexeddb тестового сценария. Физический Android test не проведён; в runtime PWA/Android новый модуль не загружается.
- Подтверждены отказ при новом распознавании, новых записях с прежней revision, changed importedRevisionId, изменении Blob/hash, неизвестных оригиналах; сценарии atomic move/quarantine, crash readonly и error delete/abort. Положительный статус quarantine не разрешает очистку: byteIntegrityLocked=false, cleanupAuthorized=false, все copies сохранены.
- Следующий главный приоритет: независимая инвентаризация всех управляемых копий pending/recognized videos, staged/backup/quarantine/entrance/record_media и fail-closed cleanup-blocker, без удаления. Затем согласование real video-recognition workflow и физические Android испытания. Merge/production по-прежнему запрещены.
- Вышеописанный success относится к указанному SHA; последующие docs-only commits требуют отдельной сверки.

---

## Контрольная точка — PASEKA02 entrance quarantine rollback (2026-11-20)

- Положительная CI-проверка предшественника Draft PR #236 code/test SHA 579fa1b7e9847f070318c08b224108030669ff8b: Android workflow #44700669872 completed/success (regression, APK build/upload). Изолированный archive APK #44700669941 skipped. Далее в #236 добавлены docs-only commits.
- В новой зависимой ветке feat/video-archive-v2-entrance-quarantine-rollback-2026-11-20 разработан **изолированный** js/video-archive-v2-entrance-quarantine-rollback.js. Только для ранее успешно выполненного test-only entrance commit с status committed_rollback_blocked допускается защищённый откат: сначала readonly проверка истории, history.importedRevisionId и текущей revision/state/ledger/media, затем асинхронный SHA видео, затем повторная проверка всех пяти stores под общей readwrite транзакцией.
- При выполнении rollback фактические Blob **атомарно сохраняются в full_backup.quarantinedMedia** перед удалением ссылок из entrance_media в **той же** транзакции. Main/state возвращается с новой revision; recognition ledger и staged originals остаются без изменений. Любой отказ read, write, delete или конфликт приводит к abort с сохранением всех данных.
- Никакой video byte не уничтожается. После успешного отката history.status=reverted_quarantined_unverified, byteIntegrityLocked=false, rollbackAuthorized=false, restoreAuthorized=false, cleanupAuthorized=false; readonly inspector после restart возвращает только осторожную диагностику. Само наличие quarantined Media не подтверждает SHA-целостность на момент транзакции.
- tests/video-archive-v2-entrance-quarantine-rollback.test.mjs добавлены: успешное перемещение Blob с сохранением SHA, recognized tombstones, restart, повтор rollback, новое распознавание/наблюдение при той же revision, altered importedRevisionId, corrupted Blob, конкрурентный writer, same-size byte swap во время SHA, atomic failure при delete.
- Код SHA 0db0a6b5699ed3b4094f0da4291c3399732ba65b; тест SHA 6f849c7d6e6bc66d2d7a2c138e16e6d2f9dfbf37; контракт docs/VIDEO-ARCHIVE-V2-QUARANTINE-ROLLBACK.md. Полный CI именно нового SHA пока НЕ подтверждён.
- Следующая задача: открыть Draft PR и проверить CI; затем аудировать полное сохранение stage/full_backup и cleanup-барьеры для уже распознанных originals. Нет runtime UI, merge, production, физических Android-тестов или удаления пользовательских данных.

---

## Проверенный GitHub CI — test-only PASEKA02 entrance commit (2026-11-20)

- Для точного SHA **579fa1b7e9847f070318c08b224108030669ff8b** Android workflow #44700669872 завершён **completed/success**: Run regression tests, Build debug APK, Upload APK — успешны. Отдельный Build isolated archive test APK #44700669941 — skipped, не успех отдельной проверки.
- Узкий commit в Draft PR #236 проверен на CI, но не подключён к runtime и не испытывался на реальном телефоне. Статус «committed_rollback_blocked»: полноценного безопасного отката и удаления видео пока нет.
- Следующий главный приоритет: test-only protected quarantine rollback для импортированных, всё ещё не распознанных оригиналов, который перед изменением проверяет history.importedRevisionId и текущую revision, ledger/tombstones и все записанные оригиналы и при любом сомнении сохраняет данные.
- CI выше относится к указанному коду SHA; новый docs HEAD проверяется отдельно. Merge и production запрещены.

---

## Контрольная точка — PASEKA02 entrance-only atomic commit (2026-11-20)

- Проверен предыдущий Draft #235: итоговый HEAD 3a5739067140e633da1ad2c624932f8761e73792, Android run #44699480313 completed/success (regression/build/upload), isolated archive APK #44699480300 skipped. Main фактический SHA 8144ec8fe7e61c2f70f067c78f299bf0e7551dd7; ветки #230–#235 остаются Draft и не слиты.
- В зависимой ветке feat/video-archive-v2-entrance-atomic-commit-2026-11-20 создан изолированный js/video-archive-v2-entrance-atomic.js. Это первое **настоящее, но только тестовое** атомарное добавление pending Blob из verified PASEKA02 с сохранением state, истории и snapshot в одной readwrite-транзакции пяти stores. Blob берётся из повторно хэшированного исходного архива, НЕ повторно читаемого изменяемого staging.
- Контракт узкий: только entrance_media, никакого record_media, прежняя живaя видеотека обязана быть пустой, прежний full_backup отсутствует, staged session+history согласованы, входящий ledger/tombstones идентичны локальным. Разрешено изменение live state **только revisionId**: любые новые записи, даже без увеличения revision, блокируют операцию.
- Protected snapshot сохраняется в full_backup, history получает статус committed_rollback_blocked. Автоматический откат видео и удаление остаются ЗАБЛОКИРОВАНЫ. Readonly inspector после рестарта сообщает только committed_media_unverified, а не безопасность byte/restore/delete.
- tests/video-archive-v2-entrance-atomic.test.mjs добавлен с негативными регрессиями: сохранение ledger, учёт новых записей, concurrent recognition, подмена staged Blob, rollback snapshot, атомарное прерывание при ошибке IDB.add, конфликт видео, защита чужих бэкапов, restart и повреждение истории.
- Контракт docs/VIDEO-ARCHIVE-V2-ENTRANCE-ATOMIC.md. Начальный код commit 5f0039e1bb0ea0f42eca3a3c768b08e88e2a61ec и дополнительное state protection  aa24ff962d212db8307a710ef0849c6755bd5f95; тесты commit 78d035a7f9a133362a2aab4118cb15f0b78200bf. JS-синтаксис проверен; CI точного нового SHA пока НЕ подтверждён.
- Следующий приоритет: проверить CI и исправить реальные ошибки; затем отдельная модель безопасного rollback с сохранением ledger/tombstones и всех оригиналов. Никаких merges, live UI, production и физического удаления видео.

---

## Проверка CI: pinned entrance add с обязательным abort (2026-11-20)

- Точный кодовый/test SHA 3bce3f1528e0866711c88e5e70fd4ec1b6a3dd8c: Android Build workflow #44699253786 **completed/success**. В build job успешны Run regression tests, Build debug APK и Upload APK. Изолированный Build isolated archive test APK #44699253789 **skipped**, не считать успешной отдельной проверкой.
- Draft PR #235: https://github.com/250oisr-eng/Pasekaapp/pull/235. Все добавленные test-only транзакции **всегда abort**, ни один пользовательский оригинал/ledger/state/backup не записан или удалён; не подключено к UI.
- Проверка в реальном Android test APK и на физическом телефоне НЕ выполнялась. В Lovable найден существующий проект Apiary Family Atlas; этот этап не изменял его код и настройки публикации.
- Следующий инженерный приоритет: тестовая полная атомарная транзакция состояния и признанной истории с защищённым rollback snapshot, чтобы будущий commit использовал именно удержанные verified archive Blob. Пока нет полноценного согласования record_media, всех копий и удаления после распознавания, запуск live и cleanup запрещены.
- Последующие docs-only SHA требуют отдельной проверки CI; code/test успех относится только к 3bce3f1528e0866711c88e5e70fd4ec1b6a3dd8c.

---

## Контрольная точка — PASEKA02: репетиция IDB add с обязательным abort (2026-11-20)

- Проверенный предшественник Draft #234: code/test SHA 36c990974f9f13dcb2af4d13163787c254d72c51, Android workflow #44698877760 completed/success, isolated archive APK #44698877638 skipped. После него только docs-only commits; основной стек #230–234 остаётся Draft.
- Новая зависимая ветка feat/video-archive-v2-pinned-add-abort-2026-11-20 поверх #234. Js/video-archive-v2-pinned-source.js теперь имеет тестовый метод rehearsePinnedEntranceAddsAbort: после повторной проверки реального PASEKA02 и SHA **удерживает те же immutable Blob** и в единой readwrite транзакции пяти stores сначала проверяет state/ledger/staging/history/entrance IDs, затем подаёт настоящие `entrance_media.add` (без put), ждёт завершения запросов и **всегда tx.abort**.
- `record_media` этим методом не восстанавливается, только entrance_media; при коллизии видео, неизвестных source ID, ошибке add или изменении ledger транзакция целиком отменяется. Никакой durable записи в main, media, staging, history, full_backup.
- tests/video-archive-v2-staging-verify.test.mjs дополнен проверками add-success-with-abort, same-size staged Blob tamper с interception add (доказано использование архивного Blob), journal video blocked, конкурентной записи video ID и искусственного add failure. Код SHA 46094204c4220c2bef9d10a1a92a88f70010cc1f, тест SHA 899239ca9f499d4d66981cfc526c865ce54d2631.
- Контракт docs/VIDEO-ARCHIVE-V2-ABORTED-ADD.md. На момент фиксации GitHub CI этого нового SHA ещё не подтверждён; Android физически не тестировался. Нет live integration, мержа PR, production и удаления оригиналов.
- Следующее: проверить CI итогового SHA и исправить реальные сбои. Затем — только отдельная тестовая реализация полноценного защищённого rollback + recognition ledger union, без удаления видео и без использования непроверенных staging байтов.

---

## Проверенный CI — pinned PASEKA02 source (2026-11-20)

- PR #234 код/тесты SHA 36c990974f9f13dcb2af4d13163787c254d72c51: Android workflow #44698877760 **completed/success** (regression tests, debug APK, upload); isolated archive APK workflow #44698877638 **skipped**. Это не физическое тестирование телефона.
- Подтверждён изолированный алгоритм получения неизменяемых SHA-проверенных архивных Blob без выдачи caller write/delete capability. Same-size staging substitution по-прежнему доказанный риск и явно возвращается stagedBytesLocked=false.
- Следующее ограниченное доказательство: тестовый запуск настоящих IndexedDB add-запросов из тех же удержанных Blob под финальным readwrite lock, с обязательным abort независимо от успеха; ни один байт не должен попасть в durable live state.

---
## Контрольная точка — неизменяемые источники PASEKA02 вместо mutable staged Blob (2026-11-20)

- Актуальная проверенная исходная цепочка: Draft #230 → #231 → #232 → #233. PR #233 HEAD 52d02d7ab84d741882ebf6d3059fb9f605c51ee5: Android workflow #44697729527 completed/success, isolated archive APK #44697729499 skipped. Нет merge/production/Android физического теста.
- Создана зависимая ветка feat/video-archive-v2-pinned-payload-proof-2026-11-20 поверх #233, один приоритет — byte-TOCTOU между staged SHA и будущим commit. Новый изолированный js/video-archive-v2-pinned-source.js повторяет SHA staging, заново проверяет реальный PASEKA02, создаёт **локальные неизменяемые Blob-срезы именно из проверенного архива** и проверяет SHA каждого нового источника. Проверяет live revision/ledger/videoIds/staging/history под финальной readwrite-блокировкой пяти stores, которая всегда abort.
- Ни один Blob не возвращается вызывающему коду, записи не выполняются. Результат явно сохраняет stagedBytesLocked=false, restoreAuthorized=false, cleanupAuthorized=false, archiveSafe=false. Это архитектурное доказательство для будущего одного commit-вызова, не готовая операция.
- В tests/video-archive-v2-staging-verify.test.mjs добавлены проверки pinned-источников, record/entrance, same-size Blob swap после аудита и повторного обнаружения SHA-подмены, гонок нового recognition ledger и истории, отсутствия данных для удаления/записи. Код SHA 95ca7d5d1e6617adc2721b021fe73a8434720b1a, тест SHA 5a06f0ebd67c6fcbf19e9fda730f790af48bb26c.
- Контракт docs/VIDEO-ARCHIVE-V2-PINNED-SOURCE.md: старые staged Blob сохраняют риск незамеченной same-size подмены; импорт вправе использовать только удерживаемые в том же вызове проверенные архивные Blob, необходим настоящий атомарный commit/rollback и полное согласование копий.
- CI этого нового кода ещё не подтверждён. Следующее: открыть Draft PR, выполнить Node/Android CI точного SHA, исправить ошибки. Затем тестовый атомарный commit исключительно безопасного узкого подмножества, используя удерживаемые Blob вместо повторно читаемых стадированных байтов, без интеграции live/cleanup.

---

## Проверенный результат CI — SHA staging verifier (2026-11-20)

- В Draft PR #233 на SHA `c5939b055f31fc32239c29bd0a56ab698ab5208d` Android workflow #44697513266 — **completed/success**, включая шаги Run regression tests, Build debug APK, Upload APK. Изолированный Build isolated archive test APK #44697513211 — **skipped**, не успешная отдельная APK-проверка.
- Подтверждены тесты изолированного stage verifier и существующей связанной цепочки именно на указанном SHA; реальный Android-телефон не тестировался. Последующие docs-only коммиты требуют собственного CI-статуса.
- Реальный импорт с видеоданными, delete/cleanup, rollback видео и durable writer-fence **не реализованы и не активированы**. Весь стек #230→#231→#232→#233 остаётся Draft; Main/production не менялись.
- Один следующий приоритет: формализовать и реализовать неизменяемость staged Blob до атомарного commit (writer-serialized согласованная защита), с сохранением новых записей, ledger/tombstones и protected backups. Без этой границы никакого live restore или deletion.

---

## Контрольная точка — повторная проверка SHA staging originals (2026-11-20)

- В зависимой ветке feat/video-archive-v2-staging-integrity-2026-11-20 подготовлен отдельный модуль js/video-archive-v2-staging-verify.js. Он принимает реальный PASEKA02, заново проверяет архивный SHA, читает ровно пять protected stores общей readonly транзакцией, сверяет header/history и точный список staged исходников, затем **повторно хэширует байты каждого уже сохранённого staged Blob**.
- После SHA-фазы повторно сравнивает live state, ledger, entrance keys и staged metadata под единой readwrite транзакцией, которая всегда abort. Никакого put/delete/restore. Результат всегда byteIntegrityLocked=false, requiresAtomicCommitCheck=true, restoreAuthorized=false, cleanupAuthorized=false и archiveSafe=false.
- Известное ограничение: подмена Blob того же размера и MIME после SHA, но до final write-lock, не определяется одним metadata fingerprint. Эту проверку нельзя считать разрешением на import/cleanup до отдельного immutable/write-fence протокола.
- Добавлены tests/video-archive-v2-staging-verify.test.mjs: оба вида видео, real-file SHA, same-size corruption, отсутствующий staged original, writer race, конфликт журнала распознавания, чужой full_backup, отсутствие store, сохранность. Синтаксис JS и тестов проверен, полный CI итогового SHA ещё не подтверждён.
- Документ контракта: docs/VIDEO-ARCHIVE-V2-STAGING-VERIFY.md. База Draft #232: code/test SHA 8f98505a9fde38dea489576fcb8de600e8a94db1, workflow #44697058894 success; isolated archive #44697058856 skipped. Этот CI не подтверждает код нового PR.
- Следующая задача: получить точный CI и устранить дефекты, затем спроектировать writer-fence staged Blob/реальную атомарную интеграцию с ledger и полным rollback. Main, production, пользовательские записи и удаление видео не изменяются.

---

## CI изолированного PASEKA02 staging — 2026-11-20

- Точный SHA `8f98505a9fde38dea489576fcb8de600e8a94db1`: Android workflow #44697058894 — completed/success (Run regression tests, Build debug APK, Upload APK). Отдельный Build isolated archive test APK #44697058856 — skipped.
- Draft PR #232: https://github.com/250oisr-eng/Pasekaapp/pull/232; код только stage-only, без live-импорта, удаления, восстановления и изменения main.
- Поскольку `protected_unverified` не доказывает повторно SHA stored Blob, следующий приоритет — read-only verification сохранённых staging copies с защитой от конкурентных изменений, не выдающая разрешения на commit или cleanup.
- Проверки относятся только к указанному SHA; физический Android тест не проводился.

---

## Контрольная точка — PASEKA02: атомарный тестовый staging нераспознанных видео (2026-11-20)

- На базе проверенного SHA цепочки Draft PR #231 создана зависимая ветка feat/video-archive-v2-pending-stage-2026-11-20. Цель — защищённое сохранение уже SHA-проверенных pending originals в тестовый staging, без live-импорта или удаления.
- Новый изолированный js/video-archive-v2-pending-stage.js использует настоящий PASEKA02 codec для проверки Blob и SHA каждого видео, отдельно проверяет SHA архива и всех видео до DB write. Единой readwrite транзакцией по main, entrance_media, archive_staging, archive_history, full_backup проверяет exact revision, ledger, ID collision, пустоту защищённых stores и записывает только header + исходные Blob + history. Main/state, ledger, entrance_media и full_backup не меняются.
- Реальная schema archive_staging содержит unique backupId index; только header несёт backupId, видеоentries — sessionId и составные source+videoId keys. Протокол совместим без изменения версии IndexedDB.
- Read-only inspectPendingStaging сообщает protected_unverified (копии есть, повторный SHA НЕ доказан) либо manual_review_required при повреждении header/history; не выдаёт restore/cleanup authorization.
- Тесты tests/video-archive-v2-pending-stage.test.mjs покрывают реальные entrance и record_video, защиту предыдущих backup, исходного Blob, записи ledger во время проверки, повторный staging, осиротевшие копии и некорректный архив. Подключения к live UI нет.
- Отдельный контракт docs/VIDEO-ARCHIVE-V2-PENDING-STAGING.md. Первичный code SHA f47d77a0e63b73c6e7d90156e39ff1716c9fb3ce и test SHA 6e79432aa4724f7e574ede9aca1f02e1ded532aa. Код прошёл синтаксический V8 parse, но полный CI ещё не подтверждён.
- База PR #231: code/test SHA c8ddefcaf47443a0c5b03c907e2811dc1912f3ae прошёл Android run #44696499993: regression, build APK, upload success. Isolated archive APK run #44696499782 skipped.
- Следующий приоритет: проверить SHA-специфический CI этой ветки и исправить тесты/ошибки; затем отдельный rehash staging content + writer-serialized recheck до рассмотрения реального commit. Merge, production, удаление видео запрещены.

---

## Проверка CI защитной цепочки PR #231 — 2026-11-20

- Точный SHA `c8ddefcaf47443a0c5b03c907e2811dc1912f3ae`: Android workflow #44696499993 **completed/success**. В job успешны **Run regression tests**, **Build debug APK** и **Upload APK**. Отдельный `Build isolated archive test APK` workflow #44696499782 имеет `skipped` (не считать проверенным).
- Проверена чистая последовательность stacked PR #230 → #231; нового live импортёра и удаления видео нет. Физическое тестирование APK не проводилось.
- Дата/вывод CI относится к указанному SHA, а не автоматически к последующим документационным commits.
- Следующая задача — отдельная проработка защищённого staging pending original видеозаписей, атомарного предварительного контракта и crash recovery; не запускать live restore или cleanup до полной проверки.

---

## Контрольная точка — PR #231: межисточниковые ID и гонка журнала (2026-11-20)

- Draft PR #231 открыт поверх #230: https://github.com/250oisr-eng/Pasekaapp/pull/231.
- Дополнены регрессии: одинаковый ID летка/журнала без ложного конфликта (источник входит в ключ), а также конкурентная запись журналового видео перед final aborted write-lock с сохранением исходных данных. Тестовые commits: 92207d23c2c5ac9e006a505938816e7bfd300ea8 и 85e677df21dde7beef172b01c90f52b71a01ff88.
- На момент фиксации полного CI точного итогового SHA нет. Проверка ожидается независимо от синтаксических и smoke-тестов.
- Следующий шаг: проверить актуальный CI; при ошибке исправить именно её, затем продолжить staging design без live действий.

---

## Контрольная точка — PASEKA02: защита исходных видео от коллизий ID (2026-11-20)

- На базе существующей Draft #230 создана зависимая ветка fix/v2-pending-media-id-collision-2026-11-20, отдельная задача: закрыть опасность совпадающих videoId у импортируемого pending original и уже существующего видео летка или журнала.
- В js/video-archive-v2-restore-gate.js добавлен чистый синхронный checkLivePendingMediaIdentity. Он требует отдельной проверки source+videoId, отвергает коллизию local entrance_media keys и journal record_media IDs, а также legacy видео с данными без стабильного videoId; существующий ledger/tombstone gate сохраняется.
- В js/video-archive-v2-restore-db-preflight.js проверка подключена после единого readonly снимка пяти stores. В js/video-archive-v2-commit-lock-guard.js повторно выполняется внутри единой write-lock транзакции, которая ВСЕГДА abort. Новый importer, writer, delete и восстановление не вводились.
- Регрессионные тесты: tests/video-archive-v2-restore-db-preflight.test.mjs и tests/video-archive-v2-commit-lock-guard.test.mjs (конфликт входного видео, conflict journal, legacy unknown ID, writer race и сохранение originals). Три изменённых JS файла прошли синтаксическую проверку в V8; pure guard прошёл три отдельных ручных сценария. Полная матрица Node/Android CI для этой ветки пока не подтверждена.
- Контракт описан в docs/VIDEO-ARCHIVE-V2-PENDING-IDENTITY.md. Предыдущий базовый SHA 209edddc638935641d88fa197e0c5b7170c3cf76 прошёл Android CI #44695197293 (success), isolated archive APK #44695197208 skipped; эти результаты нельзя переносить на новый SHA.
- Приоритет следующий: убедиться в прохождении CI на итоговом SHA, затем разработать атомарный защищённый staging pending originals и recovery, не включать live импорт и cleanup до доказательства безопасности всех копий.
- Без слияний, без активации нового улья, без обновлений production, без удаления видео и пользовательских данных.

---

## Контрольная точка — PASEKA02: оба recovery snapshot проходят проверку (2026-11-20)

- Продолжен существующий Draft PR #230. Исправлен только изолированный metadata-only inspectMetadataRecovery: прежде чем возвращать committed/reverted, проверяет корректную форму records и отсутствие непроверенных видео в обоих сохранённых snapshot — beforeState и afterState, включая неактивный.
- Проверка reverted требует валидный revertedRevisionId, отличный от обеих исторических ревизий, и точное совпадение с текущим состоянием. При расхождении — manual_review_required, без записей.
- Код SHA e445ce1e9bb896adbb0e1dbc0d6e3dbe430762c6; тест SHA f718ad280366fa043f7ab6295b646d575e13d1b9. Негативные тесты охватывают скрытые оригиналы в неактивном снимке, повреждённые records и повторно использованную или неверную rollback revision.
- Предыдущий итоговый HEAD 40a13a57d56f0d6079b0d9e0ff49a03ee6c5428b: Android workflow #44694864424 completed/success, isolated archive workflow #44694864506 skipped. Этот результат не доказывает новый SHA.
- Следующее: подтверждение CI и аудит pending-media staging, без live restore и удаления. Ветка Draft, нет merge или production.

---

## Контрольная точка — обнаружение скрытых оригиналов при recovery (2026-11-20)

- В Draft PR #230 изолированный readonly inspector теперь проверяет форму records и запрещает скрытые исходные видео в текущем state (data:video, data:application/octet-stream, blob:), прежде чем присвоить not_imported или committed. Такие данные требуют manual_review_required; автоматическое удаление и восстановление не запускаются.
- Код commit 9dfdf0efa4c59e8b2895755473d09137e5dfdf04, регрессионные тесты commit ab3a7e1b48be6137ee15845ca566a1db9262a2ec. Проверки CI на новые SHA пока не подтверждены. Предыдущий code/test SHA 9aacbe124fffcd3012f3334d5544c6df14ca0f4d: Android workflow #44694728452 cancelled, isolated APK #44694728364 skipped; оба не считаются успехом.
- Следующий приоритет: подтверждение актуального CI и аудит передачи pending оригиналов в PASEKA02 с гарантией сохранности до распознавания. Live-интеграция, cleanup, merge и production исключены.

---

## Контрольная точка — metadata-only rollback и baseline recovery (2026-11-20)

- В Draft PR #230 исправлен rollbackMetadataOnly: история должна принадлежать ожидаемому backup ID; previousRevisionId и importedRevisionId совпадают с версиями снимков beforeState/afterState, различаются и содержат корректный archiveSha256. Любая ошибка прерывает общую readwrite транзакцию до записи; backup/history и пользовательский state сохраняются.
- inspectMetadataRecovery возвращает manual_review_required вместо not_imported, если в локальном state без архивной истории отсутствует валидная schemaVersion=15 или revisionId. Режим диагностики остаётся readonly.
- Код: commit 40d06794c5048c626ad505ead4febd90f7083061; регрессионные тесты: commit 9aacbe124fffcd3012f3334d5544c6df14ca0f4d.
- На предыдущем docs HEAD 3d093175f458d484f7bc47eb16f99bc33cc96a13 Android workflow #44693025279 completed/success, в job успешны Run regression tests и Build debug APK; isolated APK workflow #44693025295 skipped. Эти результаты НЕ относятся к новым code/test SHA.
- Следующий шаг: проверить CI для итогового SHA; аудит staged-переноса видео без подключения live UI и без cleanup. Merge, публикация, удаление оригиналов запрещены.

---

## Контрольная точка — усилена проверка целостности recovery v2 (2026-11-20)

- В том же Draft PR #230 диагностическая `inspectMetadataRecovery` дополнительно сверяет backup ID, SHA-256, schemaVersion и ревизии `beforeState`/`afterState` с `archive_history`; при расхождении возвращает `manual_review_required` и не исправляет данные автоматически.
- Добавлены отрицательные тесты на повреждение полей истории и snapshot; `readonly` режим диагностики сохранён. Код SHA `47e68d28da2867c8c2a66a881822dd24d6747dbe`, последний тест SHA `b71be63cdbb8a6c95c31981926dfd39c8bc14367`.
- CI итогового SHA ещё требует отдельной проверки. Нет восстановления видео, включения live UI, удаления оригиналов, merge или production deployment.
- Следующая задача: проверить результаты точного SHA и продолжить независимую проверку архивирования pending originals, не включать cleanup до доказательства сохранения каждой управляемой копии.

---

## Контрольная точка — recovery v2 только для чтения (2026-11-20)

- Продолжена существующая Draft-цепочка архивирования, PR #230, ветка `feat/video-archive-v2-metadata-atomic-restore-2026-11-20`. Новых параллельных PR не создано.
- Исправлено: `inspectMetadataRecovery` ранее открывал `readwrite` на пяти защищённых IndexedDB stores, несмотря на статус диагностической операции. Теперь применяется строго `readonly`; атомарные `commitMetadataOnly` / `rollbackMetadataOnly` остаются `readwrite`.
- Добавлен регрессионный тест на отказ диагностической операции от права записи и сохранение всех пяти stores в согласованном чтении.
- SHA кода `7c8c07f68e3b3ef7335ae84fdebb0ff3635814ee`; SHA теста `53a41383f9c00314e380fb057c93401a1b40c269`. На SHA теста Android и isolated archive workflows зарегистрированы, но на момент проверки не завершены; успешные проверки НЕ заявляются.
- Блокеры: полноценный импорт/откат видео PASEKA02, сохранение всех оригиналов до распознавания, удаление только после подтверждения на всех управляемых носителях, физический Android тест; работающий UI не подключён. `archiveSafe=false`, `cleanupAuthorized=false`.
- Следующая задача: дождаться и проверить CI именно на новом итоговом SHA и продолжить аудит защиты staged видео без live-включения и удаления.

---

## Большая контрольная точка — изолированный атомарный импорт/откат PASEKA02 без видеовложений (2026-11-20)

- Проверено, что последний PR #226 (SHA `ebe63a1abf3935355d8779af0b159415793f8d1e`) прошёл Android Build, кодовый SHA `30dbf9254e9f9dc8ef739a2e0bd1d859dae2d2b7` прошёл Fast Quality. Отдельная UI/Windows цепочка #227–229 завершила CI, включая сборку Windows+Android ZIP на SHA `f113870dca9c98615f0ddc307941cef05aff982b`; в `main` ничего не сливалось.
- Новая зависимая архивная ветка `feat/video-archive-v2-metadata-atomic-restore-2026-11-20` создана поверх #226. Реализован `js/video-archive-v2-metadata-atomic.js` — **изолированный и не подключённый к приложению** атомарный импорт/откат только для полностью безопасного подмножества PASEKA02: schemaVersion=15, без pending video и иных исходных видео, без существующих staging/history/full_backup, с неизменным полным recognition ledger.
- Реальный файл перед транзакцией проходит PASEKA02 decoder, SHA-256 и синхронную валидацию; под общей `readwrite` блокировкой пяти stores (`main`, `entrance_media`, `archive_staging`, `archive_history`, `full_backup`) повторно проверяются revisions, ledger и отсутствие защищённых копий. В одной транзакции создаются previous state/ledger, after state, history и новый state. Никаких `delete`, `clear` или возврата оригиналов.
- Атомарный rollback сравнивает **полный** текущий state с imported snapshot (не только revision), проверяет ledger, защищённые записи и сохраняет snapshot и history после отката. Изменение журнала/маток/семей, новое видео/распознавание или чужой backup после импорта блокируют откат без потери данных. `inspectMetadataRecovery` классифицирует `not_imported`/`committed`/`reverted`/`manual_review_required` и **не выполняет recovery автоматически**.
- Добавлена матрица регрессий в `tests/video-archive-v2-metadata-atomic.test.mjs`; документация `docs/VIDEO-ARCHIVE-V2-METADATA-ATOMIC.md`. На кодовом SHA `b4e5d90102840c67a7c3017fa76993a2c27bb66a` Fast quality #44691504851 **success**; Android на финальном docs SHA проверить отдельно.
- Это НЕ live restore PASEKA02 и не разрешение на cleanup/миграции/production. Следующая большая задача — staged обработка незавершённых видео, интеграция видеоцепочки, подготовка полной автоматической безопасной модели backup+rollback; после этого отдельный Android тест.

---

## Крупный этап — сквозной безопасный dry-run восстановления PASEKA02 и защита full_backup (2026-11-20)

- Ветка `feat/video-archive-v2-end-to-end-dry-run-2026-11-20` поверх Draft PR #225. Создан `js/video-archive-v2-restore-dry-run.js`: принимает **реальный Blob архива** `PASEKA02`, использует проверенный codec для манифеста, state, ledger, видео летка и журнала, затем read-only DB preflight и финальную проверку ledger под **отменяемой** общей readwrite-блокировкой. Возвращает только отчёт с SHA-256 архива, количеством видео и историей, без права на запись.
- Выявлен недоучтённый защищённый store **`full_backup`**: рабочий `js/paseka-archive-restore.js` использует его для предыдущего состояния при v1 restore. Исправлены `js/video-archive-v2-restore-db-preflight.js` и `js/video-archive-v2-commit-lock-guard.js`: теперь все `main`, `entrance_media`, `archive_staging`, `archive_history`, `full_backup` участвуют в одном чтении / write-lock. Любая запись `full_backup` блокирует v2 restore, защищённые данные не меняются и не удаляются.
- Исправлена TOCTOU-последовательность: полный SHA-256 файла вычисляется **до** заключительной проверки под write-lock, а не после. Добавлена регрессия на новое распознавание во время вычисления отпечатка.
- `tests/video-archive-v2-restore-dry-run.test.mjs`: полный тест `PASEKA02` с обоими типами видео, SHA-256, отказом на v1/corruption, потерей ledger, гонкой распознавания, защитой staging и full_backup, неизвестной схемой и отказом зависимостей. Обновлены тесты двух ранее созданных guard-модулей. `docs/VIDEO-ARCHIVE-V2-RESTORE-READINESS.md` содержит карту всех защищённых stores, угроз и план следующего этапа.
- **Fast quality checks success** на кодовом SHA `30dbf9254e9f9dc8ef739a2e0bd1d859dae2d2b7`, run #44688101339. Android CI и итоговый docs HEAD отдельно проверить. Нет действующего v2 импорта, staging/rollback commit или удаления, `restoreAuthorized=false`, `archiveSafe=false`. Все PR Draft, `main` и production не изменены.
- Следующее: атомарный и полностью обратимый v2 stage/commit/rollback, согласование видео и архивных веток, защита всех persistent копий после распознавания и физический Android тест. Нельзя включать автоматическое удаление на основании dry-run.

---

## Контрольная точка — проверка v2 restore под отменяемой readwrite-блокировкой (2026-11-20)

- Создана зависимая ветка `feat/video-archive-v2-commit-lock-guard-2026-11-20` поверх Draft PR #224. Новый изолированный `js/video-archive-v2-commit-lock-guard.js` открывает **одну readwrite-транзакцию** над `main`, `entrance_media`, `archive_staging`, `archive_history`, читает живой ledger/state, ключи входных видео, количество staging/history и **синхронно внутри transaction callback** выполняет restore ledger gate.
- Даже если проверка успешна, транзакция намеренно **abort**; никакие `put`/`delete` не выполняются, write-авторизация не выдаётся. При обнаружении любой staging/history записи или несовпадении текущего ledger — fail closed. Это подтверждение механизма проверки на момент блокировки, **не реализация commit**.
- `tests/video-archive-v2-commit-lock-guard.test.mjs`: проверка единой readwrite-транзакции и её обязательного abort, гонок writer до/после неё, непрерывности истории, сохранности staging/history, отсутствующего ledger и store. CI точного SHA проверить.
- Следующий этап: безопасный staging+атомарный commit/rollback с включением текущего ledger и всех protected stores; миграционная совместимость и физический Android тест. Пока `archiveSafe=false`, `restoreAuthorized=false`, автоделение видео запрещено; `main` и пользовательские данные не менялись.

---

## Контрольная точка — единая read-only проверка protected stores перед v2 restore (2026-11-20)

- Поверх PR #223 создана отдельная Draft-ветка `feat/video-archive-v2-restore-db-preflight-2026-11-20`. Изолированный `js/video-archive-v2-restore-db-preflight.js` читает в одной readonly IndexedDB-транзакции `main/state`, `main/video_recognition_ledger_v1`, ключи `entrance_media`, количество `archive_staging` и `archive_history`; затем вызывает чистый v2 ledger restore gate PR #223. Blob не выгружаются целиком.
- Пока полноценная безопасность staging/history v2 не реализована, при наличии **хотя бы одной** staged/history записи проверка отказывает, ничего не удаляет и не меняет. При отсутствующем ledger, неподдерживаемой схеме state, недостающих stores, конфликте истории распознавания также fail closed.
- Добавлены `tests/video-archive-v2-restore-db-preflight.test.mjs`: один readonly transaction, обнаружение защищённых staging Blob и history rollback, сохранность данных после отказа, отсутствие ledger, потеря tombstone, отсутствие store и неверный state. Результат всё ещё `restoreAuthorized:false`, `archiveSafe:false`, `requiresAtomicCommitCheck:true`.
- Это **не** write-транзакция, не текущий import/rollback и не разрешение удаления. Нужен разработанный и протестированный атомарный commit-guard без потери истории, затем Android физический тест. Итоговый CI проверить отдельно.

---

## Контрольная точка — изолированный preflight восстановления PASEKA02 (2026-11-20)

- Создана зависимая Draft-ветка `feat/video-archive-v2-restore-ledger-gate-2026-11-20` поверх PR #222. Добавлен чистый `js/video-archive-v2-restore-gate.js`: сравнивает текущий и импортируемый ledger распознавания, отказывает при потере, переписывании или понижении статуса существующих результатов/tombstone; проверяет каждый кандидат исходного видео по `(source,videoId)` и полному SHA-256 против всей известной истории, включая попытки подставить тот же исходник с новым videoId.
- В journal state проверяет `record_media`: уже распознанные оригиналы с Data URL запрещены, а нераспознанный видеоисточник обязан иметь уникальный ID, правильный Data URL, SHA/размер, соответствующие отдельному pending payload. Старые видео без ID, скрытый binary, дубли и лишние вложения блокируются.
- `tests/video-archive-v2-restore-gate.test.mjs`: положительный read-only preflight и негативные случаи утери ledger, изменённой истории, alias SHA, распознанных Data URL, несовпадения байтов/хэша, orphan, дубликатов, неизвестной кодировки. **Никаких транзакций/импорта/удаления:** результат всегда `restoreAuthorized:false`, `archiveSafe:false`, `requiresAtomicCommitCheck:true`.
- Это не переносит проверку в реальную write-транзакцию, не закрывает staged/rollback/backup-history и ещё не интегрировано с UI. Следующий этап: совместимый атомарный протокол чтения всех protected stores перед commit и интеграция с активным runtime/разными цепочками PR; физический Android тест. CI итогового SHA проверить отдельно.

---

## Контрольная точка — повторная проверка snapshot после SHA (2026-11-20)

- В зависимой ветке `feat/video-archive-v2-posthash-recheck-2026-11-20` поверх PR #221 создан изолированный `js/video-archive-v2-export-candidate.js`. Метод получает согласованный snapshot, формирует PASEKA02 через отдельный codec, затем делает **повторную атомарную readonly-сверку** state, ledger и входных видеометаданных, заново хэширует исходные Blob и отменяет результат при изменении, конфликте с распознаванием или подмене байтов при старом хэше.
- Добавлен `tests/video-archive-v2-export-candidate.test.mjs` с моделированием гонок после первого SHA: новое распознавание, изменение revision, изменение/подмена видеобайтов, добавление ещё одного оригинала; проверяется сохранность живого Blob при отказе. Положительный тест возвращает только `postHashRecheckPassed:true`, но всегда `requiresWriterFence:true`, `archiveSafe:false`, `restoreAuthorized:false`.
- **Это оптимистическая read-only сверка, не постоянная блокировка записи**: после неё другой writer может изменить данные. Активный export/download, backup/restore/rollback и автоматическое удаление не подключены; Android Gallery и старые staged copies остаются отдельными блокерами. CI нового SHA проверить отдельно.

---

## Контрольная точка — атомарный read-only снимок для архива v2 (2026-11-20)

- В зависимой ветке `feat/video-archive-v2-consistent-read-2026-11-20` поверх Draft #220 добавлен **не подключённый к рабочему экспорту** `js/video-archive-v2-snapshot.js`. Он считывает state, `main/video_recognition_ledger_v1` и все `entrance_media` в одной IndexedDB readonly-транзакции, не используя хэши из несогласованных раздельных чтений.
- При отсутствии ledger, повреждении state или отсутствии в метаданных Blob подтверждённого `blobSha256` и `bytes` операция отказывает; если в ledger есть запись о распознавании того же видео, сохранённый оригинал блокирует подготовку архива. Ни один исходный Blob не удаляется.
- Добавлен `tests/video-archive-v2-snapshot.test.mjs`: одновременное чтение, конкурентная readwrite-запись после начала snapshot, отсутствие/повреждение ledger, отсутствие SHA, конфликт tombstone/оригинала, отсутствие магазинов и неверная схема.
- Важно: успешный snapshot сам по себе **не делает архив безопасным** после асинхронного SHA и не подтверждает отсутствие staged/rollback/внешних Android-копий. Метод всегда возвращает `archiveSafe:false`, `restoreAuthorized:false`, `needsPostHashRecheck:true`. Интеграции с codec и живым export/import пока нет. Тесты/CI итогового SHA проверить отдельно.

---

## Подтверждение кодовых тестов PASEKA02 journal adapter (2026-11-20)

- На кодовом SHA `efd3ee1a795740bbde324edb64fb21ba6728a7e2` Fast quality checks завершились **completed/success**, workflow GitHub CI; после добавления итоговых документов Android и новый итоговый HEAD сверить отдельно.
- Исправлено нарушение регрессии из #44675892008 (`1/799`): прямой `pendingVideos[source=record_media]` запрещён; только SHA-verified адаптер может сформировать journal video. Добавлен отдельный тест прямой инъекции.
- `stateAndLedger` теперь отдельно распознаёт `kind='video'` даже без известного MIME и блокирует неизвестную кодировку при отсутствии адаптера. Новые тесты включены в успешный прогон.
- Изолированный codec всё ещё не имеет согласованного IndexedDB snapshot/commit/rollback и НЕ является рабочим backup/restore. Автоудаление не включено; `main`, production, пользовательские записи не менялись.

---

## Исправление регрессии PASEKA02 record_media (2026-11-20)

- Первый Fast quality run #44675892008 на кодовом SHA `8fa9f26ca5c3fdddde4f70d0715b1b6d9d1dfd6c` завершился **failure: 1/799**: предыдущая защита не позволяла передавать произвольный `record_media` Blob без доказанного Data URL, а новая интеграция ошибочно пропускала его.
- В `js/video-archive-v2-metadata-codec.js` восстановлен fail-closed контракт: входной параметр `pendingVideos` допускает только `entrance_media`; `record_media` может быть сформирован только опциональным, проверяющим SHA-256 журналовым адаптером. Добавлен тест на попытку прямой инъекции Blob. Новая CI-проверка обязательна.
- Включение рабочего импорта/удаления не производилось.

---

## Контрольная точка — интеграция journal video в изолированный PASEKA02 кодек (2026-11-20)

- В зависимой ветке `feat/video-archive-v2-record-codec-2026-11-20` поверх Draft PR #219 codec PASEKA02 опционально вызывает тестовый record-media adapter, извлекает проверенные Data URL журналовых видео в отдельные Blob entries типа `record_video` и восстанавливает их после повторной SHA-256 проверки; фотографии остаются частью state.
- Поддерживаются `data:video/*;base64` и подтверждённый источник `data:application/octet-stream;base64`, идентичности `entrance_media` и `record_media` не смешиваются. Без адаптера старое поведение безопасного отказа сохраняется.
- В `tests/video-archive-v2-record-codec.test.mjs` добавлены сквозные тесты чистого кодека: журналовый и смешанный roundtrip, Android MIME, tombstone, отказ без адаптера, повреждение Blob и неправильный размер. Все изменения пока изолированы от IndexedDB и интерфейса; не являются рабочим backup/restore и не разрешают delete.
- CI проверять на точном SHA. Следующее — ограничение повторного появления через импорт, согласование ledger с работающими writer-путями и атомарный восстановительный протокол; отдельный Android-тест. Запрет merge/deploy/main сохраняется.

---

## Исправление CI адаптера журнала — источник потокового SHA (2026-11-20)

- Первый Fast quality run #44675711627 для кодового SHA `a6e9fafb9f40f286fd4b59ce86b9d8afe2019060` завершился **failure: 7/792 тестов**, все семь регрессий адаптера выдавали `V2_RECORD_ADAPTER_UNAVAILABLE`. Причина — архивная ветка не содержала `hashVideoDataUrlHex`, внедрённый ранее в параллельном видео Draft PR #213.
- В `js/paseka-sha256.js` аккуратно перенесена именно потоковая функция SHA-256 для исходных Base64 Data URL без изменения `hashBlobHex`. Следующий CI проверить именно для нового SHA; исходный неуспешный прогон не скрывать.
- Полный архив v2/интеграция с runtime/удаление не активированы.

---

## Контрольная точка — изолированный адаптер видео журнала для архива v2 (2026-11-20)

- На базе Draft PR #218 создана ветка `feat/video-archive-v2-record-media-adapter-2026-11-20`. В `js/video-archive-v2-record-media.js` добавлен автономный, НЕ подключённый к текущему архиву адаптер: из `records[].media[]` с `kind=video`, `videoId`, `sourceSha256`, `sourceBytes` и Base64 Data URL извлекаются оригинальные байты только неопознанных видео, подтверждаются SHA-256 и затем могут быть восстановлены без потери фотографий или структуры журнала.
- В состоянии для будущего codec используется временный маркер `archivePendingVideoV2`, `data:null`; реальная запись не мутируется. Результат нельзя использовать для сохранения или восстановления до совместимого кодека и защиты атомарного снимка. Распознанный оригинал, legacy без identity, конфликт хэша и подозрительная непрозрачная кодировка блокируются.
- `tests/video-archive-v2-record-media.test.mjs` проверяет точные байты, восстановление, Base64 с несколькими чанками, фото, дубли, legacy, tombstone, повреждение и незаявленные видеовложения. Кодек PASEKA02 ещё НЕ вызывает адаптер, поэтому не является полноценным журналовым backup. CI окончательного SHA подтвердить отдельно.
- Без удаления видео, без изменения старого v1, `main`, пользовательских данных, production или слияния PR. Следующее: после подтверждения CI безопасно интегрировать адаптер в v2 codec и добавить сквозные тесты, затем согласовать состояние IndexedDB/rollback и Android.

---

## Дополнение — строгий запрет непрозрачных полей ledger (2026-11-20)

- Аудит изолированного v2 обнаружил риск бесшумного JSON-преобразования вложенного `Blob` в пустой объект. `js/video-archive-v2-guard.js` теперь отклоняет непрозрачные типы внутри результата, незнакомые поля ledger и записей; `tests/video-archive-v2-guard.test.mjs` содержит прямую регрессию.
- Проверки CI необходимо сверить на новом кодовом и окончательном SHA; ранее успешный run не подтверждает эти последние изменения.

---

## Контрольная точка — перенос необработанных летковых видео в изолированном v2 (2026-11-20)

- Поверх Draft PR #217 создана ветка `feat/video-archive-v2-pending-entrance-2026-11-20`. `js/video-archive-v2-metadata-codec.js` расширен: разрешены **только** явно переданные `pendingVideos` из `entrance_media`, не имеющие результата распознавания в переданном ledger. Бинарные Blob переносятся отдельно от state, контроль целых исходных SHA-256 выполняется потоковым `PasekaSha256.hashBlobHex` при записи и при чтении.
- Результат read-only анализа возвращает Blob ожидающих распознавания видео, но всегда `restoreAuthorized=false` и `archiveSafe=false`; он не служит разрешением на удаление и не меняет IndexedDB.
- `record_media` Data URL, существующий runtime и конкурентные обновления источника не интегрированы: экспорт с журналовым видео продолжает безопасно отказываться. Не считаем этот кодек полноценной заменой backup. Предусмотрены тесты roundtrip, corruption/hash/tombstone/duplicate, неправильного размера и неподдерживаемого источника.
- CI на итоговом SHA требует отдельной проверки. Следующий этап: полное согласование record_media, подтверждённые источники SHA и snapshot/revision, staged commit/rollback, Android; никакого merge/production/delete.

---

## Контрольная точка — v2 metadata-only codec (2026-11-20)

- Создана зависимая ветка `feat/video-archive-v2-metadata-codec-2026-11-20` поверх PR #216. Отдельный изолированный `js/video-archive-v2-metadata-codec.js` создаёт и валидирует файл с сигнатурой `PASEKA02`, JSON state и целым ledger, проверяя SHA-256, размеры и структуру. Старый `.paseka` v1 не менялся.
- В целях защиты данных этот **промежуточный кодек не транспортирует ни входные video Blob, ни видео Data URL в state**; при их обнаружении отказывает. Это не полный архив v2, не путь для обычного полного backup, не restore/staging/commit и не разрешение удалять файлы.
- `tests/video-archive-v2-metadata-codec.test.mjs`: позитивный roundtrip и негативные тесты на коррупцию state/ledger, лишние байты, устаревший формат, бинарные поля, некорректный JSON и отсутствие криптографии. CI на итоговом SHA ещё проверяется.
- Следующая задача: безопасный полноценный транспорт ожидающих распознавания видео, совместимость `record_media`, согласование двух цепочек и проверка на Android. Слияние/production/deployment без разрешения не выполняются.

---

## Контрольная точка — изолированный валидатор метаданных архива v2 (2026-11-20)

- Поверх Draft PR #215 создана ветка `feat/video-archive-v2-ledger-validator-2026-11-20`. Добавлен независимый, **не подключённый к интерфейсу** модуль `js/video-archive-v2-guard.js` и `tests/video-archive-v2-guard.test.mjs`.
- Guard отклоняет повреждённый ledger, непроверенный SHA/размер результата, дубли video identity/result ID, видеобинарник внутри структурированного результата, попытку включить распознанный оригинал в набор архивных video payload. Функция намеренно возвращает `archiveSafe:false`; это не полноценная проверка исходных Blob, Data URL в state, staging или rollback.
- Кодек v2/изменение существующего архива, автоматическое распознавание и удаление видео НЕ реализованы. CI на точном HEAD подтвердить отдельно. Следующее: проверка тестов и интеграционный аудит v2 с исходными хэшами/байтами и импортом, без включения delete.

---

## Контрольная точка — контракт архива v2 для видео (2026-11-20)

- При повторной проверке обнаружено, что PR #214 дублирует часть #211. В PR #214 добавлено предупреждение о пересечении, merge не производится; приоритет — цепочка #210 → #211 → #212 и отдельный видео PR #213.
- В ветке `docs/video-archive-v2-contract-2026-11-20` поверх #212 создан `docs/VIDEO-ARCHIVE-V2-CONTRACT.md`: новый формат с переносом полного ledger/tombstones, запретом включения распознанных оригиналов, защитой от восстановления старых Blob, атомарными правилами commit/rollback, Android и миграционными тестами. **Только проект контракта; код архива v2 не реализован.**
- Следующий шаг: отдельный проверяемый v2 validator/codec и тесты, затем интеграция с UI и видеоцепочкой, физический Android тест. Автоудаление выключено, production и main не изменены.

---

## Дополнение к PR #212 — аудит осиротевших видеокопий (2026-11-20)

- Исправлен `inspectStagingRecognitionCopies(db)` в `js/paseka-archive-restore.js`: прежде он рассматривал только видеокопии staging, для которых сохранился `kind=session` header. Теперь только по индексным **ключам**, без загрузки Blob в память, проверяются и видеокопии с потерянным заголовком. Такие копии получают `status='orphaned_header'`, `missingSessionHeader=true` и `action='manual_review_required'`.
- В отчёт добавлены `orphanedMatchedCopies`, `unclassifiedVideoKeyCount`, `requiresManualReview` и явное `identityVerifiedByBytes=false`. Один `videoId` без доказательства идентичности SHA-256 **не даёт права удаления**. Ссылки из `archive_history` остаются помеченными как защищённые. Дубли идентичностей ledger и неподдерживаемые cleanup-состояния приводят к fail-closed ошибке.
- В `tests/archive-staging.test.mjs` добавлены регрессии на удалённый header с сохранённым staged Blob, orphan с архивной историей, duplicate ledger identity и неподдающиеся классификации ключи. Проверяется, что отчёт не меняет временные записи и ledger.
- Кодовый SHA `cf4d71aa254e9dc49656e41f681f98aca962c35c`: [полный регрессионный job #44672535903](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44672535903) **completed/success**. Android CI на кодовом и итоговом документационном SHA проверять отдельно.
- Автоматическая очистка, привязка результата к хэшу исходного видео и транспорт `ledger/tombstone` в переносимом архиве остаются блокерами. PR #212 Draft, main/production/физические архивы/данные не менялись и не удалялись.

---

## Дополнение к PR #212 — повторная очистка без записей (2026-11-20)

- `discardArchiveRestoreSession` после чтения индексных ключей возвращает `false`, если staging-сессия уже пуста; операция **ничего не удаляет** и не ошибается лишь из-за сохранившейся в `archive_history` ссылки. Если хоть одна запись есть, полные проверки ownership/kind/history продолжают действовать в единой readwrite-транзакции.
- Добавлен регрессионный тест `tests/archive-staging-cleanup-status.test.mjs` на двукратный повтор пустой очистки при наличии старой ссылки из истории.
- Кодовый SHA `6a699d3c10ca43658a5554a52f0b8017837ce4b6`: [complete regression #44672319861](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44672319861) **completed/success**; Android CI и проверка итогового документационного SHA требуют отдельного подтверждения.
- Автоудаление после распознавания не подключено. Основной оставшийся блокер: `video_recognition_ledger_v1` не содержит подтверждённой привязки к хэшу байтов, а `.paseka` v1 не сохраняет ledger/tombstone; поэтому автоматическая очистка остаточных staged-копий не разрешена.

---

## Контрольная точка — защита истории при очистке archive_staging (2026-11-20)

- Создан зависимый Draft PR #212 поверх #211: ветка `fix/archive-staging-history-protection-2026-11-20`. `main`, production, реальные пользовательские записи и архивы не изменялись.
- Исправлен `discardArchiveRestoreSession` в `js/paseka-archive-restore.js`: прежняя реализация проверяла `archive_history` только для staging без заголовка; теперь ссылка на импорт или rollback проверяется **для каждого случая** в одной IndexedDB readwrite-транзакции с возможной очисткой. Статусы `failed`/`ready`/`staging` не обходят защиту истории. Завершённый `reverted` импорт допускает прежнюю явную очистку лишь при `status=reverted` в истории, `rollbackAvailable=false`, отсутствии ссылки на rollback session и точном `backupId`.
- Добавлена fail-closed проверка `sessionId`, заголовка `session.sessionId/backupId`, всех primary keys и соответствующего `kind` по вторичным индексам **без чтения видео Blob**. Неизвестные/перепутанные записи, включая `rollback_video` в чужой сессии, не удаляются; отсутствие индекса `kind` приводит к безопасному отказу.
- Новые регрессии в `tests/archive-staging-cleanup-status.test.mjs`: защита ссылки history даже при повреждённом статусе, корректный полностью завершённый rollback, конфликт `backupId`, cross-session key, подмена `kind`, старый IndexedDB без обязательного индекса и неправильный sessionId. `tests/archive-restore-atomicity.test.mjs`: синтетический header приведён к действительной форме с `backupId` (защитный код не ослаблен).
- Кодовый SHA `dfa7957cf111a0b055f2122e0cb5b5de81a5d50f`: [complete regression #44672101794](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44672101794) **completed/success**. Android CI на этом SHA проверять отдельно; документационный HEAD потребует собственного CI.
- **Что не сделано:** автоматическое удаление видео после распознавания, проверка идентичности байтов для staging-копий, транспорт ledger/tombstone в `.paseka` и физическая Android-проверка. Новый код усиливает существующую ручную очистку; без полноценного протокола он не является разрешением удалить оригинал или резервную копию. `main` не менялась, PR Draft, merge/deployment отсутствуют.
- Следующий этап: безопасный недеструктивный план идентификации staged-копий по подтверждённому результату и хэшу содержимого; только после согласования архивного формата и восстановления — проверенная селективная очистка с retry и регрессионными сценариями после обрыва.

---

## Контрольная точка — предотвращение повторной готовности staging и аудит остаточных видео (2026-11-20)

- Создан зависимый Draft PR #211 поверх #210, отдельная ветка `fix/archive-staging-finalize-ledger-2026-11-20`. Основная ветка `main` не менялась.
- `js/paseka-archive-restore.js`: `updateSession` проверяет `main/video_recognition_ledger_v1` в общей readwrite-транзакции, прежде чем присвоить `ready` (также при идемпотентном повторе). `finalizeStagedArchive` проверяет тот же ledger непосредственно в своей readwrite-транзакции после полной проверки снимка, в том числе когда сессия уже была `ready`. Если распознавание завершилось в промежутке — `VIDEO_LEDGER_NOT_PRESERVED`, без новой записи/смены состояния.
- Добавлен `inspectStagingRecognitionCopies(db)`: **только чтение** ключей staging и метаданных ledger; возвращает число копий с подтверждённым распознаванием и tombstone, наличие ссылок архивной истории и `manual_review_required`. Не удаляет Blob, журнал, историю, rollback snapshot или исходный архив и не выдаёт `archiveSafe`.
- `tests/archive-staging.test.mjs`: новые реальные fake-indexeddb тесты перезапуска/явной финализации с новым ledger, повторной проверки уже готовой сессии, гонки после последнего video, обнаружения stale staged copies и полной неизменности Blob/ledger, испорченного ledger и старой базы.
- **Ограничения:** audit не является механизмом автоматического удаления. Ранее созданные копии в `archive_staging` сохраняются; пользовательские архивы и old backup не переписываются. Формат `.paseka` v1 не переносит ledger/tombstone. Полная пофайловая интеграция с видеоцепочкой #205–#209, архив v2 и физические Android проверки остаются отдельными задачами.
- CI оценивать только на точном HEAD #211. Не объединять PR и не развёртывать production без отдельного разрешения.

---

## Архивный PR #210 — атомарный барьер записи staging после распознавания (2026-11-20)

- В `js/paseka-archive-restore.js` функция `putStagingEntryAndUpdateSession` читает `main/video_recognition_ledger_v1` **в той же IndexedDB readwrite-транзакции**, в которой создаёт каждый staged-оригинал и увеличивает `stagedCount`. При подтверждённом результате распознавания или повреждённом журнале операция abort; новая видеокопия не записывается.
- Новый тест `tests/archive-restore-atomicity.test.mjs` моделирует запись результата распознавания после первой видеокопии при многофайловом импорте и подтверждает, что следующая копия не записана, сессия помечена failed и ранее сохранённый ledger остаётся.
- Это расширение preflight из предыдущего этапа. **Открытый риск:** оригиналы, скопированные в `archive_staging` *до* завершения распознавания, сохраняются до безопасной очистки staging. Не удалять/не считать удалёнными source, архив, медиа и recovery snapshot без полного транзакционного протокола. Также требуется запрет подтверждения статуса ready при обнаруженном ledger и сценарии restart/retry.
- Исходный archive v1 всё ещё не переносит `video_recognition_ledger_v1` и tombstone; при непустом ledger импорт/откат/экспорт блокируются. Архивную ветку #168 и видеоцепочку #205–#209 нельзя сливать автоматически: требуется аккуратное согласование и сквозное тестирование.
- PR #210 остаётся Draft. Кодовый SHA этой доработки `7ab2d4382d0abf46f39536130bafc6c3da6581bc`; точные результаты CI указывать по GitHub после завершения. Ни production, ни пользовательская пасека не изменены, данные не удалялись.

---

## Архив PR #210 — запрет подготовки несовместимого импорта (2026-11-20)

- Функция `stageArchiveForRestore` теперь проверяет `main/video_recognition_ledger_v1` до разбора архива и повторно после асинхронной проверки, перед записью в `archive_staging`. При наличии результатов распознавания или повреждённом ledger подготовка v1 не начинается, чтобы не создавать управляемые дубли старых видео.
- Добавлены регрессионные тесты: старый архив с непустым ledger не создаёт staged entry; повреждённый ledger не переписывается.
- **Остаточный риск:** распознавание может завершиться уже во время многотранзакционной подготовки. Поштучная атомарная сверка ledger и очистка временных записей при сбое пока не реализованы; нельзя считать защиту всех staged-копий завершённой. Финальный импорт и откат дополнительно защищены проверкой в readwrite-транзакциях.
- Порядок приоритета: добавить transaction-level ledger guard для `putStagingEntryAndUpdateSession`, проверить resume/recovery и безопасную очистку временных копий без удаления источников и резервных копий; затем вводить перенос истории/tombstone в новую версию архива.
- Все изменения находятся в зависимом Draft PR #210 поверх #168. CI нового HEAD требует повторной проверки, main/deploy не затрагиваются.

---

## Контрольная точка — fail-closed полная архивация и восстановление видео (2026-11-20, Draft PR #210)

- Отдельная зависимая ветка от архивного Draft PR #168: `fix/full-archive-video-ledger-interlock-2026-11-20`. Видеостек #205→#209 **не объединён** с архивной веткой; изменение минимально и не переносит неподтверждённую модель удаления.
- `js/paseka-archive.js`: `readConsistentDatabaseSnapshot` читает `main/video_recognition_ledger_v1` в одной readonly-транзакции с `state` и `entrance_media`. Архив v1 не создаётся, если журнал распознавания не пуст или повреждён, потому что формат не переносит его.
- `js/paseka-archive-restore.js`: в финальных readwrite-транзакциях `commitStagedArchive` и `rollbackCommittedArchive` читается тот же ключ; в случае результатов распознавания или повреждённого журнала импорт/откат отклоняются без изменения `state`, `entrance_media`, `full_backup`, `archive_history` и staging. Проверка именно внутри write lock предотвращает потерю результатов при гонке с распознаванием.
- `tests/archive-export.test.mjs` и `tests/archive-restore-atomicity.test.mjs`: новые тесты проверяют распознанные/повреждённые результаты, сохранение прежнего поведения при пустом ledger, необратимость импортного overwrite и rollback при изменении ledger после подготовки, неизменность данных при отказе.
- **Это защитное ограничение, а не финальный формат архива.** Экспорт результатов и tombstone в `.paseka` отсутствует. Существующие архивы и оригиналы не стираются. Полное восстановление не может безопасно заменить данные при непустом ledger до проектирования следующей версии совместимого архива. Удаление видео по распознаванию не включено.
- CI на точном итоговом SHA должен быть отдельно проверен. `main`, production, физическая пасека и пользовательские данные не затронуты; PR #210 Draft, merge/deployment не выполнялись.
- Следующее: согласовать полноценный перенос `ledger/tombstone` через новую версию `.paseka` и все стадии (export, validation, stage, commit, rollback), затем сквозные тесты восстановления, отдельных backup-файлов, Android и внешних копий камеры.

---

## Контрольная точка — CI исправления истории rollback (2026-11-19)

- Актуальный GitHub main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`, не изменён.
- Основной Draft PR #168: HEAD `13137de26c6e756c144c84adde2851712c661775`, base main, `mergeable=true`.
- Исправление renderer истории в `index.html` использует `backupId || sourceBackupId`; регрессионный тест `tests/archive-restore-history-ui.test.mjs` входит в PR #168.
- Android workflow #44467107603 на точном HEAD #168 завершился `success`: **731/731 tests passed, 0 failures**, Capacitor sync, Gradle Debug APK build и artifact upload — success. Job ID `135369261478`.
- Artifact `paseka-debug-apk`, ID `14502782884`, size 3,451,620 bytes, ZIP SHA-256 `37e5378b362e4850685c727a69baaa7ea9d66458d7276ee6b0c1f74cbc32e139`, expires 2026-12-03. Это обычная Debug APK; не использовать для установки на телефон вместо изолированной test4.
- Физический commit/rollback ранее подтверждён на изолированной test3. Проверка исправленного отображения после rollback на test4 ещё не завершена.
- PR #174: HEAD `82afa8e4feaa9ebdabd4bf99ca7671a0b91fc842`, Draft, `mergeable=false`, base PR #168 на старом SHA `c7199c61f7161fc4b542e35d77f9318310939c37`. Ветку не сливать; она используется только для изолированной сборки. Триггер CI после обновления test4-теста ожидается.
- Lovable project `8193a703-9f20-4dc8-9460-8d93225ea25f`: `needs_attention / out_of_credits`, latest commit `2196e3fd478fbb58810d6a78317c0ddd056dfdef`; этот SHA не найден в GitHub Pasekaapp, синхронизация с репозиторием не подтверждена.
- Следующий шаг: подтвердить изолированный workflow и артефакт с package ID `ru.paseka.journal.archive.test4`; затем физически проверить отображение исходного backup ID после rollback. Test2/test3 и их данные не удалять. Не выполнять merge, публикацию или production deployment.

---

## Контрольная точка — исправление истории отменённого импорта архива (2026-11-19)

- После физического испытания commit/rollback на OnePlus 10 Pro 5G обнаружено, что отменённая staging-сессия хранит исходный идентификатор архива в `sourceBackupId`, тогда как renderer читал только `backupId` и показывал `Архив undefined`.
- Исправлено в `index.html`: отображение истории использует `backupId`, затем `sourceBackupId`, и только при отсутствии обоих — явный текст «идентификатор не сохранён».
- Добавлен `tests/archive-restore-history-ui.test.mjs`, проверяющий отображение исходного ID после rollback.
- Перенос исправления выполнен непосредственно в основной feature PR #168, а не оставлен только в test-only PR #174. Коммиты исправления: `a84b6afbe32cd28b77e0ed437079317944fca600` и `d4cc8a9b26344cc0cb11bd5a190f1cc11a28b0d0`.
- CI после последнего изменения ожидается; до его завершения не считать исправление проверенным. PR #168 остаётся Draft, main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не изменялась.
- Физически подтверждены экспорт, preflight/staging, commit и rollback на изолированной test3; новые данные тестового приложения восстановлены. Test2/test3 сохраняются. Test4 предназначен для повторной проверки исправленной истории; не использовать рабочее приложение и не удалять тестовые установки.

---

## Контрольная точка — защита новых записей от потери при откате архива (2026-11-19)

- Read-only аудит выявил опасный пробел: прежний rollback проверял соответствие переданной вызывающим кодом revision текущей базе, но не сравнивал текущую revision с revision, созданной самим commit импорта. Поэтому после импорта новые записи журнала могли быть затёрты при откате.
- Исправление в `js/paseka-archive-restore.js`: Phase A проверяет, что текущая revision совпадает с `importedRevisionId` сохранённой committed import session; Phase B повторяет эту проверку внутри финальной readwrite-транзакции. Проверка в Phase B закрывает гонку, когда журнал изменяется во время асинхронной проверки rollback snapshot.
- При несовпадении возврат блокируется с кодом `ROLLBACK_STATE_CHANGED`; журнал, видео, история импорта и rollback snapshot остаются без изменений. UI сообщает, что новые записи сохранены и отмена заблокирована.
- Добавлены два регрессионных сценария: журнал изменён после импорта до вызова rollback; журнал изменён во время асинхронной проверки перед финальной транзакцией. Фикстура atomicity-тестов теперь содержит committed `importedRevisionId`.
- Дополнительно исправлен запуск isolated APK workflow: он выполняется только для pull request из ветки `test/full-archive-android-isolated-2026-11-18`; в PR #168 этот test-only workflow пропускается. Предыдущий запуск #44398348034 ошибочно упал на отсутствующем в PR #168 test-only script, хотя regression tests прошли 730/730; после gate новый запуск #44398558803 корректно skipped.
- На code/test commit PR #168 `e323ee7136e2d5377696c10eb10587aa5b29fa9b`: **730/730 tests passed, 0 failures**, Android Debug build/upload workflow #44398347933 — success. На синхронизированной тестовой ветке PR #174 commit `b116b93792289ed5bb69f408d98741b151a8cc3f`: **733/733 tests passed, 0 failures**, обычная Android Debug build/upload #44398375948 — success.
- После настройки workflow gate: PR #168 isolated workflow #44398558803 — skipped (ожидаемо); PR #168 standard Android build #44398558415 — success, 730/730 tests; PR #174 standard Android build #44398564428 — success, 733/733 tests; PR #174 isolated APK workflow #44398564375 — success, 733/733 tests, Gradle build, package ID assertion и upload. Artifact `paseka-archive-isolated-test-apk`, ID `14472093088`, размер 3,451,679 bytes, ZIP SHA-256 `35b11cd016a4bd0226c4d967ba2fba7b1ed783b341f5b6b398aeee82b537b352`, expires 2026-12-02 21:11:52 UTC; package ID `ru.paseka.journal.archive.test2`.
- Физическая проверка preflight на OnePlus 10 Pro 5G ранее завершена успешно; пользовательские рабочие данные не менялись. Commit/rollback на телефоне ещё не выполнялись.
- PR #168 и #174 остаются Draft; main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не менялась. Merge, публикация и production deployment не выполнялись.

---

## Контрольная точка — изолированная APK с исправленным Android-сохранением готова (2026-11-18)

- Изолированный test-only PR #174 пересобран поверх PR #168, package ID: `ru.paseka.journal.archive.test2`, имя: «Пасека — архив тест 2». Предыдущее тестовое приложение остаётся отдельным и не затрагивается.
- Workflow #44389963111 на SHA `fd370ff3c89a34b4d218cfc3c6cfb06001cb7677`: **731/731 tests**, Android Gradle build, проверка package ID через `aapt` и upload — success.
- Artifact `paseka-archive-isolated-test-apk`, ID `14469105084`, SHA-256 ZIP `16008c7168df0b4e28364b3e0a61012f45c7c147fe3991d334a7636a0c7c7a48`, expires 2026-12-02 20:21:56 UTC. В APK непосредственно подтверждён package ID `ru.paseka.journal.archive.test2`; production ID отсутствует.
- В APK включён native MediaStore Downloads bridge; путь сохранения: `Downloads/Пасека`. CI подтверждает компиляцию и изоляцию, но не физическую запись файла на OnePlus.
- Для повторного теста нужно установить новую APK как отдельное приложение, создать тестовый улей (его имя присваивается автоматически), записать видео летка (оно сохраняется автоматически) и проверить, что файл появляется в `Загрузки/Пасека`. Старое тестовое приложение не удалять.
- После физической проверки скачать архив, проверить открытие файла вне приложения. Не запускать восстановление/rollback до подтверждения экспорта и проверки файла.
- PR #168 и #174 остаются Draft; main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не менялась.

## Контрольная точка — исправление сохранения полного архива на Android (2026-11-18)

- По физическому тесту пользователя на OnePlus выяснено: архив формировался (UI показывал 1 видео летка, 2.6 МБ), но файл не появлялся. Причина в прежнем UI-коде: он создавал `blob:` URL, нажимал скрытую HTML-ссылку и сразу сообщал об успехе, не подтверждая, что Android WebView сохранил файл.
- Добавлен Android native Downloads bridge: generated Capacitor `MainActivity` регистрирует ограниченный JS interface, который потоково пишет файл блоками по 256 KiB через MediaStore в публичную папку `Downloads/Пасека`. Используются `IS_PENDING` до успешного завершения и удаление незавершённого файла при ошибке. Временные и пользовательские записи IndexedDB не затрагиваются.
- Android UI теперь сообщает об успехе только после того, как native bridge закрыл поток и снял `IS_PENDING`. При ошибке показывает конкретное сообщение. В обычном браузере остаётся download-link fallback.
- Добавлены: `js/paseka-android-download.js`, `scripts/prepare-android-archive-download.mjs`, `tests/android-archive-download.test.mjs`; обновлены `index.html`, `sw.js`, Android CI workflows и UI tests.
- Первый Android build выявил ошибку экранирования регулярного выражения в Java; исправлена. Финальный code/test SHA: `661ea9ad602bacdee3ab096a668fcbc56b167ec2`.
- Fast Quality Checks #44388526905: **728/728 tests, 0 failures**.
- Android build #44388526739 на том же SHA: Gradle Debug APK build/upload — success. Артефакт `paseka-debug-apk` ID `14465919073`, SHA-256 ZIP `d29002a7435fd99ccce7c8fb8b23f1006a40ded3e7bbf1977e2b8938700f026d`. Это сборка с production package ID `ru.paseka.journal`; **не устанавливать её на устройство для тестирования**.
- Требуется новая изолированная APK с отдельным package ID для физической проверки сохранения в Downloads. После неё проверить фактическое появление файла и размер, затем открытие архива вне приложения. Восстановление и rollback пока не запускать.
- PR #168 остаётся Draft; main не менялась, merge/deployment не выполнялись.

## Контрольная точка — подготовлена изолированная APK для проверки полного архива на OnePlus (2026-11-18)

- Для физической проверки PR #168 создан отдельный test-only Draft PR #174, ветка `test/full-archive-android-isolated-2026-11-18`, stacked поверх PR #168. Его workflow не меняет production appId: создаёт пакет `ru.paseka.journal.archive.test` только в CI workspace и проверяет application ID в готовом APK через Android `aapt`.
- Isolated archive workflow #44384033966 на SHA `9a688ba9746f781921f605eb6ba34a05607ad0c4`: **726/726 tests, 0 failures**, Android Debug APK build и package ID assertion — success.
- Artifact `paseka-archive-isolated-test-apk`, ID `14466525052`, ZIP SHA-256 `fee50ea2c5be4c1b07d86d524282f55d26c06fbc4946d69d876e8aed23e2eed1`, expires 2026-12-02 19:49:34 UTC. Workflow: https://github.com/250oisr-eng/Pasekaapp/actions/runs/44384033966
- Package ID в APK подтверждён: `ru.paseka.journal.archive.test`; production package `ru.paseka.journal` не используется. Приложение устанавливается отдельно от рабочей и прежней тестовой версий.
- Основной PR #168: последний code/test SHA `b0be11442083c2a3cc639d22b6bfee1b6910282f`; Fast Quality #44383207248 и Android #44383207220 прошли **723/723 tests**, APK build/upload success. Последующие коммиты в PR #168 — документационные и workflow-only.
- Физический тест экспорта, открытия файла вне приложения, восстановления и rollback на тестовых данных ещё не выполнен. Не использовать рабочее приложение или пользовательскую базу. Не сливать PR #168/#174 и не публиковать приложение.

## Обновление — IndexedDB v5 и регрессионные тесты (2026-11-18)

- Исправлено расхождение: приложение открывает IndexedDB версии 5; переход v4→v5 не создаёт stores и не преобразует пользовательские записи, но инициирует `versionchange`, чтобы старые вкладки закрыли подключения перед восстановлением.
- Добавлен тест v4→v5 с проверкой `main/state`, `full_backup/previous`, Blob в `entrance_media`, archive staging/history stores и сохранения legacy-видео без скрытой перезаписи. Обновлены проверки версии UI/видеомодуля и Service Worker cache v315.
- Итоговый code/test SHA: `b0be11442083c2a3cc639d22b6bfee1b6910282f`.
- Fast Quality Checks #44383207248 на этом SHA: **723/723 tests, 0 failures**.
- Android workflow #44383207220 на том же SHA: regression tests и подготовка web/Capacitor/Android прошли; Gradle APK build/upload ещё выполнялись на момент записи.
- Предыдущий промежуточный SHA `be18ddb151ee0ff86cff28296512c899ad95a8a8` имел 4 ожидаемо устаревших тестовых assertions (DB v4 и cache v314); все четыре исправлены. Не считать этот промежуточный прогон итоговым.
- Документация архива обновлена: IndexedDB v4 — добавление staging/history; v5 — versionchange barrier без структурной миграции; app schemaVersion остаётся 15.
- PR #168 остаётся Draft; main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не менялась. Физический Android экспорт/импорт ещё не проверен.

## Контрольная точка — защита от старых вкладок при восстановлении архива (2026-11-18)

- В аудите найдено несоответствие: комментарий в `commitStagedArchive` ссылался на закрытие старых вкладок повышением IndexedDB до v9, но приложение фактически открывало БД версии 4. Следовательно, вкладки старого кода могли остаться открытыми; защита от конкурентной legacy-записи видео не соответствовала комментарию.
- Исправление: IndexedDB object-store version повышена с 4 до 5. Новых object stores, индексов, преобразования записей или изменения app `schemaVersion=15` нет. Цель повышения — вызвать стандартное событие `versionchange`, чтобы старые подключения закрылись до восстановления; обработчик приложения дожидается очереди сохранения.
- Добавлен регрессионный тест upgrade v4→v5: проверяет сохранность `main/state`, `full_backup/previous`, оригинального Blob в `entrance_media`, всех staging/history stores и отсутствие принудительной перезаписи legacy-видео.
- Обновлён тест UI на IndexedDB v5 и Service Worker cache v315, чтобы офлайн-клиент получил обновлённый HTML.
- Изменены: `index.html`, `js/paseka-archive-restore.js`, `tests/indexeddb-startup-guard.test.mjs`, `tests/archive-ui-integration.test.mjs`, `sw.js`.
- Новый code/test SHA: `be18ddb151ee0ff86cff28296512c899ad95a8a8`. Fast Quality Checks #44382917507 и Android workflow #44382917325 выполняются; результаты ещё не подтверждены.
- PR #168 остаётся Draft. Main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не изменена. До CI и проверки конфликта PR не считать этап завершённым.

## Контрольная точка — PR #168: полный архив и проверка целостности (2026-11-18)

- Main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`.
- PR #168 остаётся Draft на ветке `feat/full-media-backup-restore-main-2026-11-18`. Последний проверенный code/test SHA: `52e587aa1f3e24c3f0de7aa221a8323d4cc7af51`.
- Fast Quality Checks #44333118570 на точном SHA: **722/722 tests, 0 failures**.
- Android PR workflow #44333131328 на том же SHA: **722/722 tests**, Debug APK build/upload success. Artifact ID `14439657825`, размер 3,446,813 bytes; ZIP SHA-256 `31658a873bc27fa4fabf127ba843c0f393b5e208ad321f2bb0f7595bbc2ed55b`.
- Защита данных: новые видео сохраняются с SHA-256; rollback восстанавливает legacy-видео с заново проверенной суммой; импорт проверяет revision, staged content, видео и выполняет замену атомарно.
- Защита экспорта: предыдущий Blob архива сбрасывается при каждом новом экспорте; Blob удерживается только если браузер поддерживает отправку файла; сообщения о fallback выводятся в статус экспорта.
- PR #169 остаётся Draft и зависит от #168; его ветка основана на более старом HEAD #168 и требует синхронизации после завершения текущего этапа.
- Не выполнены физическое скачивание/открытие/восстановление .paseka на Android. CI APK не заменяет проверку Android WebView/SAF.
- Merge, publish, production deployment и операции с пользовательскими данными не выполнялись.

---

## Уточнение статуса проверок — code/test SHA и документационный HEAD (2026-11-18)

- Последний SHA, на котором изменялись код и тесты PR #168: `3436c621c5de175259a0cf112feeaba84984bd5d`. На нём Fast Quality Checks #44331728300 и Android PR workflow #44331737784 прошли: 721/721 tests; Debug APK build/upload success, artifact 14439701927.
- После этих проверок добавлен отдельный documentation-only checkpoint. Не смешивать code/test SHA с текущим PR HEAD; актуальный PR HEAD всегда сверять через GitHub перед продолжением.
- После code/test SHA `3436c621c5de175259a0cf112feeaba84984bd5d` добавлены только документационные коммиты. Android workflow #44332204313 запускался на промежуточном documentation-only HEAD; он не меняет результат code/test проверок на `3436c621c5de175259a0cf112feeaba84984bd5d`.
- PR #168 остаётся Draft. Merge, publish и production deployment не выполнялись.

---

## Контрольная точка — PR #168: контроль целостности видео и CI (2026-11-18)

- GitHub main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`.
- PR #168 открыт, Draft, mergeable=true. Последний проверенный code/test SHA: `3436c621c5de175259a0cf112feeaba84984bd5d`; последующие изменения после него — только документация. Main не менялась.
- Fast Quality Checks #44331728300 на точном HEAD: **721/721 tests, 0 failures**.
- Android PR workflow #44331737784 на том же HEAD: **721/721 tests**, Debug APK build и upload успешны. Artifact `paseka-debug-apk`, ID `14439701927`, размер 3,446,730 bytes; SHA-256 ZIP-артефакта `d44c47515bc61599b5fdc3f93e6ac13287031a9da0e1a4acd4f662470d39b3fd`.
- Дополнительная защита: новые видео сохраняются с вычисленным SHA-256; при rollback для восстановленного legacy-видео записывается только что проверенная контрольная сумма. Добавлены тесты для same-size replacement и восстановления legacy media.
- PR #169 остаётся Draft и зависит от #168. Его HEAD `308b2f02ba218eef0f10197a7c5c97d2bd592c17` основан на прежнем #168 HEAD `cee7f51ce55490507ed6dea51939139b974d46c8`; сравнение с текущим #168 HEAD показывает diverged: 12 ahead / 6 behind. После завершения #168 требуется безопасно перенести навигационные изменения на актуальную базу, не теряя их.
- Не проверялись физическое скачивание/открытие .paseka и восстановление на реальном Android-устройстве. PR остаётся Draft; merge, publish и production deployment не выполнялись.
- Следующий этап: независимый code review PR #168; затем физический Android smoke test на тестовых данных; после этого синхронизировать зависимый PR #169.

---

## Контрольная точка — PR #168: полный архив медиа и атомарное восстановление (2026-11-18)

- Актуальный GitHub main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`. PR #154 действительно merged; merge commit совпадает с этим SHA. PR #154 code/test HEAD `2b66cd59e4acf05adb44b40b0991ecff56154d56`: 611/611 tests, Android Debug APK success; это проверки PR HEAD, а не отдельные workflow на merge SHA.
- Новый Draft PR #168 основан непосредственно на main, без отставания на момент создания. Текущий branch: `feat/full-media-backup-restore-main-2026-11-18`. Старая цепочка PR #9–#40 целиком не сливалась.
- Перенесены отдельные архивные модули codec, SHA-256, staging и atomic restore/rollback из проверяемой старой ветки #40; код интегрирован поверх актуального main. Старый CI #40 на SHA `52f43ed29d7037401c04526938f5230b5f7f675c` не заменяет проверку новой базы.
- Добавлен переносимый `.paseka`: единый readonly snapshot `main` + `entrance_media`; state JSON и отдельные оригиналы видео; SHA-256 по блокам 1 MiB; ограничение путей/размеров/метаданных; импорт сначала в persistent staging; атомарная замена только после явного подтверждения; rollback прежнего state и видео с revision guard.
- IndexedDB object-store version 3→4: добавляются только `archive_staging` и `archive_history` с индексами. Существующие `main`, `full_backup`, `entrance_media` сохраняются; app schemaVersion не меняется; преобразования пользовательских записей при upgrade нет.
- JSON/automatic backup по-прежнему не содержат отдельные оригиналы видео. Подписи интерфейса уточнены, чтобы не называть JSON полной мультимедийной копией. Полный архив остаётся локальным: внешние сервисы, загрузка на сервер и платные зависимости не добавлены.
- Добавлены тесты формата, экспорта, SHA-256, staging, cleanup, atomicity, UI/offline и upgrade v3→v4 с сохранением существующих данных. Fast Quality Checks #44322389285 на SHA `6851bbc397674d2fdbe3a3819ab04cc0c7217a0b`: 715/715 tests, 0 failures. Android PR workflow #44325832906 на точном текущем HEAD `4386d3b38a1c31303e5f9b19ad3ce7cf51f1bb20`: 715/715 tests, 0 failures; Android Debug APK build/upload success; artifact `paseka-debug-apk`, ID `14436487643`, 3,446,523 bytes. Fast Quality Checks #44322389285 на code/test SHA `6851bbc397674d2fdbe3a3819ab04cc0c7217a0b`: 715/715, 0 failures. На промежуточном Android run #44322813466 также были успешны 715/715 и сборка APK. Старый CI PR #40 не использовался как доказательство совместимости с main.
- Lovable `Apiary Family Atlas`: опубликован, последний commit `2196e3fd478fbb58810d6a78317c0ddd056dfdef`, агент `needs_attention / out_of_credits`; синхронизация с GitHub main не подтверждена.
- Не выполнялись merge, публикация, production deployment, изменение production DB или операции с пользовательскими данными. Физическое Android-тестирование сохранения/открытия .paseka вне приложения остаётся отдельным release gate.

### Следующий шаг
Следующий шаг: независимый code review всего PR #168 и подготовка физической проверки Android: скачать .paseka, сохранить вне приложения, выбрать этот файл и выполнить тестовое восстановление на отдельном/пустом тестовом профиле без пользовательских данных. Текущий HEAD a5dfbda620feed2b9188bf82ddc3a62cb8ab21d9, main 8144ec8fe7e61c2f70f067c78f299bf0e7551dd7; PR #168 Draft, 12 commits ahead / 0 behind, mergeable=true. Android и quality workflows прошли на точном code/test HEAD. Lovable latest commit 2196e3fd478fbb58810d6a78317c0ddd056dfdef не совпадает с веткой PR; синхронизация не подтверждена. Не объединять без отдельного разрешения.
 
---

## Контрольная точка — OP-07 и резервная безопасность (2026-11-17)

- PR #154: code/test HEAD `2b66cd59e4acf05adb44b40b0991ecff56154d56`; Fast Quality Checks #44169456462 — **611/611 tests, 0 failures**; Android Debug APK PR run #44169468103 — success; push run #44169456444 — success.
- Добавлены два migration regression tests: schema 14→15 сохраняет существующий `sectionalTechProcesses`; неправильный тип блокирует миграцию без изменения исходного состояния. Сам migration guard уже присутствовал; его логика не менялась.
- Пользовательское правило OP-07: установка решёток/медовых корпусов либо одновременно со вторым рядом, либо через 12–15 дней после него. Код принимает 0/12/15 и отклоняет 11/16; `AFTER_OP06` остаётся отдельным source-backed сценарием.
- **Новый production blocker:** в текущем main ручной `downloadBackup()` экспортирует только `{app:'Paseka', state:S}`, а `writeAutoBackup()` сохраняет только `S`. Оригиналы видео находятся отдельно в IndexedDB store `entrance_media` и в эти копии не входят. В main нет интегрированного контейнера `.paseka` и staging-импорта; JSON-копия не является полным архивом мультимедиа.
- Полный архивный стек PR #9–#40 остаётся незлитым. PR #14 — корневой Draft, его ветка diverged: 96 commits ahead / 109 behind main; PR #40 содержит позднюю финализацию staging и проверку rollback ownership. Нужны отдельный аудит, перенос/rebase на актуальный main и повторный CI. Не сливать старую ветку как есть.
- В репозитории **93 открытых PR, все Draft**; 19 PR имеют base=main. Только #148 из корневых веток находится на актуальной базе (83 ahead / 0 behind); остальные 18 корневых веток diverged и отстают от main на 105–109 commits. Не закрывать и не объединять автоматически.
- Активная технологическая цепочка: #148 → #149 → #87 → #150 → #151 → #152 → #153 → #154; все остаются Draft, профиль секционного улья не активирован. Main: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- Следующий приоритет — восстановить полное резервное копирование и безопасное восстановление видео; журнал обработок Varroa отложен до закрытия этого пробела. Слияние PR, production и публикация требуют отдельного разрешения.

---

## Контрольная точка — OP-07: подтверждён срок 12–15 дней (2026-11-17)

- Пользователь подтвердил два допустимых варианта установки двух больших разделительных решёток и медовых корпусов: **сразу вместе со вторым рядом** (0 календарных дней) либо **через 12–15 календарных дней после второго ряда**. Диапазон — отдельное пользовательское уточнение; не приписывать его DOCX.
- `AFTER_OP06` сохраняется как отдельная последовательность по источнику P20–P23; она не подменяется двумя вариантами срока относительно второго ряда.
- В рабочей ветке `fix/op07-12-15-day-window-2026-11-17` обновлены OP-07 coordinator и регрессионный тест: completion guard и inspector сверяют фактическую разницу календарных дней с сохранённым evidence; разрешены только 0 дней для немедленного варианта и 12–15 дней включительно для отложенного. Интервалы 11 и 16 дней отклоняются с rollback.
- PR #154 открыт как Draft поверх PR #153: base SHA `ef8fe87fd3336cff82aa31b7c99064d930d016c8`, проверенный code/test HEAD `6dd961b2df6fd859da558806a4e1edcdbbd6587c`; после проверенного code/test HEAD добавлялись только документационные уточнения; код и тесты не менялись; mergeable=true. Workflow #44166954651 на точном HEAD `6dd961b2df6fd859da558806a4e1edcdbbd6587c` завершился success: regression tests, Android Debug APK build и upload успешны. Artifact #14365802511, SHA-256 `2649c600f9d1a4d2051c3a29364ce05879d3ff4d8f4eb5e3a13561e6310b9f60`.
- Основная цепочка #148 → #149 → #87 → #150 → #151 → #152 → #153 → #154 остаётся Draft/unmerged; профиль секционного улья не активирован. Main: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- IndexedDB, миграции, backup, production и пользовательские данные не изменялись.

---

## Контрольная точка — интеграционный аудит PR #148–#153 (2026-11-17)

- Проверены актуальные refs GitHub: `main` = `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`; PR #152 HEAD = `a82d4137a6f1edab5066cc50f123642d6ea8ecfa`; PR #153 HEAD = `4beec099169eef39d4d36560905fca4ac0583c91`.
- PR #148, #149, #87, #150, #151, #152 и #153 открыты, Draft, не объединены; GitHub показывает mergeable=true для всех проверенных PR. Профиль секционного улья не активирован.
- Итоговый diff #152 относительно main содержит 28 файлов: 13 документационных/проектных и 15 файлов приложения/тестов. Цепочка зависимостей и merge-base подтверждены; PR #152 опережает main без отставания.
- PR #152 code/test SHA `94dd47ea6b904b9336f1adb4aa962233a163e4d6`: 609/609 tests, 0 failed (run #44160434256); Android Debug APK build/upload успешны (runs #44160451891 и #44160435353). После этого в #152 добавлены только 15 документационных коммитов до HEAD `a82d...`; сравнение подтверждает, что code/test SHA не изменился.
- PR #153 синхронизирован с текущим base #152. Сравнение refs `feat/full-installed-corpus-frame-capacity-2026-11-17` → `docs/varroa-treatment-sublimation-2026-11-17`: 0 commits behind, изменены ровно 9 документов, код и тесты отсутствуют. Текущий HEAD #153: `4beec099169eef39d4d36560905fca4ac0583c91`; GitHub mergeable=true.
- Открытый технологический вопрос: P41–P42 говорят «примерно около 12 дней» после установки второго ряда, но не задают допустимое отклонение. Текущая positive-only проверка не является строгой проверкой диапазона. Требуется пользовательское решение; до него не вводить числовой допуск.
- P42 отдельно разрешает выполнить установку решёток и медовых корпусов сразу вместе со вторыми корпусами. Это альтернативный вариант, не обязательная задержка.
- Остальные ограничения: позднее добавление второй пары медовых корпусов по P37 не реализовано; двухматочная ветвь OP-06 остаётся fail-closed; порамочная история осмотров/содержимого — отдельная задача.
- Varroa: пользователь подтвердил сублиматор щавелевой кислоты; параметры дозы, подготовки, интервалов, температуры и безопасности неизвестны. PR #153 документирует только подтверждённый метод и отделяет лечение от мониторинга.
- Lovable: агент `needs_attention / out_of_credits`; последний Lovable commit не найден в GitHub Pasekaapp, синхронизация не подтверждена.
- Изменения не затрагивают production, пользовательские данные и production deployment. Все PR остаются Draft.

---

## Подтверждённое уточнение пользователя — обработка Varroa (2026-11-17)

- Способ обработки от клеща: сублиматор щавелевой кислоты. Это прямое подтверждение пользователя, а не требование из DOCX.
- Текущий `js/varroa-monitor.js` фиксирует наблюдения (пробы взрослых пчёл и контрольный поддон), но не фактически выполненные обработки.
- Будущий журнал обработок должен быть отдельным от мониторинга и создавать запись только после явного подтверждения реально выполненной операции.
- Доза/масса кислоты, подготовка/концентрация, число и интервалы обработок, температура/погодные ограничения, ограничения по расплоду/маткам и меры безопасности не подтверждены. Не автозаполнять и не рекомендовать их по догадке.

---

# Актуальное состояние проекта — 2026-11-17

## Контрольная точка — 2026-11-17: аудит истории операций и времени завершения

- Актуальный GitHub main: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0` (проверен через branch endpoint; не использовать устаревший документальный SHA PR #146).
- Основная цепочка #148 → #149 → #87 → #150 → #151 → #152 остаётся Draft и не объединена; PR #153 — отдельный docs-only Draft поверх #152. Профиль секционного улья не активирован.
- Актуальный code/test SHA PR #152: `94dd47ea6b904b9336f1adb4aa962233a163e4d6`. Fast quality checks #44160434256 — **609/609 tests passed, 0 failed**. Android Debug APK push run #44160451891 и PR run #44160435353 — **success**. Artifact #14362223647, 3 409 708 bytes, SHA-256 `3d4b5dcc88a01f2eac80d23a40aa5863f89158ee5f224419ed43dd0d57916965`, срок хранения до 2026-12-01.
- Интеграционный дефект OP-05 исправлен: все три app-level вызова `PasekaSectionalOperationCoordinator.inspect()` передают `PasekaFamilyLineage` и `PasekaSectionalPhysicalLayout`; добавлен тест на все call-sites.
- Исправлена проверка истории OP-05 после OP-06: инспектор теперь проверяет события установки по историческому списку всех восьми снятых/установленных заглушек, а не только по тем, которые остаются в раскладке. Добавлен тест, удаляющий исходное событие установки после OP-06 и проверяющий обнаружение повреждения.
- Все пять критических completion API OP-04, второго ряда OP-04, OP-05, OP-06 и OP-07 теперь отклоняют будущую дату завершения. Добавлен единый тест на все пять путей; тестовый clock внедрён через зависимость, production использует системное время.
- Открытый технологический вопрос: P41–P42 описывают «примерно 12 дней» для альтернативного срока OP-07, но не задают допустимый диапазон. Код пока принимает любой положительный интервал; это не строгая проверка соответствия источнику. Нужен ответ пользователя.
- Остальные границы: последующее добавление второй пары медовых корпусов по P37 не реализовано; двухматочная ветвь OP-06 остаётся fail-closed; порамочная история осмотров/содержимого — отдельная задача.
- Varroa: пользователь подтвердил сублиматор щавелевой кислоты; параметры дозы, числа/интервал обработок, температуры и безопасности не заданы. PR #153 документирует только подтверждённый метод и отделяет лечение от мониторинга.
- Lovable: агент `needs_attention / out_of_credits`; последний Lovable commit не найден в GitHub Pasekaapp, синхронизация не подтверждена.
- Эти изменения не затрагивают IndexedDB schema, миграции, backup format, пользовательские данные или production. Merge, production deployment и публикация не выполнялись.

## Следующий приоритет

Завершить независимую проверку diff всей цепочки и подтвердить, что PR #153 остаётся документационным: без изменений кода и тестов относительно актуального #152. До признания технологической цепочки готовой к интеграции запросить у пользователя допустимый диапазон дней для формулировки «примерно 12 дней» P41–P42.

# Предыдущая контрольная точка — до реализации PR #152 (2026-11-17)

- Подтверждённый SHA основной ветки `main`: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`. Main не изменялась.
- Основная открытая технологическая цепочка остаётся Draft и не объединена: PR #148 (`27cb4de3f8bf8848475aa9877bb84affb7a51a83`) → #149 (`f8053b9a91e873ecfd61c07f5f8657ca53b42a02`) → #87 (`92bcb926a6aff9ed2a05c555ab9841fe31adddc2`) → #150 (`70583dc435674de5984640b727cc3f6064c2ca17`) → #151.
- PR #151 Draft, head `31299ab5fe556d08c6604f27a70d666839dcc7c7`; последний code/test head до документационных уточнений — `481fdd956fa040e1f5038fe975fbf461a23eea89`. Workflow #44148886358: **599/599 regression tests passed**, Android Debug APK build и artifact upload — success. Проверка относится к указанному code/test head; после него в ветку добавлялись только документационные изменения, повторный CI на docs-only head не запускался.
- Предыдущий workflow #44147147221 на более раннем SHA был отменён во время Android build; успешный run #44148886358 является более поздней проверкой PR #151.
- Пользователь закрыл вопрос о «пустых корпусах»: P57 — временный корпус без рамок для стряхивания пчёл, который не учитывается приложением; P77 — незаселённый корпус с рамками, который учитывается как обычный установленный корпус. Каждый установленный и учитываемый корпус должен иметь ровно полную вместимость рамок.
- В PR #150 пока остаётся разрешение неполной медовой рамки/корпуса и тест, допускающий 9/10 рамок. Это теперь противоречит решению пользователя. PR #152 должен исправить OP-07 и общий валидатор комплектности до интеграции этой цепочки.
- Профиль секционного улья не активирован. Production, пользовательские данные, IndexedDB и production deployment не менялись.

## Следующий приоритет

Создать PR #152 поверх PR #151: единая проверка полного количества рамок для всех учитываемых установленных гнездовых и медовых корпусов; убрать разрешение 9/10 рамок из OP-07; сохранить вне учёта временный корпус P57; добавить регрессионные тесты и отдельную историю наблюдений содержимого каждой рамки (не смешивать с типом сота). До прохождения интеграционных проверок не объединять цепочку и не активировать профиль.

## Контрольная точка — 2026-11-17: исправление привязки гнездовых рамок секционного улья

- В ходе аудита PR #151 выявлено: реестр рамок распознавал установленные корпуса только через `honeyStack.bodyIds`, но не через `sections[].broodBodyIds`. Из-за этого рамки гнездовых корпусов секционного улья могли отображаться как складские.
- Исправлен поиск физического расположения: рамки из `sections[].broodBodyIds` теперь относятся к соответствующему улью и секции; добавлен регрессионный тест.
- Изменения кода: `fd14c306890bf6976eb849e3df9b668ad3994365`; тест: `62b8e6f7d3e07a0c96816bb23e2af4c8e6194c38`.
- Android workflow #44147147221 на тестовом HEAD `62b8e6f7d3e07a0c96816bb23e2af4c8e6194c38` выполняется. До завершения не считать новую правку проверенной. Ранее 598/598 и APK success относятся к предыдущему code/test SHA `9677657799af28f5caaa6ee242c3f7186e694003`.
- `main`, пользовательская база, production и активность профиля не изменялись.

---

## Контрольная точка — 2026-11-17: идентификация и история оборудования

- PR #151 Draft. Код/тесты SHA: `9677657799af28f5caaa6ee242c3f7186e694003`; полный регрессионный набор: **598/598 passed**, 0 failed (run #44144631787). Android Debug APK build/upload успешны (run #44144644403).
- Документационный HEAD PR #151: `aef79c41c87a14a0cbe8b51616bf9942398186fd`; Android build check #44145100531 и Cloudflare preview check завершились успешно. Preview не является production deployment.
- Реализованы постоянные коды и UID всех фактических рамок, миграция ID старых событий, проверка дубликатов, единый обработчик истории перемещений и append-only журналы рамок/корпусов без обрезания 300/1000 событий.
- Пользователь подтвердил: каждый корпус и каждая рамка имеют постоянную идентификацию; любое перемещение сохраняется в истории.
- Полная вместимость корпусов и порамочный учёт содержимого пока не реализованы; следующий этап остаётся заблокирован до уточнения технологического исключения ниже.
- В DOCX P57 и P77 описаны намеренно пустые корпуса в технологических операциях. Нужно подтвердить, распространяется ли правило полной вместимости на эти корпуса. Складские корпуса, не установленные в улей, не следует автоматически считать установленными.
- PR #148 → #149 → #87 → #150 → #151 остаются открытыми Draft и не объединены. Main не менялась; production не изменялся.

---

## Контрольная точка — 2026-11-17: постоянная идентификация рамок и корпусов

- Пользователь подтвердил: каждый физический корпус и каждая рамка должны иметь постоянную уникальную идентификацию; все перемещения фиксируются с исходным и конечным местом. ID не меняется при переносе.
- Ранее коды корпусов/рамок уже существовали, но UID назначался только маркированным рамкам, а журналы обрезались после 300 событий корпуса и 1000 общих событий.
- PR #151 (Draft, base PR #150) расширяет миграцию на все фактические рамки, назначает короткий код и UID, сохраняет прежние коды, добавляет ID старым событиям без выдумывания времени, проверяет дубликаты и повреждённые записи.
- Новые события рамок содержат ID и timestamp; все основные пути перемещения используют общий обработчик. Журналы рамок и корпусов больше не обрезаются. Проверка состояния/сохранения отклоняет отсутствие идентификации и повреждённые журналы.
- CI на актуальном HEAD PR #151 ещё не подтверждён; не заявлять успешную проверку до завершения.
- Полная вместимость каждого установленного корпуса пока не реализована в этой ветке. Следующий этап должен запретить установку неполного корпуса и заменить прежний тест OP-07, допускавший 9/10 рамок.
- Следующий этап модели: по каждой рамке отдельно хранить тип сота (сушь/вощина) и историю осмотров/содержимого (расплод, яйца/личинки, перга, нектар, мёд и т. п.). Содержимое не угадывать; неизвестное обозначать как не осмотренное.
- Требование идентификации/истории/полной вместимости — пользовательские решения, а не цитаты DOCX. PR #148 → #149 → #87 → #150 → #151 открыты, Draft PR #151; main не менялась. Профиль секционного улья не активировать.

---

## Контрольная точка — 2026-11-17: правило рамок раннего медосбора подтверждено

- PR #150 остаётся Draft, base PR #87; code/test SHA: `482e086f8b2ca81abc343e94989dcc2e0baba617`. Цепочка PR: #148 → #149 → #87 → #150. Main SHA: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- Android workflow #44134181352 на точном docs HEAD `a314ba2da92274fe91310077980cde1552d31a8f` завершился успешно: **589/589 tests passed**, 0 failed; Android Debug APK build/upload успешны. Artifact #14351931133, 3,406,838 bytes, SHA-256 `fd5edbc7097a39f898d1d07485a11e5cc8c4340210937b5e2f58e07aca0c8b8f`.
- Пользовательское уточнение P80: в каждом медовом корпусе допускается не более двух рамок с вощиной; каждая такая рамка должна быть строго между рамками суши, соседние рамки с вощиной запрещены. Ограничение считается отдельно для каждого корпуса, не для пары.
- OP-07 валидирует упорядоченные `body.frames[]`: каждый установленный медовый корпус содержит ровно 10 рамок; в раннем медовом корпусе должна присутствовать сушь. `combType` обязателен (`drawn_comb` или `wax_foundation`); не более двух `wax_foundation` на корпус; у каждой такой рамки непосредственные соседи с обеих сторон должны быть `drawn_comb`. Неполный/переполненный корпус отклоняется до commit с полным rollback. История рамок сохраняется в записи корпуса и связывается с фактическим местом установки.
- Регрессионные тесты проверяют точную комплектность (в том числе отказ для 9/10), превышение лимита, соседние и крайние рамки вощины, неизвестный тип и разрешённые две рамки вощины на каждом корпусе.
- Остаются два неразрешённых вопроса OP-07: допустимый диапазон для «примерно 12 дней» P42 и отдельная операция поздней установки второй пары корпусов по P37. OP-06 остаётся fail-closed для двухматочного сценария.
- После документационных изменений требуется проверка CI на их новом HEAD SHA. UI, профиль активации, IndexedDB schema, Service Worker/cache, пользовательские и production-данные не изменялись. Слияний и публикаций не выполнялось.
- Merge PR, публикация PWA и production deployment требуют отдельного явного подтверждения пользователя.

---
---
---
---
---
---
## Контрольная точка — 2026-11-17: OP-06 проверен на полном CI

- Code/test SHA PR #87: ec3da5ee26d159bd2d7e71feac02c5a0b8f61d94.
- Android workflow run #44122663248 на точном SHA завершился success: 577/577 tests passed, Android Debug APK build и upload успешны. Artifact #14345074070, 3,402,199 bytes, SHA-256 a2b33cb34030537ba82b7229afaec0a918c80851effc4694ac03113e95c5caed, expires 2026-12-01.
- В процессе проверки исправлены ошибки TDZ в проверке исторической установки OP-05, тестового ID generator и несоответствие реального event type moved_to_storage при снятии заглушек. Финальный CI на SHA ec3da5e — зелёный.
- OP-06: append-only laying_observed для каждой матки; три идентифицированные действующие матки; 20–21 день от OP-04.startedAt; снятие всех 8 реальных заглушек либо явное подтверждение, что optional OP-05 не выполнялась; partial/reduced two-queen branch блокируются.
- PR #87 Draft, base PR #149 (base SHA f8053b9a91e873ecfd61c07f5f8657ca53b42a02); PR #149 Draft stacked на PR #148. Mergeable PR #87 = true. Main SHA d8fd021a3a6ab4ed9613dbd558205bdf24e96be0 не менялась.
- UI/профиль, IndexedDB/schemaVersion/backup, пользовательские данные и production не менялись.
- Следующий этап: отдельный аудит OP-07 и реальных предусловий установки двух больших разделительных решёток и медовых корпусов. Не объединять PR автоматически: сначала проверить всю цепочку #148→#149→#87 и открытые конкурирующие ветки.

---

## Контрольная точка — 2026-11-17: OP-06 реализован в отдельном stacked PR; CI ожидается

- Исходный DOCX повторно открыт: P20 описывает снятие временных сетчатых заглушек через 20–21 день от первоначального разделения, когда все матки вернулись с облёта и начали откладывать яйца. P21 допускает дополнительное открытие летков/вкладышей, но не делает его частью обязательного OP-06. P22–P23 относятся к следующему этапу.
- Прежняя ветка PR #87 была основана на устаревшей цепочке #84. Её рабочая ветка переведена на актуальную основу PR #149; PR #87 теперь stacked поверх #149 и остаётся Draft.
- В js/family-lineage.js добавлено append-only queenEvents.laying_observed для текущей идентифицированной матки, семьи, split event OP-04, techProcessId и времени наблюдения; требуется явное подтверждение пчеловода.
- В js/sectional-operation-coordinator.js добавлен completeOP06(): 20–21 календарный день от OP-04.startedAt; обязательны три текущие идентифицированные матки и наблюдение яйцекладки каждой. При наличии OP-05 снимаются все 8 реальных заглушек через equipment registry. Если OP-05 пропущена, требуется явное подтверждение отсутствия заглушек. Частичное покрытие и двухматочная ветвь блокируются.
- OP-05 остаётся в истории после снятия: валидатор проверяет историческое покрытие и события установки/снятия. Остальные элементы раскладки не меняются; перемещения, физическое состояние, технологическая запись и auditLog коммитятся атомарно.
- Добавлены тесты append-only наблюдений, снятия 8 заглушек, пропуска OP-05, отсутствующего наблюдения, неправильного срока и rollback. Первый CI run #44121261362 на промежуточном SHA d80a0b1 завершился 568/577 passed, 9 failed; ошибки TDZ и тестового ID-generator исправлены. Повторный CI на актуальном HEAD пока не подтверждён; Android build в первом run не запускался из-за провала тестового шага.
- Main SHA d8fd021a3a6ab4ed9613dbd558205bdf24e96be0 не менялась; PR #148/#149/#87 остаются Draft. UI/профиль, IndexedDB/schemaVersion/backup, пользовательские данные и production не менялись.
- Следующий шаг: получить полный Android workflow на актуальном HEAD PR #87, исправить оставшиеся ошибки, затем проверить stacked PR diff/base/head SHA. Не объединять до проверки всей цепочки.

---

## Контрольная точка — 2026-11-17: OP-05 и двухрядная геометрия реализованы; CI проверен

- По DOCX P17–P18 металлические сетчатые заглушки рекомендуется установить на 8–11-й день после разделения; P18 прямо допускает не выполнять эту операцию. Поэтому OP-05 — необязательная рекомендуемая операция: её отсутствие не блокирует состояние после OP-04. Число заглушек определяется фактическими отверстиями. OP-06 остаётся отдельной операцией.
- В Draft PR [#149](https://github.com/250oisr-eng/Pasekaapp/pull/149) добавлен `completeOP05()`: требует завершённого OP-04, неизменной физической раскладки, явного подтверждения, пригодных реальных заглушек на складе и полного покрытия всех фактических `openingId`. Отдельно требуется явное подтверждение ровной подставки (DOCX P17); подтверждение сохраняется в evidence и auditLog. Проверяются окно 8–11 календарных дней от начала разделения и порядок относительно завершения OP-04.
- Планировщик перемещений учитывает `temporaryQueenIsolation`. В одной транзакции фиксируются раскладка, перемещения предметов и их события, запись OP-05 и auditLog. Ошибка на любом шаге оставляет исходное состояние неизменным.
- `inspect()` проверяет статус OP-05, соответствие доказательств реальным заглушкам/отверстиям, полноту покрытия, подтверждение ровной подставки, ID событий перемещения в индивидуальном и общем журналах и временную последовательность. Добавлено 14 регрессионных тестов: 12 для coordinator OP-05 и 2 для полноты двухрядной физической раскладки.
- После детальной сверки P10–P11 физическая модель исправлена: каждый ряд имеет схему 1+2+1; первый ряд — 4 отверстия, двухрядная конфигурация — 8. Валидатор требует по одному отверстию на корпус крайних секций и по два на корпус средней секции, все отверстия связаны с реальными техническими решётками; при установке второго ряда первые 4 решётки остаются на месте, ещё 4 ставятся из склада.
- Code/test SHA PR #149: `e5f4c78ecedd3da50be70a7e66962bc54c6dbb28`; последний проверенный docs HEAD: `1a2b796a692a0880b1d3547d65d19928238bf643`. Android workflow run [#44107389196](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44107389196) на точном HEAD завершился **success**: 572/572 tests, Android Debug APK build и upload — success. Artifact #14338499255, 3,399,950 bytes, SHA-256 `29efb2909cf3d1d13a36c4da3c54ff025ca455c035ab3928881cf5f7754fcb3f`, expires 2026-12-01. Combined status не вернул отдельных status contexts; подтверждён именно workflow run. Этот status-коммит сдвинет branch HEAD; при следующем сеансе получать актуальный SHA из GitHub branch ref.
- PR #149 остаётся Draft и основан на PR #148 (base SHA `27cb4de3f8bf8848475aa9877bb84affb7a51a83`). PR #148 остаётся Draft. Main SHA `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0` не менялась.
- IndexedDB, schemaVersion, backup format, пользовательские данные, production и UI не менялись; профиль не активирован.

### Проверка отдельного проекта Lovable — read-only, 2026-11-17

- В workspace Lovable обнаружен отдельный проект **Apiary Family Atlas**. Он связан с репозиторием `250oisr-eng/apiary-family-atlas`, а не с текущим `250oisr-eng/Pasekaapp`; его latest commit `2196e3fd478fbb58810d6a78317c0ddd056dfdef` существует в первом репозитории и отсутствует во втором.
- Lovable сообщает: workspace Free, проект `needs_attention / out_of_credits`, агент завершил работу; `is_published=true`, audience `public`, последняя правка 2026-11-17 08:52 UTC. Project knowledge пустой.
- Это отдельная кодовая база с другим стеком и собственной историей PR. Не синхронизировать её с `Pasekaapp` и не изменять без отдельного решения о выборе единственного источника истины.
- Никакие изменения, публикация, деплой или расходование кредитов Lovable в ходе этой проверки не выполнялись. Текущая разработка продолжается в `Pasekaapp` согласно паспорту проекта.
- PR #149 остаётся Draft, основан на PR #148; mergeable=true, behind_by=0. PR #148 Android workflow run #44097595158 завершился success. Main `d8fd021a...` не менялась. Следующий этап — отдельная реализация OP-06: append-only подтверждение яйцекладки каждой из трёх маток, проверка 20–21 дня от `OP-04.startedAt`, атомарное снятие 8 заглушек или подтверждение их отсутствия при пропуске OP-05. Двухматочная ветвь остаётся fail-closed; P20 и действия P21 не смешивать с OP-06.
---

## Контрольная точка — 2026-11-17: атомарный OP-04 теперь поддерживает оба ряда

- Подтверждённая геометрия первого ряда: три корпуса в один ряд, каждый на отдельном днище; в каждом из трёх стеков по одному днищу, подкрышнику и крыше. DOCX P10 упоминает два днища; прямое уточнение пользователя о трёх имеет приоритет и отдельно отражено как расхождение.
- `completeOP04()` поддерживает начало разделения с `broodRows: 1`: запись OP-04 остаётся `IN_PROGRESS`, событие аудита фиксирует начало.
- Добавлен `completeOP04SecondRow()`: явное подтверждение, три новых корпуса со склада, согласованные технические отверстия/принадлежности, временная последовательность, журнал перемещений и один атомарный commit. После проверки OP-04 становится `DONE`; при ошибке исходное состояние не меняется.
- `inspect()` проверяет согласованность `broodRows`, `rowStage` и статуса операции; старые записи без новых полей сохраняют двухрядную трактовку.
- Code/test SHA `0d81b2f6f9452932f67b99bda98bca02f7d4f602`: Fast quality checks run [#44097238313](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44097238313) — **558/558 tests passed**; Android Debug APK run [#44097235721](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44097235721) — **success**, regression tests, APK build и upload завершены.
- Документация модели, ТЗ, сверки источника, плана, состояния, журнала, передачи и карты PR обновлена. Перед статусным коммитом branch HEAD был `614b29f1dc5082abd866aea10b441840c9df08d7`; после записи получать актуальный SHA из GitHub branch ref.
- `main` остаётся `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`; PR #148 остаётся Draft и не объединён. UI и профиль не активированы.
- Следующий этап: аудит и атомарная реализация OP-05; не переходить к OP-06/UI до подтверждения предусловий и тестов rollback.

---

## Контрольная точка — 2026-11-17: пользователь подтвердил первоначальную раскладку OP-04; валидатор поддерживает один ряд

- Подтверждено пользователем: три гнездовых корпуса стоят в один ряд, каждый на отдельном днище; уже на этой стадии используются три подкрышника и три крыши. Во всех рабочих состояниях остаётся комплект 3+3 для подкрышников/крыш.
- DOCX P10 говорит о двух днищах. Это расхождение с прямым подтверждением пользователя сохранено в `docs/СВЕРКА-ТЕХПРОЦЕССА-С-ИСТОЧНИКОМ.md`; модель использует три днища. DOCX P11 разрешает установить второй ряд сразу или через несколько дней.
- Изменён `js/sectional-physical-layout.js`: `broodRows: 1|2` для SIDE_BY_SIDE; старые записи без поля остаются двухрядными. Изменены `tests/sectional-physical-layout.test.mjs` и `tests/sectional-operation-coordinator.test.mjs`: тест первого ряда и запрет считать его завершённым OP-04.
- Code/test SHA `2a70452abf256f0571206894c19e13e04553ffba`: Fast quality checks run [#44096138371](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44096138371) — **556/556 tests passed**; Android Debug APK PR run [#44096148887](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44096148887) — **success**, включая regression tests и сборку APK. Отдельный Android push run #44096138401 на момент проверки ещё выполнялся.
- Документы модели, ТЗ, сверки источника, плана, состояния, журнала, передачи и карты PR обновлены. Рабочая ветка PR #148; до статусного обновления её последний известный HEAD `788fe306ac3fe05a2333e6d08c0bdd4b234785a0`. После обновления получать HEAD непосредственно из GitHub branch ref. `main` остаётся `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- Открыто: атомарный переход `broodRows: 1` → `broodRows: 2`; профиль/UI не активировать до его реализации и проверки. PR #148 остаётся Draft, не объединён.

---

## Восстановление после обрыва — 2026-11-17: проверен PR #148 и исходный DOCX

- Последняя операция до восстановления: документационный коммит `3507e1738c33dfdc4789827c8d9c62f0450d6fe3`. Журнал восстановлен коммитом `afc5cec22fc608c83e94e3aa0f6cb4f61832a6e9`, затем уточнён коммитом `550cda98e7e74bfe37150f011e9929b0a934bc35`. Текущий HEAD всегда получать из GitHub branch ref при начале сеанса: сам этот файл фиксируется отдельным коммитом и поэтому не должен быть источником собственного SHA.
- Репозиторий `250oisr-eng/Pasekaapp`; default branch `main`. Фактический main HEAD: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`. Он совпадает с base PR #148. Main после этой контрольной точки не менялся.
- PR [#148](https://github.com/250oisr-eng/Pasekaapp/pull/148) открыт, Draft, не объединён; base `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`. Текущий head брать из branch ref `feat/sectional-op04-atomic-coordinator-2026-11-17`, не из сохранённого здесь SHA. Последняя проверка PR: mergeable=true.
- Сравнение `27537227774ac8b6a6f0ad6236559b2ce0da0202...3507e1738c33dfdc4789827c8d9c62f0450d6fe3` подтверждает: после code/test SHA изменялись только 8 документационных файлов; код и тесты не изменялись. Изменения PR относительно main: 15 файлов (код coordinator, runtime, SW, тесты и документы).
- Проверки: code/test SHA `27537227774ac8b6a6f0ad6236559b2ce0da0202` — Fast quality checks run #44089591987: 553/553 tests passed; Android Debug APK runs #44089591824 и #44089600740 успешны. Для предыдущего HEAD `3507e173...` Android Debug APK pull_request run [#44092265152](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44092265152) завершился success; все шаги, включая regression tests и APK build/upload, успешны. Cloudflare Workers preview check для него также success. Это preview build, не подтверждение production deployment. Для status-only HEAD `afc5cec...` run #44094653314 завершился success. Следующий status-only HEAD `550cda9...`: run #44094791631 был запущен; при последней проверке workflow выполнялся. Текущий коммит этой записи также запускает CI; перед следующими кодовыми изменениями обязательно получить актуальный branch SHA и дождаться его проверок. Отдельный Fast quality checks run для HEAD `3507e17...` не найден; тестовый результат относится к неизменённому code/test SHA `275372...`.
- Проверен текущий PR diff и рабочая ветка: удалённых/неучтённых незавершённых удалённых изменений не обнаружено. GitHub отражает коммиты ветки; локальное рабочее дерево через GitHub API недоступно и не утверждается как проверенное.
- Исходный пользовательский DOCX повторно прочитан непосредственно из загруженного файла. P10 (абзац 11) буквально говорит об установке двух днищ; пользователь отдельно подтвердил три отдельных днища под тремя корпусами первоначального ряда. Это расхождение явно зафиксировано; для модели OP-04 действует прямое подтверждение пользователя. P11 допускает установку второго ряда сразу или через несколько дней; P12 описывает установку трёх подкрышников и крышек после второго ряда.
- Подтверждено пользователем 2026-11-17: во всех рабочих состояниях используются ровно три подкрышника и три крыши; временные элементы не применяются. Для первоначального ряда дополнительно подтверждены три корпуса в линию на трёх отдельных днищах. Это пользовательские уточнения, а не вывод из DOCX.
- В `js/sectional-physical-layout.js` добавлено поле `broodRows`: `1` валидирует промежуточный один ряд (по одному корпусу на секцию), `2` — итоговые два ряда; для старых записей без поля сохраняется прежняя трактовка двух корпусов на секцию. В каждом из трёх стеков обязательны собственные bottom, topRiser и cover. Coordinator `completeOP04()` по-прежнему принимает только два корпуса на секцию и не позволяет отметить первый ряд как завершённый OP-04.
- Добавлены тесты промежуточной раскладки и блокировки завершения OP-04 на одном ряду. Fast quality checks на code/test SHA `2a70452abf256f0571206894c19e13e04553ffba` — 556/556 tests passed (run #44096138371); Android Debug APK PR run #44096148887 — success, включая regression tests, сборку и загрузку APK. На последнем code/test SHA профиль и UI не активируются; OP-05/OP-06 не реализованы, reduced two-queen ветвь OP-06 остаётся fail-closed.
- Main не изменялся. Production database, production deployment, пользовательские данные и локальные записи пасеки не затрагивались.
- Следующий конкретный шаг: реализовать атомарный переход `broodRows: 1` → `broodRows: 2` с перемещением трёх дополнительных корпусов, обновлением журналов оборудования и полным rollback; затем покрыть немедленный и отложенный сценарии тестами. PR #148 остаётся Draft; `main` не изменялась.

---

# Контрольная точка — 2026-11-17: подтверждён постоянный комплект из трёх подкрышников и трёх крышек

- Пользователь подтвердил количество для всех рабочих состояний: один ряд, два ряда, два ряда с медовыми корпусами — всегда 3 подкрышника + 3 крышки; временные элементы не используются.
- Это отдельное подтверждение пользователя, не утверждение DOCX. В DOCX перечислены 3+3 в комплекте (стр. 1), но P10–P12 не полностью описывают промежуточную конфигурацию одного ряда.
- В текущей модели SIDE_BY_SIDE валидатор уже требует topRiserItemId и coverItemId для каждого из трёх стеков; coordinator PR #148 работает с тремя стеками. Проверка, что те же 3+3 сохраняются в будущих staged transitions и в медовой конфигурации, ещё требуется.
- Блокер временных подкрышников/крышек закрыт. Следующий шаг — спроектировать промежуточную физическую раскладку одного ряда и безопасный переход к двум рядам, не меняя количество 3+3.
- PR #148 остаётся Draft. Code/test SHA 27537227774ac8b6a6f0ad6236559b2ce0da0202; документационные изменения после него не меняют код. Текущий HEAD до этого документального обновления: bea4c8e74fc337f07a27641d035ec5c4c6c7405a. CI для нового HEAD после обновления ещё не проверен.

---

## Контрольная точка — 2026-11-17: Draft PR #148, атомарное завершение OP-04

- Актуальный `main`: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`; PR #145 и #146 уже объединены.
- Рабочий PR [#148](https://github.com/250oisr-eng/Pasekaapp/pull/148), base `main`, branch `feat/sectional-op04-atomic-coordinator-2026-11-17`; code/test SHA `27537227774ac8b6a6f0ad6236559b2ce0da0202`, последующие коммиты ветки после code/test SHA содержат только документацию; это подтверждено сравнением GitHub. Актуальный PR HEAD сверяется напрямую перед любым следующим действием.. Сравнение подтверждает, что после code/test SHA менялись только документы. PR остаётся Draft, не объединён.
- Fast quality checks на code/test SHA `27537227774ac8b6a6f0ad6236559b2ce0da0202`: run #44089591987 — **553/553 tests passed**. Android Debug APK: push run #44089591824 и pull_request run #44089600740 — **success**. Artifact #14330024531, 3,394,753 bytes, SHA-256 `c8bffeabc272de8b189d44abd14552401367e782c57e4bdd31e7835f914e67e6`, expires 2026-12-01.
- PR добавляет `PasekaSectionalOperationCoordinator.completeOP04()`: clone → split lineage → physical layout → explicit accessory/body movement → full validation → one commit. При любой ошибке исходное состояние остаётся неизменным.
- Все четыре исходные пластиковые заглушки учитываются при тестировании по DOCX P10. Перемещения шести гнездовых корпусов записываются в историю корпуса и общий журнал оборудования; OP-04 получает отдельную запись в `auditLog`.
- App schemaVersion повышается 14→15; IndexedDB object-store version остаётся 3. Добавлена `sectionalTechProcesses`, её проверка в startup/save/backup/snapshot; Service Worker v313. Старые schema14 backups остаются совместимыми.
- **Открытый источник-зависимый вопрос:** DOCX P11 допускает установить второй ряд из трёх корпусов не сразу, а через несколько дней; P12 описывает установку подкрышников и крышек после этого. Текущий coordinator завершает только итоговую раскладку из шести корпусов и не моделирует промежуточное физическое состояние после первого ряда. Источник не уточняет все детали временного укрытия/фиксации этой промежуточной конфигурации. До отдельной модели этого состояния нельзя активировать профиль или UI технологического процесса и нельзя считать промежуточный этап завершённым.
- OP-05/OP-06, UI, активация профиля и реальные операции не входят в PR #148. OP-06 reduced two-queen branch остаётся fail-closed: правило снятия сетчатых заглушек источником не задано.
- Следующий шаг: отдельно спроектировать промежуточное физическое состояние OP-04 после первого ряда из трёх корпусов и до установки второго ряда. До подтверждения/реализации этого состояния не переводить PR из Draft, не объединять его и не активировать профиль.

---

## Контрольная точка — 2026-11-17: PR #146 merged; core family lineage runtime integrated

- Актуальный main SHA: `a1798b0bc47f8f4642c42ac4ab363a98cc1c3e59` — merge commit PR #146. PR #145 и PR #146 объединены.
- PR #146 интегрировал `js/family-lineage.js` в runtime, root `familyEvents`, migration app schema 12→14, lineage validation в startup/save/raw backup, snapshot history, backup compatibility и Service Worker v312.
- На точном code/test SHA `ffbf931453868208460e59d274e09d6c557b8297` GitHub Actions run #44084558765: **545/545 tests passed**, 0 failed; Android Debug APK build/upload — **success**. Artifact #14329575117, 3,387,913 bytes, SHA-256 `c71c7bbd74e26b0c750d33776fd401bf3afde22811fe7da258cc49916446a4cb`, expiry 2026-12-01.
- Для merge commit `a1798b0bc47f8f4642c42ac4ab363a98cc1c3e59` отдельные workflow runs/combined status не представлены. Успешные проверки относятся к точному code/test SHA `ffbf931453868208460e59d274e09d6c557b8297`, не к merge commit.
- IndexedDB object-store version остаётся 3. Прикладная схема 14: legacy schema 1–12 мигрирует добавлением пустого журнала; schema13 поддерживается как переходная; schema14 требует корректный `familyEvents`. Повреждённый существующий журнал или отсутствующий журнал schema14 блокирует миграцию до изменения состояния. Save gate также не восстанавливает отсутствующий журнал schema14 автоматически.
- Исторические семьи/матки и неизвестные разделения не реконструируются. Новая модель lineage проверяется, но UI и OP coordinator пока не подключены.
- Следующий приоритет: спроектировать и реализовать отдельный атомарный coordinator OP-04/05/06 (clone-and-commit/rollback) поверх lineage + sectional layout + inventory + audit. Сначала OP-04, затем OP-05, затем OP-06. До этого не активировать профиль секционного улья и не добавлять UI.
- Открытые старые PR #101/#104 (lineage), #87 (queen laying / OP-06), #105/#106 (sectional layout) и PR #54–58 не объединять напрямую: провести selective diff audit относительно main. PR #145/#146 merged; PR #143/#144 superseded.
- Уточнение по DOCX: описан продуктивный сценарий с двумя матками, если одна из трёх не вернулась, и необязательный перенос двух рамок с яйцами из семьи с исходной маткой в два других отсека (P28–P33). Однако точное правило снятия сетчатых заглушек для reduced two-queen branch в источнике не определено; этот переход должен оставаться fail-closed до отдельного решения.

---

## Контрольная точка — 2026-11-17: PR #145 интегрирован; lineage runtime в PR #146

- Актуальный GitHub main: `d73d9523c1c566624ac372ef768f0253aa8faee6` — merge commit PR #145. PR #145 закрыт слиянием; физический ownership bridge, sectional inventory invariants и подтверждение двух больших решёток теперь входят в main.
- Проверенный кодовый SHA PR #145: `7975abb6cd2084d8eee003e325b3e05cbebaf0f7`; Fast quality checks **536/536 tests passed** (run #44081137150), Android Debug APK build/upload **success** (run #44081137033). После code SHA были только документационные коммиты. Для merge commit `d73d9523c1c566624ac372ef768f0253aa8faee6` GitHub Actions workflow runs и combined status не представлены; это не записывается как успешный CI на merge SHA.
- Следующий технический блок выполняется в Draft PR [#146](https://github.com/250oisr-eng/Pasekaapp/pull/146), ветка `feat/family-events-runtime-integration-2026-11-17`, base `d73d9523c1c566624ac372ef768f0253aa8faee6`, текущий HEAD `19bc270b4f726201e1c18432190092ee552fe235`.
- PR #146 подключает `js/family-lineage.js` к runtime, добавляет `familyEvents`, additive migration прикладной схемы 12→14, lineage integrity в startup/save/raw-backup validation, сохранение событий в snapshot history, совместимость старых backup и Service Worker cache v312.
- IndexedDB object-store version остаётся 3. Схема 13 принимается как переходная: если массив событий уже присутствует, он сохраняется; если отсутствует, создаётся пустой массив. Для схемы 14 массив обязателен. Некорректный существующий массив не заменяется и должен блокировать миграцию до изменения других данных.
- PR #146 проверяется. Android workflow run #44083460821 на HEAD `19bc270b4f726201e1c18432190092ee552fe235` был запущен; на момент записи выполнялся. Результат тестов/сборки пока не подтверждён. Не считать отсутствие отдельного combined status прохождением проверок.
- UI, coordinator OP-04/05/06, активация профиля секционного улья, реальные операции, production и публикация не выполняются этим PR.
- Следующий шаг: дождаться и разобрать CI PR #146 на актуальном HEAD; исправить выявленные ошибки, затем проверить документацию и полную обратную совместимость backup/snapshot.

---

# PROJECT_STATUS — Пасека 2.0

> Главный оперативный журнал состояния разработки и точка восстановления после обрыва связи.
> Последняя сверка: **2026-11-17, после merge PR #146; lineage runtime подключён, OP coordinator следующий**.
> Источник фактического состояния: GitHub main, PR и Actions. Переписка ChatGPT не заменяет этот файл.


## Новая контрольная точка — 2026-11-17: физические инварианты инвентаря секционного улья

- PR #142 уже объединён в main: `02d91ef1cc57c61cbc7789b1b61eda03c8923122`. Событие `queen_absence_confirmed` доступно в изолированном `js/family-lineage.js`; runtime/save/backup/SW интеграция lineage ещё не выполнена.
- Из PR #144 перенесены изменения физического инвентаря в новую независимую ветку `fix/sectional-inventory-location-main-2026-11-17`, основанную непосредственно на актуальном main. Это устраняет stacked-зависимость от PR #143 и исключает потерю изменений PR #142.
- Перенесены `index.html`, `js/equipment-inventory.js`, `js/sectional-physical-layout.js`, `sw.js` и три регрессионных файла. Добавлены derived location для `sectionalLayouts`, проверка инвентаря в save gate, обязательные ссылки на три днища/крышки/подкрышника, максимум одна фактическая feeder location, запрет пластиковых заглушек в SIDE_BY_SIDE и helper полного покрытия OP-05.
- Из PR #143 перенесено подтверждение пользователя: две большие разделительные решётки на весь улей. Оно отделено от двух технических решёток на соединение и временных сетчатых заглушек.
- P10 описывает 4 отверстия первого ряда (1+2+1), P11 повторяет схему во втором ряду; двухрядная раскладка требует 8 отверстий и 8 технических решёток. Валидатор теперь проверяет каждое тело и все связи; OP-05 покрывает все 8 фактических openingId. Диаметр 50 мм подтверждён пользователем.
- На точном PR #145 HEAD `7975abb6cd2084d8eee003e325b3e05cbebaf0f7` Fast quality checks прошли **536/536 tests** (run #44081137150); Android Debug APK build и upload — **success** (run #44081137033). Artifact #14326877819, 3,387,491 bytes, SHA-256 `7c61565660ff61d6d0f79b451300006fe3c92cf5810e808b2c5e85e4239fa69b`, expiry 2026-12-01.
- PR [#145](https://github.com/250oisr-eng/Pasekaapp/pull/145) открыт для review от main, mergeable=true. PR #143 и #144 закрыты как superseded; их изменения перенесены в #145. Merge PR #145 требует отдельного подтверждения пользователя.
- Следующий шаг: выполнить CI на новой ветке, проверить diff относительно main и завершить независимый PR. Затем отдельным этапом интегрировать `familyEvents` в runtime, миграцию, save/snapshot, backup/restore и Service Worker. UI и активацию профиля не начинать.

## Новая контрольная точка — 2026-11-17: две большие разделительные решётки

- Пользователь подтвердил: для трёхсекционного улья используются **две большие разделительные решётки на весь улей**, а не три. Это пользовательское уточнение; DOCX на стр. 3 описывает установку первой и второй решёток, но не задаёт полную геометрию.
- Технические решётки в боковых отверстиях и временные сетчатые заглушки — другие предметы; их число не определяется этим подтверждением.
- Актуальный `main` после merge PR #142: `02d91ef1cc57c61cbc7789b1b61eda03c8923122`.
- PR #142 объединён в main squash-коммитом `02d91ef1cc57c61cbc7789b1b61eda03c8923122`. Code SHA `aa6677d5657a06bdd0a4cf86fd487f0513090223`: 519/519 tests passed; Android Debug APK build/upload success. Добавлен `queen_absence_confirmed`, явное время наблюдения, запрет будущей даты и split OP-04 без поиска исходной матки.
- Следующий главный блок: атомарная доменная интеграция OP-04/05/06 поверх согласованной модели queen absence; синхронизация family lineage, sectionalLayouts, physical equipment, audit и techprocess с полным rollback. UI и активацию профиля не начинать.
- Важный блокер перед реализацией: старые PR #54–58 образуют устаревшую stacked-цепочку. `docs/АУДИТ-PR-54-58-2026-11-16.md` фиксирует критические обходы DONE для OP-04/05 и неверную последовательность OP-14. Не объединять и не переносить их целиком; использовать только после выборочного аудита. В текущем main techprocess registry отсутствует, `index.html` не содержит `S.sectionalTechProcesses`/`techProcesses`; сохранение работает через текущие `records`.

## 1. Проект и текущее состояние

- **Проект:** «Пасека» / Pasekaapp.
- **Репозиторий:** https://github.com/250oisr-eng/Pasekaapp
- **Основная ветка:** main.
- **Последний подтверждённый main SHA:** `02d91ef1cc57c61cbc7789b1b61eda03c8923122`.
- **Состояние:** активная разработка; физическая модель секционного улья и реестр оборудования интегрированы как проверяемые доменные компоненты. Новый профиль ещё не активирован; пользовательские технологические операции OP-04/05/06 не интегрированы с физической раскладкой и lineage.
- **Главный источник технологии:** пользовательский DOCX «улей для каждого техпроцесс.docx» (9 страниц) и последующие явно подтверждённые пользователем уточнения. Неизвестные параметры не додумывать.
- **Бесплатность:** обязательное ограничение проекта; платные API, тарифы, модели, хостинги и опции запрещены.

## 2. Последний завершённый этап

**Этап непрерывности разработки:** корневой PROJECT_STATUS.md создан и обязательность его чтения/обновления закреплена PR [#139](https://github.com/250oisr-eng/Pasekaapp/pull/139), merge commit 0cfb2632e82b6b7d7da80503c65b2cd1093e13ec.

**Этап:** отдельная физическая модель sectionalLayouts и фиксация её интеграции.

- PR [#134](https://github.com/250oisr-eng/Pasekaapp/pull/134) — добавлен доменный реестр физических принадлежностей js/equipment-items.js; merge commit 16b906b97f8dcdfbffe629a5ad6330884768a92d.
- PR [#136](https://github.com/250oisr-eng/Pasekaapp/pull/136) — реестр подключён к runtime-приложению, backup validation и Service Worker; merge commit febff4547e996fbec00f7d56b61fb5b20d6d9b4b.
- PR [#137](https://github.com/250oisr-eng/Pasekaapp/pull/137) — добавлен отдельный валидатор js/sectional-physical-layout.js и root-коллекция sectionalLayouts; merge commit f3de349a5018c557bfdb580071cf235018dd2dfd.
- PR [#138](https://github.com/250oisr-eng/Pasekaapp/pull/138) — обновлены документы состояния и передачи; merge commit 6e31d5b3f1183275037f7f357f52e791e64d1f34.

### Что реализовано

- equipmentInventory.items — отдельный реестр физических принадлежностей с доменной проверкой.
- sectionalLayouts — отдельное текущее физическое состояние секционного улья; не дублируется внутри techprocess record.
- Проверки физической раскладки включены в save(), диагностику пасеки, проверку backup/raw-backup и snapshot history.
- Поддерживаются режимы SIDE_BY_SIDE, ALTERNATIVE_WINTERING_COLUMN, SINGLE_FAMILY.
- Для SIDE_BY_SIDE проверяются три секции по два гнездовых корпуса и две технические связи; каждая связь требует две технические решётки и буферный коридор.
- Для R4 проверяются ровно две большие решётки FULL/HALF по явным верхним корпусам.
- Альтернативная зимовка проверяет распределение [2,1,1] без фиксации сильной семьи в нижней позиции и требует две сетчатые диафрагмы.
- SINGLE_FAMILY поддерживает три или четыре гнездовых корпуса.
- Старые записи без sectionalLayouts остаются допустимыми.

## 3. Изменённые файлы последнего этапа

### PR #134
- docs/МОДЕЛЬ-СЕМЕЙ-И-ФИЗИЧЕСКОЙ-РАСКЛАДКИ.md
- js/equipment-items.js
- tests/equipment-items.test.mjs

### PR #136
- index.html
- sw.js
- tests/regression.test.mjs

### PR #137
- docs/МОДЕЛЬ-СЕМЕЙ-И-ФИЗИЧЕСКОЙ-РАСКЛАДКИ.md
- index.html
- js/sectional-physical-layout.js
- sw.js
- tests/plant-module.test.mjs
- tests/regression.test.mjs
- tests/sectional-physical-layout.test.mjs

### PR #138
- docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md
- docs/КАРТА-ОТКРЫТЫХ-PR-2026-11-17.md
- docs/МОДЕЛЬ-СЕМЕЙ-И-ФИЗИЧЕСКОЙ-РАСКЛАДКИ.md
- docs/ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md
- docs/ПЛАН-РАЗРАБОТКИ.md
- docs/СОСТОЯНИЕ-ПРОЕКТА.md

### PR #139 — постоянный журнал состояния
- AGENTS.md
- PROJECT_STATUS.md
- docs/PROJECT-CONTROL.md
- docs/ПРАВИЛА-РАЗРАБОТКИ.md

### PR #140 — фиксация интеграции журнала
- PROJECT_STATUS.md
- docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md
- docs/ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md
- docs/СОСТОЯНИЕ-ПРОЕКТА.md

## 4. Проверки и подтверждённые результаты

Проверки выполнены на точном PR HEAD aa18cc00c1aa5a6e98c31486df104b54b8e49046 для PR #137:

- Fast quality checks, run [#44040678772](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44040678772): **510/510 тестов пройдены**.
- Android Debug APK, push run [#44040678865](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44040678865): сборка и загрузка артефакта успешны.
- Android Debug APK, pull_request run [#44040686014](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44040686014): сборка и загрузка артефакта успешны.
- Артефакт #14309540416, 3 384 494 bytes, SHA-256 c0fe22078d00f4607f1ffbb8610b63b7179884737bd9c1d82b8cac64eccf940f; срок хранения, зафиксированный при создании: 2026-12-01 07:42:45 UTC.
- Физическое тестирование на Android-устройстве **не проводилось**.
- Для документационного merge PR #138 (SHA 6e31d5b3f1183275037f7f357f52e791e64d1f34) GitHub workflow runs и combined status не вернули записей.
- PR #139 — документационный; для его merge SHA 0cfb2632e82b6b7d7da80503c65b2cd1093e13ec workflow runs и combined status не вернули записей.
- PR #140 — документационный; для его merge SHA 562c3a7794e0b0c1dc5fda46bb89169274fc5446 workflow runs и combined status также не вернули записей. Это означает «CI для этих документационных commits не представлен», а не «CI прошёл».

## 5. Совместимость, данные и границы

- IndexedDB version остаётся **3**; прикладная schemaVersion остаётся **12**.
- Миграции не добавлялись.
- Формат backup не менялся.
- Старые записи без sectionalLayouts допустимы.
- Пользовательские данные не изменялись.
- Production database и production deployment в рамках PR #134/#136/#137/#138/#139 не изменялись.
- Новый профиль секционного улья **не активирован**.
- UI создания/редактирования физической раскладки и реальные физические перемещения не добавлены.
- Технологические переходы OP-04/05/06 не синхронизированы атомарно с lineage, layout, inventory, audit и techprocess.

## 6. Известные проблемы и открытые ограничения

1. **Подтверждение отсутствия матки реализовано только в открытом PR #142.** В main событие пока отсутствует. DOCX P29 допускает продуктивную двухматочную ветвь, если одна матка не вернулась с облёта. Отсутствие currentQueenId само по себе не является подтверждением потери матки.
2. **OP-06 для двухматочной ветви не определён источником.** DOCX допускает работу двух маток, если одна не вернулась, но не объясняет, когда снимать сетчатые заглушки в этом случае. Событие queen_absence_confirmed не должно автоматически разрешать OP-06; до решения пользователя ветвь должна блокироваться.
2. **Нет атомарного перехода OP-04/05/06 и принятой runtime-модели техпроцесса.** Изменения семей/маток, физической раскладки, принадлежностей, аудита и записи техпроцесса пока не выполняются одной согласованной транзакцией/операцией с rollback. Старые PR #54–58 имеют критические дефекты по аудиту и не могут быть объединены как есть.
3. **Family lineage остаётся изолированным доменным модулем.** Не подключать его к реальным операциям/UI до синхронизации с sectionalLayouts, equipmentInventory.items, audit и techprocess.
4. **Профиль секционного улья не активировать** до полной поддержки всех затрагиваемых модулей и локальных проверок.
5. PR #101/#104/#105/#106 остаются открытыми Draft-кандидатами на старых stacked base/head. Они не являются готовыми к прямому merge; требуется selective port после проверки diff и зависимостей.
6. PR #89/#95 также остаются открытыми Draft на старых базовых ветках. Их нельзя считать актуальным источником реестра оборудования или R4 без сравнения с уже интегрированными #134/#136/#137.
7. Физическое Android-устройство не тестировалось.
8. **Lovable:** проект Apiary Family Atlas найден в workspace. Последнее изменение — 2026-11-16 21:36:50 UTC; опубликован. Текущий статус агента — needs_attention, причина out_of_credits; последний Lovable commit f9fb8025a286949e5858ffe32dea91bc7c80ecdb. Этот SHA не найден как commit репозитория Pasekaapp; синхронизация Lovable с GitHub main не подтверждена. GitHub main остаётся источником истины для кода.

## 7. Текущая незавершённая задача

**Подготовить атомарный доменный переход OP-04/05/06, использующий отдельное событие queen absence из PR #142 после его интеграции.**

Событие queen absence реализовано в PR #142 и прошло CI на его HEAD, но PR остаётся Draft и не входит в main. Атомарный переход OP-04/05/06 ещё не реализован. UI не начинать до определения транзакционной границы и rollback.

## 8. Следующий конкретный шаг

1. Повторно сверить старую технологическую цепочку PR #54–58 с текущим main и аудитом `docs/АУДИТ-PR-54-58-2026-11-16.md`; не объединять её напрямую.
2. Определить безопасную модель хранения техпроцесса и совместимость с текущими `records`, IndexedDB schemaVersion 12, backup/restore и offline.
3. Проверить PR #142 и его зависимость для queen absence; не считать событие интегрированным в main.
4. Спроектировать атомарную границу OP-04/05/06: lineage + sectionalLayouts + equipment inventory + audit + techprocess, включая rollback.
5. Реализовать доменный переход и тесты отказов/повторов; UI и активацию профиля отложить до приёмки модели.

## 9. История важных контрольных точек

| Дата | Этап | Подтверждённый результат |
|---|---|---|
| 2026-11-17 | PR #134 | Реестр физических принадлежностей добавлен; merge 16b906b9… |
| 2026-11-17 | PR #136 | Runtime/backup/SW integration; merge febff454… |
| 2026-11-17 | PR #137 | Валидируемая sectionalLayouts; 510/510 tests и Android Debug APK; merge f3de349a… |
| 2026-11-17 | PR #138 | Документы и план обновлены; merge 6e31d5b3… |
| 2026-11-17 | PR #139 | Создан корневой PROJECT_STATUS.md; правила чтения и обновления закреплены в AGENTS.md, PROJECT-CONTROL.md и ПРАВИЛА-РАЗРАБОТКИ.md; merge 0cfb2632… |
| 2026-11-17 | PR #140 | Факт интеграции журнала внесён в состояние, журнал и передачу между чатами; merge 562c3a77… |
| 2026-11-17 | Текущая сверка | Lovable найден, но статус out_of_credits; SHA не совпадает с подтверждённым GitHub main |

## 10. Правила обновления этого файла

- Читать этот файл первым при каждом возобновлении работы, затем проверять фактический GitHub main/PR/CI и Lovable.
- После каждого логически завершённого этапа обновлять этот файл **в том же PR/изменении**, что и соответствующий этап.
- Не записывать предположения как факты. Для каждого CI-результата указывать точный SHA и ссылку на run.
- Не указывать merge/сохранение/публикацию как завершённые без подтверждения соответствующего сервиса.
- Не удалять старые записи из раздела истории; новые контрольные точки добавлять сверху или в конец, сохраняя хронологию.
- При расхождении этого файла с GitHub сначала проверить фактическое состояние и исправить журнал отдельной записью; файл не является основанием игнорировать реальный GitHub.
- В конце каждого этапа указывать один следующий шаг и конкретные незавершённые блокеры.


## 11. Подтверждение внедрения постоянного журнала

- PR #139 merged в GitHub main: 0cfb2632e82b6b7d7da80503c65b2cd1093e13ec.
- После merge повторно проверены наличие PROJECT_STATUS.md в main и статус PR #139.
- PR #139 изменил только документацию и правила управления; код, IndexedDB, backup, пользовательские данные, Lovable и production не менялись.
- CI для документационного merge SHA не представлен; это не трактуется как успешная проверка приложения.


## 12. Контрольная точка PR #140

- PR #140 merged в main: 562c3a7794e0b0c1dc5fda46bb89169274fc5446.
- PROJECT_STATUS.md и документы состояния/журнала/передачи содержат запись об интеграции PR #139.
- PR #140 был документационным; workflow runs и combined status для merge SHA отсутствуют. Кодовые проверки не заявляются.


## Решение пользователя — учёт пустых корпусов и комплектности рамок (2026-11-17)

Пользователь уточнил два состояния из DOCX:
- P57: временный корпус без рамок используется только для стряхивания пчёл с рамок в общую семью, после чего корпус убирается. Эта вспомогательная операция и временное использование корпуса **не учитываются в приложении**: не создают установленный корпус, запись инвентарного перемещения или технологическое событие.
- P77: «пустой корпус» означает **незаселённый корпус с рамками**. Это реальный установленный корпус, он учитывается в физической раскладке, инвентаре и истории оборудования.

Следствие: правило полной комплектности не имеет исключения для установленных корпусов. Каждый учитываемый установленный корпус должен содержать ровно число рамок, соответствующее его вместимости. «Пустой» по заселённости корпус не означает отсутствие рамок. Временный корпус P57 находится вне модели учёта приложения.
