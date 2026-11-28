"""Verify the exact Russian Vosk ZIP; never extract or run model files."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile

MANIFEST = Path(__file__).resolve().parents[1] / "android-native" / "voice-model-source.json"


def verify(archive, manifest):
    archive = Path(archive)
    root = manifest["model"]
    expected = manifest["sha256"]
    if not re.fullmatch(r"[a-f0-9]{64}", expected):
        raise ValueError("invalid pinned SHA-256")
    size = archive.stat().st_size
    if not 0 < size <= manifest["maxArchiveBytes"]:
        raise ValueError("archive size outside limit")
    digest = hashlib.sha256()
    with archive.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise ValueError("official ZIP differs from pinned SHA-256; no install")
    required = set(manifest["requiredFiles"])
    seen, files = set(), {}
    expanded = 0
    with zipfile.ZipFile(archive) as model_zip:
        for index, info in enumerate(model_zip.infolist(), 1):
            if index > manifest["maxEntries"]:
                raise ValueError("too many ZIP entries")
            name = info.orig_filename
            path = PurePosixPath(name)
            parts = name.rstrip("/").split("/")
            if (
                not name or path.is_absolute() or "\\" in name
                or "\x00" in name or any(part in ("", ".", "..") for part in parts)
                or parts[0] != root or name != info.filename
                or (len(parts) == 1 and not info.is_dir())
            ):
                raise ValueError("unsafe or unexpected ZIP path: " + repr(name))
            normalized = "/".join(parts)
            if normalized in seen:
                raise ValueError("duplicate ZIP entry: " + normalized)
            seen.add(normalized)
            mode = (info.external_attr >> 16) & 0xFFFF
            file_type = stat.S_IFMT(mode)
            if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise ValueError("nonregular ZIP entry: " + normalized)
            if (info.is_dir() and file_type == stat.S_IFREG) or (
                not info.is_dir() and file_type == stat.S_IFDIR
            ):
                raise ValueError("inconsistent ZIP entry type")
            if info.flag_bits & 1:
                raise ValueError("encrypted model ZIP entry")
            expanded += info.file_size
            if expanded > manifest["maxExpandedBytes"]:
                raise ValueError("expanded ZIP exceeds limit")
            if not info.is_dir():
                files["/".join(parts[1:])] = info.file_size
        missing = sorted(name for name in required if files.get(name, 0) <= 0)
        if missing:
            raise ValueError("missing or empty model files: " + ", ".join(missing))
        bad = model_zip.testzip()
        if bad:
            raise ValueError("ZIP CRC mismatch: " + bad)
    return {
        "model": root, "sha256": digest.hexdigest(), "archiveBytes": size,
        "expandedBytes": expanded, "fileCount": len(files),
        "requiredFilesVerified": sorted(required),
        "zipCrcVerified": True, "extracted": False,
        "speechRecognitionTested": False, "deviceTested": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    report = verify(args.archive, manifest)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
