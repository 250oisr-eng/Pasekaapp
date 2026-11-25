# B01 — разбор отчёта OnePlus private backup V8 (25.11.2026)

## Фактический результат (из переданного пользователем JSON)

- Схема: `paseka-oneplus-app-private-backup-readonly-v8`; время UTC: `2026-11-25T08:10:45.9147686Z`.
- `status=BLOCKED`, `failureStage=LOCAL_TAR_VERIFY`, `errors=["INVALID_TAR_HEADER_CHECKSUM"]`.
- `adbToolLocated=true`, `lastAdbExitCode=0`, `runAsProbe=AVAILABLE`, `runAsAvailable=true`, телефон `NE2213`, пакет `ru.paseka.journal`.
- `archiveCreated=false`, `archiveBytes=0`, `archiveSha256=null`, `archiveTarEntries=0`, `archiveValidTar=false`.
- `backupCompleteness=NOT_VERIFIED`, `independentRestore=NOT_TESTED`, `mediaStoreGalleryCoverage=NOT_TESTED`.
- Согласно отчёту: install/uninstall/forceStop/clear/restore/deleteOriginals/deviceWrites/network — `NOT_ATTEMPTED`.

Здесь `archiveBytes=0` — поле отчёта о принятом архиве, **не доказательство** того, что инструмент не получил никакого промежуточного байта до отклонения. Нет локального потока V8, исходника скрипта V8, идентификатора host adb и сырых диагностических полей; установить первопричину `INVALID_TAR_HEADER_CHECKSUM` из одного JSON нельзя. `failureCategory=NONE` не отменяет `status=BLOCKED`.

## Дифференциальный диагноз; не выдавать гипотезы за факты

1. **Формирование TAR на Android:** `tar` может завершиться с удалённой ошибкой; на старом raw ADB stderr может попасть в stdout даже при host exit0.
2. **Транспорт:** дополнительные байты, обрыв, PTY/неверный режим shell либо несовместимый host adb; ранний V6 отдельно подтвердил четыре точных потока нулей, но не подтвердил корректный публичный TAR.
3. **Локальная обработка:** повреждение перенаправлением, усечение/неверное смещение, неверная интерпретация PAX/GNU расширений или дефект валидатора checksum. Заявление о таком дефекте требует воспроизводимого нечастного synthetic TAR и независимого валидатора.
4. **Несогласованный файловый снимок:** живые WebView/SQLite/IndexedDB могут измениться во время чтения; даже полностью валидный TAR не подтверждает консистентность backup.

V8 **не** устанавливает, какая из этих причин истинна. Ранее зарегистрированный V6 public TAR `1090` байт, старый `adb 1.0.32` и последующая подготовка V7 с современным host ADB — история отдельных экспериментов, а не доказательство того, какая версия или команда использовалась в V8.

## Минимальный различающий план: без реальных записей

**G1 — проверка инструмента на ПК, без OnePlus.** Изучить точный исходник V8 (версия adb; `adb shell` vs `exec-out`; remote tar; формат stdout/stderr; метод FileStream/cmd; валидатор checksum); проверить контрольным TAR, созданным на ПК: valid header accepted, изменённый один байт header rejected, truncated rejected, GNU/PAX корректно разобраны или отмечены unsupported без ложного PASS; код 0 при повреждённом архиве не становится PASS.

**G2 — только публичный файл на OnePlus и без private sandbox.** Один современный side-by-side host adb из официальных SDK Platform-Tools, фактическая версия фиксируется в отчёте; независимый read-only gate на доступность конкретного публичного файла, затем один точный public-only TAR с бинарным stdout, отдельным host stderr и доказуемым remote exit (где поддерживается). Проверять байты, 512-alignment, octal checksums каждого реального заголовка, payload offsets, нулевой конец, отсутствие лишних nonzero байтов, exit и источник команды. **Если любой gate BLOCKED — не переходить к пользовательским данным.** Не повторять ранее подтверждённые 16-byte/5 MiB нулевые тесты без новых причин.

**G3 — только после доказанного G2, с отдельным осознанным разрешением на приватное чтение.** Передавать диагностируемый приватный кандидат напрямую на защищённый носитель ПК, с post-capture проверкой app process и логом без пользовательских путей/контента. Самодостаточность, remote/host контроль целостности, привязка к версии скрипта и exact bytes обязательны. Никаких автоматических `force-stop`, `pm clear`, `install`, `uninstall`, `restore`, `rm` или upload. Если app process running/unknown — fail closed.

**G4 — до снятия B01.** Инвентаризация отдельных источников Android Gallery/MediaStore/внешних файлов, внешнее безопасное хранение, независимое восстановление на отдельной пустой среде, сверка histories/Blob/links/counts/hash. TAR/G3 — только `CANDIDATE_ARCHIVE`; не `fullBackupVerified`.

## Регрессии и статус

- Дополнительный синтетический тест в `tests/b01-adb-stream-safety.test.mjs`: ошибка checksum должна блокировать даже 512-aligned stream при adb exit0; некорректный/обрезанный TAR отклоняется.
- Публичный real Android тест V8: `NOT_TESTED` в этом цикле. Исходника Windows V8 нет в рассматриваемых файлах репозитория; фактическое исправление транспортного скрипта не заявлено.
- `B01=BLOCKED`, `NO_RESTORE`, `NO_APK_UPGRADE`, `NO_VIDEO_DELETE`, `NO_MERGE`, `NO_DEPLOY`.

**Точка возобновления:** доступный исходный код V8 или точный проверяемый host/public-only диагностический результат с современной версией adb. Не заставлять пользователя повторять небезопасные приватные захваты для проверки гипотез.
