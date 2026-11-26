# PROJECT_STATUS — Пасека 2.0

**26.11.2026.** Последний отмеченный в ветке live main: `346b35035861257be45dae93ee0573cbd4de9082`; сверять с актуальным GitHub. Правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). История — [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## Активный B09 · физический OnePlus, Draft #537

- Четыре отчёта 26.11: 06:39Z — `ONE_AUTHORIZED_PHYSICAL_USB_DEVICE_REQUIRED` (до install); 06:49Z — `ADB_COMMAND_FAILED` (стадия неизвестна); 07:02Z — `PROOF_TIMEOUT` на restart после первого тестового WebView PASS и force-stop; 07:14Z — `DEVICE_RESTART_PROOF_FAILED / UNCLASSIFIED_DEVICE_ERROR`, check `error`. **Синтетический Blob после перезапуска физически не подтверждён**; повреждение данных также не доказано.
- [Draft #537](https://github.com/250oisr-eng/Pasekaapp/pull/537) содержит только изолированную диагностику `ru.paseka.journal.disasterproof2`. Исправление на кодовом SHA `f37066a983e5584d21e6b8b815cd0352c4a06a7a`: фиксированные `diagnosticStage` и `diagnosticErrorType` в WebView и Windows verifier, негативные тесты утечки/неизвестных значений. Этот новый формат **отсутствует** в уже установленном старом APK.
- Предыдущий итоговый HEAD `df98581315dcc18896a2f1ef7cf702bb9dad5347`: Governance [#45774611816](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45774611816) FAILED из-за превышения предела 6500 символов в этом статусе; специализированный [#45774612116](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45774612116) FAILED с 838/839 тестами (тот же Governance guard). Исправляется **документ**, не отключается guard. Повторная проверка необходима на новом точном SHA.
- До проверки установленного debug signing, сохранения синтетического состояния и точного CI **не обновлять/очищать/переустанавливать** даже тестовый APK. Реальный архив/видео/основной package не затрагивались. B09 = BLOCKED.

## B09 · физический signer report ENOENT (26.11.2026)

- Получен `ONEPLUS-DIAGNOSTIC-SIGNER-RESULT.json`: `BLOCKED/ENOENT`, установка не разрешена, `productionPackageTouched=false`, `noInstallNoOverwriteNoDelete=true`. Отчёт **не содержит стадии** и не позволяет утверждать, что отсутствует Java, ADB, APK или файл; сравнение сертификатов NOT_VERIFIED.
- Исправление в Draft #537: signer preflight возвращает allowlisted `failedStage`, санитизирует `ENOENT`/пути/serial/stack и самостоятельно ищет уже установленную Java (JAVA_HOME, Android Studio JBR, PATH), не скачивая ничего; добавлены регрессии. **Без нового отчёта причину не классифицировать.** Не устанавливать, не очищать и не менять APK.

## B09 · read-only тест подписи APK

- В Draft #537 добавлен `inspect-diagnostic-signing.mjs` + `ПРОВЕРИТЬ-ПОДПИСЬ-БЕЗ-УСТАНОВКИ.cmd`, проверки несовпадающего сертификата/версии/пакета и ZIP packaging. Только локальный `adb -d pull` APK **тестового пакета**, без установки и доступа к его IndexedDB.
- Новая проверка на OnePlus **ещё не выполнялась**: установленный сертификат неизвестен. CI контролировать по точному SHA финальной ветки; кодовый этап не равен физическому PASS. Даже совпадающие сертификаты не разрешают автоматический upgrade: нет доказательства сохранения диагностических данных.
- Ранее установленный APK нельзя удалять/очищать или перезаписывать. Для owner возможна только read-only проверка при USB-доступе. Старые JSON остаются неизменными.

## P0: оригиналы и резервное копирование

- **B01 BLOCKED:** нет независимого полного внешнего архива `paseka-v1` + Gallery/MediaStore/оригинальных файлов и восстановления на пустой независимой цели. [#472](https://github.com/250oisr-eng/Pasekaapp/pull/472), [#501](https://github.com/250oisr-eng/Pasekaapp/pull/501), [#506](https://github.com/250oisr-eng/Pasekaapp/pull/506), [#507](https://github.com/250oisr-eng/Pasekaapp/pull/507) — кодовые проверки структуры/SHA/ограниченного чтения, **не** физическое доказательство полного восстановления. Старый TAR не считать валидным архивом.
- **B04/B05 BLOCKED:** установленный production signer OnePlus и постоянный keystore не подтверждены. Read-only инструмент #500 есть в main; **Draft #469** частично не перенесён. Ни прямых обновлений, ни замены производственного APK.
- **B06/B10 FROZEN #442:** отсутствуют лицензированные веса, полный реальный видеоконвейер и доказательство всех копий. Удаление оригиналов запрещено. [Draft #512](https://github.com/250oisr-eng/Pasekaapp/pull/512) закрывает обходы delete в рабочей ветке, но не в установленном приложении. Не считать флаги очереди разрешением удаления.

## P1/P2 и интеграция

- [Draft #511](https://github.com/250oisr-eng/Pasekaapp/pull/511) read-only курсор метаданных Blob; реальное снижение RAM NOT_MEASURED. [Draft #509/#510](https://github.com/250oisr-eng/Pasekaapp/pull/510) селективные оптимизации не merged. P2 asset-selection #426 не имеет доказанной выгоды: 19 JS используются.
- OP01–14 и OP13/CAS многосекционного профиля остаются **NOT_VERIFIED**; не активировать без полной физической модели и подтверждения пользователя. Не смешивать с Farrar. Старые P1 stacked Draft не сливать пакетом.
- Избирательно интегрированные в main #500–#507 не означают release. [Draft #452](https://github.com/250oisr-eng/Pasekaapp/pull/452) и [Draft #479](https://github.com/250oisr-eng/Pasekaapp/pull/479) требуют отдельной сверки перед переносом.

## Следующий безопасный шаг

1. На текущем SHA подтвердить Governance, полный Fast, Android и специализированную сборку. Нет PASS до результата.
2. Для B09 — только read-only сравнение installed signing/version и подготовка сохранения синтетической базы; до этих условий никакого диагностического APK upgrade, install/clear/uninstall.
3. Для B01 — локальный отдельный полный архив и независимое восстановление без загрузки личных данных в чат/CI. Продолжать независимые source-bound задачи.

**NO_MERGE / NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.**
