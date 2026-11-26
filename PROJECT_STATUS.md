# PROJECT_STATUS — Пасека 2.0

**26.11.2026.** Последний отмеченный в ветке live main: `346b35035861257be45dae93ee0573cbd4de9082`; сверять с актуальным GitHub. Правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). История — [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## B09 — физическая диагностика OnePlus, Draft #537 (26.11.2026)

- **Новое решающее доказательство:** получен `ONEPLUS-DIAGNOSTIC-SIGNER-RESULT(2).json`: `BLOCKED/DIAGNOSTIC_SIGNER_MISMATCH`; `installedDiagnosticPresent=true`; `candidateSourceSha=1e48dac72e7060317bedb48986bd338603511f93`; `installationAuthorized=false`; `productionPackageTouched=false`; `noInstallNoOverwriteNoDelete=true`; `syntheticDataPreserved=true`. Сертификат установленного `ru.paseka.journal.disasterproof2` **не совпадает** с сертификатом кандидата. **Обновлять этот пакет нельзя.** Отчёт не раскрывает отпечатки; это не доказательство общего происхождения данных и не проверка реальной пасеки.
- Прежние отчёты: четыре попытки WebView/force-stop закончились недоказанным restart Blob; signer preflight `ENOENT`, затем `CANDIDATE_BADGING` были диагностическими ошибками. После исправления временной копии APK и классификации `aapt` итоговый signer-результат **доказал несовпадение**. Не повторять циклы signer-тестов без нового сохраняемого ключа/независимой цели.
- [Draft #537](https://github.com/250oisr-eng/Pasekaapp/pull/537), code HEAD `1e48dac72e7060317bedb48986bd338603511f93`: exact-SHA GitHub Governance #45777923044, Android #45777922977, специализированный #45777922988 — **SUCCESS**. Это CI/эмулятор, **не** физическое восстановление на OnePlus.
- **B09 BLOCKED / SIGNER_MISMATCH_CONFIRMED:** сохранить установленный тестовый APK и синтетическую IndexedDB; install/update/uninstall/clear запрещены; новую диагностическую версию под этим packageId не ставить. Owner Windows ZIP изменён: из выдачи исключены install и force-stop/relaunch CMD и исполняющий их runner; signer использует отдельные pure read-only guards, добавлены тесты запрета опасных файлов. CI проверить на финальном SHA. Допустимое независимое продолжение — только проектирование локального read-only исследования установленного пакета или отдельный новый appId на новой пустой тестовой базе без утверждения восстановления старой. Ни один вариант не даёт разрешения удалять видео.

## P0: оригиналы и резервное копирование

- **B01 BLOCKED:** нет независимого полного внешнего архива `paseka-v1` + Gallery/MediaStore/оригинальных файлов и восстановления на пустой независимой цели. [#472](https://github.com/250oisr-eng/Pasekaapp/pull/472), [#501](https://github.com/250oisr-eng/Pasekaapp/pull/501), [#506](https://github.com/250oisr-eng/Pasekaapp/pull/506), [#507](https://github.com/250oisr-eng/Pasekaapp/pull/507) — кодовые проверки структуры/SHA/ограниченного чтения, **не** физическое доказательство полного восстановления. Старый TAR не считать валидным архивом.
- **B04/B05 BLOCKED:** установленный production signer OnePlus и постоянный keystore не подтверждены. Read-only инструмент #500 есть в main; **Draft #469** частично не перенесён. Ни прямых обновлений, ни замены производственного APK.
- **B06/B10 FROZEN #442:** отсутствуют лицензированные веса, полный реальный видеоконвейер и доказательство всех копий. Удаление оригиналов запрещено. [Draft #512](https://github.com/250oisr-eng/Pasekaapp/pull/512) закрывает обходы delete в рабочей ветке, но не в установленном приложении. Не считать флаги очереди разрешением удаления.

## P1/P2 и интеграция

- [Draft #511](https://github.com/250oisr-eng/Pasekaapp/pull/511) read-only курсор метаданных Blob; реальное снижение RAM NOT_MEASURED. [Draft #509/#510](https://github.com/250oisr-eng/Pasekaapp/pull/510) селективные оптимизации не merged. P2 asset-selection #426 не имеет доказанной выгоды: 19 JS используются.
- OP01–14 и OP13/CAS многосекционного профиля остаются **NOT_VERIFIED**; не активировать без полной физической модели и подтверждения пользователя. Не смешивать с Farrar. Старые P1 stacked Draft не сливать пакетом.
- Избирательно интегрированные в main #500–#507 не означают release. [Draft #452](https://github.com/250oisr-eng/Pasekaapp/pull/452) и [Draft #479](https://github.com/250oisr-eng/Pasekaapp/pull/479) требуют отдельной сверки перед переносом.

## Следующий безопасный шаг

1. **B09:** не продолжать обновление установленного диагностического APK — signer mismatch доказан; сохранять test-only пакет и старую IndexedDB без изменения. Для новой версии — отдельный независимый appId или доказанный исходный ключ с безопасным планом, без удаления старого.
2. **B01:** внешний полный архив с проверкой оригиналов и независимым восстановлением на пустой цели; личные записи/видео не загружать в GitHub и CI.
3. Независимо продолжить source-bound P1/P2 review, не сливая PR и не активируя незавершённый физический профиль.

**NO_MERGE / NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.**
