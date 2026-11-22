# Android Restore335 V10 — проверка источникового имени файла без чтения содержимого

Дата: 2026-11-22.

## Реальный результат V9 (пользователь)

`ANDROID_RESTORE335_NULL_TYPE_V9` на OnePlus NE2213/API36: `status=BLOCKED`, `detail=PRIVATE_FIND_NULL_FRAMING_UNVERIFIED`, `privateEntryCount=1`, `privateEntryType=NOT_TESTED`, `privateInput=UNKNOWN_PRESERVE`. Точные проверки ADB SHA, единственного авторизованного устройства, версии Android, трёх PackageManager наблюдений и приватного каталога завершились PASS. `installs/writes/mediaRead=NOT_ATTEMPTED`, `cleanup=NOT_AUTHORIZED`. Windows CMD успешно сохранил локальный JSON на рабочем столе. Причина ошибки framing неизвестна; это не свидетельство повреждения файла. Повторять V9 нельзя.

## Обнаружен источниковый контракт APK

`scripts/prepare-android-fileproof335-isolated-apk.mjs` задаёт `const PACKAGE='ru.paseka.journal.archive.restoreproof335'`, `const INPUT='fileproof335-input.paseka'`, тестовый SHA256 `4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186`. Предполагаемая длина тестового архива — 3158 байт. Ранее неудачная попытка staging могла создать неполный файл; **наличие корректных байтов, длина и SHA на телефоне не подтверждены**. Не считать единичную запись доказательством восстановленного архива или пчелиного видео.

## Безопасный переход от V9 к V10

Вместо форматированного `stat/ls -l/find/-print0`, V10 наследует проверенные V4 ограничения ADB, NE2213/API36, точного PackageManager, `run-as` и каталога. Прежде чем проверять тип, он требует **ровно одну** запись каталога `files`, которая без преобразований **дословно равна** константе `fileproof335-input.paseka` из исходника APK. Не использовать имя из каталога как аргумент команды и не обрабатывать чужие записи.

Только после совпадения имени запускаются четыре фиксированных read-only предиката Android Toybox:

- `test -e files/fileproof335-input.paseka` — путь существует;
- `test -f files/fileproof335-input.paseka` — обычный файл;
- `test -d files/fileproof335-input.paseka` — каталог;
- `test -L files/fileproof335-input.paseka` — символическая ссылка.

Android Toybox описывает эти четыре предиката: https://android.googlesource.com/platform/external/toybox/+/refs/heads/main/android/linux/generated/help.h . Только точная комбинация e=TRUE, f=TRUE, d=FALSE, L=FALSE и повторное совпадение списка позволяет ответить `status=PASS`, `sourceEntryKind=REGULAR_FILE_NAMED_ONLY`; неизвестные, непротиворечивые и противоречивые результаты оставляют BLOCKED и данные нетронутыми. Все выходы `test` трактуются по строгим кодам/пустому выводу. Никаких метаданных, имен других записей, исходных байтов, размера, хеша или содержимого файла в JSON.

## Что PASS не означает

PASS V10 подтверждает **только** имя и файловый тип *изолированного тестового входного файла*, но не SHA, длину, целостность, возможный источник из пользовательских данных, восстановление 2 MP4, распознавание пчёл или безопасность удаления. `privateInput=UNKNOWN_PRESERVE` и `cleanup=NOT_AUTHORIZED` всегда. Любая будущая проверка длины/SHA тестового файла — отдельный проектный этап с предварительной защитой от чтения неизвестных/слишком больших данных.

## Тестирование

`tests/android-restore335-fixed-file-predicates-v10.test.mjs` — 5 статических защитных и источниковых регрессий. Windows CI: синтаксис PowerShell, исполняемый изолированный набор 8 синтетических комбинаций (1 допустимая, 7 запрещённых). Общий Android Debug APK CI отдельно, на точном SHA. Физический V10 **не проверен**. Нет операций записи в телефон, слияния, изменения main или production deployment.

## Физический V10 — результат от пользователя (2026-11-22)

Фактический JSON с OnePlus NE2213/API36: `status=BLOCKED`, `detail=SOURCE_FIXED_NAME_NOT_MATCHED_PRESERVE`, `privateEntryCount=1`, `sourceNamedEntry=NOT_MATCHED_PRESERVE`, `sourceEntryKind=NOT_TESTED`, `privateInput=UNKNOWN_PRESERVE`. Все предварительные ADB SHA/модель/SDK/PM package triple-check и проверки каталога PASS; `installs/writes/mediaRead=NOT_ATTEMPTED`, `cleanup=NOT_AUTHORIZED`. Запуск CMD сохранил JSON в папку рабочего стола Windows. Ни одного критического действия над файлом не выполнялось.

**Строгое значение результата:** текст одной строки `ls -A files` не совпал с литералом `fileproof335-input.paseka`. Это не доказывает, что файл отсутствует во всём телефоне, что запись является повреждённым архивом или что имя точно известно. Предположения о формате ADB/Android вывода не подтверждены; не продолжать цикл V11 по разбору `ls`/`find` без новой независимой доказательной базы.

**Найден потенциальный источник одиночной записи:** в `scripts/prepare-android-fileproof335-isolated-apk.mjs` Java `Restore335Reporter` записывает `getFilesDir()/restore335-report.json` (не перезаписывая существующее), а `tests/fixtures/android-fileproof335-start.js` вызывает reporter **также в catch при отсутствующем или повреждённом входном архиве**. Значит, отчёт может существовать без `fileproof335-input.paseka` и без успешного restore. Совпадение обнаруженного элемента с `restore335-report.json` **не подтверждено**, и никто не читал его содержимое. Статический и поведенческий регрессионный тест `tests/android-restore335-report-writer-provenance.test.mjs` проверяет эту цепочку без доступа к телефону.

**Принятое ограничение:** для текущего физического этапа сохранять `RESTORE_INPUT_NOT_VERIFIED` и `RESTORE_NOT_ATTEMPTED`, не переустанавливать диагностическое APK, не очищать `files/`, не запускать старые one-shot/dd и не читать неизвестный элемент. Следующая работа — только независимая проверка источникового тестового архива, скрипта staging, документации и воспроизводимых синтетических сценариев в CI; новая физическая команда не подготовлена. Отсутствие физической проверки корректного архива не снимает требования отдельно доказать полное восстановление двух MP4 и безопасность удаления.
