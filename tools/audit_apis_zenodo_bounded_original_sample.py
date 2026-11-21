"""Bounded, original Zenodo Apis mellifera ZIP central directory + JPG/YOLO audit.

Only GET exact byte ranges of the fixed Zenodo v2 original ZIP; no 2GB download.
Validates ZIP central-directory structure, exact selected real ZIP member CRC,
original JPEG SOF dimensions and paired YOLO TXT geometry. Does not verify
the MD5 of the 2GB archive; per-member CRC isn't a publisher-authenticated
whole-archive checksum. No model training/inference/score or video deletion.
"""
from collections import Counter
import hashlib
import json
import math
import re
import struct
from pathlib import PurePosixPath
from urllib.request import Request, build_opener
import zlib

from probe_apis_zenodo_zip_range import (
    DOI, SOURCE_SPECIES, SOURCE_LICENSE, ZENODO_URL,
    PUBLISHER_MD5_UNVERIFIED, probe_range_support,
)

EXPECTED_ARCHIVE_BYTES = 2005232875  # measured from real Zenodo HTTP Content-Range, 2026-11-21
MAX_RANGE = 8 * 1024 * 1024
MAX_SAMPLE_BYTES = 12 * 1024 * 1024
MAX_ENTRIES = 20000
EXPECTED_IMAGES = 2823
EXPECTED_IN_HIVE = 2795
EOCD_SIGNATURE = b"PK\x05\x06"
CENTRAL_SIGNATURE = b"PK\x01\x02"
LOCAL_SIGNATURE = b"PK\x03\x04"
CONTENT_RANGE = re.compile(r"bytes ([0-9]+)-([0-9]+)/([0-9]+)\Z")
SOF_MARKERS = frozenset((0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6,
                         0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF))


def range_bytes(start, end, total, *, opener=None):
    """Reject HTTP 200 before reading; strict 206 and Content-Range."""
    if (type(start) is not int or type(end) is not int or type(total) is not int
            or total != EXPECTED_ARCHIVE_BYTES
            or start < 0 or end < start or end >= total
            or end - start + 1 > MAX_RANGE):
        raise ValueError("unsafe or unauthenticated ZIP byte range")
    opener = opener or build_opener()
    request = Request(ZENODO_URL, headers={
        "Range": f"bytes={start}-{end}", "Accept-Encoding": "identity",
        "User-Agent": "Paseka-Apis-Mellifera-Public-ZIP-Range-Source-Audit/1",
    }, method="GET")
    with opener.open(request, timeout=45) as response:
        if response.status != 206:
            raise ValueError("source does not support exact HTTP ranges; full download prohibited")
        if response.headers.get("Content-Encoding", "identity") != "identity":
            raise ValueError("unexpected compression of source ZIP HTTP response")
        m = CONTENT_RANGE.fullmatch(response.headers.get("Content-Range", ""))
        if not m or (int(m[1]), int(m[2]), int(m[3])) != (start, end, total):
            raise ValueError("Zenodo range response does not match request")
        data = response.read(end-start+2)
        if len(data) != end-start+1:
            raise ValueError("incomplete or overlong HTTP 206 range")
    return data


def central_directory_from_tail(tail, total):
    """Parse exact end of ZIP; no untrusted ZIP64 or multidisk fallback."""
    idx = tail.rfind(EOCD_SIGNATURE)
    if idx < 0 or idx+22 > len(tail):
        raise ValueError("ZIP central directory end marker missing")
    disk, cd_disk, disk_count, count, size, offset, comment_len = struct.unpack_from(
        "<4H2IH", tail, idx+4)
    if (disk or cd_disk or disk_count != count or
            not 0 < count <= MAX_ENTRIES or
            not 0 < size <= MAX_RANGE or
            idx+22+comment_len != len(tail) or
            offset+size > total-22):
        raise ValueError("unsupported/unsafe ZIP central directory layout")
    return {"count":count, "centralOffset":offset, "centralBytes":size}


def parse_central_directory(data, expected_count):
    items = {}
    p = 0
    for _ in range(expected_count):
        if p + 46 > len(data):
            raise ValueError("truncated central ZIP header")
        (signature, made_by, needed, flags, method, mod_time, mod_date, crc,
         compressed, original_size, namelen, extralen, commentlen, diskstart,
         internal, external, local_offset) = struct.unpack_from("<4s6H3I5H2I", data, p)
        p += 46
        if signature != CENTRAL_SIGNATURE or flags & 1 or diskstart or needed >= 45:
            raise ValueError("unsupported ZIP method or encryption/multidisk/ZIP64")
        if method not in (0, 8) or compressed > MAX_SAMPLE_BYTES:
            # Large files can exist in original archive. Only sample bounded ones.
            if method not in (0, 8):
                raise ValueError("unexpected ZIP compression method")
        if p + namelen + extralen + commentlen > len(data):
            raise ValueError("truncated original ZIP member name")
        rawname=data[p:p+namelen]
        p += namelen + extralen + commentlen
        try:
            name=rawname.decode("utf-8")
        except UnicodeError as exc:
            raise ValueError("source ZIP filenames not UTF-8") from exc
        path=PurePosixPath(name)
        if (not name or name.startswith("/") or "\\" in name or ".." in path.parts
                or len(name) > 512 or local_offset >= EXPECTED_ARCHIVE_BYTES
                or name in items):
            raise ValueError("unsafe/duplicate ZIP filename")
        mode = external >> 16
        if (mode & 0o170000) == 0o120000:
            raise ValueError("symlinks not accepted in original archive")
        items[name]={
            "offset":local_offset,"crc":crc,"compressed":compressed,
            "uncompressed":original_size,"method":method,
            "name":name,
        }
    if p != len(data):
        raise ValueError("unparsed ZIP central directory trailing bytes")
    return items


def extract_sample_zip_member(entry, total, fetch):
    if entry["compressed"] > MAX_SAMPLE_BYTES or entry["uncompressed"] > MAX_SAMPLE_BYTES:
        raise ValueError("chosen original ZIP member exceeds bounded sample cap")
    o=entry["offset"]
    local=fetch(o,o+29,total)
    if len(local)!=30 or local[:4]!=LOCAL_SIGNATURE:
        raise ValueError("ZIP local header does not match central")
    # version flags method date time crc compressed uncompressed name length extras
    needed,flags,method,mtime,mdate,crc,csize,usize,namelen,extralen=struct.unpack_from(
        "<5H3I2H",local,4)
    if flags & 1 or method!=entry["method"] or namelen > 512 or extralen > 4096:
        raise ValueError("local ZIP member invalid")
    actual_name = fetch(o+30,o+29+namelen,total)
    if actual_name != entry["name"].encode("utf-8"):
        raise ValueError("local and central ZIP member names differ")
    start=o+30+namelen+extralen
    if entry["compressed"]<=0:
        raise ValueError("empty compressed member cannot be used as sample")
    raw=fetch(start,start+entry["compressed"]-1,total)
    if method == 0:
        plain=raw
    elif method == 8:
        dec=zlib.decompressobj(-15)
        plain=dec.decompress(raw,MAX_SAMPLE_BYTES+1)
        if not dec.eof or dec.unconsumed_tail or dec.unused_data:
            raise ValueError("invalid/bomb truncated ZIP deflate")
        plain+=dec.flush()
    else:
        raise ValueError("unsupported compression")
    if len(plain) != entry["uncompressed"] or zlib.crc32(plain)&0xffffffff != entry["crc"]:
        raise ValueError("original ZIP sample bytes fail length/CRC")
    return plain


def jpeg_dimensions(data):
    if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
        raise ValueError("not an original complete-looking JPEG container")
    p=2
    while p < len(data)-4:
        if data[p] != 0xff:
            raise ValueError("malformed JPEG header")
        while p < len(data) and data[p] == 0xff:
            p+=1
        marker=data[p]
        p+=1
        if marker==0xda:
            break
        if marker in (0xd8, 0xd9, 0x01) or 0xd0<=marker<=0xd7:
            continue
        if p+2>len(data):
            raise ValueError("truncated JPEG metadata")
        seglen=int.from_bytes(data[p:p+2],"big")
        if seglen<2 or p+seglen>len(data):
            raise ValueError("bad JPEG marker length")
        if marker in SOF_MARKERS:
            if seglen<7:
                raise ValueError("invalid JPEG SOF")
            height=int.from_bytes(data[p+3:p+5],"big")
            width=int.from_bytes(data[p+5:p+7],"big")
            if not 0<height<=10000 or not 0<width<=10000:
                raise ValueError("invalid source JPEG dimensions")
            return width,height
        p+=seglen
    raise ValueError("JPEG SOF was not found before scan data")


def yolo_annotation_summary(text_bytes):
    try:
        content=text_bytes.decode("utf-8-sig")
    except UnicodeError as exc:
        raise ValueError("source TXT encoding not UTF-8") from exc
    counts=Counter()
    bad=0
    rows=0
    for line in content.splitlines():
        if not line.strip():
            continue
        cols=line.split()
        rows+=1
        if len(cols)!=5 or cols[0] not in ("0","1"):
            bad+=1
            continue
        counts[cols[0]]+=1
        try:
            x,y,w,h=[float(v) for v in cols[1:]]
        except ValueError:
            bad+=1
            continue
        if (not all(math.isfinite(z) for z in (x,y,w,h))
                or x-w/2 < -1e-6 or y-h/2 < -1e-6
                or x+w/2 > 1+1e-6 or y+h/2 > 1+1e-6
                or not 0 < w <=1 or not 0<h<=1):
            bad+=1
    return {"rows":rows,"numericClass0":counts["0"],"numericClass1":counts["1"],
            "invalidOrOutOfFrameRows":bad}


def audit_bounded_original_jpg_txt(*, probe=probe_range_support, fetch=range_bytes):
    p=probe()
    result={
        "sourceDoi": DOI,"sourceSpeciesPerPublisher": SOURCE_SPECIES,
        "sourceLicensePerPublisher": SOURCE_LICENSE,
        "publishedWholeArchiveMd5NotChecked": PUBLISHER_MD5_UNVERIFIED,
        "wholeArchiveMd5Verified":False,"fullArchiveDownloaded":False,
        "originalZipMemberJpegAndTxtCrcVerified":False,
        "jpegPixelsFullyDecoded":False,
        "sessionIndependentEvaluationEstablished":False,
        "actualBeeEntranceInOutGroundTruthValidated":False,
        "modelTrainingAllowed":False,"userVideoCleanupAuthorized":False,
        "sourceInputOrigin":"synthetic_fixture" if fetch is not range_bytes or probe is not probe_range_support else "official_Zenodo_http_range",
    }
    if not p.get("rangeSupported"):
        result["blockReason"]=p.get("blockReason","official byte-range access unavailable")
        return result
    total=p.get("publisherArchiveBytesFromContentRange")
    if total!=EXPECTED_ARCHIVE_BYTES:
        raise ValueError("publisher archive byte count changed from pinned source record")
    tail_length=min(256*1024,total)
    tail=fetch(total-tail_length,total-1,total)
    cdinfo=central_directory_from_tail(tail,total)
    rawcd=fetch(cdinfo["centralOffset"],
                cdinfo["centralOffset"]+cdinfo["centralBytes"]-1,total)
    entries=parse_central_directory(rawcd,cdinfo["count"])
    jpgs={PurePosixPath(k).stem:e for k,e in entries.items()
          if k.lower().endswith((".jpg",".jpeg")) and
          PurePosixPath(k).name.startswith("img-")}
    txts={PurePosixPath(k).stem:e for k,e in entries.items()
          if k.lower().endswith(".txt") and
          PurePosixPath(k).name.startswith("img-")}
    shared=sorted(set(jpgs)&set(txts))
    result.update({
        "zipCentralDirectoryParsed":True,
        "zipEntryCount":len(entries),
        "inHiveJpgCountByFilename":len(jpgs),
        "inHiveLabelTxtCountByFilename":len(txts),
        "inHiveJpgTxtPairedByStem":len(shared),
    })
    if len(jpgs) != EXPECTED_IN_HIVE or len(shared) != EXPECTED_IN_HIVE:
        raise ValueError("original Zenodo source JPG/TXT count or pairing changed")
    # Deterministic early original image, not cherry-picking a good detection.
    candidates=[name for name in shared
                if jpgs[name]["compressed"]<=MAX_SAMPLE_BYTES
                and jpgs[name]["uncompressed"]<=MAX_SAMPLE_BYTES
                and txts[name]["compressed"]<=MAX_SAMPLE_BYTES]
    if not candidates:
        raise ValueError("no bounded genuine original JPG/TXT sample")
    name=candidates[0]
    jpg=extract_sample_zip_member(jpgs[name],total,fetch)
    txt=extract_sample_zip_member(txts[name],total,fetch)
    width,height=jpeg_dimensions(jpg)
    yolo=yolo_annotation_summary(txt)
    result.update({
        "originalZipMemberJpegAndTxtCrcVerified":True,
        "sampleJpgOriginalMemberPath":jpgs[name]["name"],
        "sampleTxtOriginalMemberPath":txts[name]["name"],
        "sampleJpgOriginalSizeBytes":len(jpg),
        "sampleTxtOriginalSizeBytes":len(txt),
        "sampleJpgSha256":hashlib.sha256(jpg).hexdigest(),
        "sampleTxtSha256":hashlib.sha256(txt).hexdigest(),
        "originalJpegDimensions": [width,height],
        "originalYoloLabelSummary":yolo,
    })
    if yolo["invalidOrOutOfFrameRows"]:
        result["sourceAnnotationNeedsReview"]=True
    return result


if __name__=="__main__":
    print(json.dumps(audit_bounded_original_jpg_txt(),indent=2,ensure_ascii=False))
