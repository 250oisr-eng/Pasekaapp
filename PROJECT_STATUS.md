# PROJECT_STATUS — Пасека 2.0

**25.11.2026.** Live `main=fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2` (проверено); открытая stacked цепочка Draft #524→#525→#526→#527→#528. Правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Подробная история и старые точные SHA/CI — [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md). Без разрешения: no merge / release / production mutation / Android install / video delete.

## Последний этап — реальный OnePlus, безопасная проверка каталогов

- Пользовательский обезличенный отчёт **25.11.2026 16:39 UTC**: `runtime=PASS`, `oneplus-usb-metadata=PASS`, `oneplus-private-db-gate=PASS`, `oneplus-idb-inventory=PASS / WEBVIEW_STORAGE_DIRECTORY_ENTRIES_PRESENT`. Уровень доказательства: **DIRECTORY_METADATA_ONLY_NOT_BACKUP**; файлы и значения IndexedDB не читались. **Повторять инвентаризацию не нужно.**
- `full-indexeddb-export=NEEDS_INPUT / FULL_EXPORT_NOT_FOUND`; `oneplus-downloads-export=NEEDS_INPUT / NO_FULL_EXPORT_FILENAME_IN_PHONE_DOWNLOADS`; `external-android-media=NEEDS_DEVICE_EVIDENCE`. `fullBackupVerified=false`, `androidDurableRestore=NOT_TESTED`, `originalVideosRestored=NOT_TESTED`, `originalFilesModified=false`, `deletion=NOT_ATTEMPTED`.
- **Draft #524**: локальная проверка существующего `paseka-idb-full-v1` экспорта с in-memory restore/reopen, SHA/stores/Blob, только синтетический CI. **Draft #525–#528**: единый Windows offline центр, USB/Download/identity/WebView metadata-only проверки. До последнего docs-коммита #528 прошли Windows 39/39 и Android 845/845; физическое восстановление не тестировалось. Стек не интегрирован в main.
- **CI docs HEAD `e1818e63bd322bfd9b9b923d9e7f060b683b47c1`**: Windows SUCCESS 39/39, Android FAILURE 844/845, Governance FAILURE: **единственная причина** — лимит длины этого статуса `<=6500` в `scripts/governance-check.mjs`. Код продукта не изменился. Этот коммит сокращает статус без ослабления governance; **новые CI ещё не проверены**.

## Подготовка физических испытаний — Check Hub #528

- Поверх существующего Windows one-click центра добавлены локальная SHA-256 проверка содержимого ZIP **до USB-доступа**, S0–S7 readiness-классификация с запретом ложного recovery/установки/удаления, два новых набора негативных тестов. [Карта](docs/ONEPLUS-PHYSICAL-READINESS-KIT-2026-11-25.md), один запуск `ПРОВЕРИТЬ-ПАСЕКУ.cmd`; нет доступа к реальным данным при CI. **Кодовый HEAD `2a901f2db3c67b81c04476e5cb3abce196ebb0d1`: Windows #45672045187 SUCCESS (48/48, проверен реальный CMD, ZIP и защита от подмены), Fast #45672028722 SUCCESS (854/854), Android #45672045116 и Governance #45672045472 SUCCESS.** После docs-only коммитов проверить отдельный governance.
- **Старые физические USB/run-as/каталожные проверки от 25.11.2026 уже зафиксированы, не повторять без нового основания.** Осталось найти реальный полный экспорт и доказать независимое восстановление всех источников; S3/S4 BLOCKED, S5 NOT_TESTED, S6 #442 FROZEN. Пользователю сейчас **0 действий**, APK не устанавливать.

## Интеграция и ограничения

- #506 и #507 **MERGED** в main: ограниченное чтение полного JSON, отдельная проверка обычного JSON старой версии. Обычный JSON не включает `entrance_media`. Тесты исходных commit SHAs зафиксированы в журнале; ни один не доказывает recovery рабочего OnePlus.
- **Draft #452** / Draft #479: большой исходный backup/restore stack и старый 1090-byte TAR не имеют полного device-proof; нельзя интегрировать целиком. **Draft #469**: signer/key custody до сих пор недоказаны. История дополнительных интеграций #500–#507 в журнале.
- **B01 P0 BLOCKED:** нет оригинального полного внешнего архива всех источников OnePlus и независимого Android restore на пустой цели, включая Gallery/MediaStore/видео. Raw LevelDB transplant эмулятора не повторять (V22: 1 match, 1 difference, 4 stat errors). B02/B09 физически не закрыты.
- **B04/B05 P0 BLOCKED:** installed signer fingerprint и long-lived закрытый ключ не доказаны; backup/rollback отсутствуют. APK update запрещён.
- **B06/B10 FROZEN #442:** нет всей цепи лицензия модели → реальное распознавание → видеоконвейер → проверенная запись → восстановление. **Удаление оригиналов запрещено.**
- **P1 B07/B11 NOT_VERIFIED:** многосекционный профиль OP01–14 и физическая модель OP13/CAS не включены; cold-offline на OnePlus не проверен. Farrar изолирован.

## Следующий безопасный шаг

1. Не перезапускать уже успешные USB/run-as/каталожные тесты. Если **в существующей установленной версии** доступен штатный полный экспорт IndexedDB — получить файл на устройстве без обновления/удаления, затем проверить офлайн инструментом Draft #524. Не загружать личные архивы в чат/CI. Если функции нет, B01 остаётся BLOCKED; дальнейший sandbox-read возможен только через отдельно проверенный безопасный путь с доказанным сохранением оригиналов.
2. Независимо ревьюировать и проверять P1 Draft; никакого merge без разрешения. Android/MediaStore/recovery и реальное распознавание нельзя заменять тестами на ПК.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.**
