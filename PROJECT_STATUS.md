# PROJECT_STATUS — текущая точка проекта «Пасека 2.0»

**Обновлено:** 2026-11-24. **Это краткий оперативный указатель, не журнал изменений.** Факты ниже сверяются с live GitHub перед работой; если SHA/PR изменился, обновить эту запись. История — [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md), Git и [прошлая редакция этого файла на main](https://github.com/250oisr-eng/Pasekaapp/blob/ecea1c3c50801250d42f49366e00e1e9e96d556f/PROJECT_STATUS.md).

## 1. Реальные границы состояния

| Объект | Статус / подтверждённый источник |
|---|---|
| `main` | Исходный SHA перед отдельно разрешённым merge #470: `ecea1c3c50801250d42f49366e00e1e9e96d556f`. **После merge фактический новый main SHA устанавливать через live GitHub; это поле не претендует на текущий SHA.** Публикация отдельно не разрешена |
| [Draft #469](https://github.com/250oisr-eng/Pasekaapp/pull/469) | QA first-use/signing, HEAD `01ba91aa63e5d27b65671c5c06c55f58020c701f`, **НЕ merged**. Code SHA `829be6d8a0de28266d345ffe496a8dd0e649f916`: [Android #45441911572](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45441911572), **690/690 PASS**, 2 jobs PASS, два реальных изолированных QA APK с одним временным сертификатом. Дальнейший diff только docs/process |
| [Draft #452](https://github.com/250oisr-eng/Pasekaapp/pull/452) | Full IDB archive/atomic restore, HEAD `f0367c338e0e5d9b9449803364af77d636f4ce56`, **НЕ merged**; ветка разошлась с #469 и main, текущую совместимость и реальные файлы ещё проверять |
| [PR #470](https://github.com/250oisr-eng/Pasekaapp/pull/470) | **Реформа управления: пользователь отдельно разрешил merge 24.11.2026.** Итоговый статус и SHA после merge проверить через GitHub; публикация не разрешена. Исходный code/test SHA `7a29810dcc6cfb3deee56957ae205c574c33704d`: [Governance #45445521258](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45445521258) **4/4 PASS**, [Android #45445521237](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45445521237) **664/664 PASS, BUILD SUCCESSFUL**; перед слиянием новые коммиты с документами требуют своих проверок |
| [Issue #442](https://github.com/250oisr-eng/Pasekaapp/issues/442) | PASEKA02 video recognition + automatic cleanup **FROZEN** до V0–V6, лицензии модели, оригинальных данных и доказанного восстановления |
| OnePlus | Пользователь подтвердил: первый улей, семья, две заметки сохранены после офлайн-перезапуска — `DEVICE_USER_REPORTED_PASS`. Installed APK signer независимо не прочитан. **Не переустанавливать, не очищать, не обновлять неподписанным/другим APK** |

## 2. Очередь и зависимости

1. **GOVERNANCE #470 — MERGE APPROVED:** единый F0–F7, компактный статус, учёт метрик; после фактического merge и проверок следующая **активная безопасная цепочка — P0 DATA #452**. Проверить live статус, не считать разрешение доказательством выполнения.
2. **P0 DATA — READY FOR INDEPENDENT REVIEW, NOT FOR MERGE:** полный архив/restore #452: матрица источников, миграции, фактическое восстановление и исходные Blob; отдельная ветка, cross-PR совместимость ещё не доказана.
3. **P0 ANDROID — QA READY IN CODE, DEVICE MIGRATION BLOCKED:** #469: временный binary signing smoke PASS; **долговременный ключ отсутствует**, исходная установленная подпись OnePlus неизвестна, данные на устройстве сохранять.
4. **P1:** по live main/Draft проверить и подготовить интеграцию независимых PR; физическая модель OP, дневник, кормление, зимовка, медосбор — без нового UI на неподдержанной модели.
5. **FROZEN:** PASEKA02 video auto-delete #442 до лицензионного/физического/архивного подтверждения.

**Уровни доказательств не смешивать:** `IMPLEMENTED_DRAFT`, `CI_VERIFIED_EXACT_SHA`, `BINARY_PROOF`, `DEVICE_USER_REPORTED_PASS`, `DEVICE_VERIFIED`, `IN_MAIN`, `RELEASED`, `NOT_TESTED`.

## 3. Последний этап, блокеры, следующее действие

- Последний законченный **кодовый** макроцикл #469: [Actions #45441911572](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45441911572) на `829be6d8...`, 690/690 PASS, два Android jobs успешны. Никаких merge/release; подписанные изолированные APK с временным ключом **не публиковались**.
- Незакрытые внешние зависимости: долговременный QA-key; независимый original-file backup/restore; physical Android restore; лицензированные веса модели/данные; разрешения merge и выпуска. Отсутствие этих ресурсов **не разрешает удаление или рискованный импорт**.
- **Следующее действие:** после отдельного разрешённого merge #470 проверить GitHub main SHA/CI и отсутствие незапрошенной публикации, затем продолжить read-only анализ полного backup/restore #452. В течение следующих 2–3 реальных макроциклов учитывать повторные чтения, отменённые CI, блокеры и завершённые пользовательские сценарии в [WORK-CYCLE-METRICS.json](docs/WORK-CYCLE-METRICS.json). Эффект `NOT_MEASURED` до фактических измерений; экономию не выдумывать.

## 4. Ссылки

Единственный рабочий цикл: [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Ограничения: [AGENTS.md](AGENTS.md). Индекс: [PROJECT-CONTROL.md](docs/PROJECT-CONTROL.md). История: [ЖУРНАЛ-ИЗМЕНЕНИЙ.md](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md). Короткая передача: [ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md](docs/ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md).

**Запреты:** merge #470 разрешён отдельно 24.11.2026; никакие другие PR, публикация, production deployment, производственные миграции и удаление данных/видео не разрешены.
