"""Read-only audit of two real public bee traffic event annotation CSV tables.

Source: Nieves-Rivera et al. (2026), Github lablluberes/beeClassificationMethods.
Two published CSV files contain author-reported event labels; this code DOES NOT
reclassify, assume a ground-truth subset, train models or authorize reuse.

Only aggregate counts go to stdout; no raw annotations, media or user data saved.
"""
import csv
import hashlib
import io
import json
from collections import Counter
from urllib.request import Request, urlopen

COMMIT = "295948bb398054684b7b92c18b7bb44ba37566af"
BASE = "https://raw.githubusercontent.com/lablluberes/beeClassificationMethods/" + COMMIT + "/"
SOURCE = (
    ("original", "month_data/5seconds_20260406_234425.csv",
     159902, "b02663d45fc9fdc5bf8cfe028abc1ed5544c02b0"),
    ("alternative", "month_data/5seconds_remi_frames_20260407_135801.csv",
     170808, "cc83cb300fbbac37f9fe8701c269b2ad66514f91"),
)
FIELDS = frozenset((
    "group_id", "event", "ambiguousflag", "track_id", "filename", "video",
    "frame", "datetime", "tagid", "mergethreshold", "eventid",
    "short_interruption", "complex", "comment", "error", "to_review",
    "labelbee_valid",
))
LABELS = frozenset(("", "x", "D", "U", "DU", "UD"))
SHA256_PINS = {
    "original": "8d5ef1db7e742849d018c79ab8ad27cf3828518750e68aacac22ee1bf2b70d07",
    "alternative": "51cbd31c6638dac8ebbc2b0069b441aec64bb5355edd52351ea70a45cecea059",
}
ROWS = 1422
CAP = 192 * 1024


def verify_git_blob(data, size, blob_sha, expected_sha256=None):
    """Bound source to exact immutable Git blob (does not verify legal rights)."""
    if type(data) is not bytes or not 0 < len(data) <= CAP or len(data) != size:
        raise ValueError("unexpected public annotation source size")
    digest = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
    if digest != blob_sha:
        raise ValueError("published Git blob differs from pinned source")
    sha256 = hashlib.sha256(data).hexdigest()
    if expected_sha256 is not None and sha256 != expected_sha256:
        raise ValueError("original CSV SHA-256 changed")
    return {"bytes": len(data), "gitBlobSha1": digest,
            "sourceSha256": sha256}


def fetch_exact_public_source(path, max_bytes=CAP):
    """No unpinned URL input, cookies or credentials; no off-host redirects."""
    if path not in {item[1] for item in SOURCE}:
        raise ValueError("unapproved public annotation path")
    url = BASE + path
    req = Request(url, headers={"User-Agent": "Paseka-Source-Audit/1",
                                "Accept-Encoding": "identity"}, method="GET")
    with urlopen(req, timeout=20) as response:
        if response.status != 200 or response.geturl() != url:
            raise ValueError("source URL changed, redirected or not successful")
        if response.headers.get("Content-Encoding", "identity").lower() != "identity":
            raise ValueError("encoded public source not accepted")
        data = response.read(max_bytes + 1)
    if not 0 < len(data) <= max_bytes:
        raise ValueError("public source exceeded cap or is empty")
    return data


def parse_events_csv(data):
    """Strictly parse the original strings, NOT interpretations of U/D or x."""
    if type(data) is not bytes or not 0 < len(data) <= CAP:
        raise ValueError("invalid CSV bytes")
    try:
        decoded = data.decode("utf-8-sig")
    except UnicodeError as exc:
        raise ValueError("invalid CSV encoding") from exc
    try:
        csv.field_size_limit(20000)
        reader = csv.DictReader(io.StringIO(decoded, newline=""), strict=True)
        if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError("CSV headers missing or duplicated")
        if set(reader.fieldnames) != FIELDS:
            raise ValueError("CSV columns differ from published source")
        data_rows = list(reader)
    except csv.Error as exc:
        raise ValueError("invalid CSV quoting") from exc
    if len(data_rows) != ROWS:
        raise ValueError("published row coverage differs")
    results = {}
    for item in data_rows:
        if None in item or any(type(v) is not str for v in item.values()):
            raise ValueError("missing or excess CSV cells")
        raw = item["group_id"]
        if not raw.isascii() or not raw.isdecimal() or raw != str(int(raw)):
            raise ValueError("noncanonical group id")
        group = int(raw)
        if not 0 <= group < ROWS or group in results:
            raise ValueError("duplicate or out-of-range group id")
        if item["event"] not in LABELS:
            raise ValueError("unknown manual classification label")
        if not item["video"].endswith(".cfr.mp4") or len(item["video"]) > 128:
            raise ValueError("unexpected source video reference")
        if not item["eventid"] or len(item["eventid"]) > 128:
            raise ValueError("missing or oversize event identifier")
        results[group] = item
    if set(results) != set(range(ROWS)):
        raise ValueError("missing published row ids")
    return results


def summarize_table(rows):
    return {
        "rows": len(rows),
        "eventCodeCounts": dict(sorted(Counter(x["event"] for x in rows.values()).items())),
        "referencedVideoNames": len({x["video"] for x in rows.values()}),
        "nonEmptyQualityFieldCounts": {
            field: sum(bool(x[field].strip()) for x in rows.values())
            for field in ("ambiguousflag", "short_interruption", "complex",
                          "error", "to_review", "labelbee_valid")
        },
    }


def compare_source_tables(first, second):
    if set(first) != set(second):
        raise ValueError("published group IDs not comparable")
    label_changes = Counter()
    eventid_changed = 0
    video_changed = 0
    for key in sorted(first):
        a, b = first[key], second[key]
        if a["event"] != b["event"]:
            label_changes[(a["event"], b["event"])] += 1
        eventid_changed += a["eventid"] != b["eventid"]
        video_changed += a["video"] != b["video"]
    return {
        "sameGroupIdRows": len(first),
        "eventLabelsChangedByGroupId": sum(label_changes.values()),
        "eventCodeTransitions": [
            {"from": a, "to": b, "rows": number}
            for (a, b), number in sorted(label_changes.items())
        ],
        "eventIdChangedByGroupId": eventid_changed,
        "videoNameChangedByGroupId": video_changed,
        "isOneTableAnAuthoritativelyConfirmedFinalVersion": False,
        "final1194EventSubsetIdentified": False,
    }


def audit(fetch=fetch_exact_public_source):
    tables, checks = {}, {}
    for name, path, size, gitsha in SOURCE:
        original = fetch(path)
        checks[name] = verify_git_blob(original, size, gitsha, SHA256_PINS[name])
        tables[name] = parse_events_csv(original)
    return {
        "sourcePaper": "Nieves-Rivera et al. 2026, doi:10.3390/informatics13050065",
        "originalRepositoryCommit": COMMIT,
        "sourceGitRepositoryLicenseFileFound": False,
        "permissionToRedistributeSourceEventsVerified": False,
        "sourceFiles": checks,
        "sourceTables": {name: summarize_table(rows) for name, rows in tables.items()},
        "crossTableComparison": compare_source_tables(tables["original"], tables["alternative"]),
        "labelCodebookIndependentlyVerified": False,
        "manualEventGroundTruthIndependentOfModelVerified": False,
        "physicalVideoSourceBytesVerified": False,
        "final1194EventSubsetReproduced": False,
        "independentValidationAuthorized": False,
        "modelTrainingAuthorized": False,
        "realBeeTrafficAccuracyMeasured": False,
        "beeRecognitionSucceeded": False,
        "videoCleanupAuthorized": False,
    }


if __name__ == "__main__":
    print(json.dumps(audit(), ensure_ascii=False, indent=2, allow_nan=False))
