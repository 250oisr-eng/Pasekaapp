"""Bounded HTTP byte-range feasibility probe for a real Apis mellifera ZIP.

Only fixed official Zenodo v2 original 2GB source archive. NEVER fall back to
full download. Source dataset md5 *as stated by publisher* is not verified by
a 1-byte probe. No user data, model, inference, training or media cleanup.
"""
import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

DOI = "10.5281/zenodo.23276947"
SOURCE_SPECIES = "Apis mellifera"
SOURCE_LICENSE = "CC BY 4.0"
SOURCE_ARCHIVE = "dataset_2823_images_labels.zip"
ZENODO_URL = "https://zenodo.org/records/23276947/files/dataset_2823_images_labels.zip?download=1"
PUBLISHER_MD5_UNVERIFIED = "3b1dfaed60310045358a6e4391df89cc"
MAX_ARCHIVE_BYTES = 4 * 1024 ** 3 - 1
CONTENT_RANGE = re.compile(r"bytes 0-0/([1-9][0-9]*)\Z")


def probe_range_support(url=ZENODO_URL, opener=None):
    if url != ZENODO_URL:
        raise ValueError("only exact official Zenodo record and original ZIP allowed")
    opener = opener or build_opener()
    request = Request(url, headers={
        "Range": "bytes=0-0",
        "Accept-Encoding": "identity",
        "User-Agent": "Paseka-Apis-Mellifera-Public-Range-Probe/1",
    }, method="GET")
    result = {
        "sourceDoi": DOI, "publisherReportedSpecies": SOURCE_SPECIES,
        "publisherDatasetLicense": SOURCE_LICENSE,
        "publisherClaimedOriginalArchiveMd5NotVerified": PUBLISHER_MD5_UNVERIFIED,
        "originalZipBytesDownloadedFully": False,
        "originalZipPublisherMd5Verified": False,
        "originalJpgBytesVerified": False,
        "originalYoloTxtVerified": False,
        "independentVideoSessionEstablished": False,
        "realInOutGroundTruthEstablished": False,
        "modelTrainingAuthorized": False,
        "userVideoCleanupAuthorized": False,
        "rangeSupported": False,
    }
    try:
        with opener.open(request, timeout=25) as response:
            result["httpStatus"] = response.status
            if response.status != 206:
                result["blockReason"] = "source did not return HTTP 206: NOT downloading full ZIP"
                return result
            if response.headers.get("Content-Encoding", "identity") != "identity":
                raise ValueError("unexpected encoded source response")
            c = response.headers.get("Content-Range", "")
            m = CONTENT_RANGE.fullmatch(c)
            if not m:
                raise ValueError("missing or invalid HTTP Content-Range")
            total = int(m.group(1))
            if total > MAX_ARCHIVE_BYTES:
                raise ValueError("unsupported archive size")
            data = response.read(2)
            if len(data) != 1:
                raise ValueError("HTTP 206 returned wrong 1-byte payload")
            if data != b"P":
                raise ValueError("ZIP missing PK header prefix at offset 0")
            result["rangeSupported"] = True
            result["publisherArchiveBytesFromContentRange"] = total
            result["firstZipByteOnlyChecked"] = True
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        result["blockReason"] = "official source byte-range request unavailable: " + type(exc).__name__
    return result


if __name__ == "__main__":
    print(json.dumps(probe_range_support(), indent=2, ensure_ascii=False))
