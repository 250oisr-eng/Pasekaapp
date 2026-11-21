"""Audit publisher-pinned track and entrance-zone files for the July fan clip."""
import argparse
import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

from compare_mendeley_v6_fan_frames import VIDEO, check_source

TRACKS = ("tracks_20230711a-fan.txt", 4817427,
          "8446fe874e2cf89041542e8740ef8c1d85086605987e5740e763b0edd20cec12")
ZONE = ("entrance_zone_20230711a-fan.txt", 70,
        "23a339cef571975e18fdaafbb01c988c0e3ec4668bac7a491c8effe54ad50580")
WIDTH, HEIGHT, FRAMES = 1920, 1080, 6000


def vertices(text):
    # Parse the published array literal as data. Never run the assignment.
    prefix = "polygon = np.array("
    if not text.startswith(prefix) or not text.endswith(")"):
        raise ValueError("invalid zone wrapper")
    points = json.loads(text[len(prefix):-1])
    if points != [[100, 220], [1860, 270], [1805, 590], [145, 545]]:
        raise ValueError("unexpected polygon for the pinned clip")
    return points


def in_zone(x, y, edges):
    # Published convex, consistently ordered polygon; include the boundary.
    return all((bx - ax) * (y - ay) >= (by - ay) * (x - ax)
               for (ax, ay), (bx, by) in edges)


def summarize(rows, polygon, frame_count=FRAMES):
    edges = list(zip(polygon, polygon[1:] + polygon[:1]))
    counts = Counter()
    seen = defaultdict(set)
    outside = out_of_frame = duplicates = 0
    for row in rows:
        if len(row) != 6:
            raise ValueError("expected six tracking columns")
        frame, track = map(int, row[:2])
        left, top, width, height = map(float, row[2:])
        if not 1 <= frame <= frame_count or track < 0:
            raise ValueError("invalid frame or track ID")
        if not all(map(math.isfinite, (left, top, width, height))) or min(width, height) <= 0:
            raise ValueError("invalid bounding box")
        counts[frame] += 1
        duplicates += frame in seen[track]
        seen[track].add(frame)
        out_of_frame += left < 0 or top < 0 or left + width > 1 or top + height > 1
        outside += not in_zone((left + width / 2) * WIDTH, (top + height / 2) * HEIGHT, edges)
    if not counts:
        raise ValueError("empty track file")
    area = abs(sum(a[0]*b[1] - a[1]*b[0] for a, b in edges)) / 2
    return {"frameIdRange": [min(counts), max(counts)], "framesWithRows": len(counts),
            "rows": sum(counts.values()), "uniqueTrackIds": len(seen),
            "duplicateFrameIdTrackIdRows": duplicates,
            "trackIdsWithFrameGaps": sum(max(s)-min(s)+1 != len(s) for s in seen.values()),
            "minMaxRowsPerAnnotatedFrame": [min(counts.values()), max(counts.values())],
            "boxCentersOutsidePolygon": outside, "boxesOutsideImage": out_of_frame,
            "zonePixels": polygon, "polygonAreaPixelsSquared": area,
            "fractionOfImage": area / (WIDTH * HEIGHT)}


def audit(directory):
    check_source(directory, VIDEO)
    polygon = vertices(check_source(directory, ZONE).read_text(encoding="ascii"))
    with check_source(directory, TRACKS).open(encoding="ascii", newline="") as source:
        return summarize(csv.reader(source), polygon)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    print(json.dumps(audit(parser.parse_args().directory), indent=2))
