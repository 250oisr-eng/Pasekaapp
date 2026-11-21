"""Compare the publisher-pinned July fan clip with a detection JPEG, offline."""
import argparse
import hashlib
import heapq
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

JPEG = ("20230711a0.jpg", 913881, "5063bce35b4e105d9c67d828cd9afeb8bb75d8462385384c5ffc256b4888ade9")
VIDEO = ("20230711a-fan.mp4", 128747654, "e0f3a7b1bd2b70ddc333f8caa17c7f029687dab2ea911ac7aff3902e4d5ad3cc")


def check_source(directory, spec):
    name, size, digest = spec
    path = directory / name
    if not path.is_file() or path.stat().st_size != size:
        raise ValueError(f"wrong source size: {name}")
    with path.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != digest:
            raise ValueError(f"wrong source digest: {name}")
    return path


def decoder(path, gray=False, first_only=False):
    args = ["ffmpeg", "-nostdin", "-v", "error", "-noautorotate", "-i", str(path), "-map", "0:v:0"]
    if first_only:
        args.extend(["-frames:v", "1"])
    if gray:
        args.extend(["-vf", "scale=160:90:flags=area,format=gray"])
    else:
        args.extend(["-pix_fmt", "rgb24"])
    return args + ["-fps_mode", "passthrough", "-f", "rawvideo", "pipe:1"]


def nearest(stream, target, expected_count):
    scores = []
    frame_bytes = target.width * target.height
    while frame := stream.read(frame_bytes):
        if len(frame) != frame_bytes or len(scores) >= expected_count:
            raise ValueError("unexpected decoded frame length or count")
        pixels = Image.frombytes("L", target.size, frame)
        scores.append(ImageStat.Stat(ImageChops.difference(pixels, target)).mean[0])
    if len(scores) != expected_count:
        raise ValueError("incomplete video")
    return heapq.nsmallest(3, enumerate(scores), key=lambda item: item[1])


def compare(directory):
    jpg = check_source(directory, JPEG)
    clip = check_source(directory, VIDEO)
    rgb = [subprocess.check_output(decoder(p, first_only=True)) for p in (jpg, clip)]
    if any(len(b) != 1920 * 1080 * 3 for b in rgb):
        raise ValueError("unexpected RGB frame length")
    pixels = [Image.frombytes("RGB", (1920, 1080), b) for b in rgb]
    difference = ImageChops.difference(*pixels)
    red, green, blue = difference.split()
    equal_pixels = ImageChops.lighter(ImageChops.lighter(red, green), blue).histogram()[0]
    gray = subprocess.check_output(decoder(jpg, gray=True, first_only=True))
    target = Image.frombytes("L", (160, 90), gray)
    with subprocess.Popen(decoder(clip, gray=True), stdout=subprocess.PIPE) as reader:
        try:
            closest = nearest(reader.stdout, target, 6000)
        finally:
            reader.stdout.close()
        if reader.wait():
            raise ValueError("video decoder failed")
    return {"rgb24Sha256": [hashlib.sha256(b).hexdigest() for b in rgb],
            "identicalPixelsAtIndexZero": equal_pixels,
            "meanAbsoluteRgbDifference": sum(ImageStat.Stat(difference).mean) / 3,
            "decodedFrames": 6000, "nearestByGrayMeanAbsoluteDifference": closest}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    print(json.dumps(compare(parser.parse_args().directory), indent=2))
