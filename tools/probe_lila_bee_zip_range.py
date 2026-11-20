#!/usr/bin/env python3
"""Probe 64 real ZIP bytes of publicly published LILA Boxes on Bees, without archive download."""
import hashlib
import json
import re
import sys
from urllib.request import Request, HTTPRedirectHandler, build_opener
from urllib.error import HTTPError, URLError

SOURCES = (
    ("gcp", "https://storage.googleapis.com/public-datasets-lila/boxes-on-bees/boxes-on-bees-2021.zip"),
    ("aws", "https://us-west-2.opendata.source.coop.s3.amazonaws.com/agentmorris/lila-wildlife/boxes-on-bees/boxes-on-bees-2021.zip"),
)
N = 64
MAX_ARCHIVE = 10 * 1024 * 1024 * 1024
RANGE_RE = re.compile(r"^bytes 0-63/([1-9][0-9]*)$")


class ProbeRejected(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ProbeRejected("redirect_not_allowed")


def probe_source(label, url, opener=None):
    if (label, url) not in SOURCES:
        raise ProbeRejected("unapproved_public_source")
    client = opener or build_opener(NoRedirect())
    try:
        head = Request(url, method="HEAD", headers={"Accept-Encoding": "identity"})
        with client.open(head, timeout=12) as response:
            if response.status != 200:
                raise ProbeRejected("head_status_unexpected")
            reported = response.headers.get("Content-Length")
            if reported is not None:
                try:
                    length = int(reported)
                except ValueError:
                    raise ProbeRejected("head_length_invalid") from None
                if length <= N or length > MAX_ARCHIVE:
                    raise ProbeRejected("head_length_invalid")
        request = Request(url, method="GET", headers={
            "Range": "bytes=0-63", "Accept-Encoding": "identity"})
        with client.open(request, timeout=12) as response:
            # Never read a 200 response: it could stream the entire ~2GB archive.
            if response.status != 206:
                raise ProbeRejected("http_range_not_supported")
            match = RANGE_RE.fullmatch(response.headers.get("Content-Range", ""))
            if not match:
                raise ProbeRejected("range_metadata_invalid")
            total = int(match.group(1))
            if total <= N or total > MAX_ARCHIVE:
                raise ProbeRejected("archive_size_invalid")
            content = response.read(N + 1)
        if len(content) != N:
            raise ProbeRejected("range_length_invalid")
        if not content.startswith((b"PK\x03\x04", b"PK\x05\x06")):
            raise ProbeRejected("zip_header_invalid")
        return {
            "ok": True,
            "stage": "public_zip_header_only",
            "publicMirror": label,
            "reportedArchiveBytes": total,
            "byteRange": "0-63",
            "sha256Of64ByteHeader": hashlib.sha256(content).hexdigest(),
            "archiveDownloaded": False,
            "archiveSha256Verified": False,
            "archiveContentsInspected": False,
            "licenseVerified": False,
            "trainingAuthorized": False,
            "modelApproved": False,
            "recognitionSucceeded": False,
            "cleanupAuthorized": False,
        }
    except ProbeRejected:
        raise
    except HTTPError as exc:
        raise ProbeRejected(f"public_http_{exc.code}") from exc
    except (URLError, OSError) as exc:
        raise ProbeRejected("public_transport_unavailable") from exc


def probe_public():
    failed = []
    for label, url in SOURCES:
        try:
            result = probe_source(label, url)
            result["otherMirrorFailures"] = failed
            return result
        except ProbeRejected as exc:
            failed.append({"mirror": label, "reason": str(exc)})
    return {
        "ok": False, "stage": "public_range_unavailable",
        "failedMirrors": failed, "archiveDownloaded": False,
        "licenseVerified": False, "trainingAuthorized": False,
        "cleanupAuthorized": False,
    }


def main():
    result = probe_public()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
