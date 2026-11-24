# PROJECT_STATUS — Пасека 2.0

**24.11.2026.** Live `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d` после разрешённого merge [#477](https://github.com/250oisr-eng/Pasekaapp/pull/477). Все новые SHA/CI сверять по GitHub; подробная история в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## Текущая интеграция и проверки

- #471–#476 **MERGED**: read-only архив, fail-closed IDB, legacy/rollback и Varroa/journal guards; физическое полное восстановление не подтверждено.
- #477 **MERGED**: Service Worker v317 проверяет shell на private/no-store/404 при install. Exact-main Fast [#45476750153](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45476750153), Android [#45476750242](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45476750242), Governance [#45476750196](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45476750196) **completed/success**. Никакой публикации.
- [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478) **NOT_IN_MAIN**: VM регрессии реального `sw.js` для offline navigation и изоляции кеша. На SHA `1201f88f17801227672b1ca3992b6c7dcaffc577` Android [#45480683876](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45480683876) и Governance [#45480683982](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45480683982) **success**. Более поздний HEAD `84cfc1aae744c8b0a0a83687e3d164d1286fa32b`: Android [#45481184714](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45481184714) **failure (720/721)**, Governance [#45481184833](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45481184833) **failure** — **первопричина:** оперативный статус превысил установленный лимит 6500 символов; здесь сокращён без ослабления проверки. Текущий HEAD требует повторного CI.

## B11 — физические доказательства и ограничения

- Пользовательские read-only отчёты v1/v2/v3: OnePlus NE2213 Android 16/API36, установлен `ru.paseka.journal` v1.0, base.apk 8 350 003 bytes, SHA-256 `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6`. Встроенный `assets/public/sw.js` объявляет `paseka-shell-v315` (в `main` v317). **Активный Service Worker не проверен.**
- **USER_REPORTED_DEVICE_PASS:** два последовательных открытия установленной v315 при выключенной сети, улей, семья и две заметки на месте. Между созданием записей и тестом были **несколько полных перезагрузок телефона**, записи сохранились. Не проверены `am force-stop`, active SW и обновление кеша.
- v3: установленный APK **не имеет** UI полного IndexedDB-экспорта или `js/disaster-archive.js`; этот код есть только в более новом `main`. Обычный JSON backup не покрывает отдельно хранимые Blob. **Независимый полный архив/restore не доказаны.**
- v4: `run-as ru.paseka.journal id` **доступен**, но сценарий остановился на `UNEXPECTED_REMOTE_PATH` до повторного hash/signing; fingerprint **NOT_VERIFIED**. Анализ ZIP выявил чрезмерно узкую проверку имени APK (`~`, `+`, `=` в `/data/app/~~...==/.../base.apk`); подготовлен локальный **v5 read-only ZIP** с ограниченным исправлением whitelist. Физический запуск v5 **NOT_TESTED**. Ни в v4, ни в v5 база пользователя не извлекается.
- **STOP:** никаких установок поверх v315, удаления/очистки, восстановления, видео-cleanup, публикаций либо утверждений о полном архиве до доказанной независимой копии/возврата, проверки package/signing и отдельного разрешения на конкретное обновление.

- **B11 v5 (USER_REPORTED_JSON):** `PASEKA_B11_ANDROID_READONLY_GATE_V5=PASS`, `run-as=true`, installed base.apk совпадает с v2/v3 по SHA-256, извлечение пользовательской БД и изменения устройства отсутствуют. `apksigner` найден, но завершился с exit code 1; причина и сертификат **NOT_VERIFIED**. Подготовлен локальный ZIP v6 с прямым Java/JAR вызовом `apksigner`, категориями ошибок и проверкой только наличия каталогов app sandbox (`run-as ls -ld`); ZIP/статический запрет на запись PASS, физическое исполнение **NOT_TESTED**. До реального полного архива и совпадения signing certificate обновление запрещено.

## Блокеры и следующие действия

**B01** независимый полный backup/restore; **B04/B05** installed fingerprint и постоянный ключ; **B06/B10** реальные лицензированные видео и модели, issue [#442](https://github.com/250oisr-eng/Pasekaapp/issues/442) **FROZEN**; **B11** v315→v317 upgrade не проверен; **B14** device performance. Полный [реестр B01–B15](docs/РЕЕСТР-БЛОКЕРОВ.md).

Следующая точка: пользовательский read-only JSON v5, затем доказуемый способ защитить оригиналы вне телефона, без изменения текущего APK. **Draft #469** (подпись, не слит), **Draft #452** (restore, не слит). PR #478 не объединять без отдельного разрешения. Любой release, production deployment/DB и необратимые действия требуют отдельного подтверждения.
