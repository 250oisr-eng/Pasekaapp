# PROJECT_STATUS — Пасека 2.0

**24.11.2026.** Live `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d` после разрешённого merge [#477](https://github.com/250oisr-eng/Pasekaapp/pull/477). Все новые SHA/CI сверять по GitHub; подробная история в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## Текущая интеграция и проверки

- #471–#476 **MERGED**: read-only архив, fail-closed IDB, legacy/rollback и Varroa/journal guards; физическое полное восстановление не подтверждено.
- #477 **MERGED**: Service Worker v317 проверяет shell на private/no-store/404 при install. Exact-main Fast [#45476750153](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45476750153), Android [#45476750242](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45476750242), Governance [#45476750196](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45476750196) **completed/success**. Никакой публикации.
- [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478) **NOT_IN_MAIN**: VM-regressions shell/offline/cache isolation. На SHA `4160115da08e899ea71405f674d6cc763cbea39a`: Android [#45482183478](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45482183478) и Governance [#45482183534](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45482183534) **completed/success**. Последующие docs HEAD проверять отдельно.

## B11 — физические доказательства и ограничения

- Пользовательские read-only отчёты v1/v2/v3: OnePlus NE2213 Android 16/API36, установлен `ru.paseka.journal` v1.0, base.apk 8 350 003 bytes, SHA-256 `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6`. Встроенный `assets/public/sw.js` объявляет `paseka-shell-v315` (в `main` v317). **Активный Service Worker не проверен.**
- **USER_REPORTED_DEVICE_PASS:** два последовательных открытия установленной v315 при выключенной сети, улей, семья и две заметки на месте. Между созданием записей и тестом были **несколько полных перезагрузок телефона**, записи сохранились. Не проверены `am force-stop`, active SW и обновление кеша.
- v3: установленный APK **не имеет** UI полного IndexedDB-экспорта или `js/disaster-archive.js`; этот код есть только в более новом `main`. Обычный JSON backup не покрывает отдельно хранимые Blob. **Независимый полный архив/restore не доказаны.**
- **STOP:** никаких установок поверх v315, удаления/очистки, восстановления, видео-cleanup, публикаций либо утверждений о полном архиве до доказанной независимой копии/возврата, проверки package/signing и отдельного разрешения на конкретное обновление.


- **B11 v6 / OnePlus (USER_REPORTED_JSON, 24.11.2026):** `PASEKA_B11_SIGNING_STORAGE_INVENTORY_V6=PASS` для метаданных. Тот же APK SHA-256, `runAsAvailable=true`; `app_webview/Default/IndexedDB`, `Local Storage`, `databases`, `files` и другие private directories **существуют**. Содержимое не читалось, архив не создан; `javaFound=false`, `apksignerJarFound=true`, поэтому `signerCertificateSha256=NOT_VERIFIED` (`JAVA_OR_JAR_MISSING`). Файлы пользователя и система не изменены. **Не продолжать серию signer диагностик на телефоне**, пока не найден Java runtime на Windows; это не блокирует независимую разработку метода локальной read-only копии. Восстановление на рабочем OnePlus запрещено.

## Блокеры и следующие действия

**B01** независимый полный backup/restore; **B04/B05** installed fingerprint и постоянный ключ; **B06/B10** реальные лицензированные видео и модели, issue [#442](https://github.com/250oisr-eng/Pasekaapp/issues/442) **FROZEN**; **B11** v315→v317 upgrade не проверен; **B14** device performance. Полный [реестр B01–B15](docs/РЕЕСТР-БЛОКЕРОВ.md).

Следующая точка: read-only план согласованного извлечения и проверки защищённой внешней копии; без установки APK и без копирования приватной БД в чат. **Draft #469** (подпись, не слит), **Draft #452** (restore, не слит). PR #478 не объединять без отдельного разрешения. Любой release, production deployment/DB и необратимые действия требуют отдельного подтверждения.
