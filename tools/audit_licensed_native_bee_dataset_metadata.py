"""Read-only license/source metadata audit for a separate, public bee dataset.

Authority: Monash University, figshare article DOI:10.26180/32315067.v1.
This checks published JSON metadata, NOT source ZIP bytes, bee detections,
direction annotations, user videos, source-video provenance or model accuracy.
Only two exact public HTTPS metadata endpoints are used. No third-party APIs.
"""
import json
import re
from urllib.request import HTTPRedirectHandler, Request, build_opener

ARTICLE_ID = 32315067
ARTICLE_URL = "https://api.figshare.com/v2/articles/32315067"
FILES_URL = ARTICLE_URL + "/files"
API_ALLOWLIST = frozenset((ARTICLE_URL, FILES_URL))
MAX_BYTES = 128 * 1024
SOURCE_DOI = "10.26180/32315067.v1"
SOURCE_TITLE = "Australian Native Bee Detection and Tracking Dataset"
EXPECTED_FILES = {
    64894983: ("native-bee-detection-dataset.zip", 98810212,
               "30c5261bf2a23668794d10ac8b040261"),
    64894986: ("native-bee-tracking-dataset.zip", 107325128,
               "9c87d57716c879c2b569196ba4197021"),
}
KNOWN_SPECIES = "Tetragonula carbonaria"
LICENSE = "CC BY 4.0"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise ValueError("unexpected redirect in publisher metadata")


def reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate publisher JSON key")
        result[key] = value
    return result


def parse_json(data):
    if type(data) is not bytes or not 0 < len(data) <= MAX_BYTES:
        raise ValueError("metadata size or binary type invalid")
    try:
        result = json.loads(data.decode("utf-8"), object_pairs_hook=reject_duplicate_keys)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("publisher metadata not valid UTF-8 JSON") from exc
    return result


def fetch_public_metadata(url):
    """Fetch metadata only; forbid redirected URLs and bodies above 128 KiB."""
    if url not in API_ALLOWLIST:
        raise ValueError("only exact figshare metadata endpoints allowed")
    opener = build_opener(NoRedirect())
    request = Request(url, headers={
        "Accept": "application/json", "Accept-Encoding": "identity",
        "User-Agent": "Paseka-Licensed-Dataset-Metadata-Audit/1",
    }, method="GET")
    with opener.open(request, timeout=15) as response:
        if (response.status != 200 or response.geturl() != url
                or response.headers.get("Content-Encoding", "identity") != "identity"):
            raise ValueError("unexpected publisher metadata HTTP response")
        return parse_json(response.read(MAX_BYTES + 1))


def audit_public_metadata(article, files):
    """Validate pinned publisher claims without downloading annotated images."""
    if type(article) is not dict or type(files) is not list:
        raise ValueError("invalid Figshare metadata response shapes")
    if (type(article.get("id")) is not int or article["id"] != ARTICLE_ID
            or type(article.get("version")) is not int or article["version"] != 1
            or article.get("doi") != SOURCE_DOI
            or article.get("title") != SOURCE_TITLE
            or article.get("status") != "public"
            or article.get("is_public") is not True
            or article.get("is_embargoed") is not False
            or article.get("defined_type_name") != "dataset"):
        raise ValueError("publisher dataset identity/visibility changed")
    license_info = article.get("license")
    if (type(license_info) is not dict
            or license_info.get("name") != LICENSE
            or license_info.get("url") != "https://creativecommons.org/licenses/by/4.0/"):
        raise ValueError("license cannot be established from publisher metadata")
    if len(files) != len(EXPECTED_FILES):
        raise ValueError("unexpected number of publisher archives")
    seen = set()
    for entry in files:
        if type(entry) is not dict or type(entry.get("id")) is not int:
            raise ValueError("invalid publisher file entry")
        file_id = entry["id"]
        if file_id not in EXPECTED_FILES or file_id in seen:
            raise ValueError("unknown/duplicate publisher file id")
        seen.add(file_id)
        name, size, checksum = EXPECTED_FILES[file_id]
        if (entry.get("name") != name or type(entry.get("size")) is not int
                or entry["size"] != size or entry.get("is_link_only") is not False
                or entry.get("mimetype") != "application/zip"
                or entry.get("download_url") != "https://ndownloader.figshare.com/files/" + str(file_id)
                or not re.fullmatch(r"[a-f0-9]{32}", entry.get("computed_md5") or "")
                or entry.get("computed_md5") != checksum
                or entry.get("supplied_md5") != checksum):
            raise ValueError("publisher archive metadata differs from pinned record")
    if seen != set(EXPECTED_FILES):
        raise ValueError("publisher archive coverage incomplete")
    return {
        "dataset": SOURCE_TITLE,
        "doi": SOURCE_DOI,
        "sourcePublisher": "Monash University / Figshare",
        "sourceArticleId": ARTICLE_ID,
        "sourceVersion": 1,
        "speciesReportedByPublisher": KNOWN_SPECIES,
        "honeyBeeApisMelliferaBenchmark": False,
        "publisherDatasetLicense": LICENSE,
        "publisherDatasetLicenseMetadataVerified": True,
        "attributionRequired": True,
        "archiveFileCount": len(EXPECTED_FILES),
        "publisherArchiveSizesBytes": {name: size for name, size, md5 in EXPECTED_FILES.values()},
        "publisherTotalArchiveSizeBytes": sum(x[1] for x in EXPECTED_FILES.values()),
        "publisherChecksumsRecordedNotVerifiedAgainstBytes": True,
        "sourceZipBytesVerified": False,
        "originalVideoBytesVerified": False,
        "eventDirectionGroundTruthVerified": False,
        "independentInOutAccuracyMeasured": False,
        "modelTrainingApprovedForPaseka": False,
        "runtimeModelApprovedForPaseka": False,
        "videoCleanupAuthorized": False,
    }


def audit(fetch=fetch_public_metadata):
    return audit_public_metadata(fetch(ARTICLE_URL), fetch(FILES_URL))


if __name__ == "__main__":
    print(json.dumps(audit(), ensure_ascii=False, indent=2, allow_nan=False))
