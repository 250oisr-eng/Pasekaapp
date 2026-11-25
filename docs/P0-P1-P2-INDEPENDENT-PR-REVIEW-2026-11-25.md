# P0/P1/P2 — независимая сверка готовых Draft и безопасный порядок интеграции

Дата: 2026-11-25. Исходный live main: `fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2`. **Этот документ — review, а не разрешение на merge/deploy и не доказательство физического восстановления.**

## F0–F2: границы и источники

Рассмотрены исключительно уже открытые Draft PR и их GitHub diff / exact-head check-runs, без доступа к живой базе или OnePlus. Ничего из этого ещё не включено в main. Исключены: физическое восстановление (B01), подписанный APK и rollback (B04/B05), распознавание и удаление реальных оригиналов (#442).

| Независимый PR | Проверенный HEAD SHA | Содержание / доказательство | Вердикт |
| --- | --- | --- | --- |
| [#512](https://github.com/250oisr-eng/Pasekaapp/pull/512) | `d0e61661afc709f7ac95b94f1eeab0263282d078` | P0: fail-closed защита от прямого удаления исходного video Blob и `indexedDB.deleteDatabase`; Android + Governance SUCCESS на точном HEAD | **P0 приоритет для review**, пока не IN_MAIN |
| [#511](https://github.com/250oisr-eng/Pasekaapp/pull/511) | `462a6ab086f3becf11f19dd6913c0e29e59ddf6c` | P2: metadata-only IndexedDB cursor, отсутствие длительного удержания списка Blob; физическая экономия RAM не измерена; exact-head CI в описании PR | Условно готов к review, **не выпускать без P0-защиты** |
| [#514](https://github.com/250oisr-eng/Pasekaapp/pull/514) | `1bcf7d45779d99b3e3045a2836f474246890186e` | P1: защита списка видео от устаревшего ответа/ошибки при смене улья; Android + Governance SUCCESS | READY_FOR_MERGE_REVIEW, без device UX |
| [#518](https://github.com/250oisr-eng/Pasekaapp/pull/518) | `2ee43f3b9e6a00d8cc973adf5224727e120ce8dc` | Тестовая композиция #512 + #511 + #514 через stacked #513; Android + Governance SUCCESS на точном HEAD | **CI_VERIFIED_COMPOSED_DRAFT**, не готовый release |
| [#515](https://github.com/250oisr-eng/Pasekaapp/pull/515) | `d2c5242dae5321fa500734c47ec6547ebc1445d3` | P1 SW v319: только HTTP 200 сохраняется как offline shell, 204/206 отбрасываются; Android + Governance SUCCESS | READY_FOR_MERGE_REVIEW, cold offline на OnePlus NOT_TESTED |
| [#510](https://github.com/250oisr-eng/Pasekaapp/pull/510) | `0798029419a579a35a1d6510debcd7426259dde9` | P2 журнал: дешёвые фильтры до sort и полной строки поиска; превью последних 100 audit событий; Android + Governance SUCCESS | READY_FOR_MERGE_REVIEW, ускорение на устройстве NOT_MEASURED |
| [#516](https://github.com/250oisr-eng/Pasekaapp/pull/516) | `d9e32ea9d9c99e7fe46be125545737a1b68bd9af` | P1 локальный JSON: предупреждение о cross-hive связи семья/запись без изменения истории; Android + Governance SUCCESS | READY_FOR_MERGE_REVIEW, не full backup |

## F3–F5: параллельные review, единые ограничения

- Видео: в main сохраняются потенциально деструктивные ручные пути; **нельзя** считать #511 или #514 защитой от удаления. #512 review имеет приоритет перед будущим включением этих оптимизаций. #518 — полезное доказательство совместимости **только синтетических тестов**; не объединять весь стек автоматически. Проверить точный общий HEAD после любого отдельно разрешённого интеграционного шага.
- SW: #515 меняет версию shell cache; сохранение пользовательских/неизвестных/будущих CacheStorage остаётся обязательным, требуется cold offline и rollback на устройстве после B01/B04/B05. Доказательств фактического обновления OnePlus нет.
- Журнал: #510 меняет только порядок фильтрации/сортировки и UI-превью, **не** исходный журнал. Различать проверку эквивалентности отображения и реальные метрики CPU/RAM/времени — последние NOT_MEASURED.
- JSON: #516 выявляет неоднозначность исторической семейной принадлежности; предупреждение `REVIEW_REQUIRED` не должно автоматически править записи и не заменяет отдельное хранилище `entrance_media`.
- Взаимодействие направлений: #515, #510 и #516 имеют отдельные scope, не требуют составлять один гигантский PR; тестовая композиция видео #518 относится только к видео UI/IndexedDB. Не запускать реальные операции пользователя для получения синтетического CI.

## Дополнительные независимые дочерние Draft (масштабированный цикл)

- [#530](https://github.com/250oisr-eng/Pasekaapp/pull/530) поверх #515, HEAD `5f5a5bb6c962fe2110204b958684c49067993e9c`: `Response.redirected===true` теперь не сохраняется в кеш PWA даже при HTTP 200; отдельно проверены install и normal fetch. На точном SHA **Android build SUCCESS, Governance SUCCESS**; физический cold offline NOT_TESTED. Не терять защиту от private/no-store и 204/206, уже существующую в родителе.
- [#531](https://github.com/250oisr-eng/Pasekaapp/pull/531) поверх #510: индекс семьи только в рендеринге журнала, 3 новых теста. При legacy duplicate ID сохраняет **первое** совпадение как исходный `Array.find`; имя исчезнувшей семьи берёт из historical snapshot. Финальный код+docs SHA `4301613dfddeb4b3da6e5b65ac9d40651a9b2bf0`; exact-head Android #45659290364 и Governance #45659290425 **SUCCESS**; физический прирост скорости не измерен.
- Обе дочерние ветки отличаются по файлам и не составляют объединённую проверенную сборку. После любого отдельно разрешённого merge — новые CI на текущем SHA, а физические метрики и B01/B04/B05 — отдельные ворота.

## F6–F7: последовательность на будущее

1. Получить **отдельное разрешение** на конкретный merge; этот документ такого разрешения не предполагает. При review P0 #512 проверить, что все destructive UI/handlers заблокированы при B01/#442, и что legacy paths покрыты тестами.
2. Для #511 + #514 сохранять fail-closed P0 защиту, затем прогонять единые отрицательные тесты на **новом конкретном** SHA после интеграции. Не приписывать результаты #518 будущему коммиту.
3. #510 / #515 / #516 могут проходить review независимо. После разрешённого merge проверять exact-main Android/Fast/Governance и связанные регрессии; не публиковать автоматически.
4. B01 полная внешняя копия + независимый restore, B04/B05 signer/rollback, #442 лицензированный детектор и видео gate V0–V6 остаются блокерами физического выпуска и удаления. Исходные файлы, архивы и пользовательские записи не изменять.

**Итог:** review готов, user action на данном этапе не требуется. Статусы ниже IN_MAIN/RELEASED, APK не установлен, production не менялся.

## Новый параллельный цикл: наблюдаемые результаты без подмены доказательств

Три существующих Draft расширены независимо: #512 P0 write/delete-surface regression, #516 P1 семейная запись без своего hive → review без автоматической миграции, #530 B11 query-specific shell cache-poisoning gate. Используются новые точные HEAD: #512 `277e27be0b964c2aec7ed6971adb5f2615e2b90b`, #516 `0a74cb4082e9b8bb3f824197a9ed2b950975b3cc`, #530 `42a30c950c397e4093aafb99b4b4bba5c544f8e1`. Две дополнительные линии — уже проверенный #531 и этот независимый docs review #529. Никакого дополнительного использования real media.

**Обязательная матрица интеграционного решения:** код защиты видео #512 должен оставаться действующим при любой композиции #511/#514/#518; #530 зависит от cache-policy #515; #531 зависит от UI filter-first #510; #516 — отдельный скрипт read-only и не заявляет recovery. Ни один code-only успех не снимает B01/B04/B05/#442. После разрешённого merge каждый новый exact-main SHA проходит новые тесты, а физический Android offline/recovery — отдельный gate.

## 25.11.2026 — восемь направлений: совместимость и критерии интеграции

**P0 #512:** защита оригиналов должна блокировать и удаление, и перезапись по совпадающему ID. Единственный initial-save `putEntranceVideo` переведён в `add`, поскольку никакой штатный update очереди не вызывает его. Вероятная коллизия редка, но цена — потеря старого Blob. На синтетическом Uint8Array тест проверяет неизменность сохранённых байтов. Для входящих настоящих Blob остаётся необходимость Android/WebView доказательства и полного B01-архива; `#442` FROZEN.

**P1 #530:** родитель #515 устанавливает v319, дочерний cache-policy Draft #530 обязан ставить v320. Иначе частично прерванная установка может переписать кеш v319. Тесты v320 включают запрет query/redirect/204/206, сохранение старого v319 при неудаче и строгое удаление только устаревших числовых кешей после успешной активации. CI #45667251364 Android и #45667251090 Governance SUCCESS на `ab2e64ab416091a50e4a38d564aade3de2c5da85`, но реальный офлайн OnePlus NOT_TESTED.

**P1 #514 + composed #518:** ID видео не должен попадать в кавычки JavaScript после декодирования HTML entities. Передача через escaped `data-video-id` и `this.dataset.videoId` проверена опасным тестовым ID. #514 независим, но его наследованная от main кнопка ручного удаления всё ещё требует **предварительной P0-защиты #512**, а #518 уже содержит отключение удаления и insert-only запись. На кодовом HEAD #514 `3e239ab1` Android/Governance SUCCESS; на составном #518 `53b46fa6` Android/Governance SUCCESS. Никакое тестовое «объединение» не является реальным merge.

**P1 #516:** когда текущая семья не назначена улью, историческая запись с семейной связью не может быть автоматически признана согласованной; read-only `REVIEW_REQUIRED`, никаких новых полей или миграций. На docs HEAD `b9753069` Android #45667463840 и Governance #45667463839 SUCCESS. Отдельное видео-хранилище отсутствует в обычном JSON, B01 не снят.

**B01 #524:** тесты выявляют подмену legacy store в полном архиве, а также дубликаты/недопустимые имена манифеста. Code CI SUCCESS (Fast/Android/Windows/Governance), docs HEAD `673ffbf2` имеет Governance и Windows SUCCESS; Android проверить на конечном SHA. Верификация fake-indexeddb ни при каких условиях не равна физическому restore Android/MediaStore.

**P2 #531:** однократные индексы по семье и первому историческому событию, preserving legacy first-match semantics; Android/Governance SUCCESS `38b51b9e`; физическая экономия RAM/CPU NOT_MEASURED.

**F6–F7:** все компоненты — независимые Draft; `main=fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2` остаётся неизменён. При будущей отдельно разрешённой интеграции повторить регрессионные проверки на новом точном SHA и сравнить реальные данные с резервной копией; автоматический merge/deploy/удаление original media запрещены.

## 26.11.2026 — актуализация после merge P0 #512 и B09 Android-конвейера

**Проверен live GitHub**, а не исторический snapshot сверху: `main=346b35035861257be45dae93ee0573cbd4de9082`; **#512 MERGED 25.11.2026**, защита от удаления оригиналов входит в main. Никакой release/publish не было. Столбец «пока не в main» в таблице 25.11 для #512 является **устаревшим историческим состоянием**, не действующим решением.

| Направление | Фактическое состояние на 26.11 | Следующий контролируемый шаг |
| --- | --- | --- |
| **P0 оригиналы #512** | В main, SHA `346b3503`. Оригиналы видео FROZEN #442 | Не ослаблять запрет удаления во время интеграции других PR |
| **P1 video UI #514** | Чистый main-root Draft `f0346cdd`, изменяет только `index.html`, тесты и описание; P0 main сохранён | Независимый merge review, затем exact-main CI по отдельному разрешению |
| **P1 JSON #516** | Чистый main-root Draft `c1cc5dbf`, только script, тесты, docs; не содержит полного архива медиа | Независимый merge review, исторические связи оставить `REVIEW_REQUIRED` |
| **B11 SW parent #515** | До согласования `mergeable_state=dirty` с main; создан двухродительский коммит `6b8dc21e`, дерево на main плюс v319 SW/тесты | Exact SHA Fast/Android/Governance, отсутствие возврата P0 |
| **B11 SW child #530** | Зависит от #515; кодовой SHA `29912189`, дерево от обновлённого #515, v320, status 200, no redirected/partial/query-poison; дополнительно Authorization/Range/no-store bypass | Exact SHA Fast/Android/Governance, review относительно обновлённого #515; физический cold-offline позже |
| **B09 #536** | Синтетический blocked v2→v3 retry; exact docs SHA `ef04be2b`, Android/Governance SUCCESS | READY_FOR_MERGE_REVIEW, отдельное разрешение на merge |
| **B09 #538** | Синтетическая квота/rollback Blob; final SHA `4b3fd205`, Android/Governance SUCCESS; кодовый Fast SUCCESS | READY_FOR_MERGE_REVIEW, только synthetic |
| **B01 Android #534→#537** | Изолированный `disasterproof2`, final #537 SHA `5b893ea1`: APK, Windows ZIP, Android эмулятор и Governance SUCCESS; артефакт `PASEKA-ONEPLUS-RECOVERY-ONECLICK` | Физический OnePlus **NOT_TESTED**, только когда ПК доступен |
| **P2 #510→#531** | Стек оптимизации журнала, не в main; отдельные CI green, реальная RAM/latency NOT_MEASURED | Review после безопасного P0 и без массовой синхронизации |

**Scope-разделение:** #514 `index.html` и #516 `scripts/audit-oneplus-json-transfer.mjs` не конфликтуют по runtime-файлам; их зелёные изолированные проверки не доказывают совместную релизную сборку. #530 и #515 намеренно **одна последовательная SW-цепочка**, не независимые кандидаты на одновременный merge. Составной старый #518 — тестовая история, не подтверждение новых SHA. Не переносить `tests/regression.test.mjs` целиком из устаревших веток: он содержит P0 регрессии защищённого main.

**Запреты:** no merge без отдельного разрешения; no release/production; никакого удаления видео; real full archive/media and rollback B01/B04/B05 не подтверждены. Физические результаты не заменяются эмулятором или CI.

## 26.11.2026 — P2: разрешение конфликтов с main без отмены оригинальной P0-защиты

Три уже существующих Draft приведены к защищённому `main=346b3503`, вместо создания дублирующих PR. **Не merged**. Каждый кодовый SHA имеет Fast/Android/Governance SUCCESS:

- [#510](https://github.com/250oisr-eng/Pasekaapp/pull/510) `7c500f84f1ffe46c94e89df920eba3f96fe65735`: фильтр журнала до сортировки и read-only preview последних 100 audit записей; [Fast #45707793381](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45707793381), [Android #45707793402](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45707793402), [Governance #45707800196](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45707800196) SUCCESS.
- [#531](https://github.com/250oisr-eng/Pasekaapp/pull/531) `3d4fe4d8226b5646b38ce00fa40ee59f6c908669`: child поверх #510, первым совпадением индексирует семейные имена и исторические labels; [Fast #45707888890](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45707888890), [Android #45707888916](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45707888916), [Governance #45707901936](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45707901936) SUCCESS.
- [#511](https://github.com/250oisr-eng/Pasekaapp/pull/511) `7965fcbe55bbac58c3e5951813fdacbd9895c610`: read-only metadata cursor `listEntranceVideos`, остальные P0 video/read/restore пути **побайтово те же функции**, что и main; [Fast #45708060218](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45708060218), [Android #45708060600](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45708060600), [Governance #45708069913](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45708069913) SUCCESS.

**Порядок review:** #510 отдельно → #531 отдельно; #511 независимая main-root кандидатура, но UI #514 и составные #518 должны проверяться после реального разрешённого merge на **новом** SHA, а не по прежним тестам. `#512` уже в main. Реальных измерений скорости/RAM нет. Без merge/release, без физического испытания, без видеоочистки.
