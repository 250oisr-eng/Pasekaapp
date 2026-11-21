"""Check one previously exported synthetic PASEKA02 file on one USB test phone."""
import argparse
from datetime import date
import json
import re
import shlex
import subprocess

PACKAGE = "ru.paseka.journal.archive.test"


def adb_shell(*args):
    # adb shell passes its command through the remote Android shell.
    command = shlex.join(args)
    return subprocess.run(["adb", "-d", "shell", command], capture_output=True,
                          text=True, encoding="utf-8", timeout=90, check=False)


def check(export_name, expected_hash, run=adb_shell):
    name = re.fullmatch(r"paseka-full-backup-(\d{4}-\d{2}-\d{2})(?: \(\d+\))?\.paseka", export_name)
    if not name or not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
        raise ValueError("Укажите имя тестового экспорта и его исходный SHA-256.")
    date.fromisoformat(name.group(1))
    path = "/sdcard/Download/Пасека/" + export_name

    def require(*args):
        reply = run(*args)
        if reply.returncode or reply.stderr.strip():
            raise ValueError("Команда устройства не выполнена без ошибок: " + args[0])
        return reply.stdout.strip()

    def verify_file():
        if require("head", "-c", "8", path) != "PASEKA02":
            raise ValueError("Файл не содержит заголовок PASEKA02.")
        line = require("sha256sum", path)
        if line.split(maxsplit=1)[:1] != [expected_hash]:
            raise ValueError("SHA-256 внешнего архива отличается от эталона.")

    def confirm_stopped():
        reply = run("pidof", PACKAGE)
        if reply.returncode != 1 or reply.stdout.strip() or reply.stderr.strip():
            raise ValueError("Не подтверждена остановка тестового процесса.")

    if not re.fullmatch(r"[1-9]\d*(?:\s+[1-9]\d*)*", require("pidof", PACKAGE)):
        raise ValueError("Тестовое приложение должно быть запущено.")
    verify_file()
    require("am", "force-stop", PACKAGE)
    confirm_stopped()
    verify_file()
    confirm_stopped()
    return {"package": PACKAGE, "archiveFormat": "PASEKA02",
            "externalArchiveSha256BeforeAndAfter": expected_hash,
            "processAbsentBeforeAndAfterSecondRead": True,
            "indexedDbRestoreTested": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export_name")
    parser.add_argument("source_sha256", help="Эталон до Android-экспорта")
    args = parser.parse_args()
    try:
        print(json.dumps(check(args.export_name, args.source_sha256), ensure_ascii=False))
    except (ValueError, OSError, subprocess.TimeoutExpired) as error:
        parser.exit(1, f"Проверка не завершена: {error}\n")
