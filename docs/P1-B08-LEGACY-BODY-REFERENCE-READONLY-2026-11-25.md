# B08 / legacy body references — read-only обратная сверка

Дата: 2026-11-25. Основа: `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`. Источник: прежний [PR #60](https://github.com/250oisr-eng/Pasekaapp/pull/60); актуальные `js/equipment-inventory.js`, `js/equipment-items.js`, `js/sectional-physical-layout.js`.

## F0–F2: почему именно ограниченный аудит
Действующий `PasekaInventory.inspect()` проверяет реестр зарегистрированных объектов в направлении equipment → layout. Для старого `layouts[*].corpusIds` нет отдельной общей обратной проверки. Вместе с тем старые Farrar-раскладки могут иметь физические ID до `equipmentInventory.bodies`. Немедленно трактовать каждую недостающую запись как повреждение и препятствовать загрузке нельзя: это могло бы заблокировать легитимную историю.

Решение: **LIMITED_SAFE_DRAFT** — отдельная чистая `PasekaInventory.auditLegacyLayoutBodyReferences(state)`, возвращающая findings с `severity`, `code`, `details`, без вызова ensure/migrate/layoutFor и без записи в state. Это технический инспектор; не привязывать к startup/save/restore validation, пока не доказана миграция и различение реальной потери объекта от регистрации legacy. Это не новая физическая технология улья.

## F3: контракт
- Несуществующий объект с корректной непустой ссылкой: `legacy_body_not_registered`, **warning**, не corruption verdict.
- Пустые, строковые с пробелами и нестроковые ссылки: `invalid_layout_body_reference`, **error** (только диагностический).
- Повреждённая зарегистрированная identity: `invalid_registered_body_identity`, **error**.
- Отсутствующая спецификация зарегистрированного корпуса: `registered_body_spec_unknown`, **warning**; никогда не выводить размеры по умолчанию.
- Нет `equipmentInventory`, `corpusIds` или есть sectional layout: без реконструкции данных и без смешивания профилей.
- Ни одна finding не вызывает автоматическую миграцию, пользовательское подтверждение, перестановку, повреждение истории, сохранение или закрытие физической операции.

## F4–F7: доказательства и границы
Файлы: `js/equipment-inventory.js`, `tests/legacy-layout-body-reference-audit.test.mjs`. Восемь source-backed тестов на legacy, зарегистрированные тела, отсутствующую spec, некорректные значения, несогласованную identity, старые отсутствующие containers, sectional isolation, исходные family/history. В ветке нет IndexedDB schema, видео, Android keystore, SW или UI изменений.

До успешного CI `IMPLEMENTED_DRAFT / CI_NOT_VERIFIED`, после **точных** Fast/Android/Governance проверок — только `CI_VERIFIED_EXACT_SHA`; реальный OnePlus и миграции остаются NOT_VERIFIED. Для подключения в обязательный валидатор нужен отдельный аудит порядка миграций и реальные регрессии старой версии базы. Никаких merge, release или data mutation.
