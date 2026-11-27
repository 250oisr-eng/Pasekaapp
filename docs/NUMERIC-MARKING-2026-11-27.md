# Цифровая маркировка — 27.11.2026

F0: main 6526fe6d7041ef5c52f6115e1c29f1306ca9ab1b, текущая система docs/Система-маркировки-пасеки.md: 30-символьный алфавит и legacy YY-N семей. #601 Draft сверки; #641 SW, #644 локальный voice QA отдельны. В main отдельного QR модуля не найдено; старые ветки не удаляются.

F1: пользователь полностью утвердил 3, А/Б/В, С-12, К-24, Р-137, М-18, независимые постоянные номера; QR пока не выводить, сохранить возможность. Позиция отдельно, сторона обслуживания фиксируется физически; зимние позиции не подменять летними. Не менять конструкцию или активировать профиль. Обязательное: уникальность, no reuse, сохранение истории. Цвет/размер/гравировка — ориентиры, не технологические размеры. Физическая маркировка после проверки.

F2 LIMITED_SAFE_DRAFT: локальный код без внешних ресурсов, старые данные сохранены. B01/B04/B05 остаются; actual restore и downgrade до старого reader новых числовых кодов не доказаны, production release запрещён. QR reserve — только стабильный payload, без UI/камеры/сети/кодировщика; исторический QR work при наличии не удалять. Voice QA #644 должен использовать новый parser и реальные family code, не считать совместимость доказанной.

F3: существующие frameUid, corpusId, familyId, queenId сохраняются. Новые labelCode frame/body — decimal 1..999999, legacy 3-character labels в тех же полях и резерве; старый чисто цифровой legacy код занимает тот же номер. Independent monotone nextNumericLabelNumber и used*LabelCodes, проверка исчерпания/повреждения. Новая семья С-N в name, nextFamilyNumber сохраняется при удалении, год отдельно. Матка М-N при регистрации без старого кода; явный legacy code сохраняется, у нового стандарта редактирование номера запрещено. Улей existing nextHiveNumber. Позиция секции отображается по действующей физической модели, winter не переименовывается в боковую секцию. Нет переписывания присвоенных кодов, миграции IndexedDB stores/schemaVersion, не создавать реальную сущность автоматически. Опциональные поля meta входят в existing JSON state; старое ПО может не понимать новые номера, поэтому безопасный возврат требует совместимого reader или pre-change copy с сохранением новых записей отдельно.

F4: first vertical equipment/family registration + numeric reconciliation, label display, queen registry default, section label helper, QR payload reserve. Оставшиеся: whole-dialog #644 voice routing, explicit physical label printing only if required, sectional split/merge assignment and legacy queen card paths require integration review; no physical operation bypass. Main unchanged. SW v327, concurrent #641 must rebase monotonic version.

F5: новые доменные тесты, сохранены legacy fixtures, pure smoke (JS module compilation and sample numeric/legacy lookup). Full CI, Android, Chromium, actual device/restore NOT_TESTED until evidence.

F6/F7: Draft only, merge/release separate permissions; no production install.

## Второй проход F4

Первый exact SHA 3fb5d7d1a3a6cf0a06e99d05d17a3cac2b47816b: Fast 1093/1093, Governance PASS. Уточнены uppercase физические mode, запрещены неоднозначные numeric aliases, смешанные полные legacy/numeric labels, глобальная проверка числовых семей/маток и counters, immutable family code при назначении корпуса, immutable queen code из старой формы. Split/merge assigns separate new С-N inside existing transaction preserving supplied descriptive name/code in registrationName/registrationCode; confirmed new queen gets М-N when no previous marking. Existing OP validators/gates remain. Numeric queen manually supplied only if not historically used/reserved, old external nonnumeric remains as legacy. No invented queen from optional family metadata. Repeat full CI on exact new SHA, B07 remains blocked. #644 dialogue integration still pending. QR no UI.

## Точный поиск по постоянной маркировке

Second exact SHA 2160fabf3210b08faaca7bac8bd5d4c87d8e090c: 1099/1099 Fast, Governance PASS. Read-only lookup for explicit typed prefixes/whole-number speech (`Р-137`, `рамка 137`, `где рамка сто тридцать семь`), exact identity, including storage/retired, family/queen/hive/body. No substring selection, no AI forwarding, no automatic physical changes. Global search explicit marking displays location from local state; ordinary broad search remains as before. Voice QA #644 integration remains separate (its native dialogue bypasses browser handler). New queen UI read-only automatic number, legacy retained. Final CI required.

Exact marking lookup retains clickable navigation through a live re-resolution, not stale array index. Frame navigation opens the complete registry with exact canonical-code filtering; queen navigation focuses current/historical registry entry. Family physical address uses actual assigned box/section, not cached `family.box`. Duplicate/removed records block navigation. The preceding 2160fabf passed all six CI runs; exact final rerun required.

## Regression gate

Intermediate 2f2c05c5: Node PASS; both Chromium E2E failed (#46064900228/#46064894361) on family search missing existing `data-kind=family`/permanent `data-id` navigation contract. Restored semantic kind and stable ID, separate marking code and live identity revalidation before opening. Added markup and stale-ID regression tests; original E2E remains unchanged. Exact latest CI reported in #651. No production changes.
