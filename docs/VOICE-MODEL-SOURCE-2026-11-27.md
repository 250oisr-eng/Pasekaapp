# Vosk: реальный источник русской модели (F2), 27.11.2026

Независимая ветка от main `a0e52b83abb2463a9a3a7560ee3cda0517880516`: #641 меняет web lifecycle, здесь только проверка байтов конкретной бесплатной модели, без пересекающихся runtime файлов. #162/#164 не сливаются.

- Официальный каталог: https://alphacephei.com/vosk/models — конкретная `vosk-model-small-ru-0.22`, Apache 2.0, ~45M.
- Candidate SHA-256 `961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4` совпадает в двух LFS/Xet каталогах (точные ссылки в manifest). Это не официальный опубликованный SHA и не доказательство скачанных байтов.
- Старый #162 проверяет только `graph/HCLG.fst`; сторонние манифесты точной маленькой русской модели указывают `graph/HCLr.fst` и `graph/Gr.fst`. Проверка оригинального ZIP обязательна.
- Контракт: фиксированный официальный HTTPS URL, pin digest, bounded size, no redirect, только ожидаемые относительные пути, no duplicate/symlink/encrypted entry, обязательные непустые файлы, ZIP CRC. Проверяем без распаковки/исполнения. CI публикует только метаданные.
- F5: synthetic tests and actual download verification are distinct. До результата CI статус SOURCE_NOT_VERIFIED. Даже SUCCESS здесь не означает установку, распознавание, Android 16 KB page compatibility, latency, microphone or OnePlus. Не подключать модель при mismatch. Никаких изменений IndexedDB, реальных данных, APK, разрешений или production.
- Далее: перенести безопасную нативную установку на проверенные байты, объединить регистрацию с daily scheduler, проверить permission/lifecycle и isolated QA. Без автоматического merge/release.

