# PROJECT_STATUS — Пасека 2.0

**25.11.2026, P0 B01 read-only tests.** Проверенный main `0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`; действуют [AGENTS.md](AGENTS.md), [docs/PROJECT-CONTROL.md](docs/PROJECT-CONTROL.md), F0–F7. Здесь только отдельная рабочая ветка; main не изменён.

## Факты и незавершённое
- #471–#477 MERGED, защищённый read-only архив и guards IndexedDB в main, без release. [Draft #469](https://github.com/250oisr-eng/Pasekaapp/pull/469) signer/startup и [Draft #452](https://github.com/250oisr-eng/Pasekaapp/pull/452) full restore остаются несоединёнными.
- [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478) B11 SW v318; [Draft #482](https://github.com/250oisr-eng/Pasekaapp/pull/482) B08 Cloudflare bounded body; [Draft #483](https://github.com/250oisr-eng/Pasekaapp/pull/483) B09 malformed IDB/abort; [Draft #484](https://github.com/250oisr-eng/Pasekaapp/pull/484) B08 legacy inventory reverse diagnostic — независимые ветки, NOT_IN_MAIN.
- **Этот P0/B01 этап:** добавлено 5 source-backed тестов для `js/disaster-archive.js/getRecords()` в `tests/disaster-archive-read-abort.test.mjs` (отказы readonly транзакции, pending vs committed, отсутствие store); [контракт](docs/P0-B01-ARCHIVE-READ-TRANSACTION-ABORT-2026-11-25.md). Последний тестовый SHA `c5f769b750f5f72712456f7a8aa719cf417671f1`; exact SHA CI проверить. Не менялись runtime, schema, phone или user data.

## Непреодолённые блокеры и следующий шаг
- B01 независимый внешний оригинальный архив и restore НЕ ДОКАЗАНЫ. P0 B04/B05 OnePlus installed signer/key неизвестны; P0 B06/B10 лицензированные веса/реальный видеопоток и автоудаление оригиналов **FROZEN #442**; B11 реальное Android upgrade и P2 device performance NOT_VERIFIED.
- Следующее: собрать точный Node/Android/Governance CI, устранить реальные регрессии и обновить Draft PR; затем перейти к иной независимой P1-задаче. Запрещены merge, Pages/Cloudflare deploy, Android installation, production IndexedDB writes, live restore и удаление оригиналов/архивов без отдельного разрешения.

- **B01 проверено после исправления теста:** test HEAD `7138509314067c6099230000665a31be1e7378fc`, [Android #45501280912](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45501280912) completed/SUCCESS, [Governance #45501280889](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45501280889) completed/SUCCESS. Ранний Android #45501143258 FAILURE — тест ошибочно ожидал Promise.reject вместо синхронного throw отсутствующего store; `assert.throws` проверен, production неизменен. Draft #485 NOT_IN_MAIN, B01 real backup/restore BLOCKED.
