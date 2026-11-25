# B04 — поиск установленной Java для read-only APK signer audit (25.11.2026)

## F0–F2
Реальная диагностика OnePlus V3.2 вернула `APKSIGNER_OR_JAVA_NOT_FOUND`. В `main` `scripts/check-oneplus-upgrade.mjs --installed-only` ищет `java` через PATH, даже когда Android Studio включает локальную JBR. Без физического отчёта нельзя заключить, что сертификат установленного APK проверен.

F2 = LIMITED_SAFE_DRAFT. Используются только пути к уже установленным бинарникам; нет установки/скачивания Java, вызова signing keystore, генерации сертификатов, APK install/uninstall, изменения телефона, пользовательских файлов или production.

## F3–F5
- Windows: порядок существующих Java: `JAVA_HOME`, `STUDIO_JDK`, `ANDROID_STUDIO_JDK`, JBR/JRE под `ProgramFiles/Android/Android Studio`, JBR под `LOCALAPPDATA/Programs/Android Studio`, затем штатная `java` в PATH.
- В Android SDK выбирается реально присутствующий `lib/apksigner.jar` из установленных build-tools, а не необоснованное предположение о последней версии.
- Если binary отсутствует или проверка сертификата не выдаёт единственный SHA-256 64 hex — прежняя fail-closed блокировка остаётся.
- Синтетические тесты проверяют найденную JBR и fallback; никакой реальной подписи или проверки установленного APK в CI не происходит.
- `--installed-only` по-прежнему только ADB read-only: устройства/метаданные/pull во временный каталог, а не установка.

## F6–F7
B04/B05 не снимаются автоматически. Действительное чтение signer OnePlus — физическая проверка на ПК с авторизованным ADB и установленным SDK, потребуется отдельное уведомление пользователю. До B01 full recovery и rollback обновление приложения запрещено. Draft не сливать или публиковать без отдельного разрешения.
