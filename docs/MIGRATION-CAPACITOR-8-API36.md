# План миграции Paseka на Capacitor 8 / Android API 36

Статус: подготовительная миграционная ветка. Изменения не предназначены для слияния до прохождения CI и ручных проверок.

## Исходная точка

- Базовый commit: `4992bc070115fb122da74cf555c88040289e2843`
- Исходная ветка: `feature/entrance-video-retention-guard-2026-11-13`
- Capacitor: 6.2.1
- Android: minSdk 24, compileSdk 35, targetSdk 35
- Custom plugin: `@paseka/capacitor-bee-detector` (Java)
- Runtime: standalone LiteRT 2.3.2
- CI: Node 20, JDK 17; Android scaffold создаётся командой `npx cap add android`

## Проверенная целевая линия

- На 14 ноября 2026 года последняя стабильная версия Capacitor 8 — **8.6.2**; Capacitor 9 ещё в pre-release/RC и не используется как production baseline.
- Capacitor 8 поддерживает Android target API 36.
- Node.js: 22+.
- Capacitor 8 Android scaffold: AGP 8.13.0, Gradle 8.14.3, Java source/target compatibility 21.
- SDK: minSdk 24, compileSdk 36, targetSdk 36.
- Android Studio Otter 2025.2.1+ требуется для IDE-разработки; CI использует JDK/Gradle/SDK напрямую.
- npm Capacitor пакеты закреплены на одной версии 8.6.2; локальный plugin peerDependency разрешает только Capacitor 8.x.

## Проверка Java-плагина по исходникам

Сопоставлены исходники Capacitor Android 6.2.1 и 8.6.2:
- `Plugin.handleOnDestroy()` остаётся `protected void handleOnDestroy()`.
- `PluginCall.release(Bridge bridge)` сохраняет ту же сигнатуру.
- В `BeeDetectorPlugin` используются эти API без необходимости менять lifecycle override или добавлять ошибочный `release()` без аргументов.
- Gradle library module переведён на современный синтаксис `namespace =` и `compileSdk =`.

Это подтверждает совместимость использованных Java API на уровне исходных сигнатур, но не заменяет компиляцию и запуск на устройстве.

## Ограничения безопасности

- Не менять `main` и PR #1.
- Не выполнять merge.
- Не удалять и не перезаписывать исходную ветку.
- Не добавлять платные API и облачную обработку видео.
- Не добавлять фиктивные результаты распознавания без лицензированной модели.
- Не считать успешную компиляцию подтверждением runtime-совместимости.
- Для каждого нового APK/AAB сохранять обязательную проверку ELF PT_LOAD и ZIP alignment 16 KB; текущая debug APK проверка пройдена.

## Выполнено в этой ветке

- Создана отдельная ветка от зафиксированного коммита PR #1.
- Обновлены `@capacitor/core`, `@capacitor/android`, `@capacitor/cli` до 8.6.2.
- Peer dependency локального плагина обновлена до `^8.0.0`.
- CI переведён на Node 22, JDK 21, Android API 36 / Build Tools 36.0.0.
- Android Gradle patcher обновлён до AGP 8.13.0 / Gradle 8.14.3 и покрыт регрессионным тестом.
- Добавлены проверки конфигурации SDK и закреплённых версий.

## Ворота миграции

1. **Зависимости:** выполнить чистую установку npm, сформировать и зафиксировать lockfile.
2. **Android scaffold:** сгенерировать чистый проект из закреплённого CLI; проверить API 24/36/36, Gradle и манифест.
3. **BeeDetector:** успешно скомпилировать Java plugin против Capacitor 8.6.2.
4. **LiteRT:** проверить AAR manifest minSdk и все `.so` на ELF LOAD alignment 16 KB; проверить zip alignment конечного APK/AAB.
5. **Регрессия:** полный `npm test`, Android debug build, установка APK; проверить статус плагина и корректное unavailable-поведение без модели.
6. **Устройства:** Android 10 (API 29), Android 15 (API 35), Android 16 (API 36); проверить запуск, поворот/resize, клавиатуру, системные панели, фон/возврат.
7. **Релизный контроль:** собрать AAB, проверить манифест/подпись/16-КБ совместимость; не публиковать и не сливать автоматически.

## Открытые проверки

- **ELF 16-КБ alignment LiteRT 2.3.2 проверен на собранном APK** в CI: libLiteRt.so и liblitert_jni.so для arm64-v8a, armeabi-v7a и x86_64; все PT_LOAD alignment >= 16 KB. Проверка zipalign -c -P 16 также прошла. Run: https://github.com/250oisr-eng/Pasekaapp/actions/runs/43563538377 ; artifact ID 14101516480.
- Runtime-поведение на Android 10/15/16: добавлен CI emulator smoke test (API 29/35/36), результат ожидается после запуска workflow.
- Визуальная проверка edge-to-edge и системных inset на реальных устройствах.
- Воспроизводимость npm зависимостей: lockfile ещё не создан.
- Emulator smoke test проверяет установку, запуск процесса и отсутствие fatal crash в logcat; это не заменяет UI-тестирование и проверку физического устройства.

## Первичные источники

- Capacitor Android target SDK matrix: https://capacitorjs.com/docs/android/setting-target-sdk
- Capacitor 8 migration guide: https://capacitorjs.com/docs/updating/8-0
- Capacitor 8.6.2 release: https://github.com/ionic-team/capacitor/releases
- Capacitor 8.6.2 CLI engine requirement: https://github.com/ionic-team/capacitor/blob/8.6.2/cli/package.json
- Capacitor 8.6.2 Android Gradle module: https://github.com/ionic-team/capacitor/blob/8.6.2/android/capacitor/build.gradle
- Android 16-KB page sizes: https://developer.android.com/guide/practices/page-sizes
