"""Real, read-only audit of publisher-linked Apis mellifera five-fold split LISTS.

Pinned upstream GitHub repository Soda0603/varroa-in-hive-imaging,
commit 136cc6fefa993719131128132bb7c0a4deccbad9, Zenodo DOI
10.5281/zenodo.23276947 (CC BY 4.0). Downloads only ten original
train/val *.txt and license/verification metadata, each checked by the
original Git blob SHA1. No ~2GB original photos, model weights,
inference, training, user video or deletion.

IMPORTANT: date is a YYYYMMDD parsed from filename, not verified session ID.
A split can have no duplicate filename yet leak capture days.
"""
import csv
import hashlib
import io
import json
import re
from collections import Counter
from urllib.request import HTTPRedirectHandler, Request, build_opener

OWNER_REPO = "Soda0603/varroa-in-hive-imaging"
PINNED_COMMIT = "136cc6fefa993719131128132bb7c0a4deccbad9"
SOURCE_DOI = "10.5281/zenodo.23276947"
SOURCE_SPECIES = "Apis mellifera"
SOURCE_LICENSE = "CC BY 4.0"
ROOT = f"https://raw.githubusercontent.com/{OWNER_REPO}/{PINNED_COMMIT}"
# Github source Git blob sha1 values are pinned separately from network payloads.
SPLIT_BLOBS = {
    "splits/fold-1-train.txt": ("22d0ad5e4d54c96178a871e72e5f993c7b4f06f4", 2254),
    "splits/fold-1-val.txt": ("0baad29153ac1edf50d796c49c5737e27427979e", 569),
    "splits/fold-2-train.txt": ("d2159d56795d1fff0412b6902fd3be46342c7513", 2257),
    "splits/fold-2-val.txt": ("5e6bd5b774aac669cdf0db6db8306cb1a92541d4", 566),
    "splits/fold-3-train.txt": ("e029ac7313d669cd455104ecf84eac32095d2475", 2258),
    "splits/fold-3-val.txt": ("cd15a3c6c5a49a3b3579a0d1a90d53a8575c177a", 565),
    "splits/fold-4-train.txt": ("4266ba657873760d55f9accc1a8f565bded71019", 2260),
    "splits/fold-4-val.txt": ("64e3e26f333ef0236ef39df2179f51024e42c99f", 563),
    "splits/fold-5-train.txt": ("af9d433d3c784497e88873ce5416ecef0fb76ca4", 2263),
    "splits/fold-5-val.txt": ("a5082a6606c0ba8760a282eee469ff64418e2835", 560),
}
EXTRA_BLOBS = {
    "LICENSE": "4bf1ca8c192bb770d35eac98a87c064c51c377f5",
    "README.md": "64a69a253b7dd273d60092fbb8f278418053df20",
    "verification/inhive_class1_verification.csv": "06e25891e8d52c49322b3091118a7499cf2bb9fb",
}
SINGLE_FILE_LIMIT = 160 * 1024
FRAME_NAME = re.compile(r"^\./mydataset/all/([^/\r\n]+\.jpg)$")
DAY_TOKEN = re.compile(r"^img-(20\d{6})_\d{6}--\d+\.jpg$")


class RejectRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise ValueError("unexpected redirect from pinned raw GitHub source")


def git_blob_sha1(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def fetch_pinned_text(path, *, opener=None):
    if path not in SPLIT_BLOBS and path not in EXTRA_BLOBS:
        raise ValueError("only pinned original source files permitted")
    opener = opener or build_opener(RejectRedirect())
    request = Request(ROOT + "/" + path, method="GET",
                      headers={"User-Agent": "Paseka-Apis-Independent-Split-Audit/1",
                               "Accept-Encoding": "identity"})
    with opener.open(request, timeout=25) as response:
        if (response.status != 200 or response.geturl() != request.full_url
                or response.headers.get("Content-Encoding", "identity") != "identity"):
            raise ValueError("source fetch status/location not reproducible")
        raw = response.read(SINGLE_FILE_LIMIT + 1)
    if len(raw) == 0 or len(raw) > SINGLE_FILE_LIMIT:
        raise ValueError("source bytes exceed permitted metadata-only cap")
    expected = SPLIT_BLOBS.get(path, (EXTRA_BLOBS.get(path),))[0]
    if git_blob_sha1(raw) != expected:
        raise ValueError("published original Git blob SHA1 mismatch")
    try:
        return raw.decode("utf-8")
    except UnicodeError as exc:
        raise ValueError("source metadata not UTF-8") from exc


def parse_split(text):
    if type(text) is not str:
        raise ValueError("text required")
    result = []
    seen = set()
    for line in text.splitlines():
        if not line or line != line.strip():
            raise ValueError("blank or malformed split line")
        match = FRAME_NAME.fullmatch(line)
        if not match:
            raise ValueError("unrecognized split image path")
        image = match.group(1)
        if image in seen:
            raise ValueError("duplicate image in one split")
        seen.add(image)
        result.append(image)
    if not result:
        raise ValueError("split file unexpectedly empty")
    return result


def date_from_image_name(image_name):
    match = DAY_TOKEN.fullmatch(image_name)
    return match.group(1) if match else None


def verify_author_metadata(license_text, readme, class1_csv):
    if (not license_text.startswith("Creative Commons Attribution 4.0 International (CC BY 4.0)")
            or "images and weights distributed with the Zenodo" not in license_text
            or "the same licence applies" not in license_text):
        # Pin of LICENSE is the authoritative proof; textual sanity check secondary.
        if ("The same licence applies to the images and weights" not in license_text
                or "Creative Commons Attribution 4.0" not in license_text):
            raise ValueError("source license does not verify dataset")
    if ("2,795" not in readme or "2,823" not in readme or "28" not in readme
            or "Apis mellifera" not in readme and "honey bee" not in readme and "honeybee" not in readme
            or "only **3 of the 23**" not in readme):
        # README calls these honey bees; Zenodo publisher metadata confirms taxonomy.
        raise ValueError("source README statistics/safety warning changed")
    rows = list(csv.DictReader(io.StringIO(class1_csv)))
    if len(rows) != 23 or any(r.get("class1_boxes") != "1" for r in rows):
        raise ValueError("author class-1 verification manifest changed")
    yes = sum(r.get("mite_visible_on_re_inspection") == "Y" for r in rows)
    no = sum(r.get("mite_visible_on_re_inspection") == "N" for r in rows)
    if (yes, no) != (3, 20):
        raise ValueError("in-hive mite class verification counts changed")
    return {"authorVerifiedInHivePositiveBeeWithMite": yes,
            "authorUnconfirmedInHivePositiveLabels": no,
            "unverifiedInHiveClass1CannotBeGT": True}


def audit_pinned_split_files(fetch=fetch_pinned_text):
    contents = {name: fetch(name) for name in (*SPLIT_BLOBS, *EXTRA_BLOBS)}
    verification = verify_author_metadata(
        contents["LICENSE"], contents["README.md"],
        contents["verification/inhive_class1_verification.csv"])
    folds = []
    val_membership = Counter()
    catalog = None
    all_dates = set()
    for fold in range(1, 6):
        paths = [f"splits/fold-{fold}-{split}.txt" for split in ("train", "val")]
        data = [parse_split(contents[path]) for path in paths]
        for path, items in zip(paths, data):
            if len(items) != SPLIT_BLOBS[path][1]:
                raise ValueError("unexpected number of source split rows")
        train, val = set(data[0]), set(data[1])
        if train & val:
            raise ValueError("exact image identifier leaked train vs val in one fold")
        if len(train | val) != 2823:
            raise ValueError("fold missing or invented image identifiers")
        if catalog is None:
            catalog = train | val
        elif catalog != train | val:
            raise ValueError("folds describe inconsistent source image inventories")
        val_membership.update(val)
        day_train = {date_from_image_name(i) for i in train} - {None}
        day_val = {date_from_image_name(i) for i in val} - {None}
        all_dates |= day_train | day_val
        overlap = sorted(day_train & day_val)
        if not overlap:
            raise ValueError("source unexpectedly has no same-day train/val overlap")
        folds.append({
            "fold": fold, "trainImages": len(train), "valImages": len(val),
            "trainValExactFilenameOverlap": 0,
            "trainCaptureDateCountByFilename": len(day_train),
            "validationCaptureDateCountByFilename": len(day_val),
            "sharedCaptureDatesByFilename": overlap,
            "allPublishedDatesSharedWithinFold": day_train == day_val,
            "handheldNonTimestampedTrainCount": sum(date_from_image_name(i) is None for i in train),
            "handheldNonTimestampedValCount": sum(date_from_image_name(i) is None for i in val),
        })
    if (len(catalog) != 2823 or len(val_membership) != 2823
            or any(count != 1 for count in val_membership.values())):
        raise ValueError("five-fold out-of-fold image coverage invalid")
    if len(all_dates) != 9 or not all(f["allPublishedDatesSharedWithinFold"] for f in folds):
        raise ValueError("publisher split date inventory differs from pinned expected case")
    return {
        "publisher": "Su et al. Zenodo v2 / authored GitHub snapshot",
        "doi": SOURCE_DOI,
        "scientificSpeciesFromZenodoPublisher": SOURCE_SPECIES,
        "datasetLicenseVerifiedFromPinnedAuthorRepo": SOURCE_LICENSE,
        "upstreamRepo": OWNER_REPO, "upstreamCommit": PINNED_COMMIT,
        "originalAuthorSplitTextGitBlobVerified": True,
        "authorVerificationCSVGitBlobVerified": True,
        "sourceImageCountByUniqueOriginalNames": len(catalog),
        "fiveFoldUniqueValidationCoverage": len(val_membership),
        "nineTimestampCaptureDatesFromFileNames": sorted(all_dates),
        "folds": folds, "positiveClassVerification": verification,
        "actualOriginalJpgBytesVerified": False,
        "captureDatesProvenSamePhysicalVideoSession": False,
        "captureDayIndependentTrainValidation": False,
        "sessionIndependentTrainValidation": False,
        "modelAccuracyMeasuredForPaseka": False,
        "realBeeEntranceInOutGroundTruthValidated": False,
        "beesWithMitesReliableGTInHive": False,
        "trainingApprovedForPaseka": False,
        "videoCleanupAuthorized": False,
    }


if __name__ == "__main__":
    print(json.dumps(audit_pinned_split_files(), indent=2, ensure_ascii=False))
