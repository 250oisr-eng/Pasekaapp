#!/usr/bin/env python3
"""Merge small verified-link CSV chunks to an offline v6 inventory, *not* splits.

No network, image/video download, training, deletion or mutation of source CSVs.
Both original SHA256 pins are mandatory, but this metadata-only operation DOES
NOT re-download or rehash the source image/label bytes. A complete *count* of
7200 frames is not proof of license, provenance, independence or correctness.
"""
import argparse
import re
import json
import os
import tempfile
from collections import Counter
from pathlib import Path

from prepare_mendeley_v6_yolo_unassigned import GROUP_COUNTS
from stage_mendeley_v6_public_csv import (
    CSVStageRejected, MAX_PAIRS, parse_manifest, read_csv_file,
)

MAX_CHUNKS = 500  # up to 8000 rows; duplicate/incomplete guards still apply
MAX_ROWS = sum(GROUP_COUNTS.values())
SHA_256_HEX = re.compile(r'[0-9a-f]{64}\Z')


class InventoryRejected(ValueError):
    pass


def load_manifest_chunks(paths):
    if not 1 <= len(paths) <= MAX_CHUNKS:
        raise InventoryRejected("manifest_chunk_count_invalid")
    all_rows = []
    local_paths = set()
    for path in paths:
        entry = Path(path)
        try:
            canonical = entry.resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            raise InventoryRejected("manifest_file_unavailable") from exc
        if canonical in local_paths:
            raise InventoryRejected("duplicate_input_manifest_path")
        local_paths.add(canonical)
        rows = parse_manifest(read_csv_file(entry))  # fail-closed symlink/hardlink/URL
        all_rows.extend(rows)
        if len(all_rows) > MAX_ROWS:
            raise InventoryRejected("too_many_source_rows")
    return all_rows


def build_metadata_inventory(rows):
    if not 1 <= len(rows) <= MAX_ROWS:
        raise InventoryRejected("inventory_row_count_invalid")
    keys, file_uuids, jpeg_hashes = set(), set(), set()
    counts = Counter()
    entries = []
    for row in rows:
        group, image = row["group"], row["image"]
        if group not in GROUP_COUNTS:
            raise InventoryRejected("unexpected_published_group")
        imgsha, labsha = row.get("image_sha256"), row.get("label_sha256")
        if not imgsha or not labsha:
            raise InventoryRejected("sha256_pins_required")
        if not SHA_256_HEX.fullmatch(imgsha) or not SHA_256_HEX.fullmatch(labsha):
            raise InventoryRejected("sha256_pins_malformed")
        key = (group, image.casefold())
        if key in keys:
            raise InventoryRejected("same_frame_repeated_across_csv_chunks")
        keys.add(key)
        if imgsha in jpeg_hashes:
            raise InventoryRejected("same_jpeg_sha_across_csv_chunks")
        jpeg_hashes.add(imgsha)
        # URL syntax has already been checked by parse_manifest; no URL is opened.
        for u in (row["image_url"], row["label_url"]):
            if u in file_uuids:
                raise InventoryRejected("public_file_uuid_reused_across_chunks")
            file_uuids.add(u)
        counts[group] += 1
        if counts[group] > GROUP_COUNTS[group]:
            raise InventoryRejected("more_frames_than_published_for_group")
        entries.append({
            "hiveCollectionFolder": group,
            "filename": image,
            "imageSha256PinnedNotRecheckedHere": imgsha,
            "labelFilename": row["label"],
            "labelSha256PinnedNotRecheckedHere": labsha,
            "imageUrl": row["image_url"],
            "labelUrl": row["label_url"],
            "sourceVideoSha256": None,
            "sourceVideoFrameIndex": None,
            "sourcePhysicalHiveIdentity": None,
            "recordingIndependenceVerified": False,
        })
    entries.sort(key=lambda x: (x["hiveCollectionFolder"], x["filename"].casefold()))
    per_group = [
        {
            "hiveCollectionFolder": group,
            "inventoryPairs": counts[group],
            "publishedExpectedPairs": published,
            "missingPairsRelativeToPublishedCount": published - counts[group],
        }
        for group, published in sorted(GROUP_COUNTS.items())
    ]
    complete_counts = all(x["missingPairsRelativeToPublishedCount"] == 0 for x in per_group)
    return {
        "sourceDoi": "10.17632/8gb9r2yhfc.6",
        "sourceAuthor": "Tomyslav Sledevic",
        "sourceLicense": "CC BY 4.0",
        "sourceLicenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "stage": "metadata_only_source_url_sha_inventory",
        "inventoryPairs": len(entries),
        "publishedExpectedPairs": MAX_ROWS,
        "missingPairsRelativeToPublication": MAX_ROWS - len(entries),
        "publishedGroupCounts": per_group,
        "sourceHashesPinnedInCsvNotRecheckedByMerge": True,
        "originalSourceBytesDownloadedInThisStep": False,
        "countCoverageCompleteButNotIntegrityEvidence": complete_counts,
        "allRecordingBytesAndFrameProvenanceVerified": False,
        "independentHiveAndSessionHoldoutVerified": False,
        "trainValTestSplitCreated": False,
        "trainingAuthorized": False,
        "modelApproved": False,
        "recognitionSucceeded": False,
        "cleanupAuthorized": False,
        "files": entries,
    }


def publish_new_inventory(data, path):
    target = Path(path).absolute()
    if target.exists() or target.is_symlink():
        raise InventoryRejected("inventory_output_already_exists")
    parent = target.parent
    if parent.is_symlink() or not parent.is_dir():
        raise InventoryRejected("inventory_output_parent_invalid")
    # Output cannot overwrite a source; link-without-replace rejects any race.
    fd, tempname = tempfile.mkstemp(prefix=".paseka-v6-inventory-", suffix=".json", dir=parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as dst:
            json.dump(data, dst, ensure_ascii=False, indent=2, allow_nan=False)
            dst.write("\n")
        os.link(tempname, target)
    finally:
        os.unlink(tempname)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Merge pinned original Mendeley v6 Work CSVs; never train or split")
    parser.add_argument("input_csv", nargs="+", help="1 to 500 original v6 metadata CSV batches")
    parser.add_argument("--output-json", required=True, help="New inventory JSON; no overwrite")
    args = parser.parse_args(argv)
    try:
        inventory = build_metadata_inventory(load_manifest_chunks(args.input_csv))
        publish_new_inventory(inventory, args.output_json)
        print(json.dumps({
            "stage": inventory["stage"],
            "inventoryPairs": inventory["inventoryPairs"],
            "publishedExpectedPairs": inventory["publishedExpectedPairs"],
            "missingPairsRelativeToPublication": inventory["missingPairsRelativeToPublication"],
            "countCoverageCompleteButNotIntegrityEvidence":
                inventory["countCoverageCompleteButNotIntegrityEvidence"],
            "originalSourceBytesDownloadedInThisStep": False,
            "trainValTestSplitCreated": False,
            "trainingAuthorized": False, "cleanupAuthorized": False,
        }))
        return 0
    except (InventoryRejected, CSVStageRejected, OSError) as exc:
        print(json.dumps({"ok": False, "reason": str(exc),
                          "trainingAuthorized": False, "cleanupAuthorized": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
