#!/usr/bin/env python3
"""Validate only structural grouping of a PROPOSED v6 train/val/test split.

Metadata-only inputs cannot establish recording identity or frame provenance.
Even an apparently disjoint 8-group proposal is NEVER training authorization.
This tool never materializes split folders, reads user media, or assigns labels.
"""
import argparse
import json
from collections import Counter
from pathlib import Path

from prepare_mendeley_v6_yolo_unassigned import GROUP_COUNTS

MAX_MANIFEST_JSON_BYTES = 16 * 1024 * 1024
MAX_PROPOSAL_JSON_BYTES = 8 * 1024
SPLIT_NAMES = ("train", "validation", "test")
DOI = "10.17632/8gb9r2yhfc.6"


class SplitProposalRejected(ValueError):
    pass


def read_limited_json(path, cap):
    p = Path(path)
    if p.is_symlink() or not p.is_file():
        raise SplitProposalRejected("missing_or_symlink_json")
    st = p.stat()
    if st.st_nlink != 1 or not 0 < st.st_size <= cap:
        raise SplitProposalRejected("json_link_or_size_invalid")
    raw = p.read_bytes()
    if len(raw) > cap:
        raise SplitProposalRejected("json_too_large")
    try:
        return json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SplitProposalRejected("invalid_json") from exc


def assess_split_structure(inventory, proposal):
    if not isinstance(inventory, dict) or not isinstance(proposal, dict):
        raise SplitProposalRejected("invalid_manifest_or_proposal_shape")
    if inventory.get("sourceDoi") != DOI or inventory.get("stage") != "metadata_only_source_url_sha_inventory":
        raise SplitProposalRejected("not_original_v6_inventory")
    files = inventory.get("files")
    if not isinstance(files, list) or not 1 <= len(files) <= 7200:
        raise SplitProposalRejected("inventory_files_missing_or_oversize")
    if not isinstance(inventory.get("inventoryPairs"), int) or inventory["inventoryPairs"] != len(files):
        raise SplitProposalRejected("inventory_count_conflict")
    if set(proposal) != set(SPLIT_NAMES):
        raise SplitProposalRejected("expected_three_split_names")
    assignments = {}
    for split in SPLIT_NAMES:
        groups = proposal[split]
        if not isinstance(groups, list) or not groups:
            raise SplitProposalRejected("empty_or_invalid_split")
        if any(not isinstance(g, str) or g not in GROUP_COUNTS for g in groups):
            raise SplitProposalRejected("unknown_hive_group_in_proposal")
        if len(groups) != len(set(groups)):
            raise SplitProposalRejected("duplicate_group_inside_split")
        for group in groups:
            if group in assignments:
                raise SplitProposalRejected("same_published_hive_group_in_multiple_splits")
            assignments[group] = split
    if set(assignments) != set(GROUP_COUNTS):
        raise SplitProposalRejected("published_groups_not_covered_exactly_once")
    inventory_groups = Counter()
    names, jpg_hashes = set(), set()
    for file in files:
        if not isinstance(file, dict):
            raise SplitProposalRejected("invalid_inventory_row")
        group, name = file.get("hiveCollectionFolder"), file.get("filename")
        digest = file.get("imageSha256PinnedNotRecheckedHere")
        if group not in GROUP_COUNTS or not isinstance(name, str) or not name:
            raise SplitProposalRejected("inventory_frame_identity_invalid")
        if not isinstance(digest, str) or len(digest) != 64:
            raise SplitProposalRejected("inventory_original_sha_missing")
        if (group, name.casefold()) in names or digest in jpg_hashes:
            raise SplitProposalRejected("inventory_duplicate_frame_or_jpeg")
        names.add((group, name.casefold()))
        jpg_hashes.add(digest)
        inventory_groups[group] += 1
        if inventory_groups[group] > GROUP_COUNTS[group]:
            raise SplitProposalRejected("inventory_group_exceeds_publication")
    per_split = {
        split: {
            "publishedFolderGroups": list(proposal[split]),
            "inventoryImages": sum(inventory_groups[g] for g in proposal[split]),
            "publishedExpectedImages": sum(GROUP_COUNTS[g] for g in proposal[split]),
        }
        for split in SPLIT_NAMES
    }
    # A structurally safe label assignment still DOES NOT prove that two
    # collections are independent physical hives or recording sessions.
    missing = sum(GROUP_COUNTS.values()) - len(files)
    blockers = [
        "recording_original_bytes_not_verified_by_this_tool",
        "frame_to_recording_mapping_not_proven",
        "independent_physical_hive_identity_not_proven",
        "near_temporal_duplicate_leakage_not_excluded",
        "model_training_and_legal_weight_audit_not_performed",
    ]
    if missing:
        blockers.insert(0, "incomplete_original_detection_frame_coverage")
    return {
        "sourceDoi": DOI,
        "stage": "candidate_group_disjoint_split_structure_only",
        "publishedFoldersStructurallyDisjoint": True,
        "splitProposalWasAppliedToData": False,
        "inventoryImages": len(files),
        "publishedExpectedImages": sum(GROUP_COUNTS.values()),
        "missingImages": missing,
        "perProposedSplit": per_split,
        "sourceVideoRecordingHashesVerified": False,
        "frameToRecordingProvenanceVerified": False,
        "actualPhysicalHivesIndependenceVerified": False,
        "independentHoldoutVerified": False,
        "splitReadyForTraining": False,
        "blockers": blockers,
        "trainingAuthorized": False,
        "modelApproved": False,
        "recognitionSucceeded": False,
        "cleanupAuthorized": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Research-only structural grouped split proposal check")
    parser.add_argument("inventory_json")
    parser.add_argument("candidate_assignment_json")
    args = parser.parse_args(argv)
    try:
        inv = read_limited_json(args.inventory_json, MAX_MANIFEST_JSON_BYTES)
        proposal = read_limited_json(args.candidate_assignment_json, MAX_PROPOSAL_JSON_BYTES)
        print(json.dumps(assess_split_structure(inv, proposal), indent=2))
        return 0
    except (SplitProposalRejected, OSError) as exc:
        print(json.dumps({"ok": False, "reason": str(exc),
                          "splitReadyForTraining": False,
                          "trainingAuthorized": False, "cleanupAuthorized": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
