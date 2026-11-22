# A09 — аудит разрешений и отсутствия доказательств сетевого обмена (2026-11-22)

## Установленные факты
- A08 synthetic process-kill физически PASS (пользовательский отчёт), но его поле `A09_NETWORK_PERMISSION_DEVICE_AUDIT` остаётся в `scenariosNotTested`.
- В GitHub Actions workflow `.github/workflows/android-a08-process-kill-apk.yml` уже проверяет packageId и отсутствие `INTERNET`, `CAMERA`, media/storage permissions в APK через Android `aapt`. Это **build-time проверка артефакта**, не независимое чтение разрешений установленного пакета на физическом телефоне.
- Наличие или отсутствие разрешения `INTERNET` не доказывает отсутствие всех внешних передач: возможны системные share/clipboard-получатели, IPC и изменение правил Android. Пустой список запросов без наблюдения — **NOT_TESTED**, а не 0.

## Доказательная матрица
| Проверяемое свойство | Требуемый источник | Текущий статус |
|---|---|---|
| Подпись packageId в собранном APK | `aapt dump badging` конкретного SHA APK | CI_PASS |
| Запрещённые разрешения в собранном APK | `aapt dump permissions` конкретного APK | CI_PASS |
| Тот же идентификатор действительно установлен на устройстве | Android PackageManager из физического diagnostic A09 | PHYSICAL_PASS (только archivea09v1) |
| Запрошенные и выданные разрешения установленного package | Android PackageManager на телефоне, полный список | PHYSICAL_PASS (только archivea09v1) |
| Реальные сетевые подключения процесса | Отдельное наблюдение трафика/UID на физическом Android | NOT_TESTED |
| Отсутствие действий пользователя с чужими медиа/видео | Отдельная проверка scope/источников без обращения к архиву | NOT_TESTED |

## Следующая реализация
Разработать отдельный offline-only диагностический APK с уникальным `applicationId` и штатным UX **«Провести тест» → «Копировать результат»**; через собственный native Android PackageManager считать **только** установленный packageId, uid, `requestedPermissions` и фактические grant flags, не запрашивая новые разрешения. Отчёт должен разделять `packagePermissionAudit` и `networkTrafficObserved`; пока трафик не измерен, указывать `NOT_TESTED`. Не обращаться к видео, архивам, файлам пользователя, другим пакетам и не удалять ничего. Никогда не интерпретировать разрешения как успешное восстановление или право очистки.

Критерии PASS для ограниченного `A09_INSTALLED_PERMISSION_AUDIT_ONLY`: Native PackageManager сообщает **свой** package ID, совпадающий с ожидаемым; запрошенных/выданных `INTERNET`, `CAMERA`, чтения/записи внешних и media permissions нет. Это не общий A09 PASS и не подтверждение сетевого трафика. При недостатке информации, API error или обнаружении опасного разрешения — BLOCKED с явными причинами. Реальный трафик оставить отдельным доказательством.

## Непреодолимые запреты
Любое удаление пользовательских видео, реальный restore, доступ к личному архиву, производство APK для основного приложения и merge запрещены без отдельного разрешения. Android force-stop отдельно не проверен и не должен маскироваться A08 synthetic PASS.


## Реализация тестового APK — 2026-11-22

- Сборка `ru.paseka.journal.diagnostic.archivea09v1` из `diagnostics/archive-a09/` и собственного Java plugin выполнена. Native PackageManager проверяет **собственный** package ID и UID процесса, список запрошенных и grant-состояние установленных permissions. Полученные значения включены в отчёт; запрещённое разрешение блокирует тест даже если оно не выдано.
- Кодовый SHA `a00fbbe9b07a75b90a559a810597742bff0f0ff7`; [isolated CI #45026210096](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45026210096) **success**, [generic CI #45026210074](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45026210074) **success**, в первом запуске #45026010944 была ошибка пути в скрипте проверки, исправлена. Артефакт `14756160132`, ZIP SHA-256 `05748c8b692a4314c5eec79e5d3a460f1606c5039709452d36446435afe46d8b`, APK SHA-256 `15a1454efa57dc0bc125b3b10436aacc778668dd95cb4c72f582dbd371526280`.
- Важно: `A09_INSTALLED_PERMISSION_AUDIT_ONLY` может получить PASS **только после запуска на телефоне**. Получен пользовательский отчёт с физического телефона: device installed-permission audit — **PASS** в рамках отдельного diagnostic APK. Трафик сети `networkTrafficObserved:NOT_TESTED` и после этого теста, поскольку мониторинг пакетов или соединений отдельно не проводился.



## Физическое подтверждение A09 от пользователя — 2026-11-22

- `PASS / A09_INSTALLED_PERMISSION_AUDIT_ONLY`; `installedPackageVerified:true`; `packagePermissionAudit:PASS`; `forbiddenPermissions:[]`; пакет `ru.paseka.journal.diagnostic.archivea09v1`.
- Полный список содержит только `ru.paseka.journal.diagnostic.archivea09v1.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, `granted:true`, `requestedGrantedFlag:true`. Интернет, камера, микрофон, медиа и внешнее хранилище среди заявленных прав **не указаны**. Этот результат не распространяется на production package `ru.paseka.journal`.
- `networkTrafficObserved:NOT_TESTED` — не изменять; `networkRequests:NOT_ATTEMPTED` не является измерением отсутствия соединений. Отдельный этап мониторинга трафика остаётся непроведённым.
- `cleanupAuthorized:false`, `restoreAuthorized:false`, `archiveSafe:false`. Реальные архивы и удаление не разрешены.
