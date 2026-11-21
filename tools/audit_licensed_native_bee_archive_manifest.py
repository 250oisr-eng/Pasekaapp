"""Optional REAL archive byte audit of the separate CC BY 4.0 native-bee dataset.

Downloads exact two Monash/figshare ZIPs into an ephemeral temporary directory,
checks publisher MD5 against actual bytes, ZIP CRC/safety, counts only file types
and byte digests. NO unpacking, training, in/out prediction, media publication,
user-data access, event labels export or cleanup permission.

Source species Tetragonula carbonaria != Apis mellifera.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import tempfile
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import zipfile

from audit_licensed_native_bee_dataset_metadata import EXPECTED_FILES, audit

MAX_ZIP_BYTES = 128 * 1024 * 1024
MAX_MEMBER_BYTES = 32 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024
MAX_MEMBERS = 20000


class HTTPSOnlyRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        if urlsplit(newurl).scheme != "https":
            raise ValueError("publisher download redirected off HTTPS")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def inspect_zip(filename):
    """Validate archive member paths/CRC without extracting published media."""
    counters = {}
    total = 0
    stems = set()
    with zipfile.ZipFile(filename, "r") as source:
        members = source.infolist()
        if not 0 < len(members) <= MAX_MEMBERS:
            raise ValueError("unexpected ZIP entry count")
        for item in members:
            name = item.filename
            p = PurePosixPath(name)
            if (not name or name.startswith("/") or "\\" in name or
                    ".." in p.parts or p.is_absolute() or ":" in p.parts[0]):
                raise ValueError("unsafe ZIP member path")
            if name in stems:
                raise ValueError("duplicate ZIP member name")
            stems.add(name)
            mode = (item.external_attr >> 16)
            if stat.S_ISLNK(mode) or (item.flag_bits & 0x1):
                raise ValueError("symlink or encrypted ZIP member")
            if item.is_dir():
                continue
            if item.file_size > MAX_MEMBER_BYTES:
                raise ValueError("oversized member; no decompression")
            total += item.file_size
            if total > MAX_UNCOMPRESSED_BYTES:
                raise ValueError("ZIP uncompressed bytes cap exceeded")
            ext = p.suffix.lower() or "(none)"
            counters[ext] = counters.get(ext, 0) + 1
        failed = source.testzip()
        if failed is not None:
            raise ValueError("ZIP CRC verification failed")
    return {"members": len(members), "filesByExtension": dict(sorted(counters.items())),
            "sumUncompressedBytes": total,
            "containsMp4": counters.get(".mp4", 0) > 0}


def download_checked_archive(download_url, dest, expected_size, expected_md5, *,
                             opener=None):
    """Only two original publisher file IDs; stream and verify source bytes."""
    valid = {"https://ndownloader.figshare.com/files/" + str(fid): (size, md5)
             for fid, (_, size, md5) in EXPECTED_FILES.items()}
    if download_url not in valid or valid[download_url] != (expected_size, expected_md5):
        raise ValueError("unapproved archive download URL or publisher identity")
    if not 0 < expected_size <= MAX_ZIP_BYTES:
        raise ValueError("publisher archive size over cap")
    opener = opener or build_opener(HTTPSOnlyRedirect())
    request = Request(download_url, headers={"User-Agent": "Paseka-Pinned-Dataset-Audit/1",
                  "Accept-Encoding": "identity"}, method="GET")
    h256, hmd5 = hashlib.sha256(), hashlib.md5()
    got = 0
    with opener.open(request, timeout=60) as response, open(dest, "wb") as out:
        if response.status != 200 or urlsplit(response.geturl()).scheme != "https":
            raise ValueError("archive fetch not successful HTTPS")
        if response.headers.get("Content-Encoding", "identity").lower() != "identity":
            raise ValueError("unexpected archive content encoding")
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            got += len(block)
            if got > expected_size or got > MAX_ZIP_BYTES:
                raise ValueError("download exceeded exact source size")
            out.write(block)
            h256.update(block)
            hmd5.update(block)
    if got != expected_size or hmd5.hexdigest() != expected_md5:
        raise ValueError("download bytes differ from publisher-pinned MD5 and size")
    return {"bytes": got, "publisherMd5VerifiedAgainstBytes": True,
            "originalSha256": h256.hexdigest()}


def audit_original_archives():
    metadata = audit()
    if not metadata["publisherDatasetLicenseMetadataVerified"]:
        raise ValueError("data license not verified")
    report = {}
    with tempfile.TemporaryDirectory(prefix="paseka-public-native-bee-") as tmp:
        for fid, (name, size, md5) in EXPECTED_FILES.items():
            local = Path(tmp) / name
            url = "https://ndownloader.figshare.com/files/" + str(fid)
            record = download_checked_archive(url, local, size, md5)
            record["zip"] = inspect_zip(local)
            report[name] = record
    return {
        "publisherArticle": "https://api.figshare.com/v2/articles/32315067",
        "license": metadata["publisherDatasetLicense"],
        "sourceSpecies": metadata["speciesReportedByPublisher"],
        "sourceArchiveBytesChecked": True,
        "archives": report,
        "realBeeInOutGroundTruthEstablished": False,
        "sourceVideosProvedPresentAndCalibrated": False,
        "onDeviceDetectorAccuracyMeasured": False,
        "videoCleanupAuthorized": False,
    }


if __name__ == "__main__":
    print(json.dumps(audit_original_archives(), indent=2, sort_keys=True))
