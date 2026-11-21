## Итог специализированной Gradle-сборки — SUCCESS (точный SHA)

[CI #44937442484](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44937442484) на кодовом SHA `77ae44faa1d68b1e8cde17c8fd951e956f4b0457` — **completed/success**, Node **1230/1230 PASS, 0 failed**, `BUILD SUCCESSFUL`, AAPT package `ru.paseka.journal.archive.fileproof329`. Артефакт `paseka-fileproof329-inert-compile-apk`, ID **14719299636**, ZIP SHA-256 из GitHub Upload Artifact **`1953605e0deeb1fb8a31c420e24a07e2e6c99c734bd24213c9d10b8f62f57405`**. APK **инертный**: веб-страница не пишет и не экспортирует данные, никакой физический proof не проводился. Он **не предназначен для установки пользователем**. Не дополнять задним числом смысл PASS: компиляция Java, не MediaStore write/readback на телефоне.

---

## Сборочная контрольная точка (21.11.2026)

К тестовому источнику добавлен `scripts/prepare-android-two-mp4-fileproof329.mjs`: при явном `PASEKA_FILEPROOF329_BUILD=1` создаёт **отдельный package `ru.paseka.journal.archive.fileproof329`** и внедряет Java `IsolatedMediaStoreProofBridge` только в генерируемый Android `MainActivity`. Экран тестового APK **намеренно инертен**: не вызывает нативную запись, не открывает/не восстанавливает хранилища и не взаимодействует с любыми пользовательскими архивами.

Добавлена специализированная `.github/workflows/android-two-mp4-fileproof329.yml` на push test-ветки и manual dispatch. Проверяет npm regressions, генерацию изолированного Android, Gradle compilation и через AAPT **точный** package fileproof329, затем сохраняет APK-артефакт. [Сборка #44937442484](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44937442484) на кодовом SHA `77ae44faa1d68b1e8cde17c8fd951e956f4b0457`: **выполняется** по последнему наблюдению, успех пока не установлен. Не использовать этот APK на телефоне до завершения сборочной проверки и подготовки отдельного сценария. Это не физический MediaStore тест.

---

# Изолированный Android MediaStore: подготовка fileproof329

Дата: 21.11.2026. Draft PR #329 поверх #328.

## Исходное подтверждение

Физический OnePlus `ru.paseka.journal.archive.proof325`: `INITIAL_PASS` + `RELAUNCH_PASS`, две SHA-pinned фикстуры MP4 внутри отдельной IndexedDB, **только in-memory PASEKA01**. Отдельные Node CI тесты #328 записали PASEKA01 в файл временной файловой системы runner через `open('wx')`, fsync, повторно прочитали, проверили SHA и блокировку повреждений.

Осталось доказать native Android MediaStore write/readback и восстановление без удаления пользовательских данных. Существующий production bridge `scripts/prepare-android-archive-download.mjs` пишет в `Downloads/Пасека` без доказанной обработки коллизий имён; использовать его для физического эксперимента нельзя.

## Новый тестовый контракт (подготовка, не APK)

`scripts/isolated-android-mediastore-proof-bridge.mjs` генерирует отдельный класс `IsolatedMediaStoreProofBridge` **только** для другого package `ru.paseka.journal.archive.fileproof329`. Этот Java bridge пока **не внедрён** ни в production, ни в APK на телефоне.

- Пользователь/JS не задаёт имя файла, URI или каталог.
- Нативное имя `paseka-proof329-<UUID>.paseka`, относительный каталог `Download/PasekaProof329/` (не `Download/Пасека`). Проверяется отсутствие такого имени по `DISPLAY_NAME + RELATIVE_PATH`. UUID делает совпадение маловероятным, но запрос к MediaStore сам по себе может быть ограничен видимостью записей других приложений: **не доказательство абсолютной невозможности collision**.
- Максимум 1 MiB, ожидаемый magic `PASEKA01`, точный SHA-256 входных байтов. Для тестового режима не принимаются произвольные пути и имена, нет вызова `ContentResolver.delete` или API очистки.
- `IS_PENDING=1`, запись через собственный созданный URI, завершение `IS_PENDING=0`, повторное чтение **того же URI**, сравнение bytes + SHA-256. При ошибке `BLOCKED`, исходные файлы не трогаются; потенциально остаётся собственная тестовая pending-запись, её не удалять автоматически.
- One-shot ограничение после успешного экспорта; **не** разрешение на запись пользовательских видео или очистку источников.

`tests/android-two-mp4-mediastore-isolation.test.mjs` содержит статические защитные инварианты пакета, пути, методов Java, отсутствия delete и ограничения источника. Это ещё **не** настоящий Java compile и **не** физическая проверка Android MediaStore.

## Не выполнено

1. Изолированный APK fileproof329 со специальной HTML-страницей, содержащей только два pinned MP4 и один экспорт.
2. Java compilation и проверка точного package `fileproof329` на GitHub Actions.
3. Одноразовый физический запуск с readback SHA, проверкой идентификатора созданного URI и сохранности ранее созданных файлов.
4. Импорт в **новую отдельную** IndexedDB и реальные negative tests, без restore commit в production.

Перед физическим экспериментом требуется отдельный тестовый пакет, CI успешная сборка на точном SHA и проверка безопасного устройства. Не повторять установку поверх `proof325`. Автоматическое удаление оригинальных видео остаётся запрещённым.
