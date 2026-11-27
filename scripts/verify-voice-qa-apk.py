"""Verify the actual isolated APK contents; do not install or run it."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zipfile

PIN="961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4"
MODEL="assets/voice-qa/vosk-model-small-ru-0.22.zip"


def elf_load_alignment(data):
    if data[:4] != b"\x7fELF" or data[5] not in (1, 2):
        raise ValueError("invalid ELF")
    endian = "<" if data[5] == 1 else ">"
    if data[4] == 2:
        phoff = struct.unpack_from(endian+"Q",data,32)[0]
        phentsize,phnum = struct.unpack_from(endian+"HH",data,54)
        alignoff,alignfmt=48,"Q"
    elif data[4] == 1:
        phoff = struct.unpack_from(endian+"I",data,28)[0]
        phentsize,phnum = struct.unpack_from(endian+"HH",data,42)
        alignoff,alignfmt=28,"I"
    else:
        raise ValueError("unknown ELF class")
    if not phnum or phentsize < alignoff+struct.calcsize(alignfmt) or phoff+phentsize*phnum>len(data):
        raise ValueError("invalid ELF program headers")
    alignments=[]
    for i in range(phnum):
        offset=phoff+i*phentsize
        if struct.unpack_from(endian+"I",data,offset)[0]==1:
            alignments.append(struct.unpack_from(endian+alignfmt,data,offset+alignoff)[0])
    if not alignments:
        raise ValueError("no ELF PT_LOAD")
    return min(alignments)


def verify(apk):
    with zipfile.ZipFile(apk) as z:
        names=z.namelist()
        if len(set(names))!=len(names):
            raise ValueError("duplicate APK entries")
        if z.getinfo(MODEL).file_size!=46236750:
            raise ValueError("wrong embedded model size")
        sha=hashlib.sha256()
        with z.open(MODEL) as model:
            for chunk in iter(lambda:model.read(1024*1024),b""):
                sha.update(chunk)
        if sha.hexdigest()!=PIN:
            raise ValueError("embedded model SHA differs")
        html=z.read("assets/public/index.html")
        if b'id="qaVoicePanel"' not in html or b'./voice-qa.js' not in html:
            raise ValueError("QA UI not packaged")
        voice=z.read("assets/public/voice-qa.js")
        if b"PasekaOfflineSpeech" not in voice or b"aiJournalDraftInput" not in voice:
            raise ValueError("QA voice JS not packaged")
        worker=z.read("assets/public/daily-archive-worker.html")
        if b"bridge.finish(outcome)" not in worker or b'id="qaVoicePanel"' in worker:
            raise ValueError("daily worker changed or missing")
        required=["lib/arm64-v8a/libvosk.so","lib/arm64-v8a/libjnidispatch.so"]
        for name in required:
            if name not in names:
                raise ValueError("missing "+name)
        libs={name:elf_load_alignment(z.read(name)) for name in names if name.startswith("lib/") and name.endswith(".so")}
        arm64={name:align for name,align in libs.items() if name.startswith("lib/arm64-v8a/")}
        return {"embeddedModelSha256":sha.hexdigest(),"modelBytes":46236750,
                "qaUiPresent":True,"dailyWorkerPresent":True,"arm64Libraries":arm64,
                "arm64ElfLoadAlignmentAtLeast16k":all(v>=16384 for v in arm64.values()),
                "physicalRecognitionTested":False,"physicalPageSizeTested":False}


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("apk",type=Path)
    p.add_argument("report",type=Path)
    args=p.parse_args()
    result=verify(args.apk)
    report=json.dumps(result,indent=2)+"\n"
    args.report.write_text(report,encoding="utf-8")
    print(report)
