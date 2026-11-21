"""Read-only polygon-boundary diagnostic on genuine published fan tracking labels.

The publisher's polygon is a region of interest, NOT a calibrated in/out
entrance line. Geometry-only transitions are not bee traffic ground truth.
Never trains, runs a detector, updates the apiary, or deletes video.
"""
import hashlib
import json
import tempfile
from collections import Counter
from pathlib import Path

from audit_mendeley_v6_fan_tracks import (
    FRAMES, HEIGHT, TRACKS, WIDTH, ZONE, in_zone, vertices,
)
from evaluate_mendeley_v6_fan_tracks import read_frames
from run_public_mendeley_v6_fan_baseline import TRACKS_URL, verify_bytes
from stage_mendeley_v6_public_csv import bounded_read

ZONE_URL = (
    "https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/"
    "7fa8a906-4f75-4559-bd60-9b557ec2c8a8/file_downloaded"
)


def classify_zone_transitions(frames, polygon):
    """Measure adjacent-frame centroid changes across an uncalibrated polygon.

    Only frames adjacent in source chronology and matching published track IDs
    are comparable. Bridging across dropped observations is prohibited.
    """
    if not isinstance(frames, list) or not frames:
        raise ValueError("source frames must be a nonempty list")
    if (not isinstance(polygon, list) or len(polygon) < 3
        or any(not isinstance(p, list) or len(p) != 2 for p in polygon)):
        raise ValueError("source polygon is missing or malformed")
    edges=list(zip(polygon,polygon[1:]+polygon[:1]))
    previous={}
    seen={}
    last_event={}
    stats=Counter()
    changed_track_ids=set()
    n_events=0
    for idx,frame in enumerate(frames):
        if not isinstance(frame,dict):
            raise ValueError("frame must be an ID-to-bbox mapping")
        current={}
        for track_id, box in frame.items():
            if type(track_id) is not int or track_id < 0 or len(box)!=4:
                raise ValueError("invalid reference ID or box")
            x1,y1,x2,y2=box
            if not all(isinstance(v,(int,float)) and __import__('math').isfinite(v) for v in box):
                raise ValueError("invalid or nonfinite reference box")
            if not 0<=x1<x2<=1 or not 0<=y1<y2<=1:
                raise ValueError("reference bbox outside normalized image")
            current[track_id]=in_zone((x1+x2)*WIDTH/2,(y1+y2)*HEIGHT/2,edges)
            stats["sourceObservations"]+=1
            stats["centersOutsidePublisherPolygon"]+=not current[track_id]
            if track_id in seen and seen[track_id]<idx-1:
                stats["gapReappearancesNotInterpretableAsCrossing"]+=1
            if track_id in previous:
                stats["comparableAdjacentSameIdTransitions"]+=1
                if current[track_id]!=previous[track_id]:
                    n_events+=1
                    stats["polygonEntryCandidates" if current[track_id] else "polygonExitCandidates"]+=1
                    changed_track_ids.add(track_id)
                    before=last_event.get(track_id)
                    if before and idx-before[0]<=2 and before[1]!=current[track_id]:
                        stats["rapidOppositePolygonBoundaryReversals"]+=1
                    last_event[track_id]=(idx,current[track_id])
            seen[track_id]=idx
        previous=current
    return {
        "framesEvaluated":len(frames),
        "uniquePublisherTrackIds":len(seen),
        "referenceObservations":stats["sourceObservations"],
        "centersOutsidePublisherPolygon":stats["centersOutsidePublisherPolygon"],
        "adjacentSameIdComparisons":stats["comparableAdjacentSameIdTransitions"],
        "polygonEntryCandidates":stats["polygonEntryCandidates"],
        "polygonExitCandidates":stats["polygonExitCandidates"],
        "polygonBoundaryTransitionCandidates":n_events,
        "tracksWithPolygonTransitions":len(changed_track_ids),
        "gapReappearancesNotInterpretableAsCrossing":stats["gapReappearancesNotInterpretableAsCrossing"],
        "rapidOppositePolygonBoundaryReversals":stats["rapidOppositePolygonBoundaryReversals"],
        "publisherPolygonIsCalibratedEntranceLine":False,
        "physicalInsideOutsideOrientationVerified":False,
        "independentBeeInOutEventLabelsVerified":False,
        "actualBeeTrafficCountValidated":False,
        "neuralDetectorEvaluated":False,
        "androidOfflineInferenceVerified":False,
        "beeRecognitionSucceeded":False,
        "videoCleanupAuthorized":False,
    }


def run_public(fetch=bounded_read):
    with tempfile.TemporaryDirectory(prefix="paseka-public-zone-transitions-") as tmp:
        root=Path(tmp)
        tracks=fetch(TRACKS_URL, TRACKS[1])
        track_name=verify_bytes(tracks)
        (root/track_name).write_bytes(tracks)
        del tracks
        zone=fetch(ZONE_URL, ZONE[1])
        if len(zone)!=ZONE[1] or hashlib.sha256(zone).hexdigest()!=ZONE[2]:
            raise ValueError("publisher entrance polygon source SHA/size mismatch")
        polygon=vertices(zone.decode("ascii"))
        frames=read_frames(root/track_name)
        if len(frames)!=FRAMES:
            raise ValueError("unexpected original frame count")
        report=classify_zone_transitions(frames,polygon)
    return {
        "source":"Mendeley Data v6 / 20230711a-fan original tracks and entrance polygon",
        "originalTrackingSha256":TRACKS[2],
        "originalEntrancePolygonSha256":ZONE[2],
        "publishedPolygonPixels":polygon,
        **report,
    }


if __name__=="__main__":
    print(json.dumps(run_public(),indent=2,allow_nan=False))
