# PROJECT_STATUS — Пасека 2.0

**26.11.2026 · audit N baseline `fcf735e121d7c9916ab85d5482256bcf5f205dbf`; docs-only #589 MERGED at `a55aa97633e2a79195de2de1768c46a462192262`.** Перед следующим циклом сверять живой GitHub. Нормативы: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL.md](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/CI и решения — [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [аудит H](docs/PR-AUDIT-CHECKPOINT-2026-11-26-H.md).

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

- **#575 MERGED:** Windows JBR/apksigner read-only discovery (from #517), Android #45885947784 / Governance #45885947805 SUCCESS; #517 CLOSED without merge; OnePlus NOT_TESTED.

- **#577 MERGED:** TAR header negative tests ported from #509, Android #45886634965 / Governance #45886635009 SUCCESS; #509 CLOSED without merge; B01 still BLOCKED.

- **#579 MERGED:** WIP/STOP/exact-CI rules from #533 into F0–F7, Governance #45887287260 SUCCESS; #533 CLOSED without merge.

- **#581/#582 MERGED:** read-only cert and debug-signer checker from closed #519/#520. Signing key/upgrade/rollback BLOCKED.
- **#583 MERGED:** 4-body honey pair validation from #200, Android #45889321180 / Governance #45889321099 SUCCESS on exact PR HEAD; #200 CLOSED without merge; B07 inactive.
- **Root audit K:** [33 historical root PR inventory](docs/PR-AUDIT-CHECKPOINT-2026-11-26-K.md) and [machine review](docs/PR-AUDIT-ROOTS-2026-11-26-K.json). 30 root sources OPEN, 358 historical stacked; 388 indexed open overall (not exhaustive REST). Original #157 has unsafe video deletion eligibility, HOLD. 31 open-source diff structures checked; targeted deep semantics 4. No bulk merge.

- **#585 MERGED** `5d19c067e4cc832466bd2ebf497a242c729535aa`: fail-closed Node TAP verification; exact HEAD `b67f75ad720548adaa4ea1fdab80b9f104d663c7`, Fast quality #45891012805 **987/987 PASS**, Android #45891012758 and Governance #45891012722 SUCCESS. Old **#532 OPEN/PARTIALLY_PORTED**: its static PR manifests/network review not imported. B01/B04/B05/#442/B07 still BLOCKED/FROZEN.

- **#587 MERGED** `ab3206a07a7f08dbfb2bc0ef0cfba01a4e402430`: три адресных aria-label для ульев; общий Enter/Space уже работал. Exact head `7e48cd5da1ae264d8b42439bbd94c18628a9249d`, Android #45892005602 и Governance #45892005533 **SUCCESS**. **#187 OPEN/PARTIALLY_PORTED**, редизайн не переносился; физическая accessibility НЕ ПРОВЕРЕНА.

- **Root review N, MERGED #589:** [33-source patch line inventory](docs/PR-AUDIT-CHECKPOINT-2026-11-26-N.md) and [machine inventory](docs/PR-AUDIT-LINE-SCAN-2026-11-26-N.json). Exactly 33 root PRs live-state/HEAD checked; 30 OPEN Draft / 3 CLOSED without merge; 407 returned file patches, +36,512 / −312 lines mechanically scanned, no missing returned per-file patches. Human exhaustive review / exact-head CI for every root **NOT_DONE**, not an automatic merge approval. #1/#157 unsafe media deletion HOLD; #14/#168 legacy store clears and #543 optional OnePlus force-stop highlighted. #589 менял только документацию; runtime не изменён.

## Следующий конкретный шаг

По root audit N: не объединять старые корни целиком; для #187 оценить безопасные оставшиеся browser/Playwright регрессии или следующий независимый корневой P1 код по фактическому main; не вносить устаревший HTML целиком. Не импортировать старые статус и устройство. Один активный WIP цикл. 358 stacked веток рассматривать по зависимостям. Не перезаписывать устаревшими документами современный статус и не удалять историю.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL / NO_MASS_MERGE.**
