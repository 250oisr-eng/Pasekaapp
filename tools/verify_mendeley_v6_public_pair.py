#!/usr/bin/env python3
"""Bounded, public Mendeley v6 original JPG + YOLO TXT audit; no archive download."""
import hashlib
import json
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from prepare_mendeley_v6_yolo_unassigned import build_unassigned, MendeleyRejected

BASE = "https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/"
PAIRS = (
    ("20230609a1002.jpg", BASE + "dadabae0-6bbc-4636-b70c-47dae981adba/file_downloaded", 2 * 1024 * 1024),
    ("20230609a1002.txt", BASE + "882b3086-fb80-49fa-99fc-780623481ad6/file_downloaded", 32 * 1024),
)
MIRROR_HOSTS = frozenset((
    "data.mendeley.com",
    "prod-dcd-datasets-public-files-eu-west-1.s3.eu-west-1.amazonaws.com",
))
EXPECTED_GROUP = "_bee_20230609a"
EXPECTED_WIDTH = 1920
EXPECTED_HEIGHT = 1080
# Observed from actual public v6 source bytes, GitHub Actions #44749236895.
# These are source-file integrity pins, NOT evidence of source recording provenance.
EXPECTED_IMAGE_SHA256 = "dcccf2db87e3f964870cfd84a65ad0ba9e81e992194b8f2fa18c16107fea41f3"
EXPECTED_LABEL_SHA256 = "ab25e4c0d29898983b78cc8241271ca4a66095332c32c8f0d29aab68d32f68d5"
EXPECTED_BEE_BOXES = 7


class RealPairRejected(ValueError):
    pass


def allowed_https(url):
    parsed = urlparse(url)
    return (parsed.scheme == "https" and parsed.hostname in MIRROR_HOSTS
            and parsed.username is None and parsed.password is None
            and parsed.port in (None, 443))


class TrustedRedirect(HTTPRedirectHandler):
    max_redirections = 3

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed_https(newurl):
            raise RealPairRejected("untrusted_redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def bounded_public_read(url, cap, opener=None):
    if url not in (item[1] for item in PAIRS):
        raise RealPairRejected("url_not_pinned")
    client = opener or build_opener(TrustedRedirect())
    request = Request(url, headers={"User-Agent": "Paseka-public-v6-pair-audit/1",
                      "Accept-Encoding": "identity"}, method="GET")
    try:
        with client.open(request, timeout=20) as response:
            if response.status != 200:
                raise RealPairRejected("not_http_200")
            final_url = response.geturl()
            if not allowed_https(final_url):
                raise RealPairRejected("final_origin_not_trusted")
            declared_size = response.headers.get("Content-Length")
            if declared_size is not None:
                try:
                    declared = int(declared_size)
                except ValueError as exc:
                    raise RealPairRejected("invalid_content_length") from exc
                if declared <= 0 or declared > cap:
                    raise RealPairRejected("content_length_over_limit")
            data = response.read(cap + 1)
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise RealPairRejected("download_unavailable") from exc
    if not 0 < len(data) <= cap:
        raise RealPairRejected("bytes_out_of_bounds")
    if declared_size is not None and len(data) != declared:
        raise RealPairRejected("response_size_mismatch")
    return data


def verify_bytes(jpg, label, require_pinned_source=False):
    if require_pinned_source and (
        hashlib.sha256(jpg).hexdigest() != EXPECTED_IMAGE_SHA256 or
        hashlib.sha256(label).hexdigest() != EXPECTED_LABEL_SHA256
    ):
        raise RealPairRejected("public_source_sha_changed")
    if not jpg.startswith(b"\xff\xd8"):
        raise RealPairRejected("invalid_jpeg_signature")
    try:
        text = label.decode("ascii")
    except UnicodeDecodeError as exc:
        raise RealPairRejected("invalid_yolo_encoding") from exc
    # No trusting a filename, downloaded page or embedded HTML as annotation.
    if not text.strip() or text.lstrip().startswith("<"):
        raise RealPairRejected("not_yolo_annotation")
    with tempfile.TemporaryDirectory(prefix="paseka-mendeley-v6-public-") as tmp:
        root = Path(tmp) / "detection"
        images = root / EXPECTED_GROUP / "images"
        labels = root / EXPECTED_GROUP / "labels"
        images.mkdir(parents=True)
        labels.mkdir()
        (images / PAIRS[0][0]).write_bytes(jpg)
        (labels / PAIRS[1][0]).write_bytes(label)
        result = build_unassigned(root)
    if (len(result["images"]) != 1 or
        len(result["annotations"]) < 1 or
        (require_pinned_source and len(result["annotations"]) != EXPECTED_BEE_BOXES) or
        result["images"][0]["width"] != EXPECTED_WIDTH or
        result["images"][0]["height"] != EXPECTED_HEIGHT):
        raise RealPairRejected("unexpected_real_pair_shape")
    if (result["info"]["split"] != "unassigned" or
        result["info"]["trainingAuthorized"] or
        result["info"]["sourceVideosVerified"]):
        raise RealPairRejected("readiness_flag_violation")
    return {
        "source": "Mendeley Data v6 10.17632/8gb9r2yhfc.6",
        "sourceHiveFolder": EXPECTED_GROUP,
        "imageFile": PAIRS[0][0], "imageBytes": len(jpg),
        "imageSha256": hashlib.sha256(jpg).hexdigest(),
        "width": result["images"][0]["width"],
        "height": result["images"][0]["height"],
        "annotationFile": PAIRS[1][0], "annotationBytes": len(label),
        "annotationSha256": hashlib.sha256(label).hexdigest(),
        "beeBoundingBoxes": len(result["annotations"]),
        "verifiedJpegDecode": False, # header parsed; full image decode not performed
        "verifiedSourceRecording": False,
        "completeDatasetVerified": False,
        "groupIndependenceVerified": False,
        "trainedModelAvailable": False,
        "trainingAuthorized": False,
        "recognitionSucceeded": False,
        "cleanupAuthorized": False,
    }


def main():
    try:
        jpg = bounded_public_read(PAIRS[0][1], PAIRS[0][2])
        label = bounded_public_read(PAIRS[1][1], PAIRS[1][2])
        print(json.dumps(verify_bytes(jpg, label, require_pinned_source=True), indent=2))
        return 0
    except (RealPairRejected, MendeleyRejected) as exc:
        print(json.dumps({"ok": False, "reason": str(exc),
                          "trainingAuthorized": False, "cleanupAuthorized": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
