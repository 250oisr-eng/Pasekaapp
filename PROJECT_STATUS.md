# PROJECT_STATUS — Пасека 2.0

**26.11.2026 · last verified main `cedcb63441b09a08fd78fd22e5b2a65687da1f5e` (#579).** Перед следующим циклом сверять живой GitHub. Нормативы: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL.md](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/CI и решения — [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [аудит H](docs/PR-AUDIT-CHECKPOINT-2026-11-26-H.md).

## Текущая интеграция и портфель PR

- **#572 MERGED:** fail-closed защита первого запуска и маркер прежнего использования, 951/951 Node, Android/Governance CI SUCCESS на точном кодовом SHA `73483cf6bd3fb4d3e96a7fcca76704836297bb3c`, merge `d812bfa46e28ec418a1f6ca1a958ecccd445160d`. Это не полноценный backup. Реальный OnePlus NOT_TESTED.
- **#573 MERGED** `c2d6d805a2b08c46560d99e7e2e6cd39cb7bde92`, Governance exact HEAD SUCCESS. #8 и #516 закрыты без слияния как подтверждённые superseded; ветки сохранены.
- **#60 CLOSED/SUPERSEDED** без слияния: текущий `auditLegacyLayoutBodyReferences` и read-only регрессии выявляют отсутствующие/некорректные ссылки и неизвестную спецификацию; старый жёсткий `inspect()` не переносить. #43 ранее CLOSED/SUPERSEDED после #570.
- **#534 OPEN / REVIEW_REQUIRED:** на HEAD `a8ab152c44e64617f0b7714c06f47bd51e6d5e9c` Governance #45690879408, Android #45690879512 и isolated synthetic restore #45690879551 SUCCESS. Это не реальный независимый restore полного архива OnePlus, не разрешение на обновление или очистку.
- **#7 OPEN / PRESERVE_SOURCE:** уникальный исторический аудит резервирования, не сливать его старый статус целиком. **#533 OPEN / DOCS_RECONCILE**: отделить уникальные WIP/STOP-критерии от старого снимка. **#60/#534/#7/#533** имеют мотивированные комментарии.
- Новый поимённый [PR audit J](docs/PR-AUDIT-CHECKPOINT-2026-11-26-J.md): **391 индексированный OPEN, 33 исторически root, 358 stacked**. Из 358: 0 исторических циклов, глубина до 142, 6 потомков закрытого #60 и 69 PR на 5 ветках без открытого parent PR (все 5 branch существуют). 29 PR проверены напрямую по live head/base; остальные старые SHA/CI НЕ подтверждены, индекс GitHub не гарантирует полноту.

## Действующие запреты и доказательства

- **B01 P0 FROZEN/BLOCKED (Draft #452 не интегрирован):** полный независимый архив всех источников, оригиналов видео и реальный безопасный restore/rollback ещё не доказаны. Не изменять реальные данные.
- **B04/B05 P0 BLOCKED (Draft #469 не интегрирован целиком):** подпись установленной версии, долговременный ключ и совместимое обновление OnePlus не доказаны. Не устанавливать новые APK.
- **B06/B10 #442 FROZEN:** отсутствует полный комплект V0–V6 для лицензированной модели и реального распознавания пчёл. Автоудаление оригинальных видео запрещено.
- **B07 P1:** OP11–14 / sectional профиль не активировать до завершения физической модели, зависимых модулей, локальных проверок и миграций. Источник — пользовательский DOCX и отдельные подтверждения.
- **B09/B11/P2:** synthetic CI, emulator и read-only диагностика не доказывают реальные cold-offline/power-loss/Quota/restore сценарии.

- **#575 MERGED** `09ac5b757b86803eafa616c9f425c8d262145105`: selective Windows Android Studio JBR lookup and installed `apksigner.jar` from historical #517, with isolated tests. Exact-head `270152169672a1fee07e53d1705991fd0147c964`: Android #45885947784 SUCCESS (Node regression/APK/sign audit), Governance #45885947805 SUCCESS. **#517 CLOSED/SUPERSEDED WITHOUT MERGE**, source retained. Physical Windows/OnePlus validation NOT_TESTED; B01/B04/B05 remain blocked.

- **#577 MERGED** `aa9fc17702730f9b5dc2931edee18e78c867478b`: isolated TAR header check from old #509 plus negative tests. Exact-head `422d169c6f8b3932a1b4782231bdbde2cbcdf849`: Android #45886634965 and Governance #45886635009 SUCCESS. **#509 CLOSED/SUPERSEDED WITHOUT MERGE**, source retained. B01 full backup/restore still BLOCKED.

- **#579 MERGED** `cedcb63441b09a08fd78fd22e5b2a65687da1f5e`: selective WIP/diagnostic STOP/exact CI rules from #533 into existing F0–F7, Governance #45887287260 SUCCESS exact HEAD `9b44124d7bf9a783f43dfb02d846ea6742804682`. **#533 CLOSED/SUPERSEDED WITHOUT MERGE**, source branch retained.

- **B05 #519 selective port in Draft:** local single-alias keytool metadata parser with fail-closed synthetic tests and `.gitignore` for secrets, no key access/device installation. Pending exact-head CI. B05 remains BLOCKED; historical #519 retained until port merged.

- **B05 #520 selective port pending CI:** read-only comparison of audited CI Debug APK public signer against explicit supplied public reference, without implying current OnePlus certificate, safe installation, private key or rollback; existing artifact workflow remains unchanged. #520 source kept open until proven merge.

## Следующий конкретный шаг

После #579 и синхронизации индексированного реестра разбирать следующий независимый root PR по полному diff, действующим модулям, негативным тестам и live SHA. 358 stacked веток рассматривать по зависимостям. Не перезаписывать устаревшими документами современный статус и не удалять историю.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL / NO_MASS_MERGE.**
