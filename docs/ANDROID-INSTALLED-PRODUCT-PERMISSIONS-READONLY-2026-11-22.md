# Проверка разрешений УСТАНОВЛЕННОЙ основной «Пасеки» — Android read-only APK

Дата: 2026-11-22. Статус: код и сборка CI **PASS**, физическая проверка **NOT_TESTED**.

## Почему нужен отдельный APK

Предыдущая диагностика `archivea09v1` прочитала только разрешения **своего** пакета и показала отсутствие `INTERNET`. Между тем статический аудит APK настоящего `ru.paseka.journal` (code SHA `42b548b45f20d8aec1ec1e336942c6a8d1f011a7`, CI #45027702899) обнаружил **объявленный `android.permission.INTERNET`**. Ни один из результатов не доказывает, какие права сейчас имеют установленная на телефоне версия `ru.paseka.journal` и какой трафик она генерирует.

## Реализация и изоляция

- Диагностический APK: **`ru.paseka.journal.diagnostic.productpermsv1`**, отдельный Android пакет и отдельная IndexedDB/данные, не меняет production.
- Ровно две кнопки: **«Провести тест» → «Копировать результат»**. При `PASS` и `BLOCKED` результат валидируется и копируется в системный буфер только по прямому нажатию пользователя; отсутствие отчёта/Clipboard — не скрывается.
- Native `ProductPermissionsPlugin` выполняет только `PackageManager.getPackageInfo("ru.paseka.journal", GET_PERMISSIONS)`; манифест содержит строго один `<queries><package android:name="ru.paseka.journal"/></queries>`. **НЕТ** `QUERY_ALL_PACKAGES`, перечисления других приложений, Internet/media/camera разрешений самого диагностического APK, обращения к файлам, резервным копиям, видео, логину, токенам.
- Native проверяет точный target ID, положительный UID и несовпадение target UID с диагностическим процессом, возвращает только `versionCode`, `versionName`, `requestedPermissions`/grant flags; **не запускает** целевое приложение и не взаимодействует с пользовательскими данными.
- JS проверяет source marker и exact `targetPackageId`, структуру, отсутствие дубликатов и длины, сортировки не подменяют исходный JSON. При отсутствующем пакете Android, отказе PackageManager или неверных метаданных **`BLOCKED`**, никогда выдуманный `PASS`.
- `PASS / PRODUCT_INSTALLED_PACKAGE_PERMISSIONS_READONLY` означает **только** прочитанную правильную метаинформацию. Если `INTERNET` указан, вывести `internetPermissionDeclared:true`, а не занижать статус риска. `productNetworkTrafficObserved:NOT_TESTED` даже при PASS. `cleanupAuthorized:false`, `restoreAuthorized:false`, `archiveSafe:false` всегда.

## CI и контрольный APK

Кодовый SHA: `0f299c9d1cfef125406ee237283890158114e3f4`.

- [GitHub Actions #45028133593](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45028133593): **completed/success** (Node регрессии, общий набор, Gradle, APK, permissions/package/queries/plugins проверка).
- ZIP artifact ID `14755989927`, ZIP SHA256 `f515a5f14bf7e8284a1b8981e2b557e3cfe8d7f662108c0c4016b4333eefb205`.
- Извлечённый `Paseka-Installed-Product-Permissions-2026-11-22.apk`: **3 752 785 bytes**, SHA256 `1c220092ae90243d6963443fc522859d85adff0dbb71a9463fc1167878658ea5`.
- Файл проверен отдельно: ZIP содержит ровно один APK, в нём обе кнопки, `assets/public/runner.js`, `copy-report.js`, native `ClipboardPlugin`; `queries` проверен workflow в исходном AndroidManifest до сборки.

## Физический сценарий

Пользователь без удаления старых APK устанавливает новый отдельный файл, нажимает **«Провести тест»**, затем **«Копировать результат»** и вставляет полный JSON в чат. Если на этом Android **не установлена** основная `ru.paseka.journal` или PackageManager не видит пакет, результат должен быть **BLOCKED** с причиной. Установка, обновление или очистка оригинальной «Пасеки» ради теста не разрешаются.

Физический результат ещё не получен: `PRODUCT_INSTALLED_PERMISSIONS_METADATA_ONLY:NOT_TESTED`. Отсутствие/наличие реальных сетевых передач и доступ к архивам отдельно не тестировались. Критический допуск restore/delete остаётся запрещённым.
