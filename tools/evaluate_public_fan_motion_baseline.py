"""Offline motion-only baseline on the original Mendeley v6 fan MP4.

NOT a bee detector. Thresholded adjacent grayscale-frame differences detect
motion including non-bee motion, shadows and camera noise; stationary bees
can be missed. No training, model weights, Android inference or video deletion.
"""
import argparse
import hashlib
import json
import math
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy import ndimage

from audit_mendeley_v6_fan_tracks import FRAMES, TRACKS
from baseline_mendeley_v6_fan_association import associate_boxes
from compare_mendeley_v6_fan_frames import VIDEO, check_source
from evaluate_mendeley_v6_fan_tracks import evaluate, read_frames
from run_public_mendeley_v6_fan_baseline import TRACKS_URL, verify_bytes
from stage_mendeley_v6_public_csv import bounded_read

VIDEO_URL = (
    "https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/"
    "5e49dc33-a4b9-4be7-af18-f51871e6b71c/file_downloaded"
)
FRAME_WIDTH, FRAME_HEIGHT = 320, 180
FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT


def motion_boxes(previous, current, pixel_difference=25, min_area=3, max_area=600):
    """Small bounding boxes from connected moving-pixel components.

    Frame inputs are *actual gray pixel arrays*, not annotations, metadata,
    track IDs or label geometry. Fixed thresholds are experimental.
    """
    if (not isinstance(previous, np.ndarray) or not isinstance(current, np.ndarray)
        or previous.dtype != np.uint8 or current.dtype != np.uint8
        or previous.shape != (FRAME_HEIGHT, FRAME_WIDTH)
        or current.shape != (FRAME_HEIGHT, FRAME_WIDTH)):
        raise ValueError("expected same-size 320x180 uint8 decoded frames")
    if (type(pixel_difference) is not int or not 1 <= pixel_difference <= 255
        or type(min_area) is not int or type(max_area) is not int
        or not 1 <= min_area <= max_area <= FRAME_BYTES):
        raise ValueError("invalid motion threshold or area bounds")
    moving = np.abs(current.astype(np.int16) - previous.astype(np.int16)) >= pixel_difference
    labelled, count = ndimage.label(moving)
    slices = ndimage.find_objects(labelled)
    candidates = []
    for index, extent in enumerate(slices, 1):
        if extent is None:
            continue
        ys, xs = extent
        area = int(np.count_nonzero(labelled[extent] == index))
        if min_area <= area <= max_area:
            candidates.append((area, (xs.start / FRAME_WIDTH, ys.start / FRAME_HEIGHT,
                                      xs.stop / FRAME_WIDTH, ys.stop / FRAME_HEIGHT)))
    # Keep only 128 largest components. A limit on outputs is not a claim
    # that smaller blobs are not bees; record cap-hit frames in the report.
    candidates.sort(key=lambda entry: (-entry[0], entry[1]))
    capped = len(candidates) > 128
    return [bounds for _, bounds in candidates[:128]], capped


def decoded_gray_frames(video_path):
    """Stream exactly 6000 original decoded frames; reject truncated output."""
    command = ["ffmpeg", "-nostdin", "-v", "error", "-noautorotate",
               "-i", str(video_path), "-map", "0:v:0",
               "-vf", f"scale={FRAME_WIDTH}:{FRAME_HEIGHT}:flags=area,format=gray",
               "-fps_mode", "passthrough", "-f", "rawvideo", "pipe:1"]
    with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as process:
        try:
            for _ in range(FRAMES):
                buffer = process.stdout.read(FRAME_BYTES)
                if len(buffer) != FRAME_BYTES:
                    raise ValueError("source video decoded fewer than 6000 frames")
                yield np.frombuffer(buffer, dtype=np.uint8).reshape(FRAME_HEIGHT, FRAME_WIDTH).copy()
            if process.stdout.read(1):
                raise ValueError("source video produced more than 6000 frames")
            process.stdout.close()
            if process.wait() != 0:
                raise ValueError("ffmpeg decoding failed")
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()


def predict_video(video_path, pixel_difference=25, min_area=3, max_area=600):
    observations = []
    old = None
    overflow = 0
    for current in decoded_gray_frames(video_path):
        if old is None:
            found, capped = [], False
        else:
            found, capped = motion_boxes(old, current, pixel_difference, min_area, max_area)
        observations.append(dict(enumerate(found)))
        overflow += int(capped)
        old = current
    if len(observations) != FRAMES:
        raise ValueError("incomplete video")
    return observations, overflow


def run_public(fetch=bounded_read):
    """Fetch exactly two publisher-pinned files, process transient MP4 only."""
    with tempfile.TemporaryDirectory(prefix="paseka-public-motion-") as dirname:
        root = Path(dirname)
        video = fetch(VIDEO_URL, VIDEO[1])
        if len(video) != VIDEO[1] or hashlib.sha256(video).hexdigest() != VIDEO[2]:
            raise ValueError("original MP4 size/hash mismatch")
        (root / VIDEO[0]).write_bytes(video)
        del video
        source = fetch(TRACKS_URL, TRACKS[1])
        filename = verify_bytes(source)
        (root / filename).write_bytes(source)
        del source
        original_path = check_source(root, VIDEO)
        truth = read_frames(check_source(root, TRACKS))
        predictions, cap_hits = predict_video(original_path)
        geometry = evaluate(truth, predictions)
        association = associate_boxes(predictions)
        tracked = evaluate(truth, association)
    return {
        "source": "Mendeley Data v6 / original 20230711a-fan MP4 / published TXT",
        "originalVideoSha256": VIDEO[2],
        "originalTrackingSha256": TRACKS[2],
        "decodedFrames": len(predictions),
        "motionOnlyObservations": sum(map(len, predictions)),
        "motionComponentCapHitFrames": cap_hits,
        "motionThresholdGrayLevels": 25,
        "smallestComponentAreaPixels": 3,
        "largestComponentAreaPixels": 600,
        "sourceFramesResizedTo": [FRAME_WIDTH, FRAME_HEIGHT],
        "motionLocalization": geometry,
        "motionAssociation": tracked,
        "isMotionOnly": True,
        "realBeeNeuralDetectorEvaluated": False,
        "beeRecognitionSucceeded": False,
        "realAndroidInferenceVerified": False,
        "entranceCrossingsValidated": False,
        "videoCleanupAuthorized": False,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    print(json.dumps(run_public(), indent=2, allow_nan=False))
