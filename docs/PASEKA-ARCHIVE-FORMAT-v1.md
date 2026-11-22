## 2026-11-23 — P0 no-overwrite staging PR #403: exact code/test SHA CI PASS

- **Точный проверенный code/test SHA `041e122c71df04a1e068deb2ec930f0cc896ad7e`**: [Fast Quality #45070773982](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070773982) **completed/success, 868/868 PASS, 0 FAIL, 0 skipped**. [Android #45070773969](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070773969) **completed/success**: регрессионные тесты, полная debug APK сборка и artifact upload. ZIP [#14773141531](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070773969/artifacts/14773141531), 3,459,084 bytes (**размер ZIP, не SHA APK**).
- **Первый CI неуспешен:** SHA `17a06f4eccb5b7e916d60cbe4dc4e19dbe8906ef`, [Fast Quality #45070679086](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070679086) **866 PASS / 2 FAIL из 868**, [Android #45070679117](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070679117) **failed** на regression stage. Новый synthetic mock ожидал native `ConstraintError`, а fake-indexeddb вернул общий `IndexedDB transaction failed`; существующий тест quota эмулировал ошибку через устаревший перехват `store.put()`, игнорируя новый `add()`. Исправлены **только тестовые ожидания/инъекция quota для put+add**, исходный fail-closed код не ослаблен.
- [Draft PR #403](https://github.com/250oisr-eng/Pasekaapp/pull/403) дочерний от #402, main не затрагивает. `putStagingEntryAndUpdateSession` запрещает перезапись любой существующей строки с совпавшим `id` (`STAGING_ENTRY_ID_CONFLICT`), создаёт новые только `store.add()`, как нативную защиту, включая нештатное враньё `get()`. 4 новых synthetic fixture теста с двумя фальшивыми видео: штатный импорт, чужой kind, такой же kind и скрытый existing row; исходные байты staging сохранены. Quota-regression продолжает реально проверять abort и данные после повторного открытия.
- Docs-only коммиты после указанного SHA меняют HEAD и требуют отдельного exact-SHA CI, не приписывать им проверки кода. **Ограничения:** STABILIZATION_ONLY, Restore335 STOP, полный v2 ledger/tombstone portable archive НЕ интегрирован; real device/restore/media/cleanup/deletion NOT_TESTED/NOT_AUTHORIZED. Нет merge, production, deployment, изменений схемы/формата архива.
- **Следующий шаг:** проверить целостность цепочки Draft #401→#402→#403, CI docs-only HEAD и продолжить оценку P0 рисков исходных данных/recognition ledger до начала новых функций.

---

## 2026-11-23 — P0: запрет перезаписи staged Blob при primary-key конфликте (Draft, CI pending)

- **Родитель:** Draft PR #402 на SHA `b19ced33c1b2933d6e15e5bd98515d11b1ceda46`. Его кодовый SHA `c283c74930ff20a2dcf2959c8bf4c8fac791fcd0` отдельно прошёл [Fast Quality #45070364455](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070364455) **864/864 PASS** и [Android #45070364533](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070364533) **completed/success**; parent checks не подтверждают новый код.
- **Риск:** `putStagingEntryAndUpdateSession()` при `store.get(record.id)` с уже существующей строкой того же `sessionId` и любым `kind !== 'session'` ранее делал `store.put(record)`, **молча перезаписывая staged Blob**. При конкурентной или неконформной записи возможна утрата оригинальной временной копии, даже если последующая проверка full archive заблокирует commit.
- **Правка:** каждую запись манифеста stage записывает один раз; если ключ уже существует независимо от вида/владельца — abort `STAGING_ENTRY_ID_CONFLICT`. При ожидаемом отсутствии `store.add()` вместо `store.put()` гарантирует родную уникальность первичного ключа даже при недостоверном ответе `get()`. `stagedCount` увеличивается только для действительно нового ключа. При отказе live main/media/history не изменяются, существующая временная Blob-копия сохраняется. Нет изменений модели IndexedDB, .paseka, миграций или формата.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: **4 synthetic fixture сценария** с созданным внутри теста .paseka из двух фальшивых Blob: штатный stage; поздняя посторонняя строка `rollback_video`; поздняя строка `video` с тем же ключом; адаптер `get()`, скрывающий реально существующую строку — в этом случае native `add()` обязан отклонить транзакцию и сохранить байты. Тесты не используют реальные пасечные записи и не удаляют исходное видео.
- **Точный новый CI: PENDING**, до подтверждения ничего не считать PASS. STABILIZATION_ONLY, Restore335 STOP, v2 ledger/tombstones и безопасное реальное удаление ещё не реализованы. Main/production/merge/deploy не затрагивались.
- Следующее: запустить/проверить exact-SHA Fast Quality и Android, исправить любые failures, зафиксировать код SHA, и продолжить P0 lineage/integration audit.

---

## 2026-11-23 — Draft PR #402: stored null recognition ledger P0, exact-SHA CI PASS

- **Code+tests+initial-docs SHA `c283c74930ff20a2dcf2959c8bf4c8fac791fcd0`**: [Fast Quality #45070364455](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070364455) **completed/success, 864/864 PASS, 0 fail, 0 skipped**. [Android #45070364533](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070364533) **completed/success**, regression suite, full debug APK build and artifact upload success; ZIP artifact [#14773350972](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070364533/artifacts/14773350972) 3,458,857 bytes (**не SHA бинарного APK**).
- [Draft PR #402](https://github.com/250oisr-eng/Pasekaapp/pull/402) основан на #401 и остаётся unmerged; `main` = `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` на старте цикла. В `js/paseka-archive.js` и `js/paseka-archive-restore.js` только отсутствующий `undefined` ledger допускается как empty key; сохранённый `null` блокирует v1 export/stage/commit/rollback с `VIDEO_LEDGER_UNVERIFIED`. Read-only staging copy inspector показывает `ok:false`, не `no_recognition_history`.
- Добавлено 7 synthetic tests: 5 отказов на stored null, позитивный пустой валидный ledger и запрет непустой истории; проверена неизменность state/staging/history/rollback. Это **не** утверждение о реальном повреждении IndexedDB/Android.
- После точного проверенного SHA будут docs-only коммиты: **не считать новый HEAD проверенным без отдельного CI**. В format/schema/permissions/production/устройство/реальные видео ничего не менялось. STABILIZATION_ONLY, Restore335 STOP; v2 ledger/tombstones/provenance ещё не интегрированы, удаление видео и restore не авторизованы. Merge/deploy не выполнялись.
- **Следующая P0 проверка:** запрет перезаписи существующей staging-записи при частичном импорте/гонке, включая конфликт по первичному ключу `id`, с синтетическими регрессиями и новым stacked Draft PR.

---

## 2026-11-23 — P0: stored null recognition ledger ≠ отсутствующая история (Draft; CI pending)

- Родитель: [Draft #401](https://github.com/250oisr-eng/Pasekaapp/pull/401) на SHA `1ca21b55482620e508aed199b87e031975e1ecf3`, Fast Quality #45069993189 и Android #45069993246 завершены **completed/success** на этом SHA. Родительская проверка не доказывает новых изменений.
- Анализ чтения `main/video_recognition_ledger_v1` выявил fail-open `if (value == null) return` в `js/paseka-archive.js` и `js/paseka-archive-restore.js`, а также `ledger == null` в read-only `inspectStagingRecognitionCopies`. IndexedDB `get(missingKey)` возвращает только `undefined`, поэтому **существующий `null` — недостоверное сохранённое значение**, не подтверждение пустой истории. Ранее v1 export/staging/commit/rollback допускали этот случай, а audit сообщал `no_recognition_history`. Это установленная логическая граница, не наблюдённый сбой физической Android БД.
- Минимальная правка **трёх guards в двух JS модулях**: только `undefined` означает отсутствие ledger; `null` запрещает v1 архив `VIDEO_LEDGER_UNVERIFIED`, а inspection возвращает `ok:false, reason:'VIDEO_LEDGER_UNVERIFIED'`. Корректный legacy `{version:1,entries:[]}` остаётся допустим, непустой ledger по-прежнему запрещает v1 export/import.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: **7 synthetic/fake-indexeddb сценариев** для real stored `null` (export, staging, audit, commit, rollback) с проверкой сохранности state/staging/history/rollback, плюс пустой валидный ledger и непустой ledger, который по-прежнему блокируется. Никакие пользовательские данные не читались/удалялись.
- Новый код/test SHA **пока не проверен CI**; не переносить parent PASS. Никаких миграций, изменений формата `.paseka`, Service Worker, Android permissions, видеозаписей или production. STABILIZATION_ONLY, Restore335 STOP, перенос `ledger/tombstones` v2 не реализован и удаление оригиналов запрещено.
- Следующий этап: точный Fast Quality + Android CI, исправление failures, запись проверенного SHA и продолжение P0 аудита границ наследования/истории без merge/deploy.

---

## 2026-11-22 — P0 lookup lineage: Draft PR #401, exact CI PASS

- **Точный проверенный code+tests+initial-docs SHA `f6a253466129cdab2a15eb4913cc6da136c9a28d`**: [Fast Quality #45069818039](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069818039) **completed/success 857/857 PASS, 0 FAIL/0 skipped**. [Android #45069818031](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069818031) **completed/success**, regression suite, debug APK build и upload PASS. ZIP artifact [#14772668626](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069818031/artifacts/14772668626), 3,458,386 bytes, **это ZIP size, не hash APK binary**.
- [Draft PR #401](https://github.com/250oisr-eng/Pasekaapp/pull/401) основан на Draft #400 (`2bf06bf9de810579978357ad95cafa158d5d144d`), 7 изменённых файлов, без конфликтов на момент проверки. Предыдущий #400 проверен отдельно на code SHA `c8a71df8b44f75d064448b2b4f20f02092dfb59c`: [Fast Quality #45069529560](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529560) **847/847 PASS**, [Android #45069529612](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529612) **completed/success**. После его docs-only update HEAD `2bf06bf...` также прошли Fast Quality #45069689485 и Android #45069689728.
- Исправление `js/paseka-archive-restore.js`: `undefined` — единственное допустимое отсутствие history/staging lookup; `null`, `false`, чужой `backupId`, неправильные `kind/id/sessionId` → fail-closed `ARCHIVE_HISTORY_IDENTITY_UNVERIFIED`/`STAGING_BACKUP_LOOKUP_UNVERIFIED` до создания staging или финальной записи импорта. 10 новых synthetic regression tests, включая повторную подготовку того же верного архива. Main/media/staging/history/backup сохраняются при ошибках.
- Синтетический ответ неконформного IndexedDB адаптера — защитная модель, это **не утверждение**, что настоящий Android IndexedDB уже возвращал false/null. Реальный full restore/cleanup/удаление не испытаны и не авторизованы. `main` на старте цикла `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`; production не изменён, никаких merge или deploy.
- После проверенного code SHA последующие docs-only изменения меняют HEAD; не приписывать им те же exact-SHA проверки без отдельного CI. STABILIZATION_ONLY остаётся активным: P0 архив v2 + ledger/tombstones/provenance и Restore335 STOP, P1 legacy migrations/offline/Android и массовая зависимость PR ещё незавершены.
- **Следующий приоритет:** межмодульный аудит полноты/проверяемости backup v1, границы ledger v2, источника распознанного видео и rollback lineage, без изменения формата, удаления пользовательских данных или слияния.

---

## 2026-11-22 — P0: fail-closed идентичность history и backupId-index lookup (Draft, CI pending)

- **Родитель:** Draft [#400](https://github.com/250oisr-eng/Pasekaapp/pull/400), HEAD `2bf06bf9de810579978357ad95cafa158d5d144d` (последующие docs к проверенному родительскому SHA). Его code+tests SHA `c8a71df8b44f75d064448b2b4f20f02092dfb59c` прошёл [Fast Quality #45069529560](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529560) **847/847 PASS** и [Android #45069529612](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529612) **completed/success**; не приписывать этот результат новым изменениям.
- **Риск:** `getHistory()` и `findSessionByBackupId()` использовали `result || null`, объявляя `false`, `null` и иные недостоверные результаты IndexedDB отсутствующей history/staging-сессией. Затем `commitStagedArchive()` финально проверял history лишь при truthy result. При неконформном драйвере/адаптере можно было начать новый импорт или заменить неподтверждённую историю backup.
- **Исправление `js/paseka-archive-restore.js`**: IndexedDB `get` должен возвращать `undefined` при отсутствии строки. Любой иной результат обязан быть объектом с точным `backupId`, для staging также `kind:'session'`, корректными `id === sessionId`. Подтверждено в read-only lookup и **повторно под финальным readwrite lock** для history. Ошибки `ARCHIVE_HISTORY_IDENTITY_UNVERIFIED`, `STAGING_BACKUP_LOOKUP_UNVERIFIED`; без удаления/импорта в случае ошибки. Совместимый корректный индексированный legacy session сохраняет поведение.
- **10 новых fake-indexeddb тестов**: 4 непроверенных history results, 4 неправильных lookup staged backup-ID, одна недостоверная history внутри commit write lock с проверкой сохранности main/staging/history/full_backup и одна позитивная повторная подготовка того же архива. Только synthetic adapter, без реальных записей и Blob.
- **CI нового SHA: PENDING.** Формат .paseka, схема IndexedDB, физические данные, live media, PWA и Android permissions не меняются. STABILIZATION_ONLY / Restore335 STOP; v2 recognition ledger/tombstones не интегрированы, исходное видео и backup удалять нельзя. Main/production без изменения, merge/deploy запрещены.
- **Следующее:** exact-SHA Fast Quality/Android CI, фиксация failures и результатов, затем дальнейший аудит замещения данных без разблокировки restore/video deletion.

---

## 2026-11-22 — P0 staging ownership PR #400: CI проверен на точном code SHA

- **Code+tests SHA `c8a71df8b44f75d064448b2b4f20f02092dfb59c`**: [Fast Quality #45069529560](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529560) **completed/success: 847/847 PASS, 0 FAIL, 0 skipped**. [Android Debug #45069529612](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529612) **completed/success**: regression tests, APK build и upload PASS; ZIP artifact #14771909618 (3,457,863 bytes, **не SHA бинарного APK**).
- Первоначальный CI того же Draft PR на предыдущем SHA `9af470743af816d55df7ef1cf4b69c85308ae526` **FAILED**: Fast Quality #45069473880 — 846 PASS / 1 FAIL из 847; Android #45069473877 failed на регрессионном тесте. Это была неточная ожидаемая ошибка теста: неверный kind истинного заголовка уже блокировался раньше с `STAGING_SESSION_INCOMPLETE`, а тест ошибочно требовал `STAGING_RECORD_SET_MISMATCH`. Проверка скорректирована, защиту не ослабляли; повторные прогоны на точном code SHA успешны.
- [Draft PR #400](https://github.com/250oisr-eng/Pasekaapp/pull/400) — дочерний от #399, не main. Код `commitStagedArchive` проверяет всё множество staging rows (включая заголовок), ownership и уникальные ключи в финальной IDB readwrite-транзакции **до удаления временных данных**. 3 synthetic TOCTOU regressions подтверждают сохранение main/media/history/backup/staging при посторонних/перемещённых строках.
- Последующие docs-only коммиты имеют собственные HEAD и не наследуют CI без отдельной проверки. Схема БД, backup v1, ledger, реальные медиа и production **не изменены**. Restore335 STOP, v2 ledger/recognition provenance остаётся P0, пользовательские оригиналы и backup удалять нельзя. `main` без изменений, no merge/deploy.
- **Следующий P0 шаг:** проверить корректность идентификаторов `archive_history` и `archive_staging` при повторных импортах, не позволяя malformed индексированным значениям выглядеть отсутствующими строками. Затем negative tests и CI в отдельном stacked Draft.

---

## 2026-11-22 — P0: защита полного состава staging в финальной write-транзакции импорта (Draft; CI pending)

- **Прямой родитель:** Draft #399, HEAD `415ded603be7d9650ed511ce80965d16cf56020e`; его code SHA `9ae7a9ddc56991958fbc4a7be175c2b6db7edb6e` отдельно прошёл 844/844 Fast Quality и Android Debug. Это не подтверждает текущие изменения.
- **Причина:** в `commitStagedArchive()` Phase A `readStagedArchive()` проверяла весь набор записей; Phase B после асинхронного валидатора проверяла только content rows (не kind=session), поэтому поздняя дополнительная строка с `sessionId` и `kind:'session'` не меняла fingerprint, но затем массовый цикл удаления удалял эту неожиданную строку вместе с легитимными staged rows. Кроме того, изменение индексируемого `sessionId` самого заголовка между фазами раньше не отвергалось отдельно.
- **Устранение:** `js/paseka-archive-restore.js` перед любыми write операциями в финальном IndexedDB readwrite-lock требует строго `session.id === sessionId`, `session.sessionId === sessionId`, ровно `totalEntries + 1` staged rows, все с тем же sessionId, уникальными ненулевыми ключами, единственным заголовком под canonical ID и без других session-kind строк. Ошибка `STAGING_RECORD_SET_MISMATCH` отменяет всю транзакцию; live state, archive history, backup и staged originals сохраняются.
- **Тесты:** `tests/archive-restore-enumeration-failclosed.test.mjs` — 3 новых сценария fake-indexeddb, модификации **после проверенного preview, до финального write lock**: лишний заголовок, header reindexed to another owner, неверный kind заголовка. Отдельно сравниваются состояние main, entrance_media, full_backup, archive_history и staging. Никаких реальных пользовательских данных не изменено.
- **Проверки нового SHA:** PENDING, не объявлять успех до exact Fast Quality/Android. Схема IndexedDB, v1 .paseka, ledger, Android permissions и live media не меняются. STABILIZATION_ONLY; Restore335 STOP, v2 ledger/tombstones и настоящее безопасное удаление НЕ РАЗБЛОКИРОВАНЫ. Main/production/deploy не затронуты; слияние без отдельного разрешения запрещено.
- **Следующий шаг:** exact-SHA CI исправления, устранение failures и документальная фиксация; затем очередной P0 аудит lineage и флага сохранности ledger.

---

## 2026-11-22 — Draft PR #399, P0 rollback snapshot identity: exact-SHA CI PASS

- **Exact code+tests+initial-docs SHA `9ae7a9ddc56991958fbc4a7be175c2b6db7edb6e`**: [Fast Quality run #45069026386](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069026386) **completed/success, 844/844 PASS, 0 FAIL, 0 skipped**. [Android run #45069026486](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069026486) **completed/success**: regression tests, debug APK build, artifact upload succeeded. [APK artifact #14772915036](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069026486/artifacts/14772915036) is a ZIP, size 3,457,518 bytes, expires 2026-12-06; **ZIP size is not APK binary SHA**.
- [Draft PR #399](https://github.com/250oisr-eng/Pasekaapp/pull/399) now based on latest #398 HEAD `dde1e1d9485b1ef171a4888542d6dc5a99f7141d`; earlier attempt created branch from parent code SHA `3506848c...` before later parent docs-only commits. For clean stacking, our newly created branch was safely replayed onto exact current parent and the self-created PR branch updated with a checked lease; no parent/user data overwritten. Compare to parent shows **7 expected paths only**, GitHub reports mergeable=true; PR remains Draft/unmerged.
- Code `js/paseka-archive-restore.js`: enforce identity of rollback snapshot header, state and video primary keys, unique row IDs, source `record.id === originalId`; recheck after async validation. Six synthetic/fake-indexeddb tests added (one valid full rollback with previous synthetic Blob; five corrupt identity variants). Reject invalid snapshot with `ROLLBACK_SNAPSHOT_IDENTITY_INVALID`, preserve main/media/staging/history. No migration, new feature or format change.
- `main` unchanged (`8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` at cycle start); no merge/deploy/production, no real media, original video cleanup or real restore. STABILIZATION_ONLY continues. **Docs-only status commits after verified code SHA are not automatically considered exact-HEAD code/test CI PASS.**
- Further P0: archive v1 still rejects nonempty `video_recognition_ledger_v1`; v2 ledger/tombstone format not integrated. Full real backup/restore and device validation remain blocked; Restore335 STOP. Next: P0 audit of recognized video ledger transport and origin/backup lineage; no real deletion or auto-unlock.

---

## 2026-11-22 — P0 архив: строгая идентичность rollback snapshot до восстановления (Draft, CI pending)

- Родительская ветка Draft #398 на SHA `3506848c07b4a9062e78e0efc9ca8bd180bdfc2f`, базируется на #397. На parent exact SHA: [Fast Quality #45068666037](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45068666037) **838/838 PASS**, [Android #45068665898](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45068665898) completed/success. Эти результаты не являются проверкой нового исправления.
- **Сценарий риска:** `rollbackCommittedArchive()` ранее проверял счётчики, виды и SHA-256 Blob, но не требовал точного primary key для `rollback_state`/`rollback_video`, не сопоставлял `originalId` с `record.id`. Изменённый неавторизованный staged-снимок с прежним числом строк мог быть принят как валидный, и при реальном откате подменить журнал или видео. Это анализ дефекта логики и изолированный synthetic scenario, **не утверждение о наблюдённой поломке устройства**.
- Минимальное исправление `js/paseka-archive-restore.js`: `assertRollbackSnapshotIdentity` до state/video restoration, после асинхронной валидации в повторном чтении. Проверка соответствия `sessionId`, header, уникальности ключей, точного `:state` и `:video:<originalId>`, связи `originalId === record.id`; код `ROLLBACK_SNAPSHOT_IDENTITY_INVALID`. Финальная write-транзакция уже сравнивает тот же fingerprint снимка под lock, поэтому переиспользуется старый concurrency guard. Формат существующих snapshot/IndexedDB/архива **не изменён**.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: **6 synthetic/fake-indexeddb** сценариев — успешный полный откат с предыдущим видео, неверный ключ state, неправильный sessionId header, неправильный originalId, неправильный record.id, неправильный video key; при отказах утверждается неизменность main/media/staging/history. Оригинальные видео, реальная БД и production не затрагивались.
- До CI на новом точном SHA не утверждать PASS. Все PR Draft/unmerged. `main` на старте `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`. Restore335 STOP; v2 ledger/tombstone транспорт в .paseka всё ещё не разработан, v1 сознательно блокирует импорт/экспорт при ненулевом v1 ledger. **Следующий шаг:** проверить новый Fast Quality и Android на точном SHA; устранить любые failures; после фиксации перейти к следующему P0 аудиту без merge/deploy/удаления.

---

## 2026-11-22 — PR #398: sequential P0 live state guard, exact code/test SHA PASS

- **Проверенный code/test+docs SHA**: `3506848c07b4a9062e78e0efc9ca8bd180bdfc2f`. [Fast Quality #45068666037](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45068666037) **completed/success, 838/838 tests PASS, 0 fail/skip**. [Android #45068665898](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45068665898) **completed/success**, debug APK build/upload; artifact #14772561698, archive 3,457,147 bytes, **not** a separately calculated binary APK checksum. New docs-only commits AFTER the checked SHA do not automatically inherit exact-SHA validation.
- Draft PR [#398](https://github.com/250oisr-eng/Pasekaapp/pull/398) is now a **true stacked child** of Draft [#397](https://github.com/250oisr-eng/Pasekaapp/pull/397), base HEAD `768033a561f68bbe25639eb858b49ab03fbe94dd`. Rebased own branch via compare, new commits and exact SHA lease; #397's safe rollback-discard code/tests/doc updates are preserved. Relative to #397: 7 files, 9 code added/1 removed, 47 lines new tests (8 negative + 2 positive scenarios), and 5 docs. No competing sibling PR changes retained in current #398 diff.
- **Defect fixed**: In `commitStagedArchive` final readwrite transaction, `values.currentState || null` treated malformed falsy persisted journal rows like an empty database when `expectedRevision=null`. New guard `RESTORE_LIVE_STATE_UNVERIFIED` prevents overwrite, preserves current journal/staging/history/full_backup. Actual absent state still accepts import, and legacy object with `meta` but no revision keeps its rollback copy.
- Limits: validation is type/shape fail-closed, not a complete integrity proof of every valid-looking state. No IndexedDB migration, no archive schema change, no production/main writes, no merge/deploy, no real restore/cleanup/video deletion. Restore335 STOP, v2 ledger and complete portable backup integration remain P0 blockers.
- **Next single step:** continue P0 audit of archive v1/v2 coverage and recognition ledger retention, preserving fail-closed cleanup; no expansion to new feature work during STABILIZATION_ONLY.

---

## 2026-11-22 — P0: malformed live journal при restore, последовательно поверх #397 (CI новой правки ожидается)

- Текущий `main` SHA `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`; в него ничего не вносилось. Родительский Draft PR #397 — code/test SHA `f29eafbff7376ab51a95dc0b3e9a550c4b86c9b6`, docs HEAD `768033a561f68bbe25639eb858b49ab03fbe94dd`, проверен отдельно: Fast Quality #45068360057 и Android #45068359996 завершены success. Результат родителя **не доказывает** новые изменения.
- Для избежания конкурирующих sibling PR #397/#398 новая правка `commitStagedArchive` перенесена в отдельную последовательную рабочую ветку от точного HEAD #397. Тесты #397 на удаление rollback snapshot с проверкой ключей и `kind` сохранены; десять тестов защиты исходного журнала добавлены следом.
- **Выявленный дефект:** выражение `values.currentState || null` в финальной readwrite-транзакции при ожидаемой `null` revision ошибочно трактовало сохранённые `false`, `0`, пустую строку как отсутствие state, потенциально заменяя недостоверный журнал без корректного rollback snapshot. Новый `RESTORE_LIVE_STATE_UNVERIFIED` запрещает такое восстановление для non-object/Array/invalid `meta`, не записывая новые данные.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: восемь негативных fake-indexeddb кейсов с настоящими некорректными значениями в main/state, плюс позитивные проверки реального отсутствия state и legacy meta без revisionId. Не изменяются IndexedDB version, формат архива, существующие миграции и ветвление UI.
- **Verification:** новый code/test/Docs HEAD пока **NOT_VERIFIED**, ожидаются Fast Quality и Android CI на точном SHA. Реальное видео, физическое восстановление и очистка NOT_TESTED/NOT_AUTHORIZED; Restore335 STOP; v2 ledger перенос в архив ещё не завершён. Ни merge, ни production/deploy, ни удаление оригиналов не разрешены.
- Следующий шаг: обновить stacked Draft #398 на проверенную базу #397 и выполнить полную регрессию/Android на точном SHA; при любом FAIL исправить в той же ветке. Затем продолжить один P0 блок сохранности архива.

---

## 2026-11-22 — P0: проверка принадлежности записей при удалении rollback snapshot (Draft, CI pending)

- GitHub `main` на старте цикла: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`. Родительский Draft #396: HEAD `65fb6a28217d252de866b3c1686e6b8968e3676a`; прямого слияния с main нет. Его code/test SHA `dbce7c3f188047ae791b0b783fc69483d331a80b` проверялся отдельно (819/819 и Android Debug PASS); результаты не переносятся на новый код.
- Новый узкий P0 дефект: `discardArchiveRollbackSnapshot()` удалял все ключи по `sessionId`, если совпали только число записей, заголовок и статус; он не проверял точную структуру первичных ключей и типы строк. При нештатном/повреждённом индексировании мог удалить неожиданные staged-записи вместо fail-closed. Исправление касается только **уже существующей операции явного отказа от снимка отката**, не добавляет разрешения на удаление оригиналов видео.
- Код `js/paseka-archive-restore.js`: проверка типа/уникальности/допустимого префикса ключей, проверка вторичного индекса `kind` для `rollback_session`, `rollback_state`, `rollback_video` через **getAllKeys без загрузки Blob**, откат readwrite-транзакции при неуверенной принадлежности, сохранение первой установленной ошибки при конкурентных abort-событиях. Коды: `ROLLBACK_DISCARD_KEYS_UNVERIFIED`, `ROLLBACK_SNAPSHOT_INVALID`, `ROLLBACK_DISCARD_KIND_INVALID`, `ROLLBACK_DISCARD_KINDS_UNVERIFIED`.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: добавлены **9 сценариев** на synthetic/fake-indexeddb: корректный discard, подменённый ключ при неизменном количестве строк, неверный kind, 3 некорректных kind-list и 3 некорректных primary-list. Проверка сохранности state/staging/history при отказах. **CI/Android pending** до подтверждения на точном SHA.
- Изменений схемы IndexedDB, backup-формата, product-разрешений, `main`, production или реальных данных нет. Сохранить STABILIZATION_ONLY; Restore335 STOP; real video/restore/cleanup/deletion NOT_TESTED/NOT_AUTHORIZED. Следующее одно действие: проверить Fast Quality и Android CI на точном кодовом SHA, исправить любые ошибки; затем обновить PR и handoff без заявления о проверке последующих docs-only SHA.

---

## 2026-11-22 — P0 стабилизация: staged cleanup key/kind enumeration, exact-SHA CI

- В дочернем Draft PR #394 (поверх #393, без merge) устранены два remaining fail-open fallback в `discardArchiveRestoreSession`: нештатное `index('sessionId').getAllKeys` больше не считается пустым списком, нештатное `index('kind').getAllKeys` больше не подменяется пустым списком. Ошибки `STAGING_CLEANUP_KEYS_UNVERIFIED` / `STAGING_CLEANUP_KINDS_UNVERIFIED`, вся readwrite транзакция откатывается и staged copies сохраняются.
- При многократном abort IndexedDB запросов `abortWith` теперь сохраняет **первую** установленную причину отказа, а не перезаписывает её последующим DOM `AbortError`. Это проверено негативными синтетическими сценариями; реальная очистка пользовательских данных не выполнялась.
- Добавлено 6 исполняемых тестов к `tests/archive-restore-enumeration-failclosed.test.mjs`: штатное удаление/идемпотентность, 3 malformed key list, 2 malformed kind list, сохранность state и staging. **Первый SHA `72531bb3aa415670070abe4de0eceb8de5b42b6b` FAILED**: Fast Quality #45066137553: 804 PASS / 2 FAIL из 806; причина — потеря первого error при sibling IDB abort, а не физическое удаление данных. Исправлено и проверено на exact code SHA `7962d2aa383f168be7542510152bab03d821e6dc`.
- **Fast Quality [#45066221998](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45066221998): completed/success, 806/806 тестов PASS, 0 FAIL**. **Android [#45066221985](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45066221985): completed/success, 806/806 тестов PASS и debug APK assembled/uploaded**. [APK ZIP artifact #14770884898](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45066221985/artifacts/14770884898), ZIP digest `b9ad0030651d6d8bdd83811b6aed96cd81a236f672786ecf0533e6ea04125acb` (это не бинарный APK SHA).
- Ветка после документальных коммитов будет иметь другой HEAD; CI доказан для **точного code SHA**, не для всех последующих docs-only commit. В `main` пока нет этих исправлений; STABILIZATION_ONLY остаётся активным, real video/cleanup/restore/deletion NOT_AUTHORIZED.
- Следующая P1 задача: воспроизводимость npm зависимостей (в репозитории отсутствует `package-lock.json`, CI использует `npm install`) и более глубокие сценарии IndexedDB rollback/старых данных. Не переключать на `npm ci` без верифицированного lockfile.

---

## 2026-11-22 — стабилизация P0: ключи и типы staging при cleanup не могут молча считаться пустыми

- При контроле архивного `discardArchiveRestoreSession` обнаружены две оставшиеся нештатные ветви: `archive_staging.index('sessionId').getAllKeys(sessionId)` с ответом `null/undefined` раньше подменялся `[]` и позволял вернуть `false` («нечего очищать») при непроверенном индексе; `index('kind').getAllKeys(kind)` с аналогичным ответом раньше также подменялся `[]`, маскируя причину отказа. Стандартный IndexedDB возвращает массив — речь о fail-closed инварианте для сломанного адаптера/регрессии, не о подтверждённом физическом дефекте.
- В `js/paseka-archive-restore.js` оба чтения теперь требуют `assertIndexedDbRows` и выдают `STAGING_CLEANUP_KEYS_UNVERIFIED` / `STAGING_CLEANUP_KINDS_UNVERIFIED`. Ошибки внутри обработчиков IndexedDB перехватываются и передаются через `abortWith`, поэтому не теряется диагностический код; транзакция abort и существующие записи staging сохраняются.
- `tests/archive-restore-enumeration-failclosed.test.mjs` дополнен шестью синтетическими сценариями: нормальный cleanup и идемпотентный повтор, три невалидных primary-key index responses, два невалидных kind-index responses с проверкой сохранности `archive_staging` и журнала. Никаких реальных файлов или cleanup пользователя тест не открывает.
- Рабочая ветка `fix/archive-cleanup-key-enumeration-guard-2026-11-22` должна идти дочерним Draft PR поверх #393. Сначала полные Fast Quality и Android CI на точном HEAD, **до проверки не писать PASS**. Даже после успеха безопасный real cleanup остаётся NOT_AUTHORIZED, `main` без изменений.
- Отдельный P1 риск для следующего цикла: `package-lock.json` отсутствует в проверенной рабочей ветке, тогда как CI использует `npm install`. Версии прямых npm зависимостей закреплены, транзитивные могут меняться между сборками. Для воспроизводимой цепочки требуется верифицированный lockfile + `npm ci` с тестом на реальных GitHub Actions; без проверенного lockfile не менять `npm install` на `npm ci` вслепую.

---

## 2026-11-22 — P0: read-only audit protected media/history fail-closed, final exact SHA PASS

- Заключительный code/test SHA `837a36efb329b1e7fe6d1c2e63da3af6696a31e7`: [Fast Quality #45065053746](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45065053746) **completed/success**, job #137339229782, **797/797 tests PASS, 0 FAIL**. [Android #45065053625](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45065053625) **completed/success**, job #137339245171, **797/797 PASS, 0 FAIL**, debug APK built/uploaded. [GitHub artifact ZIP #14770873137](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45065053625/artifacts/14770873137), ZIP SHA256 `72289479e04056492e684820a6375c22ef3dd5dc4007194fa0486de54bd77c58` (не SHA самого APK), expires 2026-12-06.
- Помимо проверки stage/commit/rollback/history в предыдущем кодовом этапе, `inspectStagingRecognitionCopies` перестал выдавать `ok:true / no_recognition_history`, если в одной согласованной read-only транзакции были невалидные списки session headers, video-copy keys или archive_history. Ошибки `STAGING_SESSIONS_ENUMERATION_UNVERIFIED`, `STAGING_VIDEO_KEYS_ENUMERATION_UNVERIFIED`, `ARCHIVE_HISTORY_ENUMERATION_UNVERIFIED`. Добавлены 4 отдельные synthetic adapter tests (здоровая пустая база и 3 повреждённых result); все тесты не мутируют данные пользователя.
- Итого новые регрессионные сценарии в `tests/archive-restore-enumeration-failclosed.test.mjs` — **15**; весь репозиторий 797/797. Первоначальный SHA `ce82bcc...` был FAILED на одном сценарии обработчика событий IndexedDB и исправлен, результат не маскировать. Проверенные code SHAs: `823b350a...` 793/793 PASS и `837a36ef...` 797/797 PASS.
- **Граница:** это страховка от malformed IndexedDB adapter, реального Android browser сбоя не было продемонстрировано; полный безопасный v2 архив с ledger/tombstones ещё архитектурный проект и **не интегрирован** в этот v1 архивный стек. Реальные видео/recognition/recovery/deletion и product permissions не тестировались. Cleanup/delete запрещены. main и production не менялись; PR #392 Draft, никакого merge.
- Следующий безтелефонный блок: read-only аудит v2 источников, модель v2 archive ledger+originals с чёткими fail-closed контрактами и синтетическими roundtrip/corruption tests прежде чем разрешать какую-либо реальную очистку. Не переносить старые ветки v2 целиком и не придумывать формат по факту отсутствия согласованной реализации.

---

## 2026-11-22 — P0: restoration/rollback media + history enumeration FAIL CLOSED, exact-SHA CI

- **Code/test SHA `823b350aaf0811dfe0adc78366f7d20eed1f044f`**: [Fast Quality #45064787022](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45064787022) **completed/success**, job #137338408345, **793/793 Node tests PASS, 0 FAIL**. [Общая Android сборка #45064786997](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45064786997) **completed/success**, job #137338408192, **793/793 tests PASS**, Android debug APK build/upload success. Artifact ZIP #14770707550, digest `3ddaf24b10274647951ee15d8f73daf89b3fae5cb427d0fc3da1c59bfb94ca64`; digest ZIP не является SHA APK. Специализированный isolated archive workflow #45064787126 **SKIPPED** из-за branch condition, не считать успешным.
- **Честная история ошибок:** исходный PR code SHA `ce82bccb7f306ba20570fd953f8ed4f78d4e2e5a` дал `Fast Quality FAILED` (один новый тест history enumeration получил стандартный DOM `AbortError` вместо установленного кода). Причина — синхронное исключение в IndexedDB `historyRequest.onsuccess` не перехватывалось. Исправлено `try/catch -> abortWith(error)` в том же обработчике; повторный набор PASS. Оригиналы и rollback staging сохранялись уже при первом провале.
- В `js/paseka-archive-restore.js` добавлены fail-closed Array checks для media enumeration на стадиях stage/commit/rollback и для history enumeration до staging deletion; сигналы `RESTORE_MEDIA_ENUMERATION_UNVERIFIED` и `ARCHIVE_HISTORY_ENUMERATION_UNVERIFIED`. `tests/archive-restore-enumeration-failclosed.test.mjs` содержит 11 исполняемых синтетических проверок нормального массива, malformed read-only и readwrite ответов, stage/commit/rollback и защиту ссылок archive_history. Никакого real restoration/deletion, production DB или Restore335.
- **Важная граница:** IndexedDB по контракту выдаёт массив из `getAll()`; защита нужна для неожиданных ответов/моков/изменения адаптера. Это не равно готовности полного архива к production: v1 по-прежнему запрещает ненулевой recognition ledger, архитектурный v2 contract отдельный и не интегрирован; реальный backup/restore и delete NOT_TESTED/NOT_AUTHORIZED.
- Следующая приоритетная задача: точечные тесты v2 контрактов ledger/pending video и безопасной изоляции профилей/офлайн. Нельзя сливать PR в main без отдельного явного решения; данные пользователя не трогать.

---

## 2026-11-22 — P0: гарантии перечисления media/history во время staging/restore/rollback

- В отдельной ветке `fix/archive-restore-enumeration-failclosed-2026-11-22` поверх Draft PR #391 внесено точечное исправление `js/paseka-archive-restore.js`: `assertIndexedDbRows` запрещает интерпретировать нештатный результат `IDBObjectStore.getAll()` как пустой список. Основные пути: начальное сканирование видео при staging; повторная проверка при коротком write lock; Phase A hash baseline; Phase B commit write lock; фазы rollback; `archive_history.getAll()` перед удалением staging.
- Для медиа используется `RESTORE_MEDIA_ENUMERATION_UNVERIFIED`, для ссылок истории — `ARCHIVE_HISTORY_ENUMERATION_UNVERIFIED`. Все эти ошибки блокируют операцию; нет автоматической очистки или восстановления из неизвестного источника. Стандартный IndexedDB при нормальной работе возвращает Array — это защита от ошибочного адаптера/рефакторинга, а не доказательство исправления известного физического сбоя Android.
- Добавлен `tests/archive-restore-enumeration-failclosed.test.mjs`: 11 синтетических сценариев (штатная пустая медиа-библиотека, 4 некорректных ответа первичного чтения, ошибка write-lock сканирования, Phase A и Phase B commit, защищённое удаление staging, Phase A и Phase B rollback), используются отдельные fake-indexeddb и подменяемые **только ответы** getAll через изолированный Proxy. Проверяется сохранность live state, archive_history и staging.
- Это кодовый + регрессионный этап; пока CI на exact SHA не завершён, не объявлять PASS. После финального documentation snapshot создать Draft PR и выполнить полный Node/Android CI на проверенном SHA. `main`/production пользовательские данные и Restore335 не затронуты, удаление видео по-прежнему запрещено.
- Далее: audit архитектуры writer-lock и v2 media-ledger/restore с отдельными независимыми фикстурами; отсутствие real recording в ноябре не блокирует развитие.

---

## 2026-11-22 — блокировка неверного результата перечисления video store перед экспортом

- `readConsistentDatabaseSnapshot` обязательно требует **Array** от `entrance_media.getAll()`. Нестандартный `undefined`, `null`, объект или иное значение нельзя интерпретировать как «видеозаписей нет». Теперь отказ `VIDEO_SNAPSHOT_UNVERIFIED`, попытка abort read-only транзакции и отсутствие результата экспорта.
- Это страховка от ошибочного драйвера, повреждённого адаптера или будущих нарушений контракта; стандартный IndexedDB `getAll()` возвращает Array. Проверена на 8 synthetic сценариях в `tests/archive-video-snapshot-integrity.test.mjs`; никакие реальные media не читались или удалялись.
- Точный code/test SHA `eb11b71dc632b191bd6f557e42d57ba2d0f9db1c`, [общий Android CI #45063432833](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45063432833): 776/776 тестов PASS и debug build success; isolated archive workflow skipped, не PASS. Исправление не доказывает atomically committed full archive, полноценный video-ledger v2 или production restore. Без права cleanup.

---

## Дополнение к PR #212 — аудит осиротевших видеокопий (2026-11-20)

- Исправлен `inspectStagingRecognitionCopies(db)` в `js/paseka-archive-restore.js`: прежде он рассматривал только видеокопии staging, для которых сохранился `kind=session` header. Теперь только по индексным **ключам**, без загрузки Blob в память, проверяются и видеокопии с потерянным заголовком. Такие копии получают `status='orphaned_header'`, `missingSessionHeader=true` и `action='manual_review_required'`.
- В отчёт добавлены `orphanedMatchedCopies`, `unclassifiedVideoKeyCount`, `requiresManualReview` и явное `identityVerifiedByBytes=false`. Один `videoId` без доказательства идентичности SHA-256 **не даёт права удаления**. Ссылки из `archive_history` остаются помеченными как защищённые. Дубли идентичностей ledger и неподдерживаемые cleanup-состояния приводят к fail-closed ошибке.
- В `tests/archive-staging.test.mjs` добавлены регрессии на удалённый header с сохранённым staged Blob, orphan с архивной историей, duplicate ledger identity и неподдающиеся классификации ключи. Проверяется, что отчёт не меняет временные записи и ledger.
- Кодовый SHA `cf4d71aa254e9dc49656e41f681f98aca962c35c`: [полный регрессионный job #44672535903](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44672535903) **completed/success**. Android CI на кодовом и итоговом документационном SHA проверять отдельно.
- Автоматическая очистка, привязка результата к хэшу исходного видео и транспорт `ledger/tombstone` в переносимом архиве остаются блокерами. PR #212 Draft, main/production/физические архивы/данные не менялись и не удалялись.

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

## Архив PR #210 — запрет подготовки несовместимого импорта (2026-11-20)

- Функция `stageArchiveForRestore` теперь проверяет `main/video_recognition_ledger_v1` до разбора архива и повторно после асинхронной проверки, перед записью в `archive_staging`. При наличии результатов распознавания или повреждённом ledger подготовка v1 не начинается, чтобы не создавать управляемые дубли старых видео.
- Добавлены регрессионные тесты: старый архив с непустым ledger не создаёт staged entry; повреждённый ledger не переписывается.
- **Остаточный риск:** распознавание может завершиться уже во время многотранзакционной подготовки. Поштучная атомарная сверка ledger и очистка временных записей при сбое пока не реализованы; нельзя считать защиту всех staged-копий завершённой. Финальный импорт и откат дополнительно защищены проверкой в readwrite-транзакциях.
- Порядок приоритета: добавить transaction-level ledger guard для `putStagingEntryAndUpdateSession`, проверить resume/recovery и безопасную очистку временных копий без удаления источников и резервных копий; затем вводить перенос истории/tombstone в новую версию архива.
- Все изменения находятся в зависимом Draft PR #210 поверх #168. CI нового HEAD требует повторной проверки, main/deploy не затрагиваются.

---

## Проверка исправления UI истории — 2026-11-19

На точном HEAD PR #168 `13137de26c6e756c144c84adde2851712c661775` workflow #44467107603 завершился успешно: 731/731 regression tests, 0 failures; Android Debug APK build и upload успешны. В прогон включён `tests/archive-restore-history-ui.test.mjs`, проверяющий fallback на `sourceBackupId`. Артефакт #14502782884 — обычная APK с production package ID, не предназначена для физической изолированной проверки. Физическая проверка исправленного renderer после rollback на test4 остаётся обязательной.

---

## Контрольная точка — revision guard для rollback (2026-11-19)

Откат полного архива разрешён только пока текущая revision журнала совпадает с `importedRevisionId`, записанной при commit этого импорта. Проверка выполняется до асинхронной валидации rollback snapshot и повторно внутри финальной IndexedDB readwrite-транзакции. Если после импорта были сохранены новые записи, откат блокируется; текущие данные и rollback snapshot сохраняются. Сверка только с revision, переданной UI, не является достаточной защитой.

Добавлены регрессионные тесты для изменения журнала до rollback и во время асинхронной проверки. На PR #168 workflow #44398558415 — 730/730 tests, Android Debug build/upload success; на синхронизированной тестовой ветке PR #174 workflow #44398564375 — 733/733 tests, isolated Android Gradle build, package ID assertion и upload success. Artifact ID `14472093088`, ZIP SHA-256 `35b11cd016a4bd0226c4d967ba2fba7b1ed783b341f5b6b398aeee82b537b352`. Физический commit/rollback на OnePlus не проводился.

---

# Формат переносимого архива «Пасека» v1

Статус: реализовано в Draft PR #168. Последний проверенный code/test SHA `52e587aa1f3e24c3f0de7aa221a8323d4cc7af51`: Fast Quality Checks и Android PR workflow прошли 722/722 regression tests; Debug APK build/upload успешны (artifact 14439657825, ZIP SHA-256 31658a873bc27fa4fabf127ba843c0f393b5e208ad321f2bb0f7595bbc2ed55b). Ожидаются независимый code review и физическая проверка Android-файлового сценария; до них не считать готовым к выпуску.

## Управление памятью при экспорте

- Перед каждой новой попыткой экспорта предыдущая ссылка на Blob сбрасывается.
- Blob полного архива сохраняется в памяти страницы только если браузер подтверждает поддержку системной отправки файлов; иначе после скачивания он не удерживается.
- Ошибки и fallback системной отправки отображаются в статусе экспорта, не в блоке восстановления.

## Контрольные суммы записей видео

- Новые видео летка сохраняются в IndexedDB вместе с SHA-256, вычисленным до записи.
- При rollback контрольная сумма для legacy-видео, ранее не имевшего поля `blobSha256`, вычисляется заново по восстановленному Blob и сохраняется только после проверки.
- Это поле служит проверкой целостности при staging/commit/rollback; оно не является цифровой подписью и не подтверждает происхождение архива.

## Назначение

Контейнер переносит:
- один state.json — сериализованное состояние приложения;
- ноль или более оригиналов видео летка из IndexedDB store entrance_media.

Фотографии и видео, уже встроенные в объект S как data URL, остаются внутри state.json. Видео летка передаются отдельными бинарными записями. Формат не использует ZIP, компрессию или внешние runtime-зависимости.

## Физическая структура

Все многобайтовые числа — unsigned little-endian.

| Смещение | Размер | Содержимое |
|---|---:|---|
| 0 | 8 байт | ASCII PASEKA01 |
| 8 | 4 байта | длина manifest в байтах |
| 12 | N байт | UTF-8 JSON manifest |
| далее | по manifest | payload-записи подряд, без разделителей |

Размеры в manifest должны точно покрывать оставшуюся длину файла. Лишние байты в конце и усечённые payload отклоняются. Сжатие не используется.

## Manifest

Верхний уровень:
- format: paseka-archive;
- version: 1;
- backupId: постоянный ID этого файла;
- createdAt: ISO timestamp;
- schemaVersion: версия схемы состояния приложения;
- entries: записи в порядке их следования в файле.

Первая запись обязательна:
- path: state.json;
- kind: state;
- mimeType: application/json;
- size: точный размер payload;
- chunkSize: 1 MiB;
- chunkSha256: SHA-256 каждого блока по порядку.

Каждое видео:
- path: entrance-media/000001.blob, entrance-media/000002.blob и далее;
- kind: entrance_video;
- mimeType: MIME видео;
- size: точный размер Blob;
- chunkSize: 1 MiB;
- chunkSha256: SHA-256 каждого блока;
- metadata: запись метаданных видео, включая id, hiveId, дату, длительность, разрешение, размер, MIME, имя и состояние очереди.

Произвольные пути файлов не допускаются. Разрешены только state.json и индексированные имена entrance-media/NNNNNN.blob.

## Предварительные лимиты v1

| Параметр | Лимит |
|---|---:|
| Manifest | 4 MiB |
| Количество записей | 512 |
| state.json | 128 MiB |
| Одно видео | 250 MiB |
| Весь архив | 512 MiB |
| Блок проверки SHA-256 | 1 MiB |

Лимиты — консервативные стартовые значения. Их нужно проверить на Android WebView и PWA с реальными объёмами данных. Архив сверх лимита не должен частично экспортироваться или импортироваться.

## Проверка

1. Проверить сигнатуру и ограниченную длину manifest до JSON-разбора.
2. Проверить версию формата, число записей, точные допустимые пути и отсутствие повторов.
3. Проверить размеры, сумму payload и точное соответствие размера файла.
4. Проверить структуру метаданных видео и уникальность их ID.
5. Прочитать и сверить SHA-256 блоками по 1 MiB.
6. Только после успешной проверки передавать state.json существующим валидаторам состояния приложения.

SHA-256 здесь подтверждает целостность payload относительно manifest. Он не удостоверяет автора архива: пользователь, который изменил payload, может пересчитать хеши и manifest.

## Сохранение архива на Android

- В Android Capacitor-приложении нельзя считать успешным сохранение только по вызову `URL.createObjectURL(blob)` и клику по HTML-ссылке: WebView не подтверждает запись такого Blob в публичную папку загрузок.
- Нативный bridge сохраняет архив через Android MediaStore Downloads в `Downloads/Пасека`. Он принимает блоки ограниченного размера, создаёт запись с `IS_PENDING=1`, записывает поток и переводит запись в доступное состояние только после успешного завершения.
- При любой ошибке незавершённая запись удаляется; UI не сообщает об успехе до получения подтверждения от MediaStore. Путь и имя файла формируются приложением, произвольные пути не принимаются.
- Для браузерного PWA сохраняется стандартная передача Blob браузеру; это отдельный путь и не подтверждает Android-сценарий.
- Физический тест MediaStore на OnePlus остаётся обязательным: проверить наличие и размер файла в `Downloads/Пасека`, затем открыть файл вне приложения. CI подтверждает компиляцию bridge, но не работу Android MediaStore на устройстве.

## Обязательные требования к будущей интеграции

- Экспорт должен читать S и entrance_media из одного согласованного снимка данных, а не из разных моментов времени.
- Не удалять оригиналы видео после экспорта.
- До восстановления проверить schema compatibility, структуру state.json, связи ульев и видео.
- Сохранять текущую пасеку и отдельные видео до атомарного переключения.
- Staging и история импорта должны переживать перезапуск приложения.
- Повторный импорт того же backupId должен распознаваться отдельным хранилищем истории, не заменяемым импортируемым объектом S.
- Несвязанные видео после восстановления показывать отдельно; не удалять их автоматически.
- Проверить сохранение/открытие файла вне приватного каталога приложения на реальном Android. Успешная сборка APK не подтверждает работу SAF или Android WebView download.

## Текущая реализация

- `js/paseka-archive.js` реализует создание/разбор контейнера, проверку ограничений, согласованный экспорт из IndexedDB и SHA-256 payload.
- `js/paseka-sha256.js` реализует потоковую SHA-256 для проверки staged Blob.
- `js/paseka-archive-restore.js` реализует persistent staging, повторную проверку, атомарный commit, rollback, историю и очистку.
- UI полного экспорта/восстановления интегрирован в настройки приложения в Draft PR #168.
- IndexedDB object-store version 4 добавила только `archive_staging` и `archive_history`; существующие `main`, `full_backup`, `entrance_media` сохраняются. Затем версия 5 используется как барьер `versionchange`, чтобы старые вкладки закрыли соединения до атомарного восстановления. В v5 новые stores, индексы и преобразование пользовательских записей не добавляются. App schemaVersion остаётся 15.
- Service Worker v315 кеширует все три модуля. Регрессионный набор покрывает формат, экспорт, staging, cleanup, atomicity, SHA-256, UI/offline и upgrades v3→v4→v5.
- Реальная проверка сохранения/открытия архива вне приложения на физическом Android остаётся release gate.

## Экспортный адаптер

Модуль также содержит `readConsistentDatabaseSnapshot(db)` и `exportArchiveFromDatabase(db, cryptoProvider, options)`.

Адаптер читает `main/state` и весь `entrance_media` одним readonly-транзакционным снимком IndexedDB. Только после завершения транзакции он сериализует состояние и вычисляет SHA-256 блоками. Видео сортируются по дате и ID, оригинальные Blob остаются в базе. Если запись видео существует, но Blob отсутствует, экспорт завершается ошибкой вместо молчаливого пропуска.

Адаптер проверяет версию схемы 1–15, общий лимит записей, лимиты состояния/видео, метаданные и согласованность MIME/размера. Версии выше 15 отклоняются до обновления приложения. Он возвращает Blob архива, manifest и краткую сводку. Экспорт подключён к настройкам приложения; импорт использует отдельные staging/history stores и требует явного подтверждения перед атомарной заменой.

Тесты адаптера используют `fake-indexeddb` и проверяют согласованное чтение, наличие фото из state JSON, включение видео, сохранение оригиналов, отсутствие основной записи, несовместимую схему и повреждённые метаданные.


## Предварительная проверка перед восстановлением

Добавлена функция `validateArchiveForRestore(blob, cryptoProvider, validateState)`. Она:
1. разбирает manifest и проверяет ограничения формата;
2. проверяет SHA-256 всех записей до разбора состояния;
3. требует обёртку `{ app: "Paseka", state: ... }`;
4. сверяет версию схемы в состоянии с manifest;
5. передаёт состояние существующему валидатору приложения, который вызывающий код обязан предоставить;
6. возвращает видео как Blob-срезы без загрузки всего архива в память и отдельно перечисляет записи, ссылающиеся на отсутствующие в восстановленном состоянии ID ульев.

Это только проверка и подготовка ссылок на содержимое. Функция не записывает данные в IndexedDB, не создаёт staging и не переключает рабочую базу. Orphan-видео не удаляются и не блокируют проверку: вызывающий интерфейс должен показать их отдельно.


## Подключение экспорта в интерфейсе

В Draft PR #168 добавлена кнопка «Скачать полный архив .paseka» в настройках. Она дожидается очереди сохранения приложения, блокирует экспорт при ошибке сохранения, вызывает IndexedDB-адаптер и предлагает скачать файл. В статусе отображаются число видео и размер архива. Отдельно доступна системная отправка файла на поддерживаемых устройствах. JSON-копия остаётся отдельным вариантом и явно не называется полной копией видео.

Три модуля включены в precache Service Worker v314, поэтому доступны при офлайн-запуске после обновления кеша. Успешная CI-сборка не доказывает, что скачивание файла работает на конкретной версии Android WebView: это требует ручного теста на устройстве.


## Постоянная временная область импорта

IndexedDB object-store version 4 добавила два store; версия 5 не меняет структуру, а инициирует `versionchange` для закрытия старых подключений:
- `archive_staging` — проверенное состояние и видео до восстановления;
- `archive_history` — зарезервированная история уже выполненных импортов.

Менеджер `js/paseka-archive-restore.js` сначала полностью проверяет архив через codec и валидатор приложения. Затем записывает состояние и каждый Blob отдельными транзакциями в staging. Рабочие store `main` и `entrance_media` на этом этапе не меняются.

Сессия хранит статус `staging`, `ready` или `failed`, число ожидаемых/записанных записей, fingerprint manifest и список видео с отсутствующими ульями. При прерывании остаётся явная незавершённая сессия; повторная загрузка того же архива блокируется до её удаления. Уникальный индекс backupId защищает от одновременной постановки одного архива в очередь из двух вкладок. Содержимое можно прочитать для будущего commit или безопасно удалить.

В Draft PR #168 реализованы: выбор файла `.paseka`, полный предпросмотр и проверка, явное подтверждение, атомарная замена рабочей базы, сохранение прежних видео для undo и запись в `archive_history`. Наличие staging само по себе не означает, что импорт завершён: рабочие данные меняются только после отдельного подтверждения.


Перед будущим commit staging перечитывается и повторно проверяется: state Blob и каждый видео Blob сверяются с сохранёнными SHA-256 из manifest, JSON состояния разбирается заново и повторно проходит валидатор приложения. Метаданные видео сравниваются с manifest, а привязки к ID ульев пересчитываются по staged-состоянию. Изменённый или повреждённый staging не должен попасть в рабочую базу.


## Атомарное применение staged-архива

Добавлена функция `commitStagedArchive`. Она требует ожидаемую revision основного состояния и отказывает, если данные успели измениться после просмотра архива. Перед записью staged manifest, состояние и видео повторно сверяются с fingerprint и SHA-256. Проверка выполняется внутри одной readwrite-транзакции с поддержанием её активности; затем в этой же транзакции:
- прежнее состояние копируется в `full_backup/previous`;
- прежнее состояние и все старые видео сохраняются в отдельной rollback-сессии;
- `main/state` заменяется новым состоянием с новым revision ID и записью аудита;
- `entrance_media` атомарно заменяется видео из архива;
- создаётся запись `archive_history`;
- staging-сессия помечается как committed.

Если транзакция прерывается, IndexedDB не должна применить только часть этих изменений. Проверки покрывают успешную замену и отказ при устаревшей revision. Команда очистки не позволяет случайно удалить committed-сессию или rollback-снимок.

Добавлена функция `rollbackCommittedArchive`: она атомарно восстанавливает прежнее состояние и видео только если текущая revision совпадает и с ожидаемой revision вызывающего кода, и с `importedRevisionId`, сохранённой при commit данного импорта. Если после импорта журнал изменился, откат блокируется до финальной транзакции и точка отката остаётся доступной. `discardArchiveRollbackSnapshot` позволяет явно удалить точку отката и освободить место; после этого отмена данного импорта недоступна. Удаление снимка и обновление истории выполняются одной транзакцией. Пользовательский экран импорта, предпросмотр и кнопки управления интегрированы в Draft PR #168.


После успешного атомарного commit временные Blob-копии архива удаляются в той же транзакции; в staging остаётся только запись-сводка импортированной сессии. Это не дублирует все импортированные видео и позволяет освободить место, сохраняя rollback-снимок прежних данных.

После успешного отката rollback-снимок считается использованным и удаляется в той же транзакции, которая возвращает прежнее состояние и видео. История помечается как `reverted`, ссылка на точку отката очищается. Это предотвращает накопление невидимых копий видео при повторных импортах. Если транзакция отката не завершается, ни восстановление, ни удаление снимка не должны примениться частично.


## Интерфейс полного восстановления

В настройках приложения пользователь выбирает файл полного архива `.paseka`, запускает полную проверку и получает предпросмотр даты, версии схемы, числа видео и числа ссылок на отсутствующие ульи. До отдельного подтверждения рабочая база не меняется. Готовая временная сессия доступна после перезапуска приложения; пользователь может продолжить восстановление или удалить её. На поддерживаемых телефонах файл можно передать через системное меню; обычное скачивание остаётся резервным способом экспорта.

После импорта доступна атомарная отмена, пока рабочая revision не изменилась. В истории также есть явная команда удаления точки отката, чтобы освободить место; после её удаления отменить импорт нельзя. После успешной отмены использованный rollback-снимок автоматически удаляется в той же транзакции.

## Границы защиты

SHA-256 в manifest позволяет обнаружить случайное повреждение, усечение и несоответствие staged-файлов исходному архиву. Это не цифровая подпись: формат не доказывает, кто создал архив, и не защищает от намеренно изменённого архива, если злоумышленник пересчитал manifest и контрольные суммы. Приложение дополнительно проверяет структуру данных, связи модели и поддерживаемую версию схемы; загружать следует только архивы из доверенных источников.

Рабочая база изменяется только после отдельного подтверждения на экране предварительного просмотра. При успешном импорте прежнее состояние и видео сохраняются для отмены; если текущая revision после импорта меняется, откат отказывается затирать новые данные.
