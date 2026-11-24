# PROJECT_STATUS — Пасека 2.0

**25.11.2026 — семь независимых направлений.** Подтверждённый текущий `main=97e61dcd28cdaf823098e6ba7317fccc9420a3fa`. Рабочая документация: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). SHA пересверять непосредственно перед каждым merge и после него.

## Доказанные интеграции этого цикла

- **#496 MERGED** → `17834a1413f954eac1eb25bc2da0c7077ec9965e`: read-only B04 signer/OnePlus evidence audit; exact-main docs Governance #45505605231 **SUCCESS**. Физический signer не доказан.
- **#492 MERGED** → `a17cc60231db5015bc9895d40b80fcea8f53fcc0`: source-backed архивные abort и полный перечень stores; Fast #45505720390, Governance #45505720425, Android #45505720387 **SUCCESS** на main.
- **#493 MERGED** → `812d43f719d38e1ad29109200d2b79ba8bdcd691`: read-only PR inventory negative pagination and never-auto-ready; Fast #45505907793, Governance #45505907794, Android #45505907858 **SUCCESS** на main.
- **#494 MERGED** → `22123ab09b644ee79898395cf626f2e1301625f1`: SW install rejects missing/private shell assets; Fast #45506214902, Governance #45506215211, Android #45506215472 **SUCCESS** на main.
- **#498 MERGED** → `97e61dcd28cdaf823098e6ba7317fccc9420a3fa`: честное описание обычного JSON/auto backup против P0 read-only full IndexedDB archive; Fast #45506427598 SUCCESS, Governance #45506427574 SUCCESS, Android #45506427607 **PENDING** при фиксации. Код backup и данные не менялись.

## Параллельные направления

- **#495 DRAFT / NOT_IN_MAIN:** источник Cloudflare Worker, негативные проверки mid-stream transport failure и нулевого byte cap; Android #45505456614, Governance #45505456637 **SUCCESS** на Draft.
- **#497 DRAFT / NOT_IN_MAIN:** перенос из #480 ручного Cloudflare deploy с явным RELEASE_SHA, подтверждением и main ancestry (никогда push deploy). Android #45505466312, Governance #45505466390 **SUCCESS** на Draft; реальные deployment не выполнялись.
- **Draft #469** startup/installed signer, **Draft #452** аварийное восстановление, **Draft #479** read-only B01 transport — исторические сложные кандидаты, НЕ объединены и не превращены в физическое доказательство.

## Незакрытые реальные зависимости

**B01:** полного внешнего оригинального архива с отдельным тестовым restore нет, старые TAR OnePlus недействительны. **B04/B05:** signer реального установленного пакета и долгоживущий ключ отсутствуют. **B06/B10:** лицензированные weights, реальный видеоконвейер и автоудаление оригиналов **FROZEN #442**. **B11:** настоящие cold-offline/rollback тесты на OnePlus не выполнены. Никаких изменений в production БД, установки APK, публикации Pages или Cloudflare, стирания видео и секретов не было.

## Следующий этап

1. Завершить exact-main Android #498 и интегрировать #495/#497 по одному, повторяя Fast/Governance/Android CI на каждом новом `main`.
2. Обновить этот статус и журнал, проверить Governance docs-only SHA, не затереть историю.
3. Вернуться к B01 лишь при появлении доказуемого безопасного внешнего восстановления. P2 physical performance и все OP01–14 live activation отдельно требуют source-bound/устройственного gate.
