# Цифровая маркировка — 27.11.2026

F0: main 6526fe6d7041ef5c52f6115e1c29f1306ca9ab1b, текущая система docs/Система-маркировки-пасеки.md: 30-символьный алфавит и legacy YY-N семей. #601 Draft сверки; #641 SW, #644 локальный voice QA отдельны. В main отдельного QR модуля не найдено; старые ветки не удаляются.

F1: пользователь полностью утвердил 3, А/Б/В, С-12, К-24, Р-137, М-18, независимые постоянные номера; QR пока не выводить, сохранить возможность. Позиция отдельно, сторона обслуживания фиксируется физически; зимние позиции не подменять летними. Не менять конструкцию или активировать профиль. Обязательное: уникальность, no reuse, сохранение истории. Цвет/размер/гравировка — ориентиры, не технологические размеры. Физическая маркировка после проверки.

F2 LIMITED_SAFE_DRAFT: локальный код без внешних ресурсов, старые данные сохранены. B01/B04/B05 остаются; actual restore и downgrade до старого reader новых числовых кодов не доказаны, production release запрещён. QR reserve — только стабильный payload, без UI/камеры/сети/кодировщика; исторический QR work при наличии не удалять. Voice QA #644 должен использовать новый parser и реальные family code, не считать совместимость доказанной.

F3: существующие frameUid, corpusId, familyId, queenId сохраняются. Новые labelCode frame/body — decimal 1..999999, legacy 3-character labels в тех же полях и резерве; старый чисто цифровой legacy код занимает тот же номер. Independent monotone nextNumericLabelNumber и used*LabelCodes, проверка исчерпания/повреждения. Новая семья С-N в name, nextFamilyNumber сохраняется при удалении, год отдельно. Матка М-N при регистрации без старого кода; явный legacy code сохраняется, у нового стандарта редактирование номера запрещено. Улей existing nextHiveNumber. Позиция секции отображается по действующей физической модели, winter не переименовывается в боковую секцию. Нет переписывания присвоенных кодов, миграции IndexedDB stores/schemaVersion, не создавать реальную сущность автоматически. Опциональные поля meta входят в existing JSON state; старое ПО может не понимать новые номера, поэтому безопасный возврат требует совместимого reader или pre-change copy с сохранением новых записей отдельно.

F4: first vertical equipment/family registration + numeric reconciliation, label display, queen registry default, section label helper, QR payload reserve. Оставшиеся: whole-dialog #644 voice routing, explicit physical label printing only if required, sectional split/merge assignment and legacy queen card paths require integration review; no physical operation bypass. Main unchanged. SW v327, concurrent #641 must rebase monotonic version.

F5: новые доменные тесты, сохранены legacy fixtures, pure smoke (JS module compilation and sample numeric/legacy lookup). Full CI, Android, Chromium, actual device/restore NOT_TESTED until evidence.

F6/F7: Draft only, merge/release separate permissions; no production install.
