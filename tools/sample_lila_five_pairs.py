#!/usr/bin/env python3
"""Five deterministic public VOC/JPEG pair audits over ZIP HTTP Range, without full download."""
import hashlib
import json
import sys
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET
from sample_lila_voc_range import (
    BoundedRanges, SampleRejected, inspect_directory, sample_member,
    parse_voc, jpeg_header_dimensions, MAX_XML,
)

PAIR_COUNT=5
MAX_JPEG_SAMPLE=3*1024*1024
NETWORK_BUDGET=24*1024*1024


def spread_indices(total,count=PAIR_COUNT):
    """Fixed index quantiles, not random frames or claimed independent sources."""
    if not isinstance(total,int) or total<count or count<2:
        raise SampleRejected("insufficient_sample_population")
    return [i*(total-1)//(count-1) for i in range(count)]


def evaluate_sample(reader,xml_entry,lookup):
    original=sample_member(reader,xml_entry,MAX_XML)
    data=parse_voc(original)
    expected=PurePosixPath(xml_entry["name"])
    stem=str(expected)[:-4]
    partners=[lookup[k] for k in ((stem+".jpg").casefold(),(stem+".jpeg").casefold()) if k in lookup]
    if len(partners)!=1:
        raise SampleRejected("jpeg_pair_missing_or_ambiguous")
    partner=partners[0]
    # A filename field, if present, must agree with the actual paired JPEG.
    try:
        declared=ET.fromstring(original).findtext("filename")
    except ET.ParseError as exc:
        raise SampleRejected("voc_xml_invalid") from exc
    if declared and PurePosixPath(declared.replace("\\","/")).name.casefold()!=PurePosixPath(partner["name"]).name.casefold():
        raise SampleRejected("voc_filename_mismatch")
    jpeg=sample_member(reader,partner,MAX_JPEG_SAMPLE)
    width,height=jpeg_header_dimensions(jpeg)
    if (width,height)!=(data["width"],data["height"]):
        raise SampleRejected("jpeg_voc_dimensions_mismatch")
    return {
        "vocName":xml_entry["name"],
        "jpegName":partner["name"],
        "vocSha256":hashlib.sha256(original).hexdigest(),
        "jpegSha256":hashlib.sha256(jpeg).hexdigest(),
        "jpegBytes":len(jpeg),
        "width":width,"height":height,
        "objectsByClass":data["objectsByClass"],
    }


def inspect_representative_pairs(opener=None):
    reader=BoundedRanges(opener=opener,budget=NETWORK_BUDGET)
    entries=inspect_directory(reader)
    xmls=sorted((e for e in entries if e["name"].lower().endswith(".xml")),
                key=lambda e:e["name"].casefold())
    lookup={e["name"].casefold():e for e in entries}
    indexes=spread_indices(len(xmls))
    inspected=[evaluate_sample(reader,xmls[i],lookup) for i in indexes]
    counts={}
    for pair in inspected:
        for cls,n in pair["objectsByClass"].items():
            counts[cls]=counts.get(cls,0)+n
    return {
        "ok":True,
        "stage":"public_lila_five_pair_sample_only",
        "populationEntries":len(entries),
        "populationXmlCandidates":len(xmls),
        "selection":"five_evenly_spaced_xml_filenames_in_sorted_zip_catalog",
        "sampleXmlIndices":indexes,
        "samplePairs":inspected,
        "observedObjectsByClass":counts,
        "rangeBytesFetched":reader.used,
        "sourceVideoIdentityVerified":False,
        "independentTrainTestSplitAvailable":False,
        "jpegFullyDecoded":False,
        "entireArchiveDownloaded":False,
        "entireArchiveShaVerified":False,
        "licenseVerified":False,
        "trainingAuthorized":False,
        "modelApproved":False,
        "recognitionSucceeded":False,
        "cleanupAuthorized":False,
    }


def main():
    try:
        print(json.dumps(inspect_representative_pairs(),ensure_ascii=False,indent=2))
        return 0
    except SampleRejected as exc:
        print(json.dumps({
            "ok":False,"reason":str(exc),
            "sourceVideoIdentityVerified":False,
            "trainingAuthorized":False,"cleanupAuthorized":False,
        },ensure_ascii=False),file=sys.stderr)
        return 1


if __name__=="__main__":
    sys.exit(main())
