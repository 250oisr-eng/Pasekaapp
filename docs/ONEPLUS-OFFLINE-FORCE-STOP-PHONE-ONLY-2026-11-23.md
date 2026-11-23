## Второе независимое испытание: OnePlus reboot/offline — подтверждено пользователем (2026-11-23)

- После успешного подтверждённого ручного force-stop пользователь **перезагрузил OnePlus**, с отключённой сетью запустил тот же установленный диагностический APK и прислал полный JSON плюс собственный текст: **«Перезагрузил. Сеть отключена.»**
- `suite=PHONE_UNIFIED_SYNTHETIC_V2`; `packageId=ru.paseka.journal.diagnostic.allchecks`; `status=PASS`, `code=SYNTHETIC_SUITE_ONLY`. `checks.storage` `status=PASS`, `previousFixture=PRESENT_VERIFIED`, `bytes=31`, SHA256 `d9f56955f6abce25e3e877c089a0b22b8b777e2f405263f1847370698d1f07c2`. **Пользовательски подтверждённая сохранность ранее созданного синтетического IndexedDB Blob через OS reboot в офлайне: PASS**.
- Сопутствующие проверки после reboot: `archiveMetadata.status=PASS` (4 синтетических сценария, delete/restore false), `syntheticFrames.status=PASS` (3 кадра 64×64, synthetic MP4 SHA256 `29c801c7ffbeabc3796ffd265f8b8e465232c671eeeacfafd8e25e2fb105bd49`), `localOnnxWasm.status=PASS` (только self-authored 3+2=5; bee recognition NOT_TESTED).
- Доказательная граница: runner **не измеряет** OS reboot, networking/traffic, статус действующей PWA или аппаратный APK checksum. Перезагрузка/сеть подтверждены сообщением пользователя, целостность fixture — JSON. Не делать выводов о полноценном PASEKA02 backup/restore, реальном видео, bee recognition, quota или safe deletion. В JSON `scope.androidForceStop=NOT_TESTED` (прежняя ручная проверка подтверждена отдельно), `networkTraffic=NOT_MEASURED`; `cleanupAuthorized=false`, `deleteAllowed=false`, `restoreAuthorized=false`.
- Предыдущие инструкции «Следующая фаза — reboot» далее сохранены как история плана и **уже выполнены**, не предлагать снова этот этап. Следующий потенциально полезный физический класс — отдельный read-only/synthetic storage quota gate или тест оригинального *заранее подготовленного* безопасного диагностического видео, только после проверки его независимого APK; Restore335 STOP, никаких удалений.

---

## Подтверждение пользователя — этап offline + force-stop ЗАВЕРШЁН в указанной области (2026-11-23)

- После получения диагностического JSON пользователь **отдельным ответом** подтвердил оба запрошенных условия: **Wi-Fi и мобильный интернет были отключены; `ru.paseka.journal.diagnostic.allchecks` принудительно остановлен через настройки Android до запуска**. Прежняя пометка `EVIDENCE_INCOMPLETE` ниже относится к промежуточному состоянию до этого ответа и теперь **снята**.
- Результат: `PHONE_UNIFIED_SYNTHETIC_V2 / PASS / SYNTHETIC_SUITE_ONLY`, `storage.previousFixture=PRESENT_VERIFIED`, 31 байт, SHA256 `d9f56955f6abce25e3e877c089a0b22b8b777e2f405263f1847370698d1f07c2`; archiveMetadata 4 синтетических сценария PASS, syntheticFrames 3×64×64 PASS, локальная синтетическая ONNX/WASM арифметика Add(3,2)=5 PASS.
- **Ровно доказанная область:** подтверждённое пользователем ручное Android force-stop + отключение обоих каналов сети, затем успешный автономный запуск синтетических проверок и чтение неизменённого тестового Blob. Не заявлять независимо инструментированное обнаружение force-stop: поле исходного JSON `scope.androidForceStop=NOT_TESTED` неизменно. `networkTraffic=NOT_MEASURED` не подтверждает отсутствие сетевых попыток в онлайн-режиме. Не является проверкой main/current P0 branch на физическом устройстве; диагностический APK собран отдельно.
- **Следующее независимое испытание, только когда пользователь готов:** перезагрузить OnePlus без очистки данных, с отключёнными Wi-Fi и мобильным интернетом, открыть то же `allchecks`, нажать «Проверить всё безопасное» → «Копировать результат», восстановить интернет и передать JSON с пометкой `REBOOT_PERFORMED=YES; BOTH_NETWORKS_OFF=YES`. Критерий — `storage.previousFixture=PRESENT_VERIFIED`. Если BLOCKED, ничего не удалять/не переустанавливать.
- Реальные видео, beeRecognition, физическая quota, portable restore, MediaStore copies, traffic capture и deletion по-прежнему NOT_TESTED/NOT_AUTHORIZED; P0/P1 OPEN, Restore335 STOP.

---

## Новый отчёт пользователя после выдачи протокола — 2026-11-23

- Получен JSON `suite=PHONE_UNIFIED_SYNTHETIC_V2`, `packageId=ru.paseka.journal.diagnostic.allchecks`, `status=PASS`, `code=SYNTHETIC_SUITE_ONLY`.
- `checks.storage`: `PASS`, `previousFixture=PRESENT_VERIFIED`, `bytes=31`, SHA-256 `d9f56955f6abce25e3e877c089a0b22b8b777e2f405263f1847370698d1f07c2`. Это совпадает с фиксированным синтетическим fixture и прежним отчётом; **не доказывает независимо выполнение нового force-stop**.
- `checks.archiveMetadata`: `PASS`, 4 synthetic metadata cases; `restoreAuthorized=false`, `cleanupAuthorized=false`. `checks.syntheticFrames`: `PASS`, 3 кадра 64×64, исходник synthetic MP4 SHA-256 `29c801c7ffbeabc3796ffd265f8b8e465232c671eeeacfafd8e25e2fb105bd49`, `realVideos=NOT_ACCESSED`. `checks.localOnnxWasm`: `PASS`, только self-authored Add(3,2)=5, `beeRecognition=NOT_TESTED`.
- В JSON поле `scope.androidForceStop=NOT_TESTED`, `networkTraffic=NOT_MEASURED`, `externalRequests=NOT_MEASURED`; пользователь прислал **только JSON, без отдельно запрошенного подтверждения** `OFFLINE_WIFI_MOBILE=OFF; FORCE_STOP_FROM_SETTINGS=YES`. Следовательно, физический offline / force-stop этап **EVIDENCE_INCOMPLETE**, не PASS и не FAIL; подтверждение факта действий требуется, не просить повторного запуска заранее.
- Никакого свидетельства полного PASEKA02 restore, удаления исходных видео, продакшн-разрешений или bee recognition. `deleteAllowed=false`, `cleanupAuthorized=false`, `restoreAuthorized=false`. **P0/P1 OPEN, Restore335 STOP**.

---

# OnePlus: безопасная проверка офлайн + остановка процесса без ПК (2026-11-23)

**Статус: новый пользовательский JSON получен, 4 синтетических модуля PASS; offline/force-stop пока EVIDENCE_INCOMPLETE из-за отсутствия отдельного подтверждения ручных действий.** Не требуется новый APK, USB, ADB, root, разработческий режим, доступ к чужим медиа или production. В рамках STABILIZATION_ONLY — только независимый синтетический тест ранее установленного APK.

## Установленные факты, не повторять без причины

- [PR #385](https://github.com/250oisr-eng/Pasekaapp/pull/385) реализовал **уже существующее** `ru.paseka.journal.diagnostic.allchecks` с одной кнопкой «Проверить всё безопасное» и «Копировать результат». Проверенный CI code/workflow SHA `1d25ea5e3b93aae2cc37472d0024ad93d9ccb1e1`: [isolated CI #45060987323](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45060987323) success. APK SHA256 `48aab789f951f5fb1e8fac90256909468f1d8ec88c0863786725437be00fe1be` в CI, не проверялся на установленном телефоне. [Artifact #14769308321](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45060987323/artifacts/14769308321) `paseka-unified-safe-diagnostics-apk` проверен как не истёкший на 23.11, GitHub сообщает срок 06.12.2026.
- [PR #386](https://github.com/250oisr-eng/Pasekaapp/pull/386): физический Android JSON, присланный пользователем, подтвердил два запуска одной установленной диагностики: `suite: PHONE_UNIFIED_SYNTHETIC_V2`, все четыре синтетических модуля PASS; `storage.previousFixture` сначала `ABSENT_CREATED`, затем `PRESENT_VERIFIED`, 31 byte SHA256 `d9f56955f6abce25e3e877c089a0b22b8b777e2f405263f1847370698d1f07c2`. Это подтверждает повторное чтение при обычном запуске, но **не** Android force-stop/reboot. Дополнительный PR #386 менял тесты/workflow, не диагностический runtime `diagnostics/phone-all/runner.js`.
- Полевое bee recognition, real media, реальный portable backup/restore, реальная quota, traffic capture и cleanup **не** испытаны. Встроенные статусы `androidForceStop:'NOT_TESTED'`, `networkTraffic:'NOT_MEASURED'`, `beeRecognition:'NOT_TESTED'`, `cleanupAuthorized:false`, `deleteAllowed:false`, `restoreAuthorized:false` остаются таковыми даже при физическом PASS.

## Самый короткий полезный физический цикл

1. **Не скачивать и не переустанавливать** приложение, если уже установлено «Пасека — все безопасные тесты», пакет `ru.paseka.journal.diagnostic.allchecks`. Не трогать Restore335, архивы, оригиналы и основную `ru.paseka.journal`. Не очищать данные/кеш никакого диагностического приложения.
2. Выключить **Wi-Fi и мобильные данные** (например, авиарежим + проверить, что Wi-Fi не остался включён). Никакого VPN/Интернета для диагностического теста не требуется. ChatGPT временно будет офлайн; JSON сохраняется в буфере до включения сети.
3. На OnePlus зайти **Настройки → Приложения → Управление приложениями / Все приложения → «Пасека — все безопасные тесты» → Принудительно остановить**. **Не нажимать** «Очистить данные», «Очистить кеш», «Удалить приложение». Простое закрытие из «Недавних» — НЕ эквивалент force-stop.
4. Открыть **то же** диагностическое приложение без сети; нажать «Проверить всё безопасное» → после завершения «Копировать результат». Проверить `suite`, `packageId`, `status`, `checks.storage.previousFixture`; не пытаться «исправить» BLOCKED переустановкой.
5. Вернуть Интернет и вставить **полный JSON** в этот чат, добавив только внешнее утверждение о выполненном действии: `OFFLINE_WIFI_MOBILE=OFF; FORCE_STOP_FROM_SETTINGS=YES`. Не присылать настоящие пути/медиа/архивы, ID пользователя, токены или снимки личной галереи.

**Ожидаемое успешное наблюдение (не предрешённый итог):** все четыре `checks` PASS и `storage.previousFixture=PRESENT_VERIFIED`. Если `ABSENT_CREATED`, значит предыдущая тестовая запись отсутствует и проверка сохранности не пройдена, хотя новый fixture мог записаться; статус `PASS` остальных синтетических тестов не доказывает прежнюю сохранность. Если `BLOCKED`, сохранить JSON и не предпринимать опасного восстановления.

## Вторая фаза: только если первый цикл подтвердится

- **Перезагрузка OnePlus**, снова без мобильного Интернета/Wi-Fi, повторный запуск того же APK с `PRESENT_VERIFIED`; это независимое доказательство сохранения тестового Blob через reboot. Не перезагружать устройство посреди работы с пользовательскими файлами/сервисами.
- **Android quota**: только изолированный ограниченный по объёму тест с отрицательными сценариями `QuotaExceededError`, без искусственного заполнения пользовательского хранилища. P1 fake-indexeddb тест уже есть в #433/#434; он не заменяет физическую квоту.
- **Камера/реальные видео/ONNX**: сначала доказать лицензированный inference pipeline и механизм проверяемого *тестового* файла в изолированном пакете. Нет оснований включать MediaStore/Camera в текущий diagnostics APK. Тестовый ролик не должен удаляться автоматически.
- **Проверка сети**: авиарежим доказывает выполнение проверок в офлайне, но **не** отсутствие попыток сетевого обмена в онлайн-режиме. Для трафика нужен отдельно допустимый traffic audit. История SYNTHETIC_ADD_2_ONLY не подтверждает bee recognition.
- **Restore335**: `STOP / SOURCE_FIXED_NAME_NOT_MATCHED_PRESERVE`; не открывать private файл, не переустанавливать, не сканировать наугад.

## Приёмка / запись evidence

- Устройство: OnePlus NE2213/API36 **по прежнему отчёту**, не выдавать версию за автоматически перепроверенную.
- Пакет из JSON должен **точно** совпадать с `ru.paseka.journal.diagnostic.allchecks`. Нет подтверждения фактического хэша APK на устройстве.
- Наличие `PRESENT_VERIFIED` **после подтверждённого пользователем** force-stop позволяет записать `PHYSICAL_MANUAL_FORCE_STOP_WITH_SYNTHETIC_IDB_HASH` как пользовательское свидетельство. Нельзя менять поле `androidForceStop:'NOT_TESTED'` задним числом или объявлять независимую ADB проверку.
- P0/P1, backup/media cleanup, реальный Android Camera/MediaStore, восстановление архива остаются BLOCKED. Никакого merge/deploy/delete реальных записей.
