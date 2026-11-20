#!/usr/bin/env python3
"""Read-only public ZIP directory audit: pairing and extension inconsistencies, no image fetch."""
import json
import sys
from sample_lila_voc_range import BoundedRanges, SampleRejected, inspect_directory
from sample_lila_five_pairs import spread_indices

MAX_EXAMPLES=12


def audit_entries(entries):
    photos=[e["name"] for e in entries if e["name"].lower().endswith((".jpg",".jpeg"))]
    xmls=[e["name"] for e in entries if e["name"].lower().endswith(".xml")]
    xmls.sort(key=str.casefold)
    names={e["name"].casefold() for e in entries}
    missing=[]
    ambiguous=[]
    paired=0
    for path in xmls:
        stem=path[:-4]
        hits=[k for k in ((stem+".jpg").casefold(),(stem+".jpeg").casefold()) if k in names]
        if len(hits)==1:
            paired+=1
        elif len(hits)>1:
            ambiguous.append(path)
        else:
            missing.append(path)
    xml_stems={p[:-4].casefold() for p in xmls}
    orphans=[p for p in photos if p.rsplit(".",1)[0].casefold() not in xml_stems]
    indices=spread_indices(len(xmls)) if len(xmls)>=5 else []
    selected=[]
    for i in indices:
        p=xmls[i]
        stem=p[:-4]
        hits=[k for k in ((stem+".jpg").casefold(),(stem+".jpeg").casefold()) if k in names]
        selected.append({"index":i,"xml":p,"matchingJpegEntries":len(hits)})
    return {
        "ok":True,
        "stage":"public_zip_filename_catalog_only",
        "entries":len(entries),
        "vocCount":len(xmls),
        "jpegCount":len(photos),
        "exactPairCount":paired,
        "xmlWithoutExactJpegCount":len(missing),
        "xmlWithAmbiguousJpegCount":len(ambiguous),
        "jpegWithoutExactXmlCount":len(orphans),
        "unmatchedXmlExamples":missing[:MAX_EXAMPLES],
        "unmatchedJpegExamples":orphans[:MAX_EXAMPLES],
        "ambiguousXmlExamples":ambiguous[:MAX_EXAMPLES],
        "fiveSelectedXmlEntries":selected,
        "filenameGroupingVerified":False,
        "originalVideoIdentityVerified":False,
        "trainingSplitAvailable":False,
        "archiveDownloaded":False,
        "licenseVerified":False,
        "trainingAuthorized":False,
        "recognitionSucceeded":False,
        "cleanupAuthorized":False,
    }


def inspect_public():
    reader=BoundedRanges()
    entries=inspect_directory(reader)
    report=audit_entries(entries)
    report["rangeBytesFetched"]=reader.used
    return report


def main():
    try:
        print(json.dumps(inspect_public(),ensure_ascii=False,indent=2))
        return 0
    except SampleRejected as exc:
        print(json.dumps({"ok":False,"reason":str(exc),
                          "trainingAuthorized":False,"cleanupAuthorized":False}),
              file=sys.stderr)
        return 1


if __name__=="__main__":
    sys.exit(main())
