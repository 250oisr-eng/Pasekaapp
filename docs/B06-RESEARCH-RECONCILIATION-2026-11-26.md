# B06 — сверка двух исследовательских PR #539 и #540 (26.11.2026)

**Статус: RESEARCH_ONLY / TWO_ALTERNATIVE_CANDIDATES / NO_SELECTED_CHECKPOINT / #442 FROZEN.** Это перенос исторических исследований, не запуск детектора и не изменение технологии пасеки.

| Объект | Подтверждённое публичным источником | Не доказано |
|---|---|---|
| Mendeley Data v6, DOI 10.17632/8gb9r2yhfc.6 | Dataset опубликован под CC BY 4.0: https://data.mendeley.com/datasets/compare/8gb9r2yhfc | Байтовая целостность **всех** оригинальных JPG/TXT, независимость train/test по видео/ульям, истинные события IN/OUT |
| RF-DETR Nano detection | Roboflow указывает Apache-2.0 для Nano/Small/Medium/Large detection: https://roboflow.com/model-licenses/rf-detr и https://rfdetr.roboflow.com/latest/learn/pretrained/ | Точный URL/версия/SHA выбранного бинарного checkpoint; fine-tuned bee weights; конверсия и реальный инференс |
| LiteRT / EfficientDet-Lite0 | Возможный отдельный inferencing/training путь, карточка community COCO model приведена в #540 | Лицензия **конкретных** trainable weights и их хеш не проверены независимо; обычная COCO-модель не обучена классу bees |
| ByteTrack | Отдельный кандидат для tracking: https://github.com/FoundationVision/ByteTrack | Точность и независимая оценка траекторий входа/выхода на реальном летке |

## Согласование различий

- [Research #539](B06-LICENSED-BEE-DETECTOR-DECISION-2026-11-26.md) предлагает RF-DETR Nano; [Research #540](VIDEO-V0-V2-PERMISSIVE-DETECTOR-FEASIBILITY-2026-11-26.md) рассматривает LiteRT/COCO и совместимый путь обучения. **Оба варианта остаются альтернативными**; перенос не выбирает рабочую модель.
- [Реестр #539](B06-LICENSED-MODEL-REGISTRY.json) содержит `pilotJpgTxtBinaryVerified: 0` в собственном scope. [Реестр #540](VIDEO-V0-LICENSE-EVIDENCE-2026-11-26.json) упоминает **93 ранее проверенные пары** по отдельному #290. Это разные уровни доказательств: 93 не считаются перепроверенными в этом переносе и не доказывают полный оригинальный Mendeley набор.
- Лицензия научной статьи и лицензия конкретного датасета различаются. Dataset CC BY 4.0 **не является разрешением на любой неподтверждённый бинарный checkpoint**.
- Ни одна ветка не содержит скачанных весов, подтверждённого real-bee evaluation, реального видеоанализа на OnePlus, независимого восстановления или разрешения на удаление оригиналов.

## Ворота возобновления

1. Получить конкретный оригинальный бинарник выбранной модели, URL, лицензию, SHA-256 и воспроизводимый бесплатный training/inference route.
2. Установить реальные исходные JPG/YOLO TXT, видео/улей/session provenance и независимые разбиения.
3. Провести реальный локальный тест: обнаружение bees, затем отдельный track/crossing IN/OUT ground truth.
4. Доказать B01 external original-copy inventory, независимое полное восстановление и жизненный цикл всех копий до отдельного решения пользователя об удалении.

**Не объединять эти research-only документы с действующей моделью OP или Farrar. #442 остаётся FROZEN. Ни одна запись здесь не меняет `cleanupAuthorized=false`.**
