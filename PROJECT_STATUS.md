# PROJECT_STATUS — Пасека 2.0

**26.11.2026 · live main `346b35035861257be45dae93ee0573cbd4de9082`.** Основные правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL.md](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Историю и старые SHA хранить в журнале.

## Последовательная очередь по риску данных и зависимостям

1. **[#538](https://github.com/250oisr-eng/Pasekaapp/pull/538) B09 / P0 технический приоритет:** транзакционный rollback IndexedDB при quota / late abort. Code SHA `6b6b61fceb4aefb54d9678715fc423bdb091e384`; Fast #45855002393 SUCCESS, Android #45855002315 SUCCESS, Governance #45855009504 SUCCESS. Дополнительная проверка оригинального Blob `entrance_media` при закрытии/повторном открытии синтетической базы. **READY_FOR_MERGE_REVIEW только по коду, физическое Quota/PowerLoss NOT_VERIFIED**; docs / окончательный SHA проверить отдельно.
2. **[#514](https://github.com/250oisr-eng/Pasekaapp/pull/514) P0 protection:** устаревшие видеозапросы и сохранность ID; read-only. Следующая независимая задача.
3. **[#515](https://github.com/250oisr-eng/Pasekaapp/pull/515) P1 offline:** HTTP 204/206 запрещены для shell-cache. Родитель для #530.
4. **[#530](https://github.com/250oisr-eng/Pasekaapp/pull/530) P1 offline:** redirect / Content-Range; зависит от #515, не интегрировать child прежде parent.
5. **[#545](https://github.com/250oisr-eng/Pasekaapp/pull/545) P1 оборудование:** постоянная маркировка Р/К и варианты тире.
6. **[#547](https://github.com/250oisr-eng/Pasekaapp/pull/547) P1 голосовые рамки:** осмотр и preview; совместимость #545.
7. **[#546](https://github.com/250oisr-eng/Pasekaapp/pull/546) P1 голосовая подкормка:** только черновик, не утверждение операции.
8. **[#544](https://github.com/250oisr-eng/Pasekaapp/pull/544) P1 планирование:** последний сохранённый осмотр, не автоматический факт.
9. **[#548](https://github.com/250oisr-eng/Pasekaapp/pull/548) P2 журнал:** CSV выбранного улья, не backup.
10. **[#510](https://github.com/250oisr-eng/Pasekaapp/pull/510) → [#531](https://github.com/250oisr-eng/Pasekaapp/pull/531) P2 производительность:** зависимые PR, проверить совместно с CSV.

Режим: **один риск и один PR за раз**. Закончив код/негативные тесты/exact SHA CI/обзор конфликтов, ставить `READY_FOR_MERGE_REVIEW` и переходить к следующему независимому PR при отсутствии разрешения на merge. Не сливать и не публиковать автоматически. Экономия времени/памяти NOT_MEASURED.

## Замороженные зависимости (не тормозят независимую разработку)

- **B01 / P0 old OnePlus FROZEN:** старый APK и данные оставить без изменений; никакого USB/ADB варианта, установки APK или удаления. JSON v315 и MTP не заменяют full app-private backup с отдельными видео.
- **B04/B05 P0 BLOCKED:** installed signer/ключ/rollback не доказаны. **Draft #469** не разрешает upgrade.
- **B06/B10 #442 FROZEN:** лицензированная модель и реальное распознавание/автоудаление оригиналов не доказаны. [#512](https://github.com/250oisr-eng/Pasekaapp/pull/512) MERGED на main для защиты от удаления, но не установлен на OnePlus.
- **B07 P1:** физический sectional профиль и OP11–14 не активированы; исходный DOCX + пользовательские уточнения обязательны. **Draft #452** не является завершённым физическим восстановлением.
- **B09 физический риск:** синтетические fake-indexeddb тесты не равны реальным quota, crash/power loss и независимому restore на устройстве.

**NO_MERGE / NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.**
