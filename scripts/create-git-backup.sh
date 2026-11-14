#!/usr/bin/env bash
set -euo pipefail

# Создаёт переносимый Git bundle со всеми локальными refs.
# Запуск из любого места внутри Git-репозитория:
#   bash scripts/create-git-backup.sh [каталог-для-резервных-копий]

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Ошибка: текущий каталог не находится внутри Git-репозитория." >&2
  exit 2
}
cd "$repo_root"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Отказ: рабочее дерево содержит незакоммиченные изменения." >&2
  echo "Сначала сохраните изменения в коммит или отдельно скопируйте изменённые файлы." >&2
  exit 3
fi

backup_dir="${1:-$HOME/Paseka-backups}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
repo_name="$(basename "$repo_root")"
bundle="$backup_dir/${repo_name}-${timestamp}.bundle"

git bundle create "$bundle" --all
git bundle verify "$bundle"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$bundle" > "$bundle.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$bundle" > "$bundle.sha256"
else
  echo "Предупреждение: sha256sum/shasum не найдены; контрольная сумма не создана." >&2
fi

echo "Резервная копия создана: $bundle"
[[ -f "$bundle.sha256" ]] && echo "Контрольная сумма: $bundle.sha256"
echo "Храните копию отдельно от исходного устройства."
