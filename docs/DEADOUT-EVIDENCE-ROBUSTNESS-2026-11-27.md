# Гибель семьи: не терять фото и не выдумывать номер улья

**F0–F2:** существующий отчёт о погибшей семье — наблюдательный чек-лист без автоматического диагноза. Обнаружен дефект: переданный повреждённый список фотографий silently превращался в пустой, а отсутствие номера улья превращалось в 0 или NaN; инспектор мог выбрасывать TypeError при повреждённом реестре `hives`.

**F3/F4:** только `js/deadout-review.js` и `tests/deadout-review.test.mjs`; явная ошибка при некорректном типе медиа, `null` при отсутствии номера (не «№0»), обработка сломанного массива `hives` через код целостности без изменения состояния. Сохранены допустимые старые записи, дата, фото, чек-лист и статус `diagnosis:null`. Не добавлять прогноз причин.

**F5–F7:** Node/Android/Governance на exact SHA и независимые negative tests; физический OnePlus **NOT_TESTED**. IndexedDB, миграции, архивы, реальные файлы и рабочий APK не меняются. Merge, публикация и реальное восстановление не разрешены.
## F5 — фактические CI и ограничения

**Кодовый SHA:** `4dea77442de532f1647f9bb30b5f77ec5b76d411`, полный Node `1075/1075` PASS (0 FAIL) в [Fast #46048069639](https://github.com/250oisr-eng/Pasekaapp/actions/runs/46048069639). Docs-only HEAD `e10d6289abf13c39129366672e50b26c73803bfa` прошёл Android [#46048135372](https://github.com/250oisr-eng/Pasekaapp/actions/runs/46048135372) и Governance [#46048135348](https://github.com/250oisr-eng/Pasekaapp/actions/runs/46048135348). Отдельные отрицательные кейсы включены в полный Node прогон. Не подтверждены реальное устройство, production сохранность и release; эти статусы не подменять CI.

F6: small main-based Draft #635, без схематических миграций/видеопотока. F7: не разрешено, требуется отдельное явное решение владельца.

## 28.11 — F0–F5: форма и история наблюдения

Снимки семьи и улья на дату обнаружения, совместимость старых записей без снимков, безопасное добавление фото и просмотр всех сохранённых полей. Chromium 412/1280: синтетическая семья, фото, ошибочная замена, сохранение при отключённой сети, повторная загрузка с доступным localhost; снимки и фото равны исходному сохранению, семья и инвентарь не меняются. Android/камера/автономный запуск NOT_TESTED.


## 28.11 — current main reconciliation
Base `00b82f0457c3c5a5da5e4edeba27f886e3dd13a8`; original deadout code/test changes applied without overwriting merged incident and numeric-marking code. Offline shell v331; current/future/user cache protection retained. Exact-head CI pending; no physical proof or release.
