# PROJECT_STATUS — Пасека 2.0

**26.11.2026 · live `main=346b35035861257be45dae93ee0573cbd4de9082`.** Текущие факты важнее исторических дат. Правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL.md](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические результаты — в журнале.

## Десять независимых направлений — функциональный макроцикл 26.11

- **1. [#548](https://github.com/250oisr-eng/Pasekaapp/pull/548) CSV журнала — UPDATED + CI PASS:** Unicode formula guard, имя файла с ульем и уникальным временем; текущие фильтры, без медиа и записей архива. Код `06724122c6`; Fast #45853108564, Governance #45853116536, Android #45853107993/#45853116622 SUCCESS.
- **2. [#544](https://github.com/250oisr-eng/Pasekaapp/pull/544) планирование осмотров — REVIEW_READY:** последний сохранённый осмотр выбранного улья, не «сегодня» по умолчанию. Код `c1cc6d96`, итог `e71a0a23`: Fast #45838719607, Governance #45838774825, Android #45838719599/#45838775428 SUCCESS. Ручное подтверждение операций.
- **3. [#545](https://github.com/250oisr-eng/Pasekaapp/pull/545) коды оборудования — UPDATED + CI PASS:** сохранение кодов Р/К и поддержка тире `‐‑‒–—―−` в печатной маркировке; `ff409f4091`, Fast #45853500416, Governance #45853508067, Android #45853500511/#45853508069 SUCCESS.
- **4. [#546](https://github.com/250oisr-eng/Pasekaapp/pull/546) голосовая подкормка — UPDATED + CI PASS:** синтаксис «поле вид корма - сироп» без добавления дефиса к значению; `ad68a82513`, Fast #45853584018, Governance #45853591401, Android #45853584038/#45853591447 SUCCESS. Только черновик, не автозавершение.
- **5. [#547](https://github.com/250oisr-eng/Pasekaapp/pull/547) голосовые рамки — UPDATED + CI PASS:** «добавь рамку» / «запиши код рамки», без физических операций; `b832f538cc`, Fast #45853419127, Governance #45853429954, Android #45853419118/#45853430028 SUCCESS. Связанная интерпретация ведущей Р зависит от #545.
- **6. [#515](https://github.com/250oisr-eng/Pasekaapp/pull/515) PWA HTTP 204/206 — REVIEW_READY:** `6b8dc21eac`, Fast #45707232465, Governance #45707241525, Android #45707232358/#45707241543 SUCCESS. **Parent для #530**, требуется отдельное решение о слиянии.
- **7. [#530](https://github.com/250oisr-eng/Pasekaapp/pull/530) PWA redirect/range — UPDATED + CI PASS:** HTTP 200 Content-Range тоже запрещён для offline cache; `3d499324b4`, Fast #45853210025, Governance #45853220225, Android #45853210037/#45853220212 SUCCESS. **Base — ветка #515**, не сливать отдельно.
- **8. [#531](https://github.com/250oisr-eng/Pasekaapp/pull/531) P2 поиск семей — DEPENDENT_REVIEW:** `3d4fe4d822`, Fast #45707888890, Governance #45707901936, Android #45707888916/#45707901926 SUCCESS. **Base #510**, оба затрагивают журнал в `index.html`; необходима совместная регрессия с #548 после разрешённой интеграции.
- **9. [#538](https://github.com/250oisr-eng/Pasekaapp/pull/538) B09 QuotaExceeded — REVIEW_READY_SYNTHETIC:** `4b3fd20533`, Governance #45706259360 и Android #45706259335 SUCCESS. Транзакционный тест сохраняет main/backup/Blob, **не доказательство реального заполненного устройства**.
- **10. [#514](https://github.com/250oisr-eng/Pasekaapp/pull/514) устаревшие видеозапросы — REVIEW_READY:** `f0346cddb9`, Fast #45678570977, Governance #45678587465, Android #45678570784/#45678587683 SUCCESS. Только read-only UI; автоподчистка оригиналов FROZEN #442.

**Все десять остаются Draft, ни одна функция не вошла в main.** Code CI/QA ≠ проверенный физический пользовательский путь. Работа велась параллельно в независимых ветках с сохранением ограничений, без ADB.

## P0: замороженная миграция старого OnePlus не тормозит разработку

- **B01 legacy P0 BLOCKED/FROZEN:** повторные ADB/USB варианты прекращены; [Draft #543](https://github.com/250oisr-eng/Pasekaapp/pull/543) НЕ является доказательством реального архива. Старая установленная v315, её app-private IndexedDB и оригиналы неизменны. Старый JSON-экспорт, если доступен, охватывает записи, но НЕ отдельные Blob-видео `entrance_media`. Gallery/Downloads/MediaStore можно копировать через MTP отдельно; это НЕ backup app-private. Новую версию тестировать в независимой PWA/браузерной среде с синтетическими данными. Риск полной миграции сохраняется.
- **B04/B05 P0 BLOCKED:** установленный signer/долгоживущий signing key не подтверждены. [Draft #469](https://github.com/250oisr-eng/Pasekaapp/pull/469) не интегрирован. Не обновлять/удалять/сбрасывать APK на OnePlus.
- **B06/B10 #442 FROZEN:** нет доказанного лицензированного распознавателя и V0–V6 recovery. [#512 MERGED](https://github.com/250oisr-eng/Pasekaapp/pull/512) защищает текущий main от скрытого удаления, но не установленный APK; оригиналы не удалять.
- **B11 P1:** OP-11–14 и новая трёхсекционная модель не активированы; старые Draft #453–#466 не переносить вслепую. **Draft #452** full legacy recovery стек не активен.

## Следующий независимый этап

1. Завершить exact-head CI и выборочный review #544/#548, подготовить их к отдельному решению пользователя о merge; автоматического слияния/публикации нет.
2. Продолжить пользовательские P1/P2 функции с новыми main-based маленькими PR без затрагивания конфликтующих файлов. Тестировать полную IndexedDB export/restore новой версии на **отдельной пустой цели**, не используя OnePlus.
3. Реальную миграцию v315 возобновлять только после нового подтверждённого метода сохранения app-private без риска потери оригиналов.

**NO_MERGE / NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.**
