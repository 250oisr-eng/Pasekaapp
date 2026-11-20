#!/usr/bin/env python3
"""Read-only bounded HTTP Range sample of public LILA ZIP directory + one Pascal VOC XML."""
import hashlib
import json
import re
import stat
import struct
import sys
import zlib
from urllib.request import Request, HTTPRedirectHandler, build_opener
from urllib.error import HTTPError, URLError
from xml.etree import ElementTree as ET

URL = "https://storage.googleapis.com/public-datasets-lila/boxes-on-bees/boxes-on-bees-2021.zip"
MAX_ARCHIVE = 10 * 1024 * 1024 * 1024
MAX_NETWORK = 4 * 1024 * 1024
MAX_CENTRAL = 3 * 1024 * 1024
MAX_XML = 128 * 1024
MAX_ENTRIES = 20000
RANGE = re.compile(r"^bytes ([0-9]+)-([0-9]+)/([0-9]+)$")
LICENSE = re.compile(r"(?:^|/)(?:license|licence|copying|notice|readme|attribution)(?:\.[^/]*)?$",re.I)


class SampleRejected(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        raise SampleRejected("redirect_not_allowed")


class BoundedRanges:
    def __init__(self,opener=None):
        self.client=opener or build_opener(NoRedirect())
        self.used=0
        self.total=None

    def head_size(self):
        req=Request(URL,method="HEAD",headers={"Accept-Encoding":"identity"})
        try:
            with self.client.open(req,timeout=12) as response:
                if response.status!=200:
                    raise SampleRejected("head_status_unexpected")
                length=int(response.headers["Content-Length"])
        except (HTTPError,URLError,OSError,ValueError,KeyError) as exc:
            raise SampleRejected("head_unavailable") from exc
        if length<70000 or length>MAX_ARCHIVE:
            raise SampleRejected("archive_size_out_of_bounds")
        self.total=length
        return length

    def get(self,start,end):
        if self.total is None or not (0<=start<=end<self.total):
            raise SampleRejected("range_invalid")
        length=end-start+1
        if length>MAX_CENTRAL or self.used+length>MAX_NETWORK:
            raise SampleRejected("range_budget_exceeded")
        req=Request(URL,method="GET",headers={
            "Range":f"bytes={start}-{end}","Accept-Encoding":"identity"})
        try:
            with self.client.open(req,timeout=12) as response:
                # Never consume the body if the server ignored Range and returned 200.
                if response.status!=206:
                    raise SampleRejected("range_response_not_partial")
                match=RANGE.fullmatch(response.headers.get("Content-Range",""))
                if not match or tuple(map(int,match.groups()))!=(start,end,self.total):
                    raise SampleRejected("range_metadata_mismatch")
                content=response.read(length+1)
        except (HTTPError,URLError,OSError) as exc:
            raise SampleRejected("range_request_failed") from exc
        if len(content)!=length:
            raise SampleRejected("range_size_mismatch")
        self.used+=length
        return content


def clean_name(raw,flag):
    try:
        value=raw.decode("utf-8" if flag & 0x800 else "cp437")
    except UnicodeError as exc:
        raise SampleRejected("filename_encoding_invalid") from exc
    if (not value or len(value)>512 or value.startswith("/") or
        "\\" in value or ":" in value or
        any(p in ("",".","..") for p in value.rstrip("/").split("/")) or
        any(ord(c)<32 or ord(c)==127 for c in value)):
        raise SampleRejected("unsafe_zip_name")
    return value


def inspect_directory(reader):
    total=reader.head_size()
    tail_size=min(65557,total)
    tail=reader.get(total-tail_size,total-1)
    i=tail.rfind(b"PK\x05\x06")
    if i<0 or i+22>len(tail):
        raise SampleRejected("zip_end_missing")
    sig,disk,cddisk,count_disk,count,cdsize,cdoffset,commentlen=struct.unpack_from("<4s4H2LH",tail,i)
    if disk!=0 or cddisk!=0 or count!=count_disk or count<1 or count>MAX_ENTRIES:
        raise SampleRejected("zip_multidisk_or_count_unsupported")
    if i+22+commentlen!=len(tail):
        raise SampleRejected("zip_comment_mismatch")
    if (cdsize<46 or cdsize>MAX_CENTRAL or cdoffset<0 or
        cdoffset+cdsize>total-tail_size+i):
        raise SampleRejected("zip_central_directory_invalid")
    central=reader.get(cdoffset,cdoffset+cdsize-1)
    pos=0
    items=[]
    seen=set()
    for _ in range(count):
        if pos+46>len(central):
            raise SampleRejected("central_truncated")
        row=struct.unpack_from("<4s6H3L5H2L",central,pos)
        sig,_,_,flags,method,_,_,crc,compressed,uncompressed,nlen,exlen,commentlen,_,_,external,offset=row
        if sig!=b"PK\x01\x02" or flags&1 or method not in (0,8):
            raise SampleRejected("central_entry_unsupported")
        stop=pos+46+nlen+exlen+commentlen
        if stop>len(central) or not nlen:
            raise SampleRejected("central_entry_truncated")
        raw=central[pos+46:pos+46+nlen]
        name=clean_name(raw,flags)
        if name.casefold() in seen:
            raise SampleRejected("central_duplicate_name")
        seen.add(name.casefold())
        if stat.S_ISLNK((external>>16)&0xffff):
            raise SampleRejected("zip_symlink_unsupported")
        if compressed==0xffffffff or uncompressed==0xffffffff or offset==0xffffffff:
            raise SampleRejected("zip64_entry_unsupported")
        items.append({"name":name,"raw":raw,"flags":flags,"method":method,
                      "crc":crc,"compressed":compressed,"uncompressed":uncompressed,
                      "offset":offset})
        pos=stop
    if pos!=len(central):
        raise SampleRejected("central_unexpected_trailing_bytes")
    return items


def sample_member(reader,entry):
    if not 0<entry["uncompressed"]<=MAX_XML or not 0<entry["compressed"]<=MAX_XML:
        raise SampleRejected("sample_member_too_large")
    base=entry["offset"]
    header=reader.get(base,base+29)
    signature,_,flags,method,_,_,_,_,_,nlen,exlen=struct.unpack("<4s5H3L2H",header)
    if signature!=b"PK\x03\x04" or flags!=entry["flags"] or method!=entry["method"] or nlen>1024 or exlen>4096:
        raise SampleRejected("local_header_invalid")
    filename=reader.get(base+30,base+30+nlen-1)
    if filename!=entry["raw"]:
        raise SampleRejected("local_filename_mismatch")
    start=base+30+nlen+exlen
    packed=reader.get(start,start+entry["compressed"]-1)
    if method==0:
        data=packed
    else:
        dec=zlib.decompressobj(-15)
        data=dec.decompress(packed,MAX_XML+1)
        if not dec.eof or dec.unconsumed_tail:
            raise SampleRejected("xml_decompression_invalid")
        data+=dec.flush()
    if len(data)!=entry["uncompressed"] or len(data)>MAX_XML or zlib.crc32(data)!=entry["crc"]:
        raise SampleRejected("xml_crc_or_size_invalid")
    return data


def parse_voc(xml):
    if b"<!DOCTYPE" in xml.upper() or b"<!ENTITY" in xml.upper():
        raise SampleRejected("unsafe_xml_declaration")
    try:
        root=ET.fromstring(xml)
        if root.tag!="annotation":
            raise ValueError("not annotation")
        width=int(root.findtext("./size/width"))
        height=int(root.findtext("./size/height"))
        if not 0<width<=20000 or not 0<height<=20000:
            raise ValueError("invalid dimensions")
        counts={}
        for obj in root.findall("./object"):
            label=obj.findtext("name")
            if not label or len(label)>80:
                raise ValueError("invalid label")
            b=obj.find("bndbox")
            coords=[int(b.findtext(p)) for p in ("xmin","ymin","xmax","ymax")]
            x1,y1,x2,y2=coords
            if not 0<=x1<x2<=width or not 0<=y1<y2<=height:
                raise ValueError("invalid bbox")
            counts[label]=counts.get(label,0)+1
    except (ET.ParseError,ValueError,TypeError,AttributeError) as exc:
        raise SampleRejected("voc_annotation_invalid") from exc
    return {"width":width,"height":height,"objectsByClass":counts}


def inspect_public(opener=None):
    reader=BoundedRanges(opener)
    entries=inspect_directory(reader)
    docs=[e["name"] for e in entries if LICENSE.search(e["name"])]
    candidates=[e for e in entries if e["name"].lower().endswith(".xml")
                and 0<e["compressed"]<=MAX_XML and 0<e["uncompressed"]<=MAX_XML]
    last=None
    for item in candidates[:8]:
        try:
            original=sample_member(reader,item)
            data=parse_voc(original)
            return {"ok":True,"stage":"public_voc_sample_only",
                    "zipEntries":len(entries),"xmlCandidateCount":len(candidates),
                    "licenseDocumentPaths":docs[:30],"sampleXmlName":item["name"],
                    "sampleXmlSha256":hashlib.sha256(original).hexdigest(),
                    "sample":data,"bytesFetchedByRange":reader.used,
                    "archiveDownloaded":False,"archiveHashVerified":False,
                    "archiveLicensesRead":False,"licenseVerified":False,
                    "trainingAuthorized":False,"modelApproved":False,
                    "recognitionSucceeded":False,"cleanupAuthorized":False}
        except SampleRejected as exc:
            last=str(exc)
    raise SampleRejected("no_valid_voc_sample"+(":"+last if last else ""))


def main():
    try:
        print(json.dumps(inspect_public(),ensure_ascii=False,indent=2))
        return 0
    except SampleRejected as exc:
        print(json.dumps({"ok":False,"reason":str(exc),
                          "licenseVerified":False,"trainingAuthorized":False,
                          "cleanupAuthorized":False}),file=sys.stderr)
        return 1


if __name__=="__main__":
    sys.exit(main())
