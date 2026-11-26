# PROJECT_STATUS — Пасека 2.0

**26.11.2026 · verified main `5d19c067e4cc832466bd2ebf497a242c729535aa` (#585).** Перед следующим циклом сверять живой GitHub. Нормативы: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL.md](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/CI и решения — [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [аудит H](docs/PR-AUDIT-CHECKPOINT-2026-11-26-H.md).

## Текущая интеграция и портфель PR

- **#572 MERGED:** fail-closed защита первого запуска и маркер прежнего использования, 951/951 Node, Android/Governance CI SUCCESS на точном кодовом SHA `73483cf6bd3fb4d3e96a7fcca76704836297bb3c`, merge `d812bfa46e28ec418a1f6ca1a958ecccd445160d`. Это не полноценный backup. Реальный OnePlus NOT_TESTED.
- **#573 MERGED** `c2d6d805a2b08c46560d99e7e2e6cd39cb7bde92`, Governance exact HEAD SUCCESS. #8 и #516 закрыты без слияния как подтверждённые superseded; ветки сохранены.
- **#60 CLOSED/SUPERSEDED** без слияния: текущий `auditLegacyLayoutBodyReferences` и read-only регрессии выявляют отсутствующие/некорректные ссылки и неизвестную спецификацию; старый жёсткий `inspect()` не переносить. #43 ранее CLOSED/SUPERSEDED после #570.
- **#534 OPEN / REVIEW_REQUIRED:** на HEAD `a8ab152c44e64617f0b7714c06f47bd51e6d5e9c` Governance #45690879408, Android #45690879512 и isolated synthetic restore #45690879551 SUCCESS. Это не реальный независимый restore полного архива OnePlus, не разрешение на обновление или очистку.
- **#7 OPEN / PRESERVE_SOURCE:** уникальный исторический аудит резервирования, не сливать его старый статус целиком. **#533 CLOSED:** WIP/STOP правила выборочно перенесены в #579. **#60/#534/#7/#533** имеют мотивированные комментарии.
- Новый поимённый [PR audit K](docs/PR-AUDIT-CHECKPOINT-2026-11-26-K.md): **388 индексированных OPEN, 30 исторически root, 358 stacked**. Из 358: 0 исторических циклов, глубина до 142, 6 потомков закрытого #60 и 69 PR на 5 ветках без открытого parent PR (все 5 branch существуют). 29 PR проверены напрямую по live head/base; остальные старые SHA/CI НЕ подтверждены, индекс GitHub не гарантирует полноту.

## Действующие запреты и доказательства

- **B01 P0 FROZEN/BLOCKED (Draft #452 не интегрирован):** полный независимый архив всех источников, оригиналов видео и реальный безопасный restore/rollback ещё не доказаны. Не изменять реальные данные.
- **B04/B05 P0 BLOCKED (Draft #469 не интегрирован целиком):** подпись установленной версии, долговременный ключ и совместимое обновление OnePlus не доказаны. Не устанавливать новые APK.
- **B06/B10 #442 FROZEN:** отсутствует полный комплект V0–V6 для лицензированной модели и реального распознавания пчёл. Автоудаление оригинальных видео запрещено.
- **B07 P1:** OP11–14 / sectional профиль не активировать до завершения физической модели, зависимых модулей, локальных проверок и миграций. Источник — пользовательский DOCX и отдельные подтверждения.
- **B09/B11/P2:** synthetic CI, emulator и read-only диагностика не доказывают реальные cold-offline/power-loss/Quota/restore сценарии.

- **#575 MERGED** `09ac5b757b86803eafa616c9f425c8d262145105`: selective Windows Android Studio JBR lookup and installed `apksigner.jar` from historical #517, with isolated tests. Exact-head `270152169672a1fee07e53d1705991fd0147c964`: Android #45885947784 SUCCESS (Node regression/APK/sign audit), Governance #45885947805 SUCCESS. **#517 CLOSED/SUPERSEDED WITHOUT MERGE**, source retained. Physical Windows/OnePlus validation NOT_TESTED; B01/B04/B05 remain blocked.

- **#577 MERGED** `aa9fc17702730f9b5dc2931edee18e78c867478b`: isolated TAR header check from old #509 plus negative tests. Exact-head `422d169c6f8b3932a1b4782231bdbde2cbcdf849`: Android #45886634965 and Governance #45886635009 SUCCESS. **#509 CLOSED/SUPERSEDED WITHOUT MERGE**, source retained. B01 full backup/restore still BLOCKED.

- **#579 MERGED** `cedcb63441b09a08fd78fd22e5b2a65687da1f5e`: selective WIP/diagnostic STOP/exact CI rules from #533 into existing F0–F7, Governance #45887287260 SUCCESS exact HEAD `9b44124d7bf9a783f43dfb02d846ea6742804682`. **#533 CLOSED/SUPERSEDED WITHOUT MERGE**, source branch retained.

- **#581/#582 MERGED:** B05 public keytool certificate and debug signer read-only code selectively ported from old #519/#520; old sources CLOSED without merge. Main after #582: `70e9cec1be2d6b5aea032b55c1c91fa9de0840ae`. Private signing key/upgrade/rollback still BLOCKED.
- **#583 MERGED** `f306b35074b19c4d0bb2ae01e3a535f14cc29b04`: generic 4-body staged honey pair validation, tested exact-head `da147b94aaa4ad3ae9959a2a7771fefaa538c958`, Android #45889321180 SUCCESS and Governance #45889321099 SUCCESS. Old #200 CLOSED without merge; profile B07 not activated.
- **Root audit K:** [33 historical root PR inventory](docs/PR-AUDIT-CHECKPOINT-2026-11-26-K.md) and [machine review](docs/PR-AUDIT-ROOTS-2026-11-26-K.json). 30 root sources OPEN, 358 historical stacked; 388 indexed open overall (not exhaustive REST). Original #157 has unsafe video deletion eligibility, HOLD. 31 open-source diff structures checked; targeted deep semantics 4. No bulk merge.

- **#585 MERGED** `5d19c067e4cc832466bd2ebf497a242c729535aa`: fail-closed Node TAP verification; exact HEAD `b67f75ad720548adaa4ea1fdab80b9f104d663c7`, Fast quality #45891012805 **987/987 PASS**, Android #45891012758 and Governance #45891012722 SUCCESS. Old **#532 OPEN/PARTIALLY_PORTED**: its static PR manifests/network review not imported. B01/B04/B05/#442/B07 still BLOCKED/FROZEN.

## Следующий конкретный шаг

После #585 следующий независимый корневой кандидат — #187: проверить уникальные read-only UI/browser регрессии на актуальном main, без старого HTML и потери мобильного UX. Не импортировать старые статус и устройство. Один активный WIP цикл. 358 stacked веток рассматривать по зависимостям. Не перезаписывать устаревшими документами современный статус и не удалять историю.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL / NO_MASS_MERGE.**
