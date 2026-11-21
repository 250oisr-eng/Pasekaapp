r"""Rebuild the 192-file publisher snapshot from local, version-6 metadata only.

To acquire the public metadata in a fresh private directory from the repository root
(POSIX shell; curl, Python and the committed snapshot are sufficient):

    d=$(mktemp -d)
    api=https://data.mendeley.com/public-api/datasets/8gb9r2yhfc
    curl -fsS --max-time 30 --max-filesize 4194304 "$api/folders/6" -o "$d/folders.json"
    for folder in $(cut -d, -f3 tests/fixtures/mendeley-v6-publisher-checksums.csv | tail -n +2 | sort -u); do
      for offset in 0 1000; do
        url="$api/files?folder_id=$folder&version=6&\$start=$offset&\$limit=1000"
        curl -fsS --max-time 30 --max-filesize 4194304 "$url" -o "$d/$folder-$offset.json" || exit 1
        [ "$(python -c 'import json,sys;print(len(json.load(open(sys.argv[1]))))' "$d/$folder-$offset.json")" -lt 1000 ] && break
      done
    done
    python tools/collect_mendeley_v6_publisher_checksums.py "$d" "$d/publisher.csv"

Publisher listings describe available content; they do not certify a local media
read, an original recording, or a train/test split. Raw API metadata stays local.
"""
import argparse
import csv
import io
import json
import os
import stat
import tempfile
from collections import Counter
from pathlib import Path
from uuid import UUID

from prepare_mendeley_v6_yolo_unassigned import GROUP_COUNTS
from stage_mendeley_v6_public_csv import FILENAME, SHA, URL_PATTERN

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
FIELDS = ("file_uuid", "filename", "folder_uuid", "content_uuid", "size", "sha256", "version_membership")
MAX_BYTES = 4 * 1024 * 1024


def uuid_string(value):
    if not isinstance(value, str) or str(UUID(value)) != value:
        raise ValueError("invalid canonical UUID")
    return value


def read_listing(path, max_rows):
    entry = path.lstat()
    if not stat.S_ISREG(entry.st_mode):
        raise ValueError("metadata path must be a regular file")
    flags = os.O_RDONLY | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0)
    with os.fdopen(os.open(path, flags), "rb") as source:
        info = os.fstat(source.fileno())
        if not os.path.samestat(info, entry):
            raise ValueError("metadata path changed")
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= MAX_BYTES:
            raise ValueError("invalid metadata input")
        raw = source.read(MAX_BYTES + 1)
    if len(raw) != info.st_size:
        raise ValueError("metadata size changed while reading")
    data = json.loads(raw)
    if not isinstance(data, list) or len(data) > max_rows or not all(isinstance(r, dict) for r in data):
        raise ValueError("invalid metadata listing")
    return data


def repository_requests():
    batches = [FIXTURES / "mendeley-v6-user-16-pairs-pinned.csv",
               *sorted((FIXTURES / "mendeley-v6-work-96").glob("*.csv")),
               FIXTURES / "mendeley-v6-work-rejected.csv"]
    wanted = {}
    names = set()
    groups = Counter()
    for path in batches:
        with path.open(encoding="utf-8", newline="") as source:
            for r in csv.DictReader(source):
                group = r["hive_group"]
                stem, ext = os.path.splitext(r["image_filename"])
                if (group not in GROUP_COUNTS or not FILENAME.fullmatch(stem)
                        or not stem.startswith(group.removeprefix("_bee_"))
                        or ext != ".jpg" or stem + ".txt" != r["label_filename"]):
                    raise ValueError("invalid source pair")
                groups[group] += 1
                for kind in ("image", "label"):
                    match = URL_PATTERN.fullmatch(r[kind + "_url"])
                    name = r[kind + "_filename"]
                    if not match or match[1] in wanted or name in names:
                        raise ValueError("invalid or duplicate requested file")
                    wanted[match[1]] = (group, kind + "s", name)
                    names.add(name)
    if groups != {group: 12 for group in GROUP_COUNTS}:
        raise ValueError("incomplete Work registry")
    return wanted


def collect(directory, wanted):
    folders = read_listing(directory / "folders.json", 1000)
    by_id = {uuid_string(f["id"]): f for f in folders}
    if len(by_id) != len(folders):
        raise ValueError("duplicate folder UUID")
    children = {}
    for f in folders:
        key = (f.get("parent_id"), f["name"])
        if key in children:
            raise ValueError("ambiguous folder path")
        children[key] = f["id"]
    root = children[None, "detection"]
    by_folder = {}
    for uid, (group, category, name) in wanted.items():
        folder = children[children[root, group], category]
        by_folder.setdefault(folder, {})[uid] = name

    records = {}
    for folder, requested in by_folder.items():
        # At most 1320 published detection images per group, 1000 per page.
        for offset in (0, 1000):
            page = directory / f"{folder}-{offset}.json"
            if offset and not page.exists() and requested.keys() <= records.keys():
                break
            listing = read_listing(page, 1000)
            for item in listing:
                if item.get("folder_id") != folder:
                    raise ValueError("file in wrong versioned folder listing")
                uid = item["id"]
                if uid not in wanted:
                    continue
                if uid in records or requested.get(uid) != item.get("filename"):
                    raise ValueError("duplicate file or source identity conflict")
                content = item["content_details"]
                size = content["size"]
                url = URL_PATTERN.fullmatch(content["download_url"])
                if (item["status"] != "COMPLETED" or not url or url[1] != uid
                        or type(size) is not int or size <= 0 or type(item["size"]) is not int
                        or size != item["size"] or not SHA.fullmatch(content["sha256_hash"])):
                    raise ValueError("invalid publisher content metadata")
                records[uid] = (uid, item["filename"], folder, uuid_string(content["id"]),
                                size, content["sha256_hash"], "listed_v6")
            if len(listing) < 1000:
                break
    if records.keys() != wanted.keys():
        raise ValueError("missing publisher file")
    return sorted(records.values(), key=lambda row: row[1])


def publish(rows, path):
    text = io.StringIO(newline="")
    writer = csv.writer(text, lineterminator="\n")
    writer.writerow(FIELDS)
    writer.writerows(rows)
    fd, temporary_path = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(text.getvalue().encode("utf-8"))
        os.link(temporary_path, path)
    finally:
        os.unlink(temporary_path)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("metadata_directory", type=Path)
    parser.add_argument("output_csv", type=Path)
    args = parser.parse_args()
    try:
        publish(collect(args.metadata_directory, repository_requests()), args.output_csv)
    except (KeyError, TypeError, ValueError, OSError) as exc:
        parser.exit(1, f"Publisher metadata rejected: {exc}\n")


if __name__ == "__main__":
    main()
