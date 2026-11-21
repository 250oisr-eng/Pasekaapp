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

EXPECTED_ARCHIVE_SHA256 = {
    64894983: "a92a0976bdbaeb5fa0dbd665ccc2107ee6c1089bde3367dfe0cf6a00fa723968",
    64894986: "fb79d8bb77cdedd394713d56396755314fa6446ecc2795dbce62a9da3109cd8b",
}

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
    file_id = int(download_url.rsplit("/", 1)[-1])
    if h256.hexdigest() != EXPECTED_ARCHIVE_SHA256[file_id]:
        raise ValueError("original ZIP SHA256 differs from independently pinned byte-audit")
    return {"bytes": got, "publisherMd5VerifiedAgainstBytes": True,
            "originalSha256": h256.hexdigest()}


def read_annotation_structure(zip_path):
    """Read YOLO text labels without exporting image bytes or event decisions.

    Returns only counts; class field could be a detection class or bee_N
    identity; no mapping to physical entry/exit is inferred.
    """
    import math
    from collections import Counter
    from pathlib import PurePosixPath

    def normalized_pair_id(filename):
        p = PurePosixPath(filename)
        return "/".join(part for part in p.parts[:-1]
                        if part.lower() not in ("images", "labels")) + "/" + p.stem

    rows = 0
    malformed = 0
    geometry_invalid = 0
    empty_label_files = 0
    arities = Counter()
    classes = Counter()
    pairs_images, pairs_labels = set(), set()
    with zipfile.ZipFile(zip_path) as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            p = PurePosixPath(entry.filename)
            ext = p.suffix.lower()
            if ext == ".jpg":
                pairs_images.add(normalized_pair_id(entry.filename))
                continue
            if ext != ".txt":
                continue
            pairs_labels.add(normalized_pair_id(entry.filename))
            if entry.file_size > 128 * 1024:
                raise ValueError("source label file unexpectedly large")
            raw = archive.read(entry)
            try:
                lines = raw.decode("utf-8-sig").splitlines()
            except UnicodeError as e:
                raise ValueError("published source has non-UTF-8 YOLO label") from e
            if not any(line.strip() for line in lines):
                empty_label_files += 1
            for line in lines:
                if not line.strip():
                    continue
                rows += 1
                fields = line.split()
                arities[str(len(fields))] += 1
                if len(fields) != 5:
                    malformed += 1
                    continue
                label = fields[0]
                if label.isascii() and label.isdecimal():
                    classes["numeric_class"] += 1
                elif label.startswith("bee_") and label[4:].isascii() and label[4:].isdecimal():
                    classes["bee_identity_class"] += 1
                else:
                    classes["unrecognized_class"] += 1
                try:
                    cx, cy, w, h = [float(token) for token in fields[1:]]
                except ValueError:
                    malformed += 1
                    continue
                if (not all(math.isfinite(x) for x in (cx,cy,w,h))
                        or not (0 <= cx <= 1 and 0 <= cy <= 1 and 0 < w <= 1 and 0 < h <= 1)
                        or cx-w/2 < -1e-6 or cy-h/2 < -1e-6
                        or cx+w/2 > 1+1e-6 or cy+h/2 > 1+1e-6):
                    geometry_invalid += 1
    return {
        "annotatedRows": rows,
        "emptyLabelFiles": empty_label_files,
        "columnCounts": dict(sorted(arities.items())),
        "classTokenCategories": dict(sorted(classes.items())),
        "nonFiveColumnRows": malformed,
        "geometryOutOfBoundsRows": geometry_invalid,
        "pairedJpgTxtFiles": len(pairs_images & pairs_labels),
        "unpairedJpgFiles": len(pairs_images - pairs_labels),
        "unpairedTxtFiles": len(pairs_labels - pairs_images),
        "physicalInOutEventsValidated": False,
    }


def audit_cross_archive_jpg_byte_overlap(detection_zip, tracking_zip):
    """Exact frame-byte identity only: differs from visual similarity/session ID."""
    def jpg_hashes(zip_file):
        hashes = {}
        count = 0
        with zipfile.ZipFile(zip_file) as archive:
            for entry in archive.infolist():
                if entry.is_dir() or not entry.filename.lower().endswith(".jpg"):
                    continue
                if entry.file_size > MAX_MEMBER_BYTES:
                    raise ValueError("oversized source JPG")
                h = hashlib.sha256(archive.read(entry)).hexdigest()
                hashes[h] = hashes.get(h, 0) + 1
                count += 1
        return hashes, count

    a, na = jpg_hashes(detection_zip)
    b, nb = jpg_hashes(tracking_zip)
    shared = set(a) & set(b)
    return {
        "detectionImages": na,
        "trackingImages": nb,
        "uniqueDetectionJpgSha256": len(a),
        "uniqueTrackingJpgSha256": len(b),
        "sharedExactJpgSha256": len(shared),
        "detectionFramesWithExactMatchInTracking": sum(a[h] for h in shared),
        "trackingFramesWithExactMatchInDetection": sum(b[h] for h in shared),
        "independentTrainingValidationSplitEstablished": False,
        "imageVisualOrSessionIndependenceProved": False,
        "realInOutEventLabelsEstablished": False,
    }


def audit_original_archives():
    metadata = audit()
    if not metadata["publisherDatasetLicenseMetadataVerified"]:
        raise ValueError("data license not verified")
    report = {}
    with tempfile.TemporaryDirectory(prefix="paseka-public-native-bee-") as tmp:
        archives_by_id = {}
        for fid, (name, size, md5) in EXPECTED_FILES.items():
            local = Path(tmp) / name
            url = "https://ndownloader.figshare.com/files/" + str(fid)
            archives_by_id[fid] = local
            record = download_checked_archive(url, local, size, md5)
            record["zip"] = inspect_zip(local)
            record["annotationStructure"] = read_annotation_structure(local)
            report[name] = record
        cross_overlap = audit_cross_archive_jpg_byte_overlap(
            archives_by_id[64894983], archives_by_id[64894986])
    return {
        "publisherArticle": "https://api.figshare.com/v2/articles/32315067",
        "license": metadata["publisherDatasetLicense"],
        "sourceSpecies": metadata["speciesReportedByPublisher"],
        "sourceArchiveBytesChecked": True,
        "archives": report,
        "crossArchiveExactJpgOverlap": cross_overlap,
        "realBeeInOutGroundTruthEstablished": False,
        "sourceVideosProvedPresentAndCalibrated": False,
        "onDeviceDetectorAccuracyMeasured": False,
        "videoCleanupAuthorized": False,
    }


if __name__ == "__main__":
    print(json.dumps(audit_original_archives(), indent=2, sort_keys=True))
