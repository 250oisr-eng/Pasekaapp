#!/usr/bin/env python3
"""Read-only public Mendeley dataset METADATA probe; never downloads archive bytes."""
import argparse
import json
import re
import socket
import ssl
import sys
from urllib.parse import urlencode
from urllib.request import Request, HTTPRedirectHandler, build_opener
from urllib.error import URLError, HTTPError

DATASET_ID = "8gb9r2yhfc"
VERSION = 6
BASE = "https://api.data.mendeley.com"
MAX_JSON_BYTES = 2 * 1024 * 1024
SHA = re.compile(r"^[0-9a-f]{64}$")
VERSION_PARAM = urlencode({"version": VERSION})


class MetadataUnavailable(Exception):
    pass


class DenyRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise MetadataUnavailable("unexpected_redirect")


def fetch_json(endpoint, opener=None):
    if endpoint not in ("dataset", "files", "zip"):
        raise MetadataUnavailable("invalid_endpoint")
    # This fixed allowlist prevents attacker-supplied URLs and signed-download redirects.
    suffix = {
        "dataset": f"/datasets/{DATASET_ID}?{VERSION_PARAM}",
        "files": f"/datasets/{DATASET_ID}/files?{VERSION_PARAM}",
        "zip": f"/datasets/{DATASET_ID}/zip?{VERSION_PARAM}",
    }[endpoint]
    request = Request(
        BASE + suffix,
        headers={"Accept": "application/json", "User-Agent": "Paseka-Public-Metadata-Review/1"},
        method="GET",
    )
    try:
        client = opener or build_opener(DenyRedirects())
        with client.open(request, timeout=12) as response:
            payload = response.read(MAX_JSON_BYTES + 1)
        if len(payload) > MAX_JSON_BYTES:
            raise MetadataUnavailable("metadata_response_too_large")
        parsed = json.loads(payload)
    except MetadataUnavailable:
        raise
    except HTTPError as exc:
        raise MetadataUnavailable(f"public_api_http_{exc.code}") from exc
    except URLError as exc:
        if isinstance(exc.reason, socket.gaierror):
            raise MetadataUnavailable("public_api_dns_unavailable") from exc
        if isinstance(exc.reason, (ssl.SSLError, ssl.SSLCertVerificationError)):
            raise MetadataUnavailable("public_api_tls_unavailable") from exc
        raise MetadataUnavailable("public_api_transport_unavailable") from exc
    except (OSError, ValueError, UnicodeDecodeError) as exc:
        raise MetadataUnavailable("public_api_response_invalid") from exc
    if not isinstance(parsed, (dict, list)):
        raise MetadataUnavailable("invalid_json_root")
    return parsed


def license_label(dataset):
    license_field = dataset.get("licence", dataset.get("license"))
    if isinstance(license_field, dict):
        label = license_field.get("name") or license_field.get("label")
    elif isinstance(license_field, str):
        label = license_field
    else:
        label = None
    return label[:160] if isinstance(label, str) else None


def verify_metadata(dataset, files, zip_metadata):
    if not isinstance(dataset, dict) or not isinstance(zip_metadata, dict):
        raise MetadataUnavailable("metadata_shape_invalid")
    if dataset.get("id") not in (None, DATASET_ID):
        raise MetadataUnavailable("dataset_identity_mismatch")
    if dataset.get("version") not in (None, VERSION):
        raise MetadataUnavailable("dataset_version_mismatch")
    items = files if isinstance(files, list) else files.get("files", files.get("results")) if isinstance(files, dict) else None
    if not isinstance(items, list) or not items or len(items) > 10000:
        raise MetadataUnavailable("file_listing_missing")
    summary = []
    for item in items[:50]:
        if not isinstance(item, dict):
            raise MetadataUnavailable("file_record_invalid")
        name = item.get("filename", item.get("name"))
        details = item.get("content_details") or {}
        if not isinstance(name, str) or not name or len(name) > 500 or not isinstance(details, dict):
            raise MetadataUnavailable("file_record_invalid")
        digest = details.get("sha256_hash")
        if digest is not None and (not isinstance(digest, str) or not SHA.fullmatch(digest)):
            raise MetadataUnavailable("file_hash_invalid")
        size = details.get("size", item.get("size"))
        if size is not None and (not isinstance(size, int) or size < 0):
            raise MetadataUnavailable("file_size_invalid")
        summary.append({"name": name, "bytesReported": size, "sha256Reported": digest})
    zip_digest = zip_metadata.get("sha256_hash")
    if zip_digest is not None and (not isinstance(zip_digest, str) or not SHA.fullmatch(zip_digest)):
        raise MetadataUnavailable("zip_hash_invalid")
    zip_size = zip_metadata.get("size")
    if zip_size is not None and (not isinstance(zip_size, int) or zip_size < 0):
        raise MetadataUnavailable("zip_size_invalid")
    return {
        "ok": True,
        "stage": "public_api_metadata_only",
        "datasetId": DATASET_ID,
        "requestedVersion": VERSION,
        "reportedVersion": dataset.get("version"),
        "reportedLicenceLabel": license_label(dataset),
        "fileListCountReturned": len(items),
        "fileListPossiblyPartial": True,
        "sampleFileMetadata": summary,
        "zipMetadata": {
            "status": str(zip_metadata.get("status"))[:80],
            "bytesReported": zip_size,
            "sha256Reported": zip_digest,
        },
        # Metadata is self-declared by the public source; no files were downloaded or inspected.
        "archiveDownloaded": False,
        "fileLicensesInspected": False,
        "licenseVerified": False,
        "trainingAuthorized": False,
        "modelApproved": False,
        "recognitionSucceeded": False,
        "cleanupAuthorized": False,
    }


def probe(fetch=fetch_json):
    return verify_metadata(fetch("dataset"), fetch("files"), fetch("zip"))


def main():
    parser = argparse.ArgumentParser(description="Read public Mendeley v6 metadata only; no downloads")
    parser.parse_args()
    try:
        print(json.dumps(probe(), ensure_ascii=False, indent=2))
    except MetadataUnavailable as exc:
        print(json.dumps({"ok": False, "stage": "public_api_metadata_unavailable",
                          "reason": str(exc), "archiveDownloaded": False,
                          "licenseVerified": False, "trainingAuthorized": False,
                          "cleanupAuthorized": False}), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
