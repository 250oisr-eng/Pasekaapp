"""Fail-closed research gate: ONLY explicitly sourced Apis mellifera datasets.

Read-only, standard-library, synthetic split fixtures. No AI inference, training,
media access, release approval, original video deletion or transformation of
bounding boxes into physical in/out events. Metadata/source evidence in docs.
"""
import json
import re
from collections import Counter

# Fixed references from the official publisher pages, not user-supplied guesses.
# 'speciesEvidence' is an author/publisher statement, NOT a DNA identity test.
SOURCES = {
    "beehive-mendeley-v1": {
        "doi": "10.17632/5yz78xxpmy.1",
        "species": "Apis mellifera",
        "license": "CC BY 4.0",
        "evidenceUrl": "https://data.mendeley.com/datasets/5yz78xxpmy/1",
        "annotationKind": "object_detection_bbox",
        "observation": "inside_hive_frame_and_bottom",
        "publishedImages": 3551,
        "frameLevelInOutLabels": False,
    },
    "pollen-beedata-mendeley-v1": {
        "doi": "10.17632/9mhd82tz8j.1",
        "species": "Apis mellifera carnica",
        "license": "CC BY 4.0",
        "evidenceUrl": "https://data.mendeley.com/datasets/9mhd82tz8j/1",
        "annotationKind": "bee_and_pollen_instance_segmentation",
        "observation": "hive_landing_board_single_bee_images",
        "publishedImages": 1278,
        "frameLevelInOutLabels": False,
    },
    "zenodo-varroa-in-hive-v2": {
        "doi": "10.5281/zenodo.23276947",
        "species": "Apis mellifera",
        "license": "CC BY 4.0",
        "evidenceUrl": "https://zenodo.org/records/23276947",
        "annotationKind": "bee_bbox_mite_visibility_binary_labels_not_mite_gt",
        "observation": "in_hive_sliding_rail_2795_and_handheld_28",
        "publishedImages": 2823,
        "frameLevelInOutLabels": False,
    },
}
REJECTED = {
    "monash-native-bee-v1": "Tetragonula carbonaria (not Apis mellifera)",
    "boxes-on-bees-2021": "species not explicitly confirmed as Apis mellifera by publisher",
    "vnbee-tracking": "licensing for app use not established",
    "bee24": "species and reuse license for relevant source not established",
    "unverified-candidate": "not pinned to authoritative species and dataset license",
}
SHA256 = re.compile(r"[a-f0-9]{64}\Z")
SPLITS = frozenset(("train", "valid", "test"))
FIELDS = frozenset(("source_id", "observation_id", "frame_sha256",
                    "capture_session_sha256", "split"))


def candidate_status(source_id, *, doi, species, license_name):
    """Publisher-qualified taxon/license ONLY, not dataset bytes or model rights."""
    if type(source_id) is not str or source_id not in SOURCES:
        raise ValueError("dataset blocked: unverified taxon, license or other species")
    source = SOURCES[source_id]
    if (type(doi) is not str or doi != source["doi"]
            or type(species) is not str or species != source["species"]
            or type(license_name) is not str or license_name != source["license"]):
        raise ValueError("source identity/species/license mismatch")
    if species != "Apis mellifera" and not species.startswith("Apis mellifera "):
        raise ValueError("not Apis mellifera")
    return {
        "sourceId": source_id,
        "sourceDoi": source["doi"],
        "scientificSpeciesAsReportedByPublisher": species,
        "sourceLicense": license_name,
        "publisherSourceLink": source["evidenceUrl"],
        "publishedImagesClaimedNotByteChecked": source["publishedImages"],
        "annotationKind": source["annotationKind"],
        "metadataCandidateEligibleForApisMelliferaOnly": True,
        "sourceOriginalImageBytesVerified": False,
        "sourceSessionIdentityVerified": False,
        "sessionIndependentSplitEstablished": False,
        "hiveEntranceInOutGroundTruthVerified": False,
        "modelTrainingAuthorized": False,
        "independentDetectorAccuracyMeasured": False,
        "userVideoCleanupAuthorized": False,
    }


def validate_synthetic_session_split(records, *, source_id,
                                     input_origin="synthetic_fixture"):
    """Reject exact image/session leakage; *never* assert real dataset independence.

    Requires complete 64-char hashes representing original captured sessions.
    Even if hashes and IDs are well-formed, this code cannot establish that
    supplied session hashes were derived from source-video bytes. A successful
    synthetic run reports internal consistency ONLY.
    """
    if input_origin != "synthetic_fixture":
        raise ValueError("real source split requires separate independently reviewed adapter")
    if source_id not in SOURCES:
        raise ValueError("Apis mellifera source must be on verified allowlist")
    if type(records) not in (list, tuple) or not records:
        raise ValueError("non-empty synthetic record sequence required")
    if len(records) > 200000:
        raise ValueError("synthetic split cap exceeded")
    ids = set()
    image_to_split = {}
    session_to_split = {}
    counts = Counter()
    for item in records:
        if type(item) is not dict or set(item) != FIELDS:
            raise ValueError("split record missing or extra provenance fields")
        if item["source_id"] != source_id or type(item["source_id"]) is not str:
            raise ValueError("mixed-source split is not trusted")
        item_id = item["observation_id"]
        if (type(item_id) is not str or not item_id.isascii()
                or not item_id.strip() or len(item_id) > 128 or item_id in ids):
            raise ValueError("missing, malformed or duplicate observation ID")
        ids.add(item_id)
        split = item["split"]
        if type(split) is not str or split not in SPLITS:
            raise ValueError("invalid split")
        for name in ("frame_sha256", "capture_session_sha256"):
            h = item[name]
            if type(h) is not str or not SHA256.fullmatch(h):
                raise ValueError("missing or malformed SHA256 provenance")
        frame = item["frame_sha256"]
        session = item["capture_session_sha256"]
        if frame in image_to_split:
            raise ValueError("same image across splits or duplicated inside split")
        if session in session_to_split and session_to_split[session] != split:
            raise ValueError("same captured session crossed split boundary")
        image_to_split[frame] = split
        session_to_split[session] = split
        counts[split] += 1
    if not all(counts[name] > 0 for name in SPLITS):
        raise ValueError("all train/valid/test splits must be represented")
    return {
        "syntheticOnly": True,
        "source": source_id,
        "records": len(records),
        "splitCounts": {x: counts[x] for x in sorted(SPLITS)},
        "distinctDeclaredSessions": len(session_to_split),
        "noExactFrameShaOverlapWithinSyntheticManifest": True,
        "noDeclaredSessionShaOverlapAcrossSyntheticSplits": True,
        "actualOriginalFramesByteVerified": False,
        "actualCaptureSessionHashesVerified": False,
        "independenceOfRealTrainValidationTestSessionsEstablished": False,
        "sourceOriginalVideoVerified": False,
        "hiveEntranceInOutGroundTruthVerified": False,
        "modelTrainingAuthorized": False,
        "independentDetectorAccuracyMeasured": False,
        "userVideoCleanupAuthorized": False,
    }


def audit():
    return {
        "targetTaxon": "Apis mellifera",
        "scope": "publisher-metadata source eligibility and synthetic split contract",
        "candidateSummaries": [
            candidate_status(sid, doi=d["doi"], species=d["species"],
                             license_name=d["license"])
            for sid, d in sorted(SOURCES.items())
        ],
        "excludedSourceReasons": REJECTED,
        "approvedForRealModelTraining": False,
        "realEntranceCountingValidated": False,
        "userVideoCleanupAuthorized": False,
    }


if __name__ == "__main__":
    print(json.dumps(audit(), ensure_ascii=False, indent=2, allow_nan=False))
