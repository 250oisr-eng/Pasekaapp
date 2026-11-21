# Proof325 — физическая проверка двух MP4 в отдельном Android WebView

Дата: 2026-11-21. Draft PR #326 поверх #325. Статус: **реальное устройство NOT TESTED**.

## Предмет проверки

Проверяется работоспособность **нового самостоятельного APK** `ru.paseka.journal.archive.proof325`, который не заменяет `ru.paseka.journal` и `ru.paseka.journal.archive.test`. В новой приватной IndexedDB `paseka_two_mp4_proof_325_v1` записываются только два искусственных источника. Перед любыми записями два независимых, зафиксированных SHA-256 сверяются с исходными байтами.

- Black 16×16 MP4: `794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f`.
- White 16×16 MP4: `bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff`.

Обе фикстуры — синтетические MPEG-4 Part 2; даже их успешное чтение не подтверждает качество/кодеки реальной съёмки летка. Они не содержат пользовательских данных.

## Этапы внутри приложения

1. Новый APK сверяет исходные bytes/hash **до** открытия IndexedDB. Несовпадение: `BLOCKED`, запись запрещена.
2. Открывает отдельную IDB. Только при отсутствии state, marker и видео записывает 2 Blob. При существующих непроверенных данных — `BLOCKED`, без перезаписи.
3. Закрывает IDB и открывает снова, сверяет Blob SHA и метаданные.
4. Использует настоящий `PasekaArchive.exportArchiveFromDatabase`; в памяти проверяет PASEKA01 manifest, chunk SHA и восстановительный preflight, **без записи файла в Downloads и без restore commit**.
5. После первого запуска выдаёт `INITIAL_PASS`, после остановки только этого приложения и нового запуска — `RELAUNCH_PASS`. Снимки с результатами добавляются в приватный `files/paseka-two-mp4-proof.ndjson`, без удаления предыдущих строк.
6. Только тестовый `tools/android-two-mp4-proof-device.ps1` сможет прочитать результат через `adb shell run-as`. При любом расхождении — `BLOCKED`, без стирания базы/архива.

## Безопасность

- APK создаётся только GitHub Actions, с отдельным package ID; тестовая HTML-страница подменяет штатную **только в runner**, production HTML не меняется.
- Для proof APK **исключён** bridge MediaStore Downloads — он не нужен и ранее вызывал конфликт двух onCreate.
- Нет программного распознавания, удаления видео, `pm clear`, `adb uninstall`, модификации Camera/Gallery/Downloads, смены схемы production IndexedDB, merge или deployment.
- Перед физическим запуском требуется успешная отдельная сборка proof APK и ZIP SHA-256; скрипт требует **проверенный архив артефакта**, ровно один NE2213/API36 по USB и доказанное отсутствие этого нового пакета на телефоне.
- Внешний PASEKA01-файл и реальный экспорт в Downloads **не тестируются** здесь. `recognitionSucceeded=false`; `cleanupAuthorized=false`.

## Контрольные проверки на момент фиксации

- Существующий общий тест PR #325: SHA `1be1200218ad46ac048288a925993bbc650f2159`, 1220/1220, Android Debug success — **исторический**, не замена CI proof325.
- Новый скрипт `tests/test_android_two_mp4_proof_mock.sh` + workflow `test-android-two-mp4-proof-device.yml`: [run #44935389806](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44935389806) **completed/success**. Проверены PowerShell parser, три отказа (несколько USB устройств, установленный пакет, отсутствие ZIP), отсутствие `adb install` и остановки устройства при отказе.
- Первые proof CI: [#44934877821](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44934877821) failure из-за YAML; [#44934957295](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44934957295) failure из-за дублирующего onCreate; последующие run при push отменялись конкурирующими веточными запусками. Ошибки исправлены без изменения production.
- Последний код/CI ref для проверки: `a4637a443419c0783672683d83c0809410ee33c6`; статус proof APK workflow пока **не подтверждён как SUCCESS**. Не передавать APK на физический телефон до получения полного результата и SHA ZIP.

## Следующее действие

Дождаться и проверить точный proof APK CI, артефакт и SHA ZIP; после этого подготовить пользователю один закреплённый Windows запуск с локально скачанным ZIP и командой из pinned commit. От пользователя требовать действий только после проверки сборки. Отдельно позднее тестировать сохранение PASEKA01 в Downloads, реальное восстановление и кодек телефона; ни один PASS этого теста не даёт права удалять исходные видео.
