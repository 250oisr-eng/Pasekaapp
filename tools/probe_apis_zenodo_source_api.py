"""Read-only official Zenodo v2 record metadata and optional ZIP container API.

Never retrieves full 2GB ZIP or original image bytes. Checks signed publisher
record identity, species in author description and CC BY 4.0, source ZIP
metadata checksum/length; probes whether Zenodo supports internal ZIP member
listing via its documented InvenioRDM container endpoint. No credentials.
"""
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

RECORD_URL = "https://zenodo.org/api/records/23276947"
CONTAINER_URL = "https://zenodo.org/api/records/23276947/files/dataset_2823_images_labels.zip/container"
EXPECTED_DOI = "10.5281/zenodo.23276947"
EXPECTED_ZIP_SIZE = 2005232875
EXPECTED_ZIP_MD5_FROM_PUBLISHER = "3b1dfaed60310045358a6e4391df89cc"
ZIP_NAME = "dataset_2823_images_labels.zip"
MAX_METADATA = 1200000


def fetch_small_json(url, opener=None):
    if url not in (RECORD_URL, CONTAINER_URL):
        raise ValueError("only two official publisher metadata URLs permitted")
    opener = opener or build_opener()
    req = Request(url, method="GET", headers={
        "Accept": "application/json",
        "Accept-Encoding": "identity",
        "User-Agent": "Paseka-Apis-Mellifera-Source-API-Metadata/1",
    })
    try:
        with opener.open(req, timeout=20) as response:
            if response.status != 200:
                return {"available": False, "status": response.status}
            if not response.headers.get("Content-Type", "").lower().startswith("application/json"):
                return {"available": False, "status": 200, "reason": "not_JSON"}
            if response.headers.get("Content-Encoding", "identity") != "identity":
                return {"available": False, "status": 200, "reason": "unexpected_compression"}
            raw = response.read(MAX_METADATA + 1)
            if len(raw) > MAX_METADATA:
                return {"available": False, "status": 200, "reason": "response_oversized"}
            if not raw:
                return {"available": False, "status": 200, "reason": "empty_response"}
        return {"available": True, "status": 200, "metadata": json.loads(raw)}
    except HTTPError as exc:
        return {"available": False, "status": exc.code, "reason": "publisher_HTTP_error"}
    except (URLError, TimeoutError, OSError) as exc:
        return {"available": False, "reason": type(exc).__name__}


def publisher_record_summary(data):
    if not isinstance(data, dict) or data.get("id") not in ("23276947", 23276947):
        raise ValueError("publisher record ID mismatch")
    doi = data.get("pids", {}).get("doi", {}).get("identifier", data.get("doi"))
    if doi != EXPECTED_DOI:
        raise ValueError("Zenodo v2 DOI changed")
    meta = data.get("metadata") or {}
    desc = meta.get("description", "")
    if not isinstance(desc, str) or "Apis mellifera" not in desc:
        raise ValueError("Apis mellifera scientific species not documented in publisher metadata")
    # Zenodo legacy records expose metadata.license, recent RDM records use
    # metadata.rights[]. Both must be checked by exact CC BY 4.0 identifier.
    raw_rights = meta.get("rights", [])
    rights = raw_rights if isinstance(raw_rights, list) else [raw_rights]
    candidates = rights + [meta.get("license")]
    ids = [str(o.get("id", o.get("identifier", ""))).lower()
           for o in candidates if isinstance(o, dict)]
    if "cc-by-4.0" not in ids:
        # Only public source license IDs, not cookies or signed download URLs.
        raise ValueError("publisher dataset CC BY 4.0 rights mismatch; license_ids=" + repr(ids))
    # Legacy Zenodo record API: files[] list; InvenioRDM API: files.entries{}.
    raw_files = data.get("files")
    if isinstance(raw_files, list):
        matches = [f for f in raw_files
                   if isinstance(f, dict)
                   and f.get("key", f.get("filename")) == ZIP_NAME]
        if len(matches) != 1:
            raise ValueError("original ZIP is missing/duplicated in legacy publisher file list")
        entry = matches[0]
    elif isinstance(raw_files, dict):
        entry = (raw_files.get("entries") or {}).get(ZIP_NAME)
    else:
        entry = None
    if not isinstance(entry, dict):
        raise ValueError("original ZIP not found in publisher file metadata")
    checksum = str(entry.get("checksum", ""))
    if (entry.get("size") != EXPECTED_ZIP_SIZE
            or checksum != "md5:" + EXPECTED_ZIP_MD5_FROM_PUBLISHER):
        raise ValueError("publisher source archive size/MD5 metadata changed")
    return {
        "recordDoi": doi,
        "sourceSpeciesExplicitlyInPublisherRecord": "Apis mellifera",
        "sourceLicense": "CC BY 4.0",
        "publisherOriginalZipSizeBytes": entry["size"],
        "publisherOriginalZipMd5DeclaredNotByteVerified": checksum,
        "publisherRecordMetadataAuthenticated": True,
        "sourceArchiveFullyDownloaded": False,
        "publisherZipChecksumIndependentlyVerified": False,
        "sourceJpgTxtMemberBytesVerified": False,
        "modelTrainingAuthorized": False,
        "userVideoCleanupAuthorized": False,
    }


def probe(*, fetch=fetch_small_json):
    rec = fetch(RECORD_URL)
    status = {
        "source": "Zenodo v2 Apis mellifera public API",
        "metadataVerifiedFromPublisher": False,
        "individualZipMemberAPIConfirmed": False,
        "originalJpgTxtMemberBytesVerified": False,
        "modelTrainingAuthorized": False,
        "userVideoCleanupAuthorized": False,
    }
    if not rec["available"]:
        status["recordMetadataAccess"] = {k:v for k,v in rec.items() if k!="metadata"}
        return status
    # No 'verified' flag if source-reader is injected synthetic fixture.
    summary = publisher_record_summary(rec["metadata"])
    status["publisherMetadataClaims"] = summary
    status["metadataVerifiedFromPublisher"] = fetch is fetch_small_json
    cont = fetch(CONTAINER_URL)
    status["containerEndpointStatus"] = {k:v for k,v in cont.items() if k!="metadata"}
    if cont.get("available"):
        meta = cont.get("metadata")
        # Do not trust/emit raw possibly large URLs. Only report supported JSON structure.
        status["containerMetadataType"] = type(meta).__name__
        status["individualZipMemberAPIConfirmed"] = bool(
            isinstance(meta, dict) and isinstance(meta.get("entries"), (list, dict))
        )
    return status


if __name__ == "__main__":
    print(json.dumps(probe(), ensure_ascii=False, indent=2, allow_nan=False))
