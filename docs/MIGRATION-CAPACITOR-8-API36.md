# План миграции Paseka на Capacitor 8 / Android API 36

Статус: подготовительная ветка; изменения не предназначены для слияния до прохождения всех ворот CI и проверки на устройствах.

## Исходная точка

- Базовый commit: 4992bc070115fb122da74cf555c88040289e2843
- Исходная ветка: feature/entrance-video-retention-guard-2026-11-13
- Capacitor: 6.2.1
- Android: minSdk 24, compileSdk 35, targetSdk 35
- Custom plugin: @paseka/capacitor-bee-detector (Java)
- Runtime: standalone LiteRT 2.3.2
- CI: Node 20, JDK 17; Android scaffold создаётся командой cap add android

## Целевая линия

- Последняя стабильная линия, выбранная для проверки: Capacitor 8.6.2 (не использовать 9.0.0 RC как production baseline).
- Android target/compile API: 36; minSdk: 24.
- Node.js: 22+.
- Android toolchain, версии AGP/Gradle/JDK должны быть закреплены после сверки с шаблоном тега 8.6.2 и официальной документацией.
- Пакеты Capacitor должны быть согласованы по major/minor/patch и зафиксированы точными версиями.

## Ограничения безопасности

- Не менять main и PR #1.
- Не выполнять merge.
- Не удалять и не перезаписывать исходную ветку.
- Не добавлять платные API и облачную обработку видео.
- Не включать реальные выводы о распознавании пчёл без лицензированной модели и проверенных тестовых данных.
- Не считать успешную компиляцию подтверждением runtime-совместимости.
- Не считать LiteRT 2.3.2 совместимым с 16-КБ страницами без проверки всех ELF-библиотек в конечном APK/AAB.

## Ворота миграции

1. **Версии и окружение:** проверить Capacitor 8.6.2 по официальному тегу; закрепить Node, JDK, AGP, Gradle, SDK.
2. **Зависимости:** обновить @capacitor/core, @capacitor/android, @capacitor/cli и peerDependency локального плагина согласованно; сформировать package-lock.json.
3. **Android scaffold:** генерировать чистый проект из закреплённого CLI; проверить API 24/36/36, манифест и configChanges.
4. **BeeDetector:** проверить Java API и lifecycle по исходникам 6.2.1 и 8.6.2; проверить Gradle library module.
5. **LiteRT:** проверить AAR manifest minSdk и все .so на ELF LOAD alignment 16 KB; отдельно проверить zip alignment конечного APK/AAB.
6. **Регрессия:** полный npm test, Android debug build, APK install; проверить plugin status и безопасное поведение при отсутствии модели.
7. **Устройства:** Android 10 (API 29), Android 15 (API 35), Android 16 (API 36); проверить запуск, поворот/resize, клавиатуру, системные панели, фон/возврат.
8. **Релизный контроль:** собрать AAB, проверить подпись/manifest/16-KB, не публиковать и не сливать автоматически.

## Открытые вопросы

- Точные toolchain версии для Capacitor 8.6.2 и JDK.
- Совместимость API локального Java-плагина.
- Фактический minSdk и 16-КБ ELF alignment LiteRT 2.3.2.
- Поведенческая совместимость UI с edge-to-edge на API 35/36.
