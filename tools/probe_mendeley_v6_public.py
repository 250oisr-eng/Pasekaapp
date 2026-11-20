#!/usr/bin/env python3
"""One-shot, bounded, read-only Mendeley v6 metadata probe (no media downloads)."""
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler

DATASET = "8gb9r2yhfc"
VERSION = 6
MAX_BODY = 256 * 1024
ALLOWED_ORIGIN = "https://api.data.mendeley.com"
PATHS = (
    "/datasets/publics/8gb9r2yhfc/folders?version=6",
    "/datasets/publics/8gb9r2yhfc/files?version=6",
    "/datasets/8gb9r2yhfc/snapshot?version=6",
    "/datasets/8gb9r2yhfc?version=6",
    "/datasets/8gb9r2yhfc/versions",
    "/datasets/8gb9r2yhfc/zip?version=6",
)

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class ProbeError(Exception):
    pass

def summarize_list(items):
    preview = []
    for item in items[:15]:
        if not isinstance(item, dict):
            preview.append({"type": type(item).__name__})
            continue
        # No content_details.download_url or signed storage URL is ever printed.
        row = {}
        for key in ("filename", "name", "id", "folder_id", "parent_id", "size", "status"):
            value = item.get(key)
            if isinstance(value, (str, int)) and len(str(value)) <= 200:
                row[key] = value
        details = item.get("content_details")
        if isinstance(details, dict):
            for key in ("size", "sha256_hash", "content_type"):
                value = details.get(key)
                if isinstance(value, (int, str)) and len(str(value)) <= 130:
                    row[key] = value
        preview.append(row)
    return preview

def summarize(parsed):
    if isinstance(parsed, dict):
        out = {"type": "object", "keys": sorted(parsed.keys())[:35]}
        for key in ("id", "short_id", "version", "status"):
            value = parsed.get(key)
            if isinstance(value, (str, int, bool)) and len(str(value)) < 100:
                out[key] = value
        for key in ("data_licence", "license", "doi"):
            value = parsed.get(key)
            if isinstance(value, dict):
                out[key] = {k: value[k] for k in ("short_name", "full_name", "id", "status")
                            if isinstance(value.get(k), (str, int, bool))
                            and len(str(value[k])) < 130}
        for field in ("files", "folders", "items", "children", "results"):
            val = parsed.get(field)
            if isinstance(val, list):
                out[field] = {"count": len(val), "preview": summarize_list(val)}
        return out
    if isinstance(parsed, list):
        return {"type": "array", "count": len(parsed), "preview": summarize_list(parsed)}
    return {"type": type(parsed).__name__}

def probe(path, opener=None):
    url = ALLOWED_ORIGIN + path
    parsed = urlparse(url)
    if (parsed.scheme != "https" or parsed.netloc != "api.data.mendeley.com"
        or path not in PATHS):
        raise ProbeError("non_allowlisted_url")
    client = opener or build_opener(NoRedirect())
    request = Request(url, headers={"Accept": "application/json",
                      "Accept-Encoding": "identity",
                      "User-Agent": "Paseka-open-metadata-audit/1.0"}, method="GET")
    try:
        with client.open(request, timeout=14) as response:
            status = response.status
            size = response.headers.get("Content-Length")
            if size and size.isdigit() and int(size) > MAX_BODY:
                return {"path": path, "status": status, "body": "size_exceeds_metadata_limit"}
            payload = response.read(MAX_BODY + 1)
            if len(payload) > MAX_BODY:
                return {"path": path, "status": status,
                        "body": "oversized_metadata_response"}
            mime = response.headers.get("Content-Type", "").lower()
    except HTTPError as exc:
        return {"path": path, "status": exc.code, "body": "http_status_only"}
    except (URLError, OSError, TimeoutError) as exc:
        return {"path": path, "status": "network_error", "error_type": type(exc).__name__}
    result = {"path": path, "status": status,
              "receivedBytes": len(payload), "contentType": mime.split(";")[0]}
    if not 200 <= status < 300:
        result["body"] = "unexpected_status"
    elif "json" not in mime:
        result["body"] = "not_json_no_parse"
    else:
        try:
            result["summary"] = summarize(json.loads(payload))
        except (ValueError, UnicodeDecodeError):
            result["body"] = "invalid_json"
    return result

if __name__ == "__main__":
    print(json.dumps({
        "dataset": DATASET, "version": VERSION,
        "mode": "metadata_only", "noArchiveDownloads": True, "noAuth": True,
        "results": [probe(path) for path in PATHS]
    }, ensure_ascii=False, indent=2))
