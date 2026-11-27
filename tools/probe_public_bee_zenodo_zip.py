#!/usr/bin/env python3
"""Bounded selective access to the publisher's large public ZIP.
No full-archive download, no extraction to disk, no training admission.
Publisher: Sledevic and Vdoviak, Zenodo version DOI 10.5281/zenodo.14929560, CC BY 4.0.
"""
import hashlib
import io
import json
import re
import stat
import zipfile
from pathlib import PurePosixPath
from urllib.parse import urlparse
from urllib.request import Request,urlopen

DOI="10.5281/zenodo.14929560"
RECORD="https://zenodo.org/api/records/14929560"
SIZE=11909319247
MD5="md5:1750347f386c8c7bef7a5c8d53a2be72"
BUDGET=24*1024*1024
MAX_REQUEST=8*1024*1024

class RangeReader(io.RawIOBase):
    def __init__(self,url,size,opener=urlopen,budget=BUDGET):
        super().__init__()
        if urlparse(url).scheme!="https" or size<=0:raise ValueError("invalid archive source")
        self.url=url;self.size=size;self.pos=0;self.received=0;self.requests=0
        self.opener=opener;self.budget=budget
    def readable(self):return True
    def seekable(self):return True
    def tell(self):return self.pos
    def seek(self,offset,whence=0):
        pos={0:0,1:self.pos,2:self.size}[whence]+offset
        if not 0<=pos<=self.size:raise ValueError("seek outside archive")
        self.pos=pos
        return pos
    def read(self,n=-1):
        if n<0:n=self.size-self.pos
        n=min(n,self.size-self.pos)
        if not n:return b""
        if n>MAX_REQUEST or self.received+n>self.budget or self.requests>=80:
            raise ValueError("range budget exceeded")
        end=self.pos+n-1
        req=Request(self.url,headers={"Range":f"bytes={self.pos}-{end}","Accept-Encoding":"identity","User-Agent":"Paseka-public-research/1.0"})
        self.requests+=1
        with self.opener(req,timeout=25) as response:
            if response.status!=206:raise ValueError("server did not honor range; full download refused")
            if urlparse(response.geturl()).scheme!="https":raise ValueError("insecure response")
            if response.headers.get("Content-Range")!=f"bytes {self.pos}-{end}/{self.size}":
                raise ValueError("range mismatch")
            if response.headers.get("Content-Encoding","identity")!="identity":
                raise ValueError("encoded archive range")
            raw=response.read(n+1)
            self.received+=len(raw)
            if len(raw)!=n:raise ValueError("truncated or excessive range")
        self.pos+=n
        return raw

def record():
    req=Request(RECORD,headers={"Accept":"application/json","User-Agent":"Paseka-public-research/1.0"})
    with urlopen(req,timeout=25) as response:raw=response.read(2*1024*1024+1)
    if len(raw)>2*1024*1024:raise ValueError("metadata size")
    d=json.loads(raw);m=d["metadata"];files=d["files"]
    if (d.get("doi",m.get("doi"))!=DOI or m.get("license",{}).get("id")!="cc-by-4.0"
        or m.get("access_right")!="open" or len(files)!=1):
        raise ValueError("publisher record changed")
    f=files[0]
    if f.get("key")!="dataset.zip" or f.get("size")!=SIZE or f.get("checksum")!=MD5:
        raise ValueError("publisher archive changed")
    url=f["links"]["self"]
    if urlparse(url).scheme!="https" or urlparse(url).hostname!="zenodo.org":
        raise ValueError("unexpected source host")
    return url

def safe_name(info):
    s=info.filename;p=PurePosixPath(s)
    if (not s or s.startswith("/") or "\\" in s or ":" in s or ".." in p.parts
        or stat.S_ISLNK(info.external_attr>>16) or info.flag_bits&1):
        raise ValueError("unsafe archive entry")
    return p

def read_entry(z,info,cap):
    if info.file_size>cap or info.compress_size>cap or info.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED):
        raise ValueError("sample entry exceeds bound")
    with z.open(info) as s:raw=s.read(cap+1)
    if len(raw)!=info.file_size or len(raw)>cap:raise ValueError("sample size mismatch")
    # ZipExtFile verifies CRC when the entry is read to EOF.
    return raw

def inspect(z):
    infos=z.infolist()
    if not 0<len(infos)<=100000:raise ValueError("entry count bound")
    names={};images={};labels={};groups={};config=[]
    for info in infos:
        p=safe_name(info)
        if info.filename in names:raise ValueError("duplicate member")
        names[info.filename]=info
        if info.is_dir():continue
        parent=str(p.parent)
        groups[parent]=groups.get(parent,0)+1
        parts=list(p.parts)
        if p.suffix.lower() in (".jpg",".jpeg",".png") and "images" in parts:
            parts[parts.index("images")]="labels";k=str(PurePosixPath(*parts).with_suffix(".txt"))
            if k in images:raise ValueError("ambiguous image label pair")
            images[k]=info
        if p.suffix.lower()==".txt" and "labels" in parts:labels[str(p)]=info
        if p.suffix.lower() in (".yaml",".yml") and info.file_size<65536:config.append(info.filename)
    paired=sorted(images.keys()&labels.keys())
    samples=[]
    # Only diagnostic CRC and local SHA, no redistribution and no training admission.
    if paired:
        key=paired[len(paired)//2];i=images[key];l=labels[key]
        iraw=read_entry(z,i,4*1024*1024);lraw=read_entry(z,l,65536)
        if not (iraw.startswith(b"\xff\xd8") or iraw.startswith(b"\x89PNG\r\n\x1a\n")):raise ValueError("invalid image header")
        samples.append({"image":i.filename,"label":l.filename,"imageBytes":len(iraw),"labelBytes":len(lraw),
            "imageSha256":hashlib.sha256(iraw).hexdigest(),"labelSha256":hashlib.sha256(lraw).hexdigest(),
            "labelLineCount":len(lraw.decode("utf-8").splitlines()),"entryCrcVerified":True})
    return {"entries":len(infos),"imageCandidates":len(images),"labelCandidates":len(labels),"pairedCandidates":len(paired),
            "directoryCounts":dict(sorted(groups.items())[:80]),"configNames":sorted(config)[:30],
            "firstNames":sorted(names)[:15],"samplePairs":samples,"archiveFullMd5Verified":False,
            "sourceSessionIndependenceVerified":False,"trainingAdmission":False}

def run():
    report={"doi":DOI,"license":"CC BY 4.0","archiveBytes":SIZE,"publisherMd5":MD5,"budgetBytes":BUDGET,
            "archiveFullMd5Verified":False,"trainingAdmission":False}
    reader=None
    try:
        reader=RangeReader(record(),SIZE)
        with zipfile.ZipFile(reader) as z:report.update(inspect(z))
        report["status"]="RANGE_DIRECTORY_INSPECTED"
    except Exception as e:
        report["status"]="STOP_WITHOUT_FULL_DOWNLOAD";report["errorType"]=type(e).__name__
        report["detail"]=str(e)[:200]
    if reader is not None:report["bytesRead"]=reader.received;report["rangeRequests"]=reader.requests
    return report

if __name__=="__main__":
    print("PUBLIC_BEE_RANGE_REPORT",json.dumps(run(),sort_keys=True,allow_nan=False),flush=True)
