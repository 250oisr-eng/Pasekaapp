#!/usr/bin/env python3
"""Offline JPEG/PNG+Pascal VOC to COCO: UNASSIGNED only, never train/test split."""
import argparse
import hashlib
import json
import math
import os
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET
from sample_lila_voc_range import image_header_dimensions, SampleRejected

CATEGORIES={"bee":1,"pollen":2}
MAX_XML=256*1024
MAX_IMAGE=16*1024*1024
MAX_IMAGES=10000
MAX_OBJECTS=500000


class ConversionRejected(ValueError):
    pass


def parse_annotation(xml_bytes,expected_name,image_width,image_height):
    if len(xml_bytes)>MAX_XML or b"<!DOCTYPE" in xml_bytes.upper() or b"<!ENTITY" in xml_bytes.upper():
        raise ConversionRejected("xml_unsafe")
    try:
        root=ET.fromstring(xml_bytes)
        if root.tag!="annotation":
            raise ConversionRejected("xml_root_invalid")
        filename=root.findtext("./filename")
        if filename and Path(filename.replace("\\","/")).name!=expected_name:
            raise ConversionRejected("xml_filename_mismatch")
        width=int(root.findtext("./size/width"))
        height=int(root.findtext("./size/height"))
        if (width,height)!=(image_width,image_height):
            raise ConversionRejected("xml_jpeg_dimensions_mismatch")
        annotations=[]
        for obj in root.findall("object"):
            cls=obj.findtext("name")
            if cls not in CATEGORIES:
                raise ConversionRejected("unknown_object_class")
            box=obj.find("bndbox")
            if box is None:
                raise ConversionRejected("missing_bbox")
            values=[float(box.findtext(key)) for key in ("xmin","ymin","xmax","ymax")]
            x1,y1,x2,y2=values
            if not all(math.isfinite(v) for v in values) or not (0<=x1<x2<=width and 0<=y1<y2<=height):
                raise ConversionRejected("invalid_bbox")
            dx=x2-x1;dy=y2-y1
            annotations.append({"category_id":CATEGORIES[cls],"bbox":[x1,y1,dx,dy],
                                "area":dx*dy,"iscrowd":0})
        return annotations
    except ConversionRejected:
        raise
    except (ET.ParseError,ValueError,TypeError,AttributeError,OverflowError) as exc:
        raise ConversionRejected("xml_annotation_invalid") from exc


def local_file(path,root,max_bytes):
    if path.is_symlink():
        raise ConversionRejected("symlink_forbidden")
    actual=path.resolve(strict=True)
    if not actual.is_relative_to(root) or not actual.is_file():
        raise ConversionRejected("path_escape_or_missing")
    size=actual.stat().st_size
    if not 0<size<=max_bytes:
        raise ConversionRejected("file_size_invalid")
    return actual


def build_unassigned(source_root):
    root=Path(source_root).resolve(strict=True)
    if not root.is_dir():
        raise ConversionRejected("source_root_invalid")
    xmls=sorted(root.rglob("*.xml"),key=lambda p:p.as_posix())
    images_on_disk=sorted([*root.rglob("*.jpg"),*root.rglob("*.jpeg"),*root.rglob("*.png")],key=lambda p:p.as_posix())
    if not xmls or len(xmls)>MAX_IMAGES or len(images_on_disk)!=len(xmls):
        raise ConversionRejected("image_xml_count_mismatch")
    result={"info":{"description":"LILA VOC source inventory: UNASSIGNED; NOT TRAINING READY",
                    "split":"unassigned","trainingAuthorized":False},
            "categories":[{"id":1,"name":"bee"},{"id":2,"name":"pollen"}],
            "images":[],"annotations":[]}
    image_names=set()
    annotation_count=0
    for xml_path in xmls:
        xml=local_file(xml_path,root,MAX_XML)
        relative=xml.relative_to(root)
        matches=[p for p in (xml.with_suffix(".jpg"),xml.with_suffix(".jpeg"),xml.with_suffix(".png")) if p.exists()]
        if len(matches)!=1:
            raise ConversionRejected("image_pair_missing_or_ambiguous")
        image=local_file(matches[0],root,MAX_IMAGE)
        relative_image=image.relative_to(root).as_posix()
        key=relative_image.casefold()
        if key in image_names:
            raise ConversionRejected("duplicate_image_path")
        image_names.add(key)
        with image.open("rb") as stream:
            header=stream.read(65536)
        try:
            width,height=image_header_dimensions(header,image.name)
        except SampleRejected as exc:
            raise ConversionRejected("image_header_invalid") from exc
        contents=xml.read_bytes()
        parsed=parse_annotation(contents,image.name,width,height)
        image_id=len(result["images"])+1
        digest=hashlib.sha256()
        with image.open("rb") as stream:
            for part in iter(lambda:stream.read(1024*1024),b""):
                digest.update(part)
        result["images"].append({"id":image_id,"file_name":relative_image,
                                 "width":width,"height":height,"sha256":digest.hexdigest()})
        for ann in parsed:
            annotation_count+=1
            if annotation_count>MAX_OBJECTS:
                raise ConversionRejected("annotations_excessive")
            result["annotations"].append({"id":annotation_count,"image_id":image_id,**ann})
    if len(image_names)!=len(images_on_disk):
        raise ConversionRejected("unpaired_jpeg_present")
    return result


def publish_unassigned(source_root,output_json):
    root=Path(source_root).resolve(strict=True)
    target=Path(output_json).absolute()
    parent=target.parent.resolve(strict=True)
    if (target==root or target.is_relative_to(root) or root.is_relative_to(target) or
        parent==root or parent.is_relative_to(root)):
        raise ConversionRejected("output_overlaps_source")
    if target.exists() or target.is_symlink():
        raise ConversionRejected("output_already_exists")
    data=build_unassigned(root)
    fd,tmp=tempfile.mkstemp(prefix=".paseka-voc-stage-",suffix=".json",dir=parent)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as out:
            json.dump(data,out,ensure_ascii=False,indent=2,allow_nan=False)
            out.write("\n")
        # Hard-link final publication is atomic and refuses overwriting an existing file.
        os.link(tmp,target)
    finally:
        os.unlink(tmp)
    return {"ok":True,"stage":"coco_unassigned_only","images":len(data["images"]),
            "annotations":len(data["annotations"]),"output":str(target),
            "trainingAuthorized":False,"modelApproved":False,
            "recognitionSucceeded":False,"cleanupAuthorized":False}


def main(argv=None):
    p=argparse.ArgumentParser(description="Local VOC -> COCO, unassigned and not for training")
    p.add_argument("source_root")
    p.add_argument("output_json")
    args=p.parse_args(argv)
    try:
        print(json.dumps(publish_unassigned(args.source_root,args.output_json),ensure_ascii=False))
        return 0
    except (ConversionRejected,OSError) as exc:
        print(json.dumps({"ok":False,"reason":str(exc),"trainingAuthorized":False,
                          "cleanupAuthorized":False}),file=__import__("sys").stderr)
        return 1


if __name__=="__main__":
    raise SystemExit(main())
