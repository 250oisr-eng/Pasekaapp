#!/usr/bin/env python3
"""Read-only stdlib ZIP inspection of a manually obtained PUBLIC bee dataset."""
import argparse
import hashlib
import json
import re
import stat
import sys
import zipfile
from pathlib import Path

MAX_ENTRIES=10000
MAX_MEMBER=512*1024*1024
MAX_TOTAL=2*1024*1024*1024
MAX_RATIO=200
CHUNK=1024*1024
LICENSE_NAME=re.compile(r"(?:^|/)(?:license(?:\.[^/]*)?|licence(?:\.[^/]*)?|copying(?:\.[^/]*)?|readme(?:\.[^/]*)?|notice(?:\.[^/]*)?|attribution(?:\.[^/]*)?)$",re.I)

class ArchiveRejected(ValueError):
    pass

def normalized_name(name):
    if not isinstance(name,str) or not name or len(name)>512:
        raise ArchiveRejected('unsafe_entry_name')
    if '\\' in name or name.startswith('/') or ':' in name or re.search(r'[\x00-\x1f\x7f]',name):
        raise ArchiveRejected('unsafe_entry_name')
    parts=name.rstrip('/').split('/')
    if any(p in ('','.','..') for p in parts):
        raise ArchiveRejected('unsafe_entry_name')
    return '/'.join(parts)

def inspect_archive(path):
    archive_path=Path(path)
    if not archive_path.is_file() or not zipfile.is_zipfile(archive_path):
        raise ArchiveRejected('not_zip_archive')
    archive_hash=hashlib.sha256()
    with archive_path.open('rb') as source:
        for chunk in iter(lambda:source.read(CHUNK),b''):
            archive_hash.update(chunk)
    with zipfile.ZipFile(archive_path) as z:
        entries=z.infolist()
        if not entries or len(entries)>MAX_ENTRIES:
            raise ArchiveRejected('entry_count_invalid')
        names=set()
        bytes_total=0
        inventory=[]
        for entry in entries:
            name=normalized_name(entry.filename)
            key=name.casefold()
            if key in names:
                raise ArchiveRejected('duplicate_or_case_conflicting_name')
            names.add(key)
            mode=(entry.external_attr>>16)&0xffff
            if stat.S_ISLNK(mode):
                raise ArchiveRejected('symlink_not_allowed')
            if entry.flag_bits&1:
                raise ArchiveRejected('encrypted_entry_not_allowed')
            if entry.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED):
                raise ArchiveRejected('compression_not_supported')
            if entry.is_dir():
                if entry.file_size:
                    raise ArchiveRejected('directory_not_empty')
                continue
            if entry.file_size>MAX_MEMBER or entry.file_size<0:
                raise ArchiveRejected('member_too_large')
            bytes_total+=entry.file_size
            if bytes_total>MAX_TOTAL:
                raise ArchiveRejected('archive_too_large')
            if entry.file_size>1024*1024 and entry.file_size/max(1,entry.compress_size)>MAX_RATIO:
                raise ArchiveRejected('compression_ratio_excessive')
            digest=hashlib.sha256()
            actual=0
            try:
                with z.open(entry) as member:
                    while data:=member.read(CHUNK):
                        actual+=len(data)
                        if actual>entry.file_size or actual>MAX_MEMBER:
                            raise ArchiveRejected('decompressed_size_exceeded')
                        digest.update(data)
            except (RuntimeError,EOFError,zipfile.BadZipFile,OSError) as exc:
                raise ArchiveRejected('archive_member_corrupt') from exc
            if actual!=entry.file_size:
                raise ArchiveRejected('member_size_mismatch')
            inventory.append({'path':name,'bytes':actual,'sha256':digest.hexdigest()})
    documents=[v['path'] for v in inventory if LICENSE_NAME.search(v['path'])]
    return {
        'stage':'zip_integrity_inventory_only',
        'archiveSha256':archive_hash.hexdigest(),
        'fileCount':len(inventory),
        'totalUncompressedBytes':bytes_total,
        'licenseDocumentCandidates':documents,
        'entries':inventory,
        'licenseVerified':False,
        'trainingAuthorized':False,
        'modelApproved':False,
        'recognitionSucceeded':False,
        'cleanupAuthorized':False,
    }

def main(argv=None):
    ap=argparse.ArgumentParser(description='Read-only scan of an independently supplied public bee ZIP')
    ap.add_argument('archive',help='local ZIP path (no downloads or extraction)')
    args=ap.parse_args(argv)
    try:
        print(json.dumps(inspect_archive(args.archive),ensure_ascii=False,indent=2))
    except (ArchiveRejected,zipfile.BadZipFile,OSError) as exc:
        print(json.dumps({'ok':False,'reason':str(exc),'trainingAuthorized':False,'cleanupAuthorized':False}),file=sys.stderr)
        return 1
    return 0

if __name__=='__main__':
    raise SystemExit(main())
