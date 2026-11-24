# PROJECT_STATUS — Пасека 2.0

**2026-11-25.** Live `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`. Нормативные [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md) и [AGENTS.md](AGENTS.md); история в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## Состояние репозитория и телефона

- #471–#477 **MERGED** (read-only export для нового main, IndexedDB guards, Service Worker v317), без публикации. На точном main: Fast #45476750153, Android #45476750242 и Governance #45476750196 **SUCCESS**.
- [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478) — SW offline/cache lifecycle, **NOT_IN_MAIN**. Точный SHA `a5e7ab8d539f0110beb482425bd6fd144769d14e`, Android #45483004363 и Governance #45483004397 **SUCCESS**.
- [Draft #479](https://github.com/250oisr-eng/Pasekaapp/pull/479) — B01 Windows/OnePlus evidence и регрессии raw ADB contamination; прежний SHA `b1f0294297c8f776981f89c53ba11d3667d49f23`: Governance #45489618244 **SUCCESS**, Android #45489618134 **IN_PROGRESS** при последней проверке. Новый docs HEAD требует собственной проверки CI. Нет разрешения на merge.
- OnePlus NE2213 Android 16, установленный `ru.paseka.journal` v1.0 с embedded SW v315; APK SHA-256 `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6` неизменён. Пользователь дважды открыл офлайн, исходные улей/семья/две заметки сохранились после нескольких reboot. `run-as` PASS, каталоги app-private IndexedDB есть; установленная v315 **не имеет** UI полного экспорта. Активный SW, signer и v315→v317 upgrade **NOT_VERIFIED**.

## B01 — доказательства сохранности данных

- Первый OnePlus TAR-кандидат совпал с указанным SHA, но повреждён: 5 119 715 bytes (`mod 512=227`), 17 валидных TAR заголовков, первый неверный в блоке 20 (`BAD_HEADER_CHECKSUM`), EOF отсутствует. Второй строгий capture тоже **BLOCKED/INVALID_BLOCK_LENGTH**. Возможны частичные файлы на ПК; **не удалять и не восстанавливать**. Пользовательская база на телефоне не изменялась; реального complete backup нет.
- **Windows synthetic PASS**: 5 MiB через `cmd.exe` redirection дали валидный 5 253 120-байтный TAR с совпадающим payload SHA. Проблема не доказана в общем Windows-механизме записи.
- **ADB synthetic V1 BLOCKED (script bug)** до передачи: PowerShell `New-Item -LiteralPath`. **ADB synthetic V2 USER_REPORTED_BLOCKED:** raw `adb exec-out dd` передал `5,242,967` вместо `5,242,880` байт (**+87**), exit0, host stderr NONE. AOSP raw protocol объединяет удалённые stdout/stderr, так что stderr `dd` — сильная, но ещё не физически доказанная гипотеза. `run-as dd` и public TAR пока не проверены; реальные данные не читались.
- **V3 USER_REPORTED_BLOCKED:** `adb shell -T dd` вернул лишь **75 байт**, exit=0, host stderr=NONE; фактический текст этих байт ещё UNKNOWN, поэтому нельзя утверждать причину. Run-as / публичный TAR не исполнялись; private данные не трогались.
- **Следующий единый USB-блок v4:** `PASEKA-B01-ADB-direct-binary-split-synthetic-v4.zip`, SHA-256 `c90deb5f3d7e0866d5f53ee1599aae40fd1ace5f971640a1f92dfd44a7804d31`: прямой `adb.exe` через .NET (без `cmd.exe`), сначала 16 нулевых байтов и при ошибке безопасный ограниченный текст диагностики; далее 16 нулей run-as, 5 МиБ нулей plain/run-as и TAR только публичного `/system/build.prop`. Без app-private данных, изменений телефона и `CAPTURE`. ZIP CRC/static safety **PASS**, Windows/OnePlus v4 **NOT_TESTED**. Обновлены негативные регрессии `tests/b01-adb-stream-safety.test.mjs`; новый HEAD CI проверять.
- До доказанного транспорта, внешнего архива, независимого restore **B01 BLOCKED**, `completeBackupVerified=false`, `restoreTested=false`. Подробные доказательства — [B01 gate](docs/P0-B01-ONEPLUS-SNAPSHOT-CANDIDATE-GATE-2026-11-24.md), [B01–B15 blockers](docs/РЕЕСТР-БЛОКЕРОВ.md).

## Ограничения и последующие шаги

- B04 signing fingerprint `NOT_VERIFIED` (на Windows нет доступного Java для apksigner.jar); Draft #469. Draft #452 restore UI не слит. B06/B10 real bee detection/video cleanup [#442](https://github.com/250oisr-eng/Pasekaapp/issues/442) **FROZEN**. B11 upgrade **BLOCKED**.
- Никаких merge без отдельного разрешения, production deployment, изменения APK, restore/clear/удаления данных, видео, архивов. Не считать CI, синтетический PASS или файл-кандидат доказательством восстановления.
