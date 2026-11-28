# P1 — единственный канонический вход ИИ и короткий путь новой записи

## F0–F2: источник и проблема

Источники: утверждённые [эргономические принципы](ПРИНЦИПЫ-ЭРГОНОМИКИ-ИНТЕРФЕЙСА.md) (разделы 2 и 4: не дублировать ИИ в шапке/главной и нижней навигации), `main=e00d5d34cdeeed619bb2af6082650f7643e9994b` после #603. До изменения `#home .home-ai-card` повторял переход в ИИ, отдельное поле вопроса и 3 готовых запроса, хотя `#ai` уже содержит каноническое поле `#aiQuestion`, рабочие prompt chips и отправку после подтверждения. Единственный вход в AI — nav `button[data-tab=ai]`; при этом была полезная кнопка `＋ Записать событие` на главной.

**F2 LIMITED_SAFE_DRAFT:** операция только о навигации и DOM, не требует физического Android/секретов. Не удалять пользовательские истории, вопросы в `#aiMessages`, состояния `S` или локальные медиа. Реальный экран и TalkBack требуют отдельной проверки.

## F3–F4: контракт и минимальное исправление

- Убрать только повторный `.home-ai-card` с полем `homeAIQuestion`, ненужным прокси `askAIFromHome` и его CSS. Кнопка центрального ИИ, `#aiQuestion`, `useAIPrompt()`, отправка, авторизация и история диалога сохраняются.
- Не терять быстрое открытие несохранённого черновика: `＋ Записать событие` переносится внутрь заголовка карточки «Последние события» на той же главной и продолжает вызывать штатный `newRecord()`. Никакого скрытого сохранения.
- Поскольку правая desktop колонка освободилась, сводка пасеки занимает всю ширину; задачи и последние события соседствуют. «Все ульи», три превью и задачи всех ульев остаются неизменными.
- Без изменений: `js/**`, `S`, IndexedDB/store schema, Service Worker, видео, OP, секционный профиль, backup/restore, cloud AI/permission, production.

## F5: проверяемый результат (до CI)

Новый `tests/home-ai-dedup.test.mjs`: единственный nav AI, отсутствие homeAIQuestion/relay, рабочие AI prompt chips, quick journal и сохранение задач/превью. Существующий Chromium `tests/e2e/journal-browser.e2e.cjs` дополнен открытием и закрытием несохранённого черновика **без изменения** состояния synthetic `S.records`. CI на точном SHA должен пройти Node, Chromium mobile/desktop + 11 geometry cases, Governance и Android debug APK; физический OnePlus/TalkBack NOT_TESTED.

## F6–F7: границы

После успешной CI и разрешённого merge статус IN_MAIN, но не RELEASED/DEVICE_VERIFIED. #596 3-row против 2-row остаётся отдельно OPEN. Публикация и установка на устройстве, работа с реальным IndexedDB, удаление оригиналов и восстановление данных не разрешены.

## Проверенные CI и исправление устаревшего теста

Исходный runtime SHA `0e0ac87c7a18e71dfa12ee4b952581f28578e4a6`: [Chromium #45954040590](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45954040590) SUCCESS (mobile+desktop journal, единственный AI nav, quick `newRecord()` открывает и закрывает unsaved draft без записи, 11 geometry cases). [Fast #45954040598](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45954040598) FAIL — 2 stale tests ожидали удалённый home AI relay. Исправлены **только** `tests/regression.test.mjs`, runtime не менялся. Code SHA `e185a4e828641eeb521291d68f4222c2bf1ddc06`: Fast #45954139870 **1017/1017 PASS**, Android #45954139760 **1017/1017 PASS + Debug APK**, Governance #45954145543 **SUCCESS**. OnePlus/TalkBack NOT_TESTED; не release.
