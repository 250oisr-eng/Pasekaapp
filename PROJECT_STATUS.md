## Проверка CI исправления публикации PASS — 2026-11-20

- На точном SHA `7160e0cf060b5ca9acb429d850ca3984e3194464` [Build Android APK #44614534185](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44614534185) завершился **completed/success**: regression tests, Android Gradle debug APK и Upload APK прошли успешно (по шагам GitHub Actions). Отдельный [Build isolated archive test APK #44614534256](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44614534256) — **completed/skipped**, не выдавать за успех.
- Данный CI-SHA включает исправление `Sanitize-Report` и негативный PS5.1 mock. Он **не** является физическим тестом нового Windows-скрипта. Сведения о предыдущем реальном отчёте 9/9 остаются отдельными.
- Перед новым ручным запуском заменить только `scripts/windows/Publish-Paseka-Test-Report.ps1` из проверенного SHA `7160e0cf060b5ca9acb429d850ca3984e3194464` в прежней папке локального агента; дождаться подтверждения замены. Старую ссылку `bbf7d1d5...` не использовать.
- Документационное обновление создаёт следующий HEAD, которому нельзя автоматически приписывать эти CI-проверки; code/test SHA остаётся указан выше. Запрещены merge, production deployment и Task Scheduler.

---

## Контрольная точка — проверка достоверности публичного PASS (2026-11-20)

- В Draft PR #199 устранён дефект в `scripts/windows/Publish-Paseka-Test-Report.ps1`: при `status=PASS` теперь проверяется отсутствие `FAIL` и в первой фазе до перезапуска, и в итоговой фазе. Ранее проверялся список результатов только итоговой фазы, несмотря на проверку количества элементов первой.
- В `tests/windows-local-agent.ps1` добавлена негативная регрессия: фазе до перезапуска подставляется `FAIL` при сохранённых `phaseOne.pass=true` и финальных 9/9 PASS; публикация обязана отклонить противоречивый отчёт.
- Code SHA `ec54e5d5f0a4c0c279e90b2b24a7b5565e9aaa18`, test SHA `aa13ec6ba7550232edd4822a1038a0d40caa4d65`. Новый CI на итоговом HEAD пока не подтверждён; физический Windows/Android прогон **не выполнялся**.
- **Ранее выданный файл на SHA `bbf7d1d...` больше не является последним исправлением.** Перед следующим локальным тестом пользователь должен заменить ровно один файл `Publish-Paseka-Test-Report.ps1` из актуального HEAD PR #199, после успешной проверки CI; автоматический или ручной тест запрещён до подтверждения замены. Не смешивать отчёты/тестовые APK разных комплектов.
- Следующий шаг: проверить GitHub Actions на окончательном SHA ветки #199, затем подтвердить пользователю актуальную ссылку на заменяемый файл. Без merge/main/production/Task Scheduler.

---

## 2026-11-19 — локальный агент: фактическая первая публикация в GitHub подтверждена

- **Физический ручной OnePlus/Windows 11 USB запуск:** GitHub issue [#198](https://github.com/250oisr-eng/Pasekaapp/issues/198) содержит подтверждённый [комментарий #7021784139](https://github.com/250oisr-eng/Pasekaapp/issues/198#issuecomment-7021784139), созданный аккаунтом пользователя `250oisr-eng`. Уникальный marker/runId `b77fda3f1dd846119a79`; test-only package `ru.paseka.journal.device.r44604951938a2` и CI source SHA `c3c973b65fcf593decd5a3465a2b8070175b59fd`. Режим `normal`: **7/7 PASS** до перезапуска, **9/9 PASS** после, все девять именованных check-результатов PASS. Это подтверждает работоспособность локального агента и end-to-end отправку обезличенного отчёта в GitHub в пределах тестового сценария, **не** продакшен, не реальная база, не video restore и не offline-тест новой APK.
- Первоначальная публикация прошла с некорректной кириллицей и слитыми строками заголовка из-за чтения созданного Windows `UTF-8 без BOM` файла pending через `Get-Content -Raw` в PowerShell 5.1 (используется ANSI-кодовая страница). Обнаружено при непосредственной проверке текста комментария GitHub API. Существующий комментарий #7021784139 **отредактирован на GitHub без изменения результатов**: восстановлены читаемая русская разметка, исходный marker/runId, точный package, CI SHA, этапы 7/7/9/9 и все девять именованных PASS. Не создано дополнительных комментариев или пользовательских вложений.
- В PR #199 для **следующих** публикаций: `Read-PendingComment -Encoding UTF8` для BOM-less файла очереди; `Test-PendingUtf8` создаёт временный BOM-less UTF-8 файл с кириллицей и проверяет точное чтение и JSON roundtrip, без сети/секретов; построение Markdown через `List[string].Add`, вместо неоднозначных выражений с запятыми. Windows PS5.1 regression проверяет перенос строки между скрытым marker и читаемым заголовком.
- **Кодовый SHA `bbf7d1d5bea3bdc17b389df3a4145403f3df83d9`**: [Fast quality #44612855426](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44612855426) **completed/success**, [Win11 kit #44612855519](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44612855519) этап `validate-windows-script` **completed/success**, полный Android build этап выполняется отдельно и не приравнивается к success до завершения. Предыдущий SHA `eba05f0d31639d7e778b0ee39fe9beb0eeb00855` вернул CI failure из-за действительно слитых Markdown-строк, дефект исправлен. Проверять CI на актуальном HEAD после docs-only изменений.
- **Действия пользователя не требуются** для уже опубликованного отчёта. Для будущих ручных тестов агент по-прежнему запускается только по его команде, через USB, с ограниченным fine-grained PAT. Не регистрировать Task Scheduler, фоновый сервис или remote control, не загружать raw JSON, скриншоты, токены или приватные записи в публичный issue. Draft PR #199, main и production не менялись.
- Следующая техническая задача проекта остаётся отдельной: контролируемый Android system picker восстановление тестового `.paseka` и тест аварийной записи; **не** считать текущий 9/9 покрытием этих ветвей.

---

## 2026-11-19 — повторная отправка сохранённого отчёта: ошибка поля body в локальном PS5.1

- Пользователь сообщил `REPORT UPLOAD NOT CONFIRMED: Unsafe GitHub comment payload: missing string body.` после запуска `RETRY-REPORT-UPLOAD.cmd`. Отказ был **локальным до HTTP POST**, поэтому на основании данного сообщения GitHub не получал новый комментарий. Обезличенная очередь и исходный физический Android PASS-отчёт по прежнему тестовому пакету остаются на ПК.
- Предыдущая защита выполняла вторичный `ConvertFrom-Json` с доступом к `PSObject.Properties['body']`; реальный pending summary этой проверкой ошибочно отклонялся. Код исправлен **без ослабления проверки источника очереди**: `New-CommentJson` принимает только строку, начинающуюся с `<!-- paseka-test-agent:<20 hex> -->`, проверяет совпадение marker с filename, длину до 8000, затем единожды сериализует PSCustomObject `{body: string}`. HTTP POST принимает сериализованное содержимое с ограничением размера; не интерпретирует его повторно. Негативные условия fail closed. Локальный SelfTest проверяет JSON round-trip и отказ от постороннего marker; внешних сетевых запросов в SelfTest нет.
- Рабочий **кодовый SHA `95622292446dcaa60cb92a5ebda1e2b80d4a0b63`**. Win PS5.1 проверки #44611084695 validate-windows-script **success**, fast quality #44611084647 **success**. Изолированная Android сборка на этом SHA проверяется отдельно; незавершённый статус не считать успехом. Промежуточный неуспешный SHA `962dad3127ac2d7608ee27948a791aeadd90cd12` имел синтаксическое повреждение при программной вставке и **не использовать**.
- Следующий шаг: в уже существующей распакованной папке пользователя заменить только `Publish-Paseka-Test-Report.ps1` версией с code SHA `95622292446dcaa60cb92a5ebda1e2b80d4a0b63` и запустить `RETRY-REPORT-UPLOAD.cmd` **однократно**. APK, USB, телефон, `device-package.txt`, токен, pending и reports не трогать. Если GitHub снова вернёт 422, безопасная HTTP-классификация остаётся в загрузчике; сообщать только эту строку.
- GitHub issue #198 остаётся единственным приемником обезличенных синтетических комментариев. Draft PR #199 не сливать, Task Scheduler/автозапуск не включать, main/production не менять.

---

## 2026-11-19 — Local GitHub report upload: payload check rejected pending summary

- User ran `RETRY-REPORT-UPLOAD.cmd` after the HTTP 422 diagnostics update. This time the local uploader refused its own queued comment with `Unsafe GitHub comment payload; upload blocked`. **No GitHub request was made at this stage**; physical Android run remains a local PASS and pending anonymized report is preserved. Do not delete or modify the queue, original report, APK, device metadata, DPAPI token or production data. GitHub issue #198 still had zero comments at observation.
- Refined `scripts/windows/Publish-Paseka-Test-Report.ps1`: outgoing JSON `body` now checked by explicit PSObject property access after `ConvertFrom-Json -InputObject`, with distinct fail-closed error categories (invalid object, missing body, invalid marker/length), avoiding reliance on ambiguous pipeline wrapper. Kept validation of 8 KB limit, marker prefix, token isolation, duplicate handling and safe HTTP 422 diagnostics.
- Added test-mode outgoing serialization/validation for a representative synthetic comment, including the rejection of an unrelated marker, and regression assertion in `tests/windows-local-agent.ps1`. Tests do not post to GitHub or expose private data.
- Code SHA `05fe84f17054e2359c9db8cb571fed5b53b84e12`: Windows PowerShell 5.1 validation job and fast quality suite **success**; isolated kit build #44610029072 pending/in progress at recording and must be reported separately. The earlier intermediate build failures/cancellations are not successes.
- Recover on the **same user's original kit** by replacing only its `Publish-Paseka-Test-Report.ps1` from this exact SHA, then running `RETRY-REPORT-UPLOAD.cmd` once. **Do not download a new test APK**: its new package would be incompatible with the preserved report. If the same failure persists, retain the queue and use distinct error category to pinpoint actual pending formatting before another retry.
- Draft PR #199; no main modification, scheduled background task, public raw data, merge or production deployment.

---

## 2026-11-19 — GitHub issue #198 upload 422: safe diagnostic update

- User ran `RETRY-REPORT-UPLOAD.cmd` after fixing previous empty-comment StrictMode error. The local report and sanitized pending summary remain intact; GitHub rejected the POST with **HTTP 422 Unprocessable Entity**. No claim of successful upload; GitHub issue #198 was confirmed **open, unlocked, with zero comments**.
- HTTP 422 is ambiguous (GitHub: validation error or anti-spam/abuse protection). Without the response validation body it is **not possible to attribute 422 to token scope, body formatting or rate-limiting**. Do not rotate/reveal token or re-run Android based on a guess.
- Test-only uploader `scripts/windows/Publish-Paseka-Test-Report.ps1` now validates outgoing JSON `body` before POST and, when HTTP errors occur, prints **only** allowlisted HTTP status, category and validation field/code. Arbitrary API message, user data, token, raw report, file paths and entire response are not printed. `SelfTest` covers 422 field invalid, anti-spam category and private-message non-disclosure. Preserve fail-closed duplicate guard and local pending queue.
- Code SHA `21b03bde6bded17f59d1e4fb39f6271974575131`; Windows PowerShell 5.1 validation and quality CI **success** on this SHA. Isolated Android APK workflow #44609144729 is checked separately; do not claim success until finished.
- Safe next step: replace **only** `Publish-Paseka-Test-Report.ps1` within the original user's kit `ru.paseka.journal.device.r44604951938a2` with this fixed SHA and run `RETRY-REPORT-UPLOAD.cmd` once. Report the new sanitized `GitHub HTTP 422; category=...; errors=...` line. No phone/ADB re-test, no new token, no moving reports, no production or main changes.
- Remains Draft PR #199, Task Scheduler disabled, no auto-run and no merge/deployment.

---

## 2026-11-19 — устранение отказа публикации отчёта первого физического запуска агента

- Получен консольный вывод пользователя: ручной test-only USB/ADB run package `ru.paseka.journal.device.r44604951938a2` завершился **PASS**, сохранён `reports/agent-7809b7d751b3473885371aa942f9456b/report.json`; шаг публикации в GitHub issue #198 завершился **ошибкой** `The property 'body' cannot be found on this object`. Это не подтверждение 9/9: консольный PASS подтверждает общий успех, но без повторного чтения JSON не назначать отдельные технические результаты. GitHub issue #198 на момент проверки не содержал комментариев, публикация не состоялась. Локальная pending-копия обезличенной сводки сохранена агентом.
- Корень дефекта: Windows PowerShell 5.1 с StrictMode мог получить для пустого списка комментариев GitHub один `$null` внутри массива и обращался к `$comment.body`. Исправлено `scripts/windows/Publish-Paseka-Test-Report.ps1`: безопасное устранение null-элементов, проверка формы непустого ответа, сохранение механизма предотвращения повторной отправки; malformed responses → fail closed. Добавлен локальный `SelfTest` (empty/null/matching/unrelated/malformed) и Windows PS5.1 regression в `tests/windows-local-agent.ps1`.
- Восстановление без переустановки APK: заменить **только** `Publish-Paseka-Test-Report.ps1` в старом распакованном комплекте пользователя версией из исправленного PR #199 и нажать `RETRY-REPORT-UPLOAD.cmd`. Нельзя заменять APK, device-package.txt, device-build-sha.txt или переносить исходный report в другой ZIP: строгая проверка связки отчёта+APK должна остаться на прежней сборке. GitHub-токен DPAPI не требуется создавать повторно. Не публиковать вручную неочищенный отчёт и не присылать токен.
- Изменены только uploader, Windows-мок и документы. Не выполнять Task Scheduler, merge, production deployment или операции с реальными записями пасеки. Новая физическая Android проверка для исправления чистой передачи не требуется.
- CI на исправленном кодовом SHA `f4d60f9cafb370a20d08e8d8257dea2fe1f98d79`: fast quality и Windows PS5.1 smoke **success**, отдельная изолированная Android-сборка оценивается независимо; не переносить статус незавершённого Gradle на результат исправления uploader. После docs-only SHA проверять CI отдельно.

---

## 2026-11-19 — ручной локальный Win11 агент с обезличенными GitHub-отчётами (Draft PR #199)

- **Новое прямое решение пользователя:** реализовать локальный агент на Windows 11 для запуска тестовой APK по ручной команде пользователя и автоматической отправки результатов в GitHub. Это **узкое исключение** из предыдущего запрета auto-upload: разрешены только обезличенные synthetic-only PASS/FAIL summaries; не включены постоянная служба, Task Scheduler, отправка исходного JSON, скриншотов, путей ПК, пользовательской базы, фото, видео или токенов. Запуск теста остаётся двойным щелчком на ПК, без удалённого доступа ChatGPT к Windows.
- Созданы **Draft PR [#199](https://github.com/250oisr-eng/Pasekaapp/pull/199)** поверх PR #197 и публичный технический [issue #198](https://github.com/250oisr-eng/Pasekaapp/issues/198) для только синтетических обезличенных отчётов. Issue до первого реального локального запуска не является доказательством физической передачи.
- Код: `scripts/windows/Invoke-Paseka-Test-Agent.ps1`, `Publish-Paseka-Test-Report.ps1`, `SETUP-REPORT-UPLOAD.cmd`, `START-AGENT-TESTS.cmd`, `START-AGENT-OFFLINE.cmd`, `RETRY-REPORT-UPLOAD.cmd`, расширение `Run-Paseka-Tests.ps1` строго проверенным `-AgentRunId` для выделенной `reports/agent-<guid>` папки, обновление отдельного `.github/workflows/android-device-selftest.yml` и README. Существующие ручные `START-TESTS.cmd` и `START-OFFLINE-TESTS.cmd` не затронуты, production код не менялся.
- Публикация только allowlist: ручной `PASS/FAIL`, `normal/manual-offline`, test-only package `ru.paseka.journal.device.r...a...`, CI SHA из `device-build-sha.txt`, 20-символьный synthetic runId и status/check names. Перед публикацией проверить формат, фазовые счётчики, exact package, реальный SHA-256 APK. Детали ошибок, JSON, Screenshots, Android serial и личные данные не передаются в публичный issue. На стороне Windows GitHub PAT с минимальными правами `Issues: Read and write` только к `Pasekaapp` шифруется Windows DPAPI в локальном профиле пользователя, а не хранится в репозитории/архиве. Повторы отсекаются по уникальному marker в комментариях; при ошибке сети/авторизации локальная очередь и ручной retry.
- **Проверенный кодовый SHA** `c3c973b65fcf593decd5a3465a2b8070175b59fd`. [Windows+isolated Android kit #44604951938](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44604951938) **attempt 2 completed/success** (Windows PowerShell 5.1 parser, mock privacy/identity guards, 763/763 Node tests, Java/Gradle build, AAPT package и ZIP upload). Первый attempt failed при загрузке Maven dependencies, перезапущены только failed jobs; не скрывать ошибку инфраструктуры. [Android CI #44604952169](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44604952169) completed/success на том же SHA; fast-quality CI #44604952015 success, isolated archive-only CI skipped.
- **Переносимый комплект:** [artifact #14568443986](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44604951938/artifacts/14568443986), `paseka-win11-android-selftest-kit`, test package `ru.paseka.journal.device.r44604951938a2` (attempt 2), размер **11 840 998 bytes**, digest `sha256:b06c1671ee441a8cb93c0f62897c72d77ca790047218213de24eb593c2e44e1c`, хранится до **2026-12-03 20:08 UTC**. Не путать с предыдущими a1 package/artifacts.
- **Что НЕ выполнено:** пользователь ещё не запускал новый `SETUP-REPORT-UPLOAD.cmd` (требуется безопасно созданный им fine-grained PAT), не запускал агент с физическим USB после настройки, не проверена фактическая запись комментария в issue #198. Не считать CI proof of external GitHub write. Старый физический offline 11/11 относится к предыдущему тестовому Android package и остаётся корректной исторической проверкой, но не проверкой нового агента.
- Следующий шаг: при участии пользователя однократно настроить токен на ПК (НЕ присылать токен в чат), скачать ZIP, выполнить `START-AGENT-TESTS.cmd` и проверить в issue #198 обезличенный отчёт и точный synthetic package/runId. После этого ChatGPT сможет самостоятельно читать отчёт из GitHub при следующих проверках. Сначала проверить новую сборку/CI после docs-only SHA; не говорить о физическом успехе заранее.
- Без merge, изменений `main`, production deployment, автозапуска расписания или операций над настоящими данными.

---

## 2026-11-19 — OnePlus manual-offline 11/11 PASS, PR #197

- Предоставлен пользовательский файл `report(8).json` и скриншот `before-restart(4).png`. JSON самостоятельно разобран: `format=paseka-windows-test-report-v1`, `status=PASS`, `mode=manual-offline`, `error=""`; `runId=67ae11c975d3449ba7e6` совпадает для обеих фаз. `phaseOne`: `awaiting_restart`, **8/8 PASS**. `final`: `complete`, **11/11 PASS**. Среди результатов `offline_network_disabled_before_archive` и `offline_network_disabled_after_restart` оба PASS, `archive_export_preflight_commit_rollback` PASS, `native_downloads_reject_incomplete_and_oversize` PASS, `native_downloads_archive_hash_and_cleanup` PASS, `real_android_restart_persists_indexeddb` PASS. Скриншот подтверждает только pre-restart 8/8; post-restart подтверждён JSON.
- Сопоставлено с фактической сборкой: `testedPackage=ru.paseka.journal.device.r44602022835a1`; [Win11 isolated kit #44602022835](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44602022835) на SHA `10c112cef6fe4a6854b51812caf02bcf6da319b8` завершён **success**, Windows PowerShell 5.1+762/762 Node tests+Android Gradle+APK identity; [regular Android #44602040875](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44602040875) также **success**. Artifact #14568636235.
- Подтверждена воспроизводимость offline-тестового сценария на физическом OnePlus при отсутствии network INTERNET capability до и после рестарта. Это **isolated-android-package-and-test-only-indexeddb**, а не проверки production, пользовательских архивов или передачи настоящих видео. Статус `manual-offline` не означает теста системного file picker: `native-file-picker` и `manual-visual-legibility` остались явно `notVerified` в отчёте.
- На скриншоте вновь наблюдаются слишком длинные технические идентификаторы тестов и низкая контрастность строки состояния: отдельная UX-задача тестовой оболочки; не отменяет функциональный 11/11.
- Следующие release-блокеры: безопасное физическое испытание штатного Android system picker с тестовым `.paseka`, отдельное покрытие ошибок `openOutputStream` и восстановление архива с реальным видеосодержимым на синтетическом независимом dataset. Для следующего испытания готовить новый уникальный test-only Android package и новые отчёты; не переносить результат 11/11 на другое APK.
- Решение пользователя неизменно: Windows/USB проверка **только ручная**, без Task Scheduler, auto-upload и удалённого доступа к ПК. Никаких merge, main changes, release/deploy или операций с настоящими данными. PR #197 остаётся Draft. После этого SHA создаются лишь документационные коммиты — не заявлять, что они прошли тот же CI.

---

## Контрольная точка — PR #197: изолированная Windows/Android офлайн-сборка проверена CI (2026-11-19)

- **Точный code+docs SHA:** `2181e56faeca7cd56ffb00ae92b12054a14fd526`. [Win11 isolated device kit #44600658795](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44600658795) **completed/success**, attempt 1: PowerShell 5.1 mock/parse/USB selection, Node **762/762 PASS, 0 fail**, Java/Gradle `BUILD SUCCESSFUL`, AAPT package verification, ZIP uploaded. Ранее ожидавший workflow #44600648843 на промежуточном SHA завершился **cancelled**, не success. Обычный [Android workflow #44600682379](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44600682379) completed/success, archive-only #44600682172 skipped.
- Подтверждённый физически устанавливаемый изолированный package: `ru.paseka.journal.device.r44600658795a1`; ZIP artifact [#14569440075](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44600658795/artifacts/14569440075) `paseka-win11-android-selftest-kit`, 11,832,219 bytes, `sha256:2372233a2cd6efa9b892b9fc40232c146eb7b57dda1e445677334598867fa94c`, срок до **2026-12-03 19:47 UTC**.
- Для реального офлайн-испытания пользователь вручную отключает Wi-Fi и мобильные данные на OnePlus, подключает разрешённый USB и запускает **только** `START-OFFLINE-TESTS.cmd`. Скрипты НЕ меняют сеть, не используют беспроводной ADB, не удаляют пользовательские архивы и не запускают расписание. Android ConnectivityManager обязан подтвердить отсутствие доступной сети с INTERNET capability до/после перезапуска; отчёт `mode=manual-offline`, ожидается **8/8 phaseOne, 11/11 final**.
- Стандартный `START-TESTS.cmd` не меняет предыдущую приёмку 9/9. Реальный офлайн-отчёт ещё НЕ получен; кодовая проверка CI не означает физическое подтверждение. Системный file picker и аварийная инъекция openOutputStream исключения не проверены. Тестовые фикстуры пока не дают доказательства переноса реальных видеороликов. Production/Main нетронуты; PR Draft. После этого checkpoint HEAD изменится docs-only и должен отдельно проверяться при необходимости.

---

## 2026-11-19 — опциональная ручная офлайн-проверка полного архива через Win11/USB

- После физического `report(7).json` 9/9 PASS из PR #196 подготовлена отдельная stacked test-only ветка `test/manual-android-offline-archive-2026-11-19` от документационного HEAD PR #196 `6054826cccf819561d411a71b9716426b0d40b68`. Основной код архива и IndexedDB не изменены.
- `scripts/prepare-device-selftest.mjs` генерирует test-only Java bridge с `offlineRequested()` и fail-closed `isNetworkOffline()` через Android ConnectivityManager, проверяющим **все доступные сети** на `NET_CAPABILITY_INTERNET`. Разрешение `ACCESS_NETWORK_STATE` добавляется только в генерируемую изолированную APK, никогда в рабочую production-установку. Ни Wi-Fi, ни мобильные данные скрипты не переключают.
- `tests/device-selftest.js` выполняет два дополнительных native offline checks: до synthetic archive export/preflight/commit/rollback и после настоящего Android restart. Если сеть обнаружена или ConnectivityManager недоступен, сценарий останавливается FAIL до критического этапа. Отдельный optional mode `manual-offline`: **8/8 до рестарта, 11/11 после**; стандартные ручные 9/9 остаются без изменений.
- `scripts/windows/Run-Paseka-Tests.ps1 -Offline` передаёт безопасный Intent flag через ADB, требует USB transport (игнорирует Wi-Fi endpoint), не меняет сеть на телефоне. Добавлен `scripts/windows/START-OFFLINE-TESTS.cmd` в ZIP; оператор должен вручную выключить Wi-Fi/мобильные данные и подключить USB. `START-TESTS.cmd` не изменён. Никакого Windows Task Scheduler и никаких автоматических задач.
- Тесты исходника и документация проверяют изолированный Java network API, наличие explicit offline флага дважды (до и после рестарта), отчётные счётчики, отсутствие сетевых управляющих API и наличие offline launcher в package workflow.
- Offline-only physical 11/11, а также системный native picker — **ещё не выполнены**. Предыдущий физический 9/9 сохраняет силу только для своей test-only APK. Следующий шаг: Android CI на точном SHA + Windows PowerShell 5.1; затем при успехе новый ZIP и добровольное ручное выключение сети на OnePlus для отдельного физического запуска. Сетевой тест не равен проверке системного выбора файла.
- Без merge, изменения main, publication/deploy, реальных записей, резервных копий и офлайн-кеша production. 

---

## 2026-11-19 — подтверждён физический OnePlus 9/9 PASS, PR #196

- Пользователь прислал `report(7).json` и `before-restart(3).png`. Проверены JSON `format=paseka-windows-test-report-v1`, `status=PASS`, `error=""`, `runId=475ff5d763624f348c07`, `testedPackage=ru.paseka.journal.device.r44598762090a1`. Этап 1: `awaiting_restart`, **7/7 PASS**, включая новый `native_downloads_reject_incomplete_and_oversize`. Этап 2: `complete`, **9/9 PASS**, включая `real_android_restart_persists_indexeddb` и `real_card_renderer_after_restart`. Один runId на обеих фазах. Скриншот показывает 7/7 до рестарта; post-restart подтверждён отчётом, не скриншотом.
- Соответствие фактическому GitHub: [Win11 + isolated Android kit run #44598762090](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44598762090) completed/success для **точного HEAD `ede9cebf451a9768a59b89125faaeb65ecdead5d`**, пакет `ru.paseka.journal.device.r44598762090a1`, artifact **#14566477961** (до 2026-12-03 19:31 UTC). Windows PS5.1, 761/761 тестов, Android compile и AAPT package проверены. Отдельный Android CI #44598770335 completed/success, isolated archive-only workflow skipped.
- Физически проверен positive-path native SHA-256/cleanup, отказ от нулевого/отрицательного expectedBytes, от неполной 3/10-byte записи с отказом публикации, от oversized 6/4-byte chunk, отсутствие обнаруженных test-owned row после отмены, export/stage/commit/rollback и restart. Только **изолированное test-only приложение** с синтетическими данными; нет основания утверждать проверку файлов пользователя или реальных данных.
- Ограничения: настоящая инъекция исключения `openOutputStream`, системный native file picker, отключение сети/проверка offline transport и полноценная ручная визуальная приёмка не проводились. На изображении видны длинные идентификаторы тестов, выходящие за удобную ширину, и белая системная строка на светлом фоне — отдельный косметический дефект тестовой оболочки.
- Пользователь подтвердил исключительно **ручной** режим тестов через ПК. Task Scheduler не устанавливать; никаких merge, main write, production/deployment, изменения или удаления рабочих архивов. PR #196 оставлен Draft.
- Следующий технический приоритет: изолированный безопасный native-picker/offline сценарий с synthetic-only архивом; отдельно построить воспроизводимый тест аварийного `openOutputStream` с проверкой cleanup. Не переносить статус 9/9 на эти непроверенные сценарии.

---

## 2026-11-19 — итог CI для PR #196 (точный кодовый SHA, manual Android 9/9 ещё ожидается)

- **Финальный code/test HEAD**: `2cfb0ac6d0fa7b788bedaf2def6a5810488ecd28`. [Windows 11 + Android kit #44597829170](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44597829170), **attempt 2** — completed/**success**. Windows PowerShell 5.1 validation completed/success; Node regression **761/761 PASS, 0 fail**, isolated Gradle debug APK compile, package AAPT identity verification, archive bridge injection and ZIP upload completed/success.
- **Первый attempt 1 завершился failure** на Gradle dependency download из-за HTTP **429 Too Many Requests от repo.maven.apache.org**, при этом Windows и Node tests прошли. Failed jobs были перезапущены штатной командой GitHub; attempt 2 успешен. Первую ошибку не считать дефектом логики, но сохранять в истории для аудита инфраструктуры.
- Проверенный AAPT package: `ru.paseka.journal.device.r44597829170a2` (run attempt 2, НЕ старый a1); ZIP artifact [#14566252908](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44597829170/artifacts/14566252908), `paseka-win11-android-selftest-kit`, 11,830,205 bytes, digest `sha256:48e63981acdeeaa0009ab37eb65b22753a2dfe3c7dbcc34341879801dff81dfd`, срок до **2026-12-03 19:28 UTC**.
- [Build Android APK #44597858029](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44597858029) тоже completed/success на том же HEAD. [Build isolated archive test APK #44597858035](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44597858035) **skipped** — отдельного покрытия от него нет.
- Результаты GitHub **не являются физическим 9/9**: для нового ZIP нужен ручной USB запуск `START-TESTS.cmd` на Windows 11 с OnePlus и новый `reports/.../report.json`. Ожидается 7/7 до Android restart и **9/9 final**. Прежние отчёты 8/8 принадлежат другой APK и не засчитываются.
- После этого кодового SHA новые изменения должны быть только документационными; на них нельзя автоматически переносить статус CI. Не запускать Task Scheduler, не устанавливать APK поверх `ru.paseka.journal`, не удалять чужие файлы из Downloads. Native file picker/offline и физическая инъекция `openOutputStream` по-прежнему вне охвата.

---

## 2026-11-19 — отдельная физическая проверка отказов MediaStore (следующая после PR #195)

- Подтверждённый предыдущий этап: PR #195, test-only APK `ru.paseka.journal.device.r44596186324a1`, физический `report(6).json`: 6/6 до перезапуска и 8/8 после него. Это НЕ проверка новых негативных сценариев.
- Создана stacked test-only ветка `test/pr194-native-negative-paths-2026-11-19` поверх последнего HEAD PR #195 `067861c04d82f0efbf5a9ad91392b0ba3862b19f`. Производственный код `PasekaArchiveDownloadBridge`, `js/paseka-android-download.js`, IndexedDB и формат архива не меняются.
- Добавлена **только для изолированной APK** отдельная девятая Android-проверка `native_downloads_reject_incomplete_and_oversize`: запрет ожидаемого размера 0/-1 до создания MediaStore, 3 байта вместо ожидаемых 10 (отказ `finishFile` и удаление pending), oversized base64-block 6 при ожидаемых 4 (отказ `appendChunk` и `cancelFile`). Проверка созданных строк — read-only `countOwnTestDownloadRows()` в test bridge, с ограничениями имени `testDownloadName()` данного runId, owner package и Downloads/Пасека; удаление этой функцией не выполняется. При невозможности чтения API возвращает -1 и тест проваливается (fail closed).
- В CI/Windows manual runner нормой полного нового отчёта являются 7/7 до restart и **9/9 после restart**. Прежние достоверные отчёты 8/8 оставлены в исторической документации без переписывания. Task Scheduler не устанавливается; даже предусмотренный approval guard старого типа обновлён на 9/9 для исключения использования старого отчёта. Запуск исключительно вручную из отдельного ZIP.
- Изменены только `scripts/prepare-device-selftest.mjs`, `tests/device-selftest.js`, `tests/device-selftest-build.test.mjs`, `scripts/windows/Run-Local-Scheduled.ps1`, `scripts/windows/Register-Local-Scheduled.ps1`, `tests/windows-local-schedule.ps1`, `scripts/windows/README-WIN11.txt`, workflow branch trigger и документы. Это тестовый код; при удалении ветки приложение остаётся прежним.
- **Проверки на финальном SHA пока не подтверждены**: необходимы Windows PowerShell 5.1 parser/mock, npm regression, реальная Java-компиляция Android bridge, уникальная APK+ZIP и новый физический отчёт на OnePlus. Ни успешный CI, ни ранее полученный 8/8 нельзя засчитывать новому тесту. `openOutputStream` exception injection, native file picker и offline transport этим блоком не проверяются.
- Не сливать PR, не менять main, реальные архивы, production или рабочий Android package; не запускать расписание. Следующий шаг — финальная сборка, анализ CI, затем ручная изолированная физическая 9/9 проверка через ПК.

---

## 2026-11-19 — физический OnePlus PASS по объединённой test-only ветке PR #195

- Получен пользовательский `report(6).json` и скриншот `before-restart(2).png`. Тестовый package `ru.paseka.journal.device.r44596186324a1`, runId `f984b6f8bc86441b9026`; `phaseOne` = `awaiting_restart`, **6/6 PASS**, `final` = `complete`, **8/8 PASS**, error пуст. Оба этапа имеют один runId и отмечены как `isolated-android-package-and-test-only-indexeddb`. На скриншоте видны шесть зелёных проверок до перезапуска; post-restart результат подтверждается JSON, не этим скриншотом.
- Сопоставлено с GitHub Actions [Win11 + Android selftest #44596186324](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44596186324), точный тестовый commit `868f8b34d099404fb4361cc7c74c03935a74d078`: `validate-windows-script` и `build` — completed/success, включая Windows PowerShell 5.1, `npm test`, сборку isolated APK и ZIP upload. Artifact ID `14565926717`, имя `paseka-win11-android-selftest-kit`, срок до 2026-12-03 19:16 UTC. Обычный Android workflow [#44596220000](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44596220000) на том же SHA тоже completed/success. Изолированный архивный workflow #44596219809 — skipped (не считать выполненной проверкой).
- Test-only APK содержит побайтно идентичные исходному PR #194 три файла (`js/paseka-android-download.js`, `scripts/prepare-android-archive-download.mjs`, `tests/android-archive-download.test.mjs`); подтверждённый набор тестов проверяет положительный путь `native_downloads_archive_hash_and_cleanup`, export/preflight/commit/rollback, guard against unconfirmed treatment, revision guard, фактический restart/IndexedDB и карточки. **Отдельной физической инъекции неполной записи/ошибок `beginFile`/MediaStore этот отчёт не демонстрирует**; negative coverage остаётся mock/source-contract и CI.
- Не проверены `native-file-picker`, `offline-network-transport`, полная визуальная читаемость экрана. На предоставленном снимке длинные технические идентификаторы тестов переносятся на следующие строки, status bar белая на светлом фоне — потенциальный UX-недочёт тестовой оболочки; не блокировать положительные функциональные 8/8 этим наблюдением, не приписывать полную визуальную приёмку.
- Решение пользователя: Windows автоматизация остаётся **ручной**. Никаких Task Scheduler jobs, `-Install`, `-Run`, production, пользовательских записей, merge или deploy. Результат не делает PR #194 или весь архивный стек готовыми к production.
- Следующий приоритет: независимый negative-path тест Native MediaStore для неполной передачи и ошибок создания/записи с гарантированной очисткой только собственного test URI; затем native picker и офлайн-проверка в отдельном тестовом сценарии. Эти ворота release пока открыты.

---

## 2026-11-19 — подготовка ручной Win11/OnePlus проверки PR #194

- Решение пользователя: оставить Windows/ADB тестирование **только ручным**, не регистрировать Task Scheduler и не запускать scheduled `-Run`.
- Создана независимая **test-only** ветка `test/pr194-win11-manual-archive-2026-11-19` от HEAD Draft PR #186 `f7395b32194d807982742661f32afd6164df121a` с готовым изолированным Windows 11/Android тестовым комплектом.
- Три файла перенесены из **точного HEAD PR #194** `9a53a8fea63798ecc6825735840e07407fbc4fbf` без изменений содержимого: `js/paseka-android-download.js` (blob `4ef28f76`), `scripts/prepare-android-archive-download.mjs` (blob `d026b190`) и `tests/android-archive-download.test.mjs` (blob `d68a4afd`). Существующие сценарии тестового приложения сохраняются.
- Обновлён только trigger `.github/workflows/android-device-selftest.yml` для новой тестовой ветки; `workflow_dispatch` сохранён. В ней собирается отдельный APK с уникальным `ru.paseka.journal.device.r<run-id>a<attempt>` и ZIP для ручного запуска `START-TESTS.cmd` на Windows. Никакой scheduler не активируется.
- Обычный архивный PR #194 остаётся отдельным Draft, его собственные GitHub CI на HEAD `9a53a8fe` — 737/737 и Android сборка success; **они не проверяют физически этот новый комбинированный тестовый комплект**. Для нового SHA тестовой ветки необходимы отдельные GitHub Actions (Windows PS 5.1 mock + npm tests + Android build + artifact), затем **новый** физический report 8/8 PASS на OnePlus из того же ZIP. Старые reports не переносятся.
- Тесты работают только с синтетическим изолированным пакетом и его данными. Native picker, offline transport и реальные архивы не считаются проверенными автоматически. Слияние PR, publication/deploy, изменения `main`, production, реальной базы и резервных копий не выполнялись.
- Следующий шаг: сверить CI на **точном финальном SHA** новой ветки. Если есть ZIP — передать пользователю ссылку на artifact и однократную инструкцию ручного запуска USB; исследовать `report.json` и только затем фиксировать физический результат.

---

## Контрольная точка — новый OnePlus 8/8 PASS и реальный Win11 DRY RUN (2026-11-19)

- Пользователь представил `report(5).json` с результатом `status=PASS`, `runId=a75070c120bf40819172`, test-only package `ru.paseka.journal.device.r44528651797a1` из CI run `44528651797` (проверенный code SHA `6dd3004623b9d5c8dd77aa829d3b258164790c0f`). `phaseOne.pass=true` (6/6 checks), `final.pass=true` (8/8 checks), `error` пустой. Подтверждены штатный запуск/WebView, тестовые карточки, backup export/preflight/commit/rollback, native Downloads archive SHA/cleanup, Varroa guards, real Android restart IndexedDB, card renderer после restart.
- Представлен `before-restart(1).png`: экран показывает 6/6 PASS до рестарта; после-restart screenshot для этого запуска не получен, итоговые 8/8 подтверждены JSON-отчётом.
- Windows 11 пользователь реально выполнил без `-Run` `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\Run-Local-Scheduled.ps1`. Достоверный вывод: `DRY RUN: approved local kit for ru.paseka.journal.device.r44528651797a1` и `No ADB commands, installs or scheduled tasks were executed.`. Это подтверждает разрешающие проверки уже установленного комплекта и отсутствие действий DRY RUN, **но не физическую работоспособность повторного планового `-Run` или созданной задачи Windows**.
- Границы: тест только isolated-android-package-and-test-only-indexeddb; по-прежнему не проверены native-file-picker, offline-network-transport, manual-visual-legibility и отдельный Wi-Fi transport. USB/Wi-Fi явно не записывается в report.json.
- **Следующий необходимый выбор:** пользовательское локальное время `HH:mm` и согласие на регистрацию `Paseka-Local-Android-Selftest`. Без этого не создавать Windows Task Scheduler; скрипт по умолчанию даёт preview. При включении нужен физически подключённый авторизованный USB, интерактивная сессия Windows и уже установленная test-only APK. Отчёты остаются локальными, нет скачивания APK или изменения production.
- Документационная фиксация в существующем Draft PR #186, никаких слияний, production deployment и действий с реальной базой пасеки.

---

## Контрольная точка — Windows scheduler CI подтверждён (2026-11-19)

- **Точный проверенный кодовый HEAD**: `6dd3004623b9d5c8dd77aa829d3b258164790c0f` в существующем Draft PR #186. [Windows11 + isolated APK workflow #44528651797](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44528651797) — **SUCCESS**: Windows PowerShell 5.1 parser, мок-тест чтения Android-отчёта, USB/Wi-Fi mock, **Run-Local-Scheduled / Register-Local-Scheduled approval & preview mock**, все Node regression tests, сборка isolated Android APK и Windows ZIP.
- Другие workflow на том же SHA: Fast quality checks #44528651740 **SUCCESS**, Android APK #44528651622 и #44528663422 **SUCCESS**, independent isolated archive workflow #44528663201 **SKIPPED**. Нельзя выдавать SKIPPED за PASS.
- ZIP artifact `paseka-win11-android-selftest-kit` **ID 14531304135**, 11,682,099 bytes, expires `2026-12-03 12:59:00 UTC`. Включает `Run-Local-Scheduled.ps1`, `Register-Local-Scheduled.ps1`, старые runner и START-TESTS.cmd, официальный ADB, уникальную test-only APK.
- Проверка нового scheduler-скрипта на настоящем ПК и физический результат **этой новой APK** ещё не получены. Предыдущий подтверждённый физический 8/8 PASS относится к test APK из run #44526817635 (другой package/signing key). По безопасности новая сборка сначала требует собственный ручной 8/8 PASS в папке reports, только затем возможен -Run и opt-in -Install.
- **Задание Windows не создавалось**: не выбрано время; регистрация требует явного `-DailyAt HH:mm -Install` пользователя, не входит в CI. Нет auto-install/auto-update, auto-download, upload diagnostics, elevated privileges или работы с production. В плановом запуске USB-only и уже установленный тестовый package; Wi-Fi остаётся ручным.
- **Следующий шаг:** выполнить на Windows 11 ручной `START-TESTS.cmd` с артефактом 14531304135 и получить новый 8/8 PASS, затем проверить dry-run; после этого выбрать время и отдельно включить task по явному решению пользователя. Не merge/deploy/main/production.

---

## Этап — Windows 11 локальный автозапуск подготовлен, но не активирован (2026-11-19)

- Основание: пользовательский физический OnePlus test-only PASS 8/8, package `ru.paseka.journal.device.r44526817635a1`, run `cc7ba1ae3a5f434cacb9`, CI checked SHA `f79c8c9c2386f3c8ac8a682f012e8383bca1eff1`.
- Существующий Draft PR #186 расширен **только тестовой инфраструктурой**. `Run-Paseka-Tests.ps1` получил флаг окружения `PASEKA_SCHEDULED_NO_INSTALL=1`: тогда пропускает ADB install и требует уже установленный уникальный test-only package; обычный ручной `START-TESTS.cmd` сохраняет прежнее поведение.
- Новый `scripts/windows/Run-Local-Scheduled.ps1` по умолчанию выполняет только dry-run без ADB; `-Run` разрешён лишь после проверки локального APK SHA-256 и 8/8 PASS из той же папки reports для **того же** package ID. Плановое подключение ограничено USB; Wi-Fi endpoint не наследуется, не скачиваются новые APK или скрипты, нет автоотправки отчётов.
- `scripts/windows/Register-Local-Scheduled.ps1`: безопасный preview по `-DailyAt HH:mm`; реальная регистрация Windows Task Scheduler только после отдельного ключа `-Install` и доказанного 8/8 PASS; текущий интерактивный пользователь, без повышения прав, не заменяет существующую задачу. В проекте не выбран пользовательский час и на его Windows ничего не установлено.
- `tests/windows-local-schedule.ps1` запускает мок-тест PS 5.1 без телефона и регистрации задач; Node regression закрепляет условия, workflow проверяет и копирует оба скрипта в portable ZIP. README расширен. **CI после этих изменений ещё не подтверждён**, физический scheduler ещё не проверен; ни одно scheduled задание не активировалось.
- **Следующий шаг:** получить CI exact HEAD; при ошибках исправить. Затем ручной smoke-test нового ZIP с 8/8 PASS и dry-run. Точное расписание и включение task оставить отдельным решением пользователя после проверки. Main, production, базы, пользовательские файлы, merge не трогать.

---

## Контрольная точка — физический OnePlus 8/8 PASS (2026-11-19)

- Получены три пользовательских артефакта: `report(4).json`, `before-restart.png`, `after-restart.png`. Итог **PASS**, runId `cc7ba1ae3a5f434cacb9`, изолированный пакет `ru.paseka.journal.device.r44526817635a1`; это соответствует ZIP GitHub Actions run **44526817635** и проверенному CI SHA `f79c8c9c2386f3c8ac8a682f012e8383bca1eff1`.
- **8/8 итоговых checks PASS**: WebView/startup; тестовые карточки; archive export/preflight/commit/rollback; **native Downloads archive SHA-256/length/cleanup**; отбрасывание неподтверждённой Varroa обработки; защита revision rollback; сохранность IndexedDB после настоящего force-stop/start; повторная отрисовка карточек.
- Обе фазы отчёта (`awaiting_restart` и `complete`) имеют `pass=true`; error пустой. Пользовательские снимки показывают 6/6 перед перезапуском и 8/8 после. На них видны неудобные переносы длинных названий проверок и слабый контраст светлых элементов системного статус-бара; это отдельный UI backlog, не основание отрицать функциональный PASS.
- **Границы**: проверялся isolated-android-package-and-test-only-indexeddb; фактическое значение MediaStore MIME не измерялось, но конкретная тестовая проверка имени/папки/владельца/хеша/размера и cleanup вернула PASS. Не проверялись native file picker, offline network transport, читаемость рабочего приложения. Не подтверждён канал (USB или Wi-Fi) по JSON.
- До включения локального планировщика Windows остаётся отдельно проверить Wi-Fi pairing/transport при необходимости, сетевой offline сценарий, проверку отчётов/управление версиями тестового ZIP и защиту от выполнения непроверенных PR. Внедрение scheduler и автоотправка отчётов пока **не выполнены**.
- Код не менялся с проверенного CI `f79c8c9c...`; новая запись — документация в существующем Draft PR #186. Никаких merge, production deployment, изменений main или пользовательских данных.
- **Следующий шаг:** закрыть подготовительный физический этап, перейти к отдельному проектированию безопасного локального Windows Task Scheduler и недеструктивных offline/Wi-Fi tests, не объявляя их уже пройденными.

---

## Контрольная точка — OnePlus MIME fallback: CI успешен (2026-11-19)

- После физического `report(3).json` (7/8, `ERR_TEST_MIME`) в Draft PR #186 доработан только test-only Android MediaStore bridge: допускается `application/vnd.paseka.archive` или ровно `application/octet-stream`, плюс обязательная проверка `OWNER_PACKAGE_NAME == activity.getPackageName()` перед удалением. Реальный MIME OnePlus неизвестен; `application/octet-stream` — ограниченная гипотеза, не наблюдённое значение.
- **Проверенный точный HEAD:** `f79c8c9c2386f3c8ac8a682f012e8383bca1eff1`. [Windows + isolated Android kit workflow #44526817635](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44526817635) — **SUCCESS**, Windows PS 5.1 parse/ADB tests, Node regressions, isolated APK build, package check, ZIP upload. [Android APK workflow #44526822579](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44526822579) — **SUCCESS**; archive workflow #44526822608 — **SKIPPED**.
- ZIP `paseka-win11-android-selftest-kit`, GitHub artifact ID `14532865511`, 11,677,387 bytes, expires `2026-12-03 12:47:17 UTC`. Эта APK на физическом устройстве пока не проверена.
- **Следующий шаг:** выполнить новый физический тест только этого комплекта на OnePlus Android 15+ с USB (Wi-Fi допустим после ручного pairing), предоставить `report.json`. Не объявлять PASS без фактического отчёта, не удалять предыдущие тестовые файлы вручную и не включать планировщик до подтверждённого safe cleanup. Production/main/merge/deployment не затронуты.

---

## Контрольная точка — отчёт (3), Android MIME (2026-11-19)

- Пользователь прислал физический `report(3).json`: `status=FAIL`, `runId=f2ff998fdb344a128e40`, test-only package `ru.paseka.journal.device.r44525367280a1`, **7/8 PASS**, только `native_downloads_archive_hash_and_cleanup` возвращает **`ERR_TEST_MIME`**; отчёт не содержит фактическое значение MIME. Все архивные/Varroa/IndexedDB restart checks PASS.
- Источник Android `MediaStore.MediaColumns.MIME_TYPE` — вычисляемое read-only поле, часто на основе расширения. Для неизвестного `.paseka` правдоподобен `application/octet-stream`, но **это не подтверждённое значение на OnePlus**. Официальная документация: https://developer.android.com/reference/android/provider/MediaStore.MediaColumns.
- Минимальное изменение **только в test-only Java bridge**, генератор `scripts/prepare-device-selftest.mjs`: сохраняется точный MIME `application/vnd.paseka.archive` и дополнительно допускается **только** `application/octet-stream`; добавлено обязательное сравнение `OWNER_PACKAGE_NAME` с `activity.getPackageName()` (при null/недоступности — `ERR_TEST_OWNER`, удаление запрещено). Все проверки точного run-specific имени, каталога, Android URI, размера и SHA-256 обязательны до удаления. Production archive bridge и реальные записи не изменены.
- В `tests/device-selftest-build.test.mjs` закреплены допустимое MIME-исключение, guard владельца и порядок проверок до удаления. Повторная реальная проверка ещё нужна; данные остаются неизменными. Кодовые изменения `fd1bc0b`, `4503787`, `a27da01` (полный точный HEAD сверить в GitHub).
- **Следующий шаг:** подтверждение CI на новом HEAD и повторный физический OnePlus-прогон через отдельный ZIP. Не объявлять физический PASS и не включать scheduler до отчёта. Не удалять предыдущие тестовые файлы вручную, не трогать данные/production/main и не merge.

---

## Контрольная точка — диагностический Android ZIP готов (2026-11-19)

- По физическому OnePlus отчёту с 7/8 PASS и `ERR_NOT_TEST_ARCHIVE` подготовлена только fail-closed детализация отказа на `ERR_TEST_NAME`, `ERR_TEST_MIME` и `ERR_TEST_FOLDER`. Проверки имени, MIME, папки, SHA-256, длины и право удаления **не ослаблены**; production и база не изменены.
- **Точный проверенный HEAD:** `a36202f7f0f2f5b1b19d7a70a34f214ff701f00f` (кодовый коммит `b29de5afb62106e386033525cf79faab2520655b`, затем только документация).
- [Windows 11 и изолированная APK: GitHub Actions #44525367280](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44525367280) — **success**: PowerShell 5.1 parser; missing-report retry; mock USB/Wi-Fi selector; Node regression; Android test-only APK, package validation, ZIP upload.
- [Android APK PR CI #44525378927](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44525378927) — **success**; отдельный archive workflow #44525379279 — **skipped**, не проверка.
- Артефакт `paseka-win11-android-selftest-kit`, ID `14530045688`, 11,676,493 bytes, expires `2026-12-03 12:37:44 UTC`. Реальный запуск этой диагностической APK **ещё не выполнен**.
- **Следующий единственный шаг:** выполнить изолированный физический прогон этого ZIP с OnePlus Android 15+; получить `report.json`. В случае `ERR_TEST_NAME/MIME/FOLDER` определить несовпадающий metadata guard, не меняя правил удаления до подтверждения причины. Если останется тестовый архив в Downloads/Пасека, не удалять другие файлы.
- Нет нового реального подтверждения Wi-Fi; прежний физический отчёт не фиксировал transport. Не включать Windows scheduler / автоотправку диагностик до подтверждённого безопасного физического цикла. Main, merge, production, user data не трогать.

---

## Контрольная точка — физический OnePlus: 7/8, диагностика Downloads (2026-11-19)

- Пользователь прислал физический Windows/Android отчёт `report(2).json`, runId `ece1565a58ef4684a386`, package `ru.paseka.journal.device.r44522050363a1` (точная сборка #44522050363). Общий итог **FAIL**: семь из восьми итоговых проверок PASS; единственный FAIL `native_downloads_archive_hash_and_cleanup` с `ERR_NOT_TEST_ARCHIVE`.
- PASS: WebView startup, карточки ульев, archive export/preflight/commit/rollback, reject unconfirmed Varroa event, revision guard, real Android restart IndexedDB и повторная отрисовка. Это исключительно тестовая база и APK; production-данные не участвовали.
- Native test bridge возвращал общий `ERR_NOT_TEST_ARCHIVE` при несоответствии ровно одного из трёх признаков MediaStore: имени тестового файла, MIME или каталога. **Причина пока не определена**: нет исходных metadata. Удаление такого файла запрещено; возможно остался отдельный test-only архив в Downloads/Пасека, не удалять другие файлы.
- Текущая безопасная правка в существующем Draft PR #186 заменяет общую ошибку отдельными `ERR_TEST_NAME`, `ERR_TEST_MIME`, `ERR_TEST_FOLDER` при сохранении всех трёх строгих проверок до SHA-256 и удаления; добавлен регрессионный guard их порядка. Никакого ослабления правил и никаких изменений production. Кодовый SHA `b29de5afb62106e386033525cf79faab2520655b`; CI на этом коде пока не подтверждён.
- **Следующий шаг:** проверить CI на точном SHA, затем новый изолированный физический запуск для определения ошибочного metadata-поля. До получения такого результата не разрешать удаление по ослабленной проверке и не включать автоматический scheduler.

---

## Контрольная точка — USB/Wi-Fi CI подтверждён (2026-11-19)

- Проверен точный HEAD `f9049fceb0beceea9d7da40d8f20bf48b30672f8` существующего Draft PR #186.
- [Windows 11 + isolated Android kit run #44522050363](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44522050363): **success**. Windows PowerShell 5.1 parse, missing-report retry, mock USB/Wi-Fi selection, Node regression suite, isolated APK build, AAPT package verification and ZIP artifact upload завершились успешно.
- [Android APK PR run #44522060897](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44522060897) на том же SHA: **success**. Изолированный archive workflow skip по path filter — это не успешный тест архива.
- Артефакт `paseka-win11-android-selftest-kit`, ID `14527759850`, 11,676,452 bytes, до 2026-12-03 12:16:32 UTC. Сборка не равна физическому тесту.
- Следующий блокер — первоначальное разрешение USB-отладки на OnePlus Android 15+, однократное безопасное Wireless debugging pairing, запуск реальной test-only APK и получение отчёта. **Пока физический запуск не завершён, не включать постоянный Windows scheduler, автоматическую загрузку отчётов и непроверенные обновления APK.**
- Main, production, реальные данные, merge и deployment не изменялись. Следующий шаг — физический прогон с этим артефактом, затем решение о расширении локальной автоматизации.

---

## Дополнение к контрольной точке Android (2026-11-19)

- После первичной сборки выявлена ошибка формирования обновлённого PowerShell-файла; скрипт пересобран из чистой базовой версии PR #185, возвращены PR #186 retry чтения отчёта и failure screenshot; структурно проверено ровно по одному объявлению Invoke-ADB/Read-DeviceReport/Find-TestDevice и UTF-8 BOM.
- Дополнительная защита: USB-автовыбор разрешён только для алфавитно-цифровых serial, исключая mDNS Wi-Fi и emulator serial. Добавлены негативные сценарии в Windows mock test.
- Точный новый code/test HEAD: `9d889cc14aacedbfb9a1f73915e31aed6a2d20c6`. CI на нём пока не подтверждён (не заявлять PASS). Старые результаты относятся к более ранним SHA.
- Следующий шаг: CI на точном актуальном HEAD (и исправления при ошибках), затем физический OnePlus прогон. Подключение и локальный автозапуск по расписанию не настроены; main/production/база не изменены.

---

## Контрольная точка — Windows 11 + OnePlus USB/Wi-Fi (2026-11-19)

- Пользователь подтвердил Windows 11, OnePlus 10 Pro 5G, Android 15+, USB как основной способ и Wi-Fi как резервный.
- Работа продолжается в существующем Draft PR #186, ветка `fix/win11-report-polling-2026-11-19`, поверх PR #185; конкурирующий PR не создаётся.
- В `scripts/windows/Run-Paseka-Tests.ps1` добавлен fail-closed выбор USB/заранее сопряжённого Wi-Fi: разрешён только явно указанный частный IPv4:порт через `PASEKA_ADB_WIFI_ENDPOINT`; USB приоритетен; при нескольких USB остановка. Никакого автоматического включения TCP/IP debugging, удаления пакетов или доступа к production-данным.
- `tests/windows-adb-selection.ps1` проверяет выбор устройства настоящим Windows PowerShell 5.1 с mock ADB, без Android; CI workflow включает тест. `tests/device-selftest-build.test.mjs` содержит регрессионные guards. `scripts/windows/README-WIN11.txt` описывает ручное первоначальное сопряжение.
- Кодовый HEAD после восстановления PR #186 report polling: `42292b887c82c7778fd27cca535801cd989aa860`. Статус его CI требует отдельной проверки; не утверждать PASS до завершения. Предыдущий кодовый SHA `a734537c081a60791d0b2708525c0ca4818562b5` имел 753/753 PASS, но это не проверка нового Wi-Fi кода.
- Реальный OnePlus в этой сессии не подключался. Физический новый USB/Wi-Fi прогон и автономный Windows runner ещё не выполнены; тестовый пакет и данные реальной пасеки не затронуты. Main, production и merge не менялись.
- **Следующий шаг:** дождаться точного CI для нового HEAD, исправить ошибки при их наличии; затем выполнить однократное локальное USB-разрешение и Wireless debugging pairing на устройстве перед безопасным автоматическим расписанием.

---

## Контрольная точка — исправлен преждевременный FAIL при ожидании Android-отчёта на Win11 (2026-11-19)

- Пользователь приложил `report(1).json`: `status: FAIL`, `runId: c386c2d5c4ff43a086da`, `testedPackage: ru.paseka.journal.device.r44519287088a1`, `error: cat: files/paseka-device-report.json: No such file or directory`; `phaseOne: null`, `final: null`. Консоль показывает, что test-only APK успешно установлена, Intent запуска отправлен, но скрипт остановился **при первом чтении ещё отсутствующего отчёта**, не запустив подтверждённых функциональных проверок. Ранее подтверждённый физический 7/7 PASS сохраняет свой отдельный статус.
- Причина: PowerShell 5.1 в `Read-DeviceReport` при глобальном `$ErrorActionPreference='Stop'` превращал stderr внешней команды `adb shell run-as ... cat` в terminating error, даже при перенаправлении `2>$null`. Отсутствие файла до завершения WebView-тестов — нормальное, ожидаемое состояние. Предыдущий Wait-Report предусматривал повторение каждые 2 секунды, но не успевал повторять.
- Создан Draft PR #186: https://github.com/250oisr-eng/Pasekaapp/pull/186, branch `fix/win11-report-polling-2026-11-19`, base #185 → #184 → #183 → #182 → #181 → #179 → #176 → #168. В `scripts/windows/Run-Paseka-Tests.ps1` только функция чтения отчёта временно использует локальное `$ErrorActionPreference='Continue'`, возвращает null при отсутствующем файле / ошибке JSON / ненулевом коде и не меняет общую строгую политику Stop для других ADB-команд. При сбое после запуска test-only APK дополнительно сохраняет `failure.png` для диагностики.
- Добавлен реальный Windows PowerShell 5.1 интеграционный тест `tests/windows-report-polling.ps1` с fake `.cmd` ADB: отсутствие отчёта + native stderr, доступный JSON, задержанный JSON после повтора; проверка, что глобальная политика ошибок не изменяется. Workflow `.github/workflows/android-device-selftest.yml` требует этот тест **до** сборки и выдачи ZIP. Node regression test также проверяет эти ограничения.
- **Code/test SHA `a734537c081a60791d0b2708525c0ca4818562b5`**: Fast quality checks [#44520631325](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44520631325) — **753/753 PASS, 0 FAIL**; Windows/Android isolated kit [#44520631354](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44520631354) — **success**, настоящая Windows PowerShell 5.1 syntax + native stderr retry **PASS**, Node 753/753, Android Debug APK + AAPT package check `ru.paseka.journal.device.r44520631354a1`, ZIP upload **success**. Android APK workflow #44520693492 — success; isolated archive workflow #44520693541 — skipped по path filter ожидаемо.
- Artifact `paseka-win11-android-selftest-kit`, ID `14527738260`, 11,674,984 bytes, ZIP SHA-256 `6132d538ed99ccb8d9b6ef07c12de0083c32212ab120299e884bf73299334660`; доступен до **2026-12-03 12:07:25 UTC**. Использовать новый распакованный архив в отдельной папке; старые APK и данные не удалять.
- Новый физический прогон этого ZIP **ещё не выполнен**. Следующий шаг: получить `report.json` от новой версии, ожидаемые **8/8 PASS**, включая native Downloads. При задержке/проблеме с WebView сценарий ждёт до таймаута и сохраняет `failure.png`; запросить эти два файла для следующей диагностики. Системный file picker, офлайн-сеть и читаемость интерфейса всё ещё не подтверждены.
- Main остаётся `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`. Ни merge, ни publication, production deploy, изменения основной схемы/базы или удаления пользовательских данных не проводилось.

---

## Контрольная точка — исправлен ParserError Windows PowerShell 5.1 в физическом тест-комплекте (2026-11-19)

- Пользователь выполнил повторный запуск изолированного Win11/Android ZIP и получил **ParserError до запуска любой Android-команды**. Сообщение указывало на `platform-tools\\adb.exe`, повтор синтаксиса около строки 210 и незавершённый литерал. Проверка содержимого `scripts/windows/Run-Paseka-Tests.ps1` на HEAD PR #184 подтвердила: при предыдущей модификации скрипта произошло дублирование значительной части тела (~13,717 символов вместо исходных ~6,781) и обрыв шаблона `$Package -cnotmatch`. **Это дефект только test-only Windows-скрипта, а не приложения «Пасека» или Android**; прежний подтверждённый тестовый отчёт 7/7 PASS остаётся актуальным в своих границах.
- Создан Draft PR #185: https://github.com/250oisr-eng/Pasekaapp/pull/185, branch `fix/win11-powershell-parse-2026-11-19`, base PR #184 → #183 → #182 → #181 → #179 → #176 → #168. Восстановлен ровно один полный PowerShell-скрипт, оставлены изоляция package ID и SHA-256 проверка APK, защищено корректное буквальное регулярное выражение без опасной JS-подстановки `$'`.
- **Добавлен обязательный GitHub Actions job `validate-windows-script` на `windows-2022`**: Windows PowerShell 5.1 `Parser.ParseFile`, проверка UTF-8 BOM, отсутствия дублирования тела и наличия package/hash checks. ZIP собирается только после успешного завершения Windows job. Добавлены регрессионные тесты к `tests/device-selftest-build.test.mjs`, уточнён `scripts/windows/README-WIN11.txt`. Production Java/JS, основное Android-приложение, IndexedDB и пользовательские данные **не менялись**.
- Exact code/test SHA `63cb3649c470403b3bc1a028dabd6d84d0d59c20`: Fast quality checks [#44519287101](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44519287101) **752/752 passed, 0 failed**; Android APK [#44519295082](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44519295082) **success**; [Windows + Android self-test kit #44519287088](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44519287088) **success**, Windows PowerShell 5.1 parser success, `npm test` 752/752, Android Debug APK built, AAPT package `ru.paseka.journal.device.r44519287088a1` verified, ZIP uploaded.
- Artifact `paseka-win11-android-selftest-kit` ID `14527297397`, размер 11,674,700 байт, sha256 ZIP `58caccc610b10215352abbcf2589c10eff17807f4304b3af2a9a4b6de0c65915`, срок хранения до **2026-12-03 11:58:56 UTC**. Распаковывать в новую папку; не заменять содержимое старого ZIP.
- Остаётся **не выполнена новая физическая проверка** с этой исправленной APK: пользователь должен запустить `START-TESTS.cmd` из нового комплекта и отправить `report.json`. Ожидается 8/8, включая native Downloads; offline/network, системный file-picker и субъективная читаемость по-прежнему вне охвата. Никакой `adb uninstall`, `pm clear`, удаления пользовательских данных или старых APK не требуется.
- Основная ветка `main`: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` на начало этапа. Нет merge, publication, production deployment и изменений production-базы.

---

## Контрольная точка — устранён конфликт подписи Android test APK при повторном физическом запуске (2026-11-19)

- Пользователь повторно запустил test-only Windows ZIP из PR #183. ADB завершил **install** ошибкой `INSTALL_FAILED_UPDATE_INCOMPATIBLE`: установленная `ru.paseka.journal.device.test` имеет отличающуюся подпись от новой APK. `report.json` этой попытки `FAIL` относится **только к установке**; ни один тест функций приложения не запускался. Предыдущий физический отчёт 7/7 PASS остаётся достоверным в своих границах.
- Решение без удаления или перезаписи: новый Draft PR #184, https://github.com/250oisr-eng/Pasekaapp/pull/184, branch `test/win11-signature-safe-2026-11-19` поверх #183 → #182 → #181 → #179 → #176 → #168. Каждая CI-сборка/попытка получает уникальный test-only package ID `ru.paseka.journal.device.r<github.run_id>a<github.run_attempt>`. `capacitor.config.json`, Java bridge и APK manifest собираются с одним и тем же ID.
- В Windows-комплект добавлен `device-package.txt` с ID этой APK. `Run-Paseka-Tests.ps1` считывает его по строгому шаблону и использует **только для тестового пакета**. Ни `adb uninstall`, ни `pm clear`, ни очистка основной/старой test базы не применяются; ранее установленные тестовые APK остаются без изменений.
- Изменены только `scripts/prepare-device-selftest.mjs`, `scripts/windows/Run-Paseka-Tests.ps1`, `.github/workflows/android-device-selftest.yml`, `tests/device-selftest-build.test.mjs`, `scripts/windows/README-WIN11.txt`. Производственное приложение, основная база, архивный формат и другие модули не затронуты. Добавлены 2 регрессионные проверки.
- **Code/test SHA `deaaa81dc3bb403601e86da348c6dc696c6289f0`**: Fast quality checks [#44518222972](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44518222972) **752/752 tests passed, 0 failures**; [Android APK #44518271568](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44518271568) **success**; [изолированный Win11/Android ZIP #44518222894](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44518222894) **success**, APK package ID проверен инструментом AAPT: `ru.paseka.journal.device.r44518222894a1`. Android debug APK + portable Windows kit uploaded.
- Artifact `paseka-win11-android-selftest-kit` ID `14527580322`, 11,674,485 bytes, срок хранения **до 2026-12-03 11:51 UTC**. Этот ZIP заменить старым нельзя: использовать отдельно распакованную новую сборку с `device-package.txt`.
- **Новый физический прогон с обновлённой APK ещё не выполнен**. Следующий шаг — получить `report.json` от этого ZIP; проверить 8/8, включая real native Downloads. При этом offline и Android system file-picker остаются непроверенными. Main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не изменялась; PR остаётся Draft, без merge, release или deploy.

---

## Контрольная точка — следующий Android-тест native Downloads готов к физическому прогону (2026-11-19)
- На основании пользовательского отчёта `report.json` предыдущий test-only Android-прогон через Win11 зафиксирован как **7/7 PASS** (runId `10d64147632a4d5d9403`). Физические archive schema 16, Varroa hive card, rollback revision guard и restart сохранены как подтверждённые в границах тестового приложения и отдельной IndexedDB; системный файловый picker, Downloads и реальный offline этим отчётом не подтверждаются.
- Draft PR #183: https://github.com/250oisr-eng/Pasekaapp/pull/183, branch `test/win11-native-downloads-2026-11-19`, base PR #182 → #181 → #179 → #176 → #168. Исправляет **только сборку test-only APK**: не заменять основной Java `MainActivity`, сохраняя штатный `PasekaArchiveDownloadBridge`, а добавить отдельный `PasekaDeviceTestBridge.java` для локальных отчётов и контрольной проверки загрузки.
- Добавлена новая физическая проверка `native_downloads_archive_hash_and_cleanup`: создаётся фиктивный архив, штатный Java bridge сохраняет его в Android `Downloads/Пасека`; изолированный тестовый bridge сверяет URI, уникальное имя (год 2080–2099), MIME, папку, размер и SHA-256 через MediaStore, после всех совпадений удаляет **только созданный тестовый файл**. Если проверка/удаление не сработает, тест FAIL и диагностический архив может остаться в Downloads; другие файлы не удаляются.
- Exact code/test SHA `ab9aa93f006ac5c742461b8540f88361827988a0`: [isolated Win11/Android kit workflow #44510666856](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44510666856) **success**, внутри сборки `npm test`: **750/750 passed, 0 failures**; Android APK build, package ID validation и ZIP upload success. Android APK workflow #44510746930 — success; archive workflow #44510746988 — skipped по path filter ожидаемо.
- Artifact: `paseka-win11-android-selftest-kit`, ID `14523440881`, 11,673,660 байт, сохранён до **2026-12-03 11:01 UTC**. Инструкция `scripts/windows/README-WIN11.txt`, запуск через `START-TESTS.cmd`; Android 15+.
- **Физический прогон новой 8-пунктной версии ещё не получен.** Системный выбор файла для импорта, реально отключённая сеть и субъективная читаемость экрана остаются неподтверждёнными. Нельзя считать успешную CI-сборку физическим испытанием.
- Main остаётся `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`; PR #183 остаётся Draft, нет слияния, публикации, production deployment, изменения БД реальной пасеки.
- Следующий шаг: получить `report.json` нового изолированного ZIP и проверить минимум **8/8 PASS** (включая native Downloads); затем отдельно оценить штатный файл-пикер и offline при сохранении безопасности. В этом сеансе **никаких команд ADB на пользовательском устройстве не выполнялось**.

---

## Контрольная точка — получен отчёт физического теста Win11 / Android (2026-11-19)
- Пользователь предоставил локальный `report.json` формата `paseka-windows-test-report-v1` от изолированного Android package `ru.paseka.journal.device.test` (runId `10d64147632a4d5d9403`). Файл отчёта содержит `status: PASS`, `error: ""`, `final.pass: true`.
- **7 из 7 автоматических проверок на устройстве — PASS**: `app_startup_and_webview`, `hive_card_last_event_and_empty_hive`, `archive_export_preflight_commit_rollback`, `archive_rejects_unconfirmed_treatment`, `archive_revision_guard_preserves_new_treatment`, `real_android_restart_persists_indexeddb`, `real_card_renderer_after_restart`. Первый этап — 5/5 PASS до restart; второй — 7/7 после stop/relaunch. Финальная отметка `2026-11-19T10:55:07.542Z`.
- Результат относится **только к отдельному тестовому приложению и тестовой IndexedDB**, он не подтверждает миграции/импорт базы реальной пасеки. Не тестировались: native Downloads bridge / системный выбор файла, физическое отключение интернета и качество визуального восприятия экрана; скриншот не предоставлен. Не считать эти проверки успешными.
- Проверенное исходное приложение — code/test SHA `a8bf1ea3d9fb152389f1f7195bdb445a41a36ad6` (комплект Actions run #44509082276). Предыдущий docs-only HEAD `da6dc7afa8c025937821ff38efa498a5e7f4a2d6` также успешно собран в Win11 kit #44509554079 и Android #44509562497. Физическое испытание отчёта было до внесения этой документационной отметки.
- Следующий приоритет: довести изолированный стенд до проверки реального Android Downloads bridge и поведения офлайн, не трогая реальную базу и не изменяя без разрешения настройки сети. Обнаружен риск в test-only подготовке: `instrumentMainActivity` полностью заменяет Activity после добавления Downloads bridge; текущий физический тест не мог подтвердить native Downloads. Для нового теста потребуется безопасное объединение мостов, отдельный тест и явное ограничение работ с публичной папкой Downloads.
- Draft PR #182 остаётся открытым; основная ветка `main` остаётся `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`. Никаких merge, deploy, production database changes, release или удаления пользовательских данных.

---

## Контрольная точка — комплект автоматических физических испытаний Win11 + Android (2026-11-19)

- Draft PR #182: https://github.com/250oisr-eng/Pasekaapp/pull/182, branch `test/win11-device-automation-2026-11-19`, base #181 → #179 → #176 → #168. Main на начало этапа: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`; ни merge, ни публикации, ни production deployment не выполнялись.
- Code/test SHA `a8bf1ea3d9fb152389f1f7195bdb445a41a36ad6`: **Fast quality checks #44509082289 — 750/750 passed, 0 failed**; **Android APK #44509082334 — success**; **Build isolated Windows 11 + Android device test kit #44509082276 — success** (проверен package ID и загружен артефакт).
- Artifact `paseka-win11-android-selftest-kit`, ID `14522290437`, 11,670,795 байт, GitHub Actions https://github.com/250oisr-eng/Pasekaapp/actions/runs/44509082276, срок хранения до **2026-12-03 10:50 UTC**.
- В ZIP: отдельная APK `ru.paseka.journal.device.test`, Google Platform Tools (ADB for Windows), `START-TESTS.cmd`, PowerShell, README, SHA-256 APK. Запускается без Android Studio и без программных изменений основного приложения; Android 15+ и разрешение USB-отладки необходимы.
- На устройстве сценарий **должен** проверить UI последней обработки, отсутствие строки без обработки, архив schema 16 (export → preflight → stage → commit → rollback), отказ неподтверждённого события, защиту rollback revision guard и фактический перезапуск приложения. Работает с фиктивными данными и собственной test-only IndexedDB; отчёт/скриншоты локальны.
- **Не подтверждено физически**: ни одна из этих проверок ещё не была запущена на телефоне пользователя. CI и сборка не заменяют физический тест. Нативный файловый picker/Downloads, реальное отсутствие сети и субъективная читаемость UI этим комплектом не проверены.
- **Следующий шаг:** пользователь распаковывает единый ZIP, подключает Android по USB с разрешённой отладкой, запускает `START-TESTS.cmd` и отправляет только `report.json` и `before-restart.png` для анализа. Запросов о ручном вводе фиктивных записей нет.

---

## Контрольная точка — интеграционный аудит Varroa schema 16 и полного архива (2026-11-19)

- Создан Draft PR #181: https://github.com/250oisr-eng/Pasekaapp/pull/181, branch `test/varroa-archive-roundtrip-2026-11-19`, base PR #179 → #176 → #168. Главная ветка `main`: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`.
- В `tests/varroa-archive-integration.test.mjs` добавлены три сквозных сценария для app schema 16 с реальными `PasekaArchive`, `PasekaArchiveRestore`, доменной проверкой Varroa и производственным структурным валидатором `validateBackupState`. Используется только `fake-indexeddb` и фикстуры; пользовательские данные не затронуты.
- Проверены: экспорт .paseka → preflight → staging без изменения live state → атомарный commit → чтение после повторного открытия IndexedDB → rollback к прежней истории; отказ staging при `userConfirmed=false` в архиве с корректной контрольной суммой; отказ rollback при новой подтверждённой обработке с сохранением новой записи и recovery snapshot.
- Code/test SHA: `579bdfa6d6e5e0cf1891903a9b4bf19574488a16`. Fast quality checks #44507462252: **745/745 tests passed, 0 failures**. Android workflow #44507462228 (push) — success: regression tests, Debug APK build и artifact upload прошли; PR workflow #44507472768 — cancelled при обновлении документации и не считается успешной проверкой. Isolated archive workflow #44507472719 skipped по path filter (ожидаемо).
- В рабочем коде нет изменений: не менялись `index.html`, доменные модули, формат архива, IndexedDB schema, Service Worker, Android package ID и production. Новый PR строго test-only.
- **Не подтверждено на физическом устройстве:** UI последней обработки в PR #180 и полный archive schema 16 import/rollback. Не выдавать тесты за физическую проверку. Ничего не merge и не deploy.
- Следующий шаг: получить физическое подтверждение UX карточки Varroa (PR #180) и полного archive schema 16 import/rollback на отдельной test-only APK; интеграционные автоматические проверки завершены без регрессий.

---

## Контрольная точка — изолированная Android-проверка карточки Varroa (2026-11-19)

- Для UX-изменения PR #179 подготовлена отдельная test-only APK в Draft PR #180: https://github.com/250oisr-eng/Pasekaapp/pull/180.
- Workflow #44505448168 завершился success на точном test-only HEAD `1605fce812efd19d9f92f8c48f667d68fa5e13e8`: **742/742 tests passed, 0 failures**, Android Debug APK build и проверка package ID внутри APK успешны.
- В APK подтверждён package ID `ru.paseka.journal.varroa.hivecard.test`; production package ID отсутствует.
- Artifact #14520170370: `paseka-varroa-hive-card-isolated-test-apk`, 3,454,667 bytes; SHA-256 ZIP `ed678f4d58a436d2cf62e99583b9085b0d84980708518051d79940e587d1bd1`; срок хранения до 2026-12-03 10:26:27 UTC.
- Исправлен test workflow: подтверждена фактическая установка Android SDK levels и проверяется итоговая конфигурация; устранена ошибка записи JSON-конфигурации Capacitor. Проверка относится к test-only workflow, функциональный код PR #179 не менялся.
- **Физическая проверка UX ещё не выполнена.** Требуется проверить наличие даты/метода для улья с обработкой, отсутствие строки для улья без обработки, выбор последнего события, сохранение после перезапуска и офлайн.
- PR #180 остаётся test-only Draft; PR #179 — функциональный Draft, stacked поверх #176 → #168. Main остаётся `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`; merge, публикация и production deployment не выполнялись.

---

## Контрольная точка — последняя обработка Varroa в списке ульев (2026-11-19)

- Draft PR #179: https://github.com/250oisr-eng/Pasekaapp/pull/179; branch `feat/varroa-last-treatment-hive-card-2026-11-19`; code/test SHA `465b6c216bd8f62586aa41e6873784f3a93721df`.
- В доменный модуль добавлен `latestTreatmentForHive()`: выбирает последнее подтверждённое событие поддерживаемого метода с корректной датой только для указанного улья. В строке улья отображается дата и метод «Сублиматор щавелевой кислоты»; при отсутствии события дополнительная строка не появляется.
- Новая схема данных, миграции, IndexedDB object-store version, backup/archive format и Service Worker cache не менялись. История остаётся append-only; записи не изменяются.
- Android workflow #44485196425 на точном SHA завершён успешно: 742/742 тестов, 0 failures; Android Debug APK build/upload success. Отдельный archive workflow #44485196514 пропущен ожидаемо (path filter).
- Следующий этап — изолированная test-only APK с package ID `ru.paseka.journal.varroa.hivecard.test` для физической проверки отображения в списке, отсутствия строки без события, выбора последней обработки, перезапуска и offline.
- PR #179 остаётся Draft и stacked поверх PR #176 → #168. Main и production не изменялись; merge/deploy не выполнялись. Физическая проверка этой UX-правки пока не подтверждена.

---

## Контрольная точка — физическая проверка Varroa и совместимость полного архива (2026-11-19)

- Пользователь подтвердил успешное выполнение всех семи пунктов физической проверки журнала Varroa на отдельном Android-приложении. UI, блокировки подтверждения/будущей даты, история и сохранение после перезапуска офлайн подтверждены пользователем.
- В интеграционном аудите найден дефект: `js/paseka-archive.js` ограничивал экспорт схемой 15, хотя журнал Varroa повышает app schema до 16. Исправлено: полный архив принимает schema 16; schema 17+ по-прежнему отклоняется.
- Добавлен регрессионный тест `tests/archive-export.test.mjs`: экспорт schema 16 с `varroaTreatments`, проверка содержимого `state.json` и preflight чтения архива; проверка неподдерживаемой schema 17 сохранена.
- Проверки на code/test SHA `f3a346e3ebd4b27c78e4ebdcd47b0e813b2d5b1b`: Fast quality checks #44477890337 — **741/741 tests passed, 0 failures**; Android Debug APK #44477890428 — success, artifact #14506518539, SHA-256 `3cb7d37638c294e04b8c1c8598f83482fd1706b4a2419881f4a87dd7f619d896`; Android Debug APK PR run #44477903201 — success, artifact #14507306363, SHA-256 `8b94b548f411a1c22d676e5488b686c6ed4827be39d4b7152ff09884a6f5e50f`. Оба APK имеют стандартный package ID; не предназначены для установки на телефон.
- Изолированная Varroa APK PR #177 (package `ru.paseka.journal.varroa.test`) прошла физическую проверку пользователя, но содержит предыдущую версию archive export ceiling; физическая проверка archive schema 16 export/restore ещё не выполнена.
- PR #176 остаётся Draft и stacked поверх PR #168; PR #177 — test-only. Main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не изменялась; merge, production и реальные данные не затронуты.
- Следующий шаг: отдельная изолированная Android-проверка `.paseka` export/preflight/commit/rollback с тестовым набором, включающим `varroaTreatments`; не использовать рабочую базу. После этого завершить интеграционный аудит.

---

## Контрольная точка — журнал обработок Varroa и изолированная Android-проверка (2026-11-19)

- Функциональная реализация: Draft PR #176, ветка feat/varroa-treatment-log-2026-11-19; проверенный code/test SHA `ae7421a27aeed368724bf942aaab2cecd7266d9a`.
- Fast quality checks #44474930398: 741/741 tests, 0 failures. Android Debug APK #44474938730: build/upload success на том же SHA.
- Модель отделяет varroaTreatments от varroaObservations; метод — сублиматор щавелевой кислоты, подтверждён пользователем. Доза, интервалы, температурные условия, подготовка и меры безопасности не добавлены.
- App schema 15→16; старые наблюдения сохраняются; treatment events включены в snapshots, backup/archive validation и offline cache. Запись требует подтверждения фактического выполнения.
- Изолированная Android-сборка: Draft PR #177, workflow #44476267580, SHA `b949518e3163b02e45f715e9fa04681332b0171e` — success. Все 18 build steps завершились успешно, включая полный regression suite и проверку package ID внутри APK.
- Артефакт `paseka-varroa-isolated-test-apk`, ID `14505654409`, 3,681,597 bytes, SHA-256 `c28b11f3e63f56424b3f5685e2ceb6b39820cecebdd328b98c2096058948c678`, expires 2026-12-03 07:02:11 UTC. Package ID: `ru.paseka.journal.varroa.test`.
- Физическая проверка на OnePlus 10 Pro 5G ещё не выполнена. До неё UI и сохранение офлайн не считать подтверждёнными.
- PR #176 остаётся stacked поверх PR #168; #177 — test-only, не предназначен для слияния. Main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не изменялась; production и пользовательские данные не затрагивались.
- Следующий шаг: пользователь устанавливает только изолированный APK и проверяет регистрацию/историю, блокировки, перезапуск и сохранность офлайн. После физической проверки — интеграционный аудит backup/restore/rollback для varroaTreatments.

---

## Дополнение о текущей разработке — 2026-11-19

Начата реализация отдельного журнала фактически выполненных обработок Varroa в Draft PR #176:
- PR #176: https://github.com/250oisr-eng/Pasekaapp/pull/176
- Ветка feat/varroa-treatment-log-2026-11-19, HEAD ae7421a27aeed368724bf942aaab2cecd7266d9a.
- PR #176 stacked поверх PR #168 и не может безопасно рассматриваться независимо от него; оба PR остаются Draft.
- Fast quality checks run #44474930398: success, 741/741 тестов, 0 failures на указанном HEAD.
- Android Debug APK run #44474938730: success на том же SHA; artifact ID 14506310191, SHA256 a15a96b0a2b8e4f8d79036854e63cc7cfc611fdd8e516c1390ae6443e3eb57f1, срок хранения до 2026-12-03 06:49:59 UTC.
- Это CI-проверка, а не физический тест. APK не предназначен для установки поверх основного приложения; отдельная физическая проверка пока не выполнялась.
- Реализация использует app schema 16 и отдельный varroaTreatments. Никакие дозы, интервалы, температура или меры безопасности не добавлены.
- PR #176 не merged; main и production не изменялись.

---

# Актуальное состояние проекта — 2026-11-19

## Проверенная точка GitHub

- main SHA: 8144ec8fe7e61c2f70f067c78f299bf0e7551dd7 (branch endpoint).
- Цепочка технологических операций фактически объединена: PR #148 → #149 → #87 → #150 → #151 → #152 → #153 → #154. Merge commits: 007935289a7fba06a4776e84b943a105423f655c, 95eb64eff22fa7243d5f3b65747416037b39b0b0, 77cb70027b65e8d95955c62ad9abed73a65f185c, e31fe96f9b9083cd4580cd46db42adc1e5bc6336, 51e3dbce9426f241c5ee07c96fd8915f0f57363d, 9af532d30a45c24a0cf37540e3acf7ac871cf535, 0e84bbcd8beb9922472c8f086047cae19b26d36a, 8144ec8fe7e61c2f70f067c78f299bf0e7551dd7.
- Для SHA 8144ec8fe7e61c2f70f067c78f299bf0e7551dd7 GitHub Actions: Fast quality checks #44232695339 — success; Android Debug APK #44232695515 — success; Pages workflow #44232694911 — success. Commit status API отдельно не содержит status contexts. Результаты относятся только к указанному SHA.
- PR #168 остаётся open/Draft, base main, HEAD 7e53e3ded0c4ce133b6326d540bfc07036c12d97; полный архив .paseka и atomic restore ещё не интегрированы в main.
- PR #174 остаётся open/Draft, test-only ветка для Android archive validation; mergeable=false и не предназначен для слияния. Физическая проверка на OnePlus завершена по ранее записанному протоколу.
- PR #142 уже merged; событие queen_absence_confirmed присутствует в main.
- Lovable project 8193a703-9f20-4dc8-9460-8d93225ea25f остаётся needs_attention / out_of_credits; latest Lovable SHA не синхронизирован с GitHub main. Платные функции не использовать.

## Технологическое состояние

- OP-04, OP-05, OP-06 и OP-07 реализованы в доменном coordinator и интегрированы в main; sectionalTechProcesses присутствует, migration app schema 14→15 добавляет реестр процессов. Индексированная БД object-store version для этих изменений не повышалась.
- OP-04: staged split с первым и вторым рядом; операции атомарно связывают lineage, физическую раскладку, инвентарь, techprocess и audit.
- OP-05: необязательная рекомендуемая установка сетчатых заглушек, с фактическим покрытием технических отверстий и историей оборудования.
- OP-06: снятие заглушек через 20–21 день от исходного разделения при подтверждённой яйцекладке трёх идентифицированных маток. Reduced two-queen branch остаётся fail-closed: событие отсутствия матки не разрешает снятие сеток.
- OP-07: сроки установки решёток/медовых корпусов — вместе со вторым рядом либо через 12–15 календарных дней; отдельный AFTER_OP06 не смешивается с этими вариантами.
- Профиль секционного улья не активировать до завершения общего аудита всех связанных модулей и UX; наличие доменных операций не доказывает готовность полного пользовательского процесса.
- Известные остатки: позднее добавление второй пары медовых корпусов по DOCX P37 не реализовано; порамочная история наблюдений содержимого — отдельная задача.

## Следующий главный приоритет

Подготовить отдельный журнал фактически выполненных обработок Varroa. В main уже есть varroaObservations для мониторинга, но нет varroaTreatments или эквивалентного реестра лечения. Метод — сублиматор щавелевой кислоты — подтверждён пользователем; доза, режим, число/интервалы, температура и меры безопасности неизвестны и не должны автозаполняться. Сначала спроектировать минимальную модель и её совместимость с schema 15, backup/restore, offline и audit; запись создавать только после явного подтверждения фактически выполненной обработки.

## Границы безопасности

PR #168/#174 и прочие открытые Draft PR не сливать автоматически. Не изменять production, не публиковать приложение и не запускать deployment. Не выполнять физические операции и не создавать записи реальной пасеки в тестах.

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
