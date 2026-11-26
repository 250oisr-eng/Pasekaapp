# PR audit M — безопасный выборочный перенос из UI-корня #187

**Дата:** 26 ноября 2026. **Подтверждённый кодовый main:** `ab3206a07a7f08dbfb2bc0ef0cfba01a4e402430` после [#587](https://github.com/250oisr-eng/Pasekaapp/pull/587).

## Факт уникального исправления

На актуальном `index.html` до изменения экранный диктор слышал одинаковые «Открыть»/«Удалить» в каталоге разных ульев. Старый root [#187](https://github.com/250oisr-eng/Pasekaapp/pull/187) предлагал контекстные названия, но одновременно крупный редизайн HTML, новые browser tools и inline keydown. Сверка **действующего** `document.addEventListener('keydown')` показала, что Enter/Space уже обеспечивают открытие ульев и рамок; повторный inline handler грозил двойной активацией.

Fresh-main [#587](https://github.com/250oisr-eng/Pasekaapp/pull/587) перенёс **только** три экранированных `aria-label` для карточки, кнопки открытия и кнопки удаления улья и негативные тесты на делегированный клавиатурный обработчик. Никаких изменений обработчиков `openHive`, `deleteHive`, IndexedDB, Service Worker, профилей и навигационной структуры.

**Точное HEAD #587:** `7e48cd5da1ae264d8b42439bbd94c18628a9249d`.

| Проверка | Реальный результат |
|---|---|
| Android [#45892005602](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45892005602) | **SUCCESS**: Node регрессии, debug APK и signer/no-upgrade gate |
| Governance [#45892005533](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45892005533) | **SUCCESS** |
| Кодовый merge | **MERGED** в `ab3206a07a7f08dbfb2bc0ef0cfba01a4e402430`; main идентичен этому SHA |

Исторический #187 **OPEN/PARTIALLY_PORTED**. Оставшиеся browser smoke/Playwright/axe, honeycomb navigation и большой HTML diff не проверены на полную совместимость с current main. Исходная ветка и история сохранены; никаких массовых закрытий.

## Следующая работа и ограничения

GitHub Search после #587: **388 индексированных OPEN PR**, исторически 30 main-root + 358 stacked. Search **не гарантирует полный REST список** (известный ранее пропуск #516). Текущее содержимое корневого реестра #187 обновлено отдельно в [машинной матрице K](PR-AUDIT-ROOTS-2026-11-26-K.json).

Можно отдельно оценить пригодность оставшихся browser smoke tests без новой обязательной зависимости/дорогого CI. Не переносить старый UI/Service Worker автоматически. **B01 полный внешний backup/restore, B04/B05 Android installed signer, B07 физическая модель, #442 V0–V6 видео cleanup остаются BLOCKED/FROZEN.** Синтетическая клавиатурная проверка не доказывает физическую доступность на OnePlus. Реальных данных, видео, устройства и production не касались.
