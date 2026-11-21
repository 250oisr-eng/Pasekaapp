"""Tests use invented filenames, never private media or third-party binaries."""
import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from audit_apis_zenodo_real_split_lists import (
    SPLIT_BLOBS, EXTRA_BLOBS, git_blob_sha1, parse_split, date_from_image_name,
    fetch_pinned_text, verify_author_metadata, audit_pinned_split_files,
    conservative_day_heldout_plan,
)


def original_like_records():
    # Synthetic names with nine invented daily groups. Not originals.
    days = ("20240107", "20240109", "20240110", "20240116",
            "20240117", "20240305", "20240306", "20240307", "20240308")
    return [f"img-{days[i % 9]}_{i%24:02d}{i//24%60:02d}{i//1440%60:02d}--{i}.jpg"
            for i in range(2795)] + [f"handheld-{i:02d}.jpg" for i in range(28)]


def fake_csv():
    return ("image,class1_boxes,mite_visible_on_re_inspection,note\n"
            + "".join(f"img-{'20240307' if i < 3 else '20240116'}_000000--{i},1,"
                      f"{'Y' if i < 3 else 'N'},synthetic fixture\n" for i in range(23)))


def fake_author_files():
    names = original_like_records()
    assert len(set(names)) == 2823
    # Partition into five distinct val folds with same totals as author.
    sizes = [569, 566, 565, 563, 560]
    assigned = {}
    cursor = 0
    for fold, length in enumerate(sizes, 1):
        val = names[cursor:cursor + length]
        val_set = set(val)
        train = [n for n in names if n not in val_set]
        cursor += length
        assigned[f"splits/fold-{fold}-train.txt"] = \
            "".join(f"./mydataset/all/{n}\n" for n in train)
        assigned[f"splits/fold-{fold}-val.txt"] = \
            "".join(f"./mydataset/all/{n}\n" for n in val)
    assigned["LICENSE"] = ("Creative Commons Attribution 4.0 International (CC BY 4.0)\n"
        "The same licence applies to the images and weights distributed with the Zenodo record.\n")
    assigned["README.md"] = "2,795 frames, 2,823 total, 28 handheld\nonly **3 of the 23**\n"
    assigned["verification/inhive_class1_verification.csv"] = fake_csv()
    return assigned


class PublishedSourceEvidenceTests(unittest.TestCase):
    def test_pinned_repo_exactly_ten_original_split_lists(self):
        self.assertEqual(len(SPLIT_BLOBS), 10)
        self.assertEqual(sum(row[1] for key, row in SPLIT_BLOBS.items() if key.endswith("-val.txt")), 2823)
        self.assertEqual(set(EXTRA_BLOBS), {"LICENSE", "README.md",
                                          "verification/inhive_class1_verification.csv"})

    def test_blob_identity_uses_git_object_header(self):
        payload = b"this is a synthetic fixture\n"
        h = hashlib.sha1(b"blob " + str(len(payload)).encode() + b"\0" + payload).hexdigest()
        self.assertEqual(git_blob_sha1(payload), h)

    def test_split_valid_canonical_paths(self):
        names = parse_split("./mydataset/all/img-20240107_010101--1.jpg\n"
                            "./mydataset/all/handheld-1.jpg\n")
        self.assertEqual(len(names), 2)
        self.assertEqual(date_from_image_name(names[0]), "20240107")
        self.assertIsNone(date_from_image_name(names[1]))

    def test_split_reject_duplicate_file_id(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            parse_split("./mydataset/all/a.jpg\n./mydataset/all/a.jpg\n")

    def test_split_reject_missing_or_blank_record(self):
        for raw in ("", "\n", "./mydataset/all/a.jpg\n\n"):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_split(raw)

    def test_split_reject_path_traversal_and_arbitrary_relative_paths(self):
        for raw in ("../private.jpg\n", "./mydataset/all/../bad.jpg\n",
                    "/home/user.jpg\n", "./mydataset/all/test.png\n"):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_split(raw)

    def test_allowlist_reject_nonpublisher_archive_before_fetch(self):
        with self.assertRaises(ValueError):
            fetch_pinned_text("dataset_2823_images_labels.zip")
        with self.assertRaises(ValueError):
            fetch_pinned_text("splits/fold-9-val.txt")

    def test_reinspect_23_positives_only_three_verified(self):
        license_txt = fake_author_files()["LICENSE"]
        author_readme = fake_author_files()["README.md"]
        status = verify_author_metadata(license_txt, author_readme, fake_csv())
        self.assertEqual(status["authorVerifiedInHivePositiveBeeWithMite"], 3)
        self.assertEqual(status["authorUnconfirmedInHivePositiveLabels"], 20)
        self.assertTrue(status["unverifiedInHiveClass1CannotBeGT"])

    def test_reinspection_wrong_positive_counts_rejected(self):
        lines = fake_csv().replace(",1,N,", ",1,Y,", 1)
        with self.assertRaises(ValueError):
            verify_author_metadata(fake_author_files()["LICENSE"],
                                   fake_author_files()["README.md"], lines)

    def test_synthetic_five_fold_result_with_strict_real_flags_false(self):
        d = fake_author_files()
        r = audit_pinned_split_files(fetch=lambda p: d[p])
        self.assertEqual(r["sourceImageCountByUniqueOriginalNames"], 2823)
        self.assertEqual(r["fiveFoldUniqueValidationCoverage"], 2823)
        self.assertEqual(len(r["folds"]), 5)
        self.assertEqual(len(r["nineTimestampCaptureDatesFromFileNames"]), 9)
        self.assertTrue(all(len(row["sharedCaptureDatesByFilename"]) == 9 for row in r["folds"]))
        for key in ("actualOriginalJpgBytesVerified", "captureDayIndependentTrainValidation",
                    "sessionIndependentTrainValidation", "modelAccuracyMeasuredForPaseka",
                    "realBeeEntranceInOutGroundTruthValidated",
                    "trainingApprovedForPaseka", "videoCleanupAuthorized"):
            self.assertIs(r[key], False, key)

    def test_exact_filename_train_val_leak_fail_closed(self):
        d = fake_author_files()
        path = "splits/fold-1-val.txt"
        d[path] = d[path].replace("handheld-00.jpg", "handheld-06.jpg")
        # Neither forced duplicate nor physical artifact is necessary: inserting
        # a training filename into validation is rejected.
        original_train = parse_split(d["splits/fold-1-train.txt"])[0]
        d[path] += f"./mydataset/all/{original_train}\n"
        with self.assertRaises(ValueError):
            audit_pinned_split_files(fetch=lambda p: d[p])

    def test_wrong_source_split_count_rejected(self):
        d = fake_author_files()
        d["splits/fold-2-val.txt"] = d["splits/fold-2-val.txt"].splitlines()[0] + "\n"
        with self.assertRaises(ValueError):
            audit_pinned_split_files(fetch=lambda p: d[p])

    def test_cross_fold_duplicate_validation_coverage_rejected(self):
        d = fake_author_files()
        # Same in-fold counts maintained, but fold3 duplicates fold1 assignments,
        # leaving some images never validated.
        d["splits/fold-3-val.txt"] = d["splits/fold-1-val.txt"]
        with self.assertRaises(ValueError):
            audit_pinned_split_files(fetch=lambda p: d[p])

    def test_author_license_cannot_be_substituted_by_generic_open_data(self):
        d = fake_author_files()
        d["LICENSE"] = "MIT License"
        with self.assertRaises(ValueError):
            audit_pinned_split_files(fetch=lambda p: d[p])

    def test_conservative_day_split_excludes_all_handheld_from_all_folds(self):
        result = audit_pinned_split_files(fetch=lambda p: fake_author_files()[p])
        plan = result["conservativeDayHeldoutPlan"]
        self.assertEqual(plan["numberOfDayHeldoutProposals"], 9)
        self.assertEqual(plan["handheldExcludedFromInHiveEvaluation"], 28)
        self.assertEqual(sum(r["validationImagesFromSingleDay"] for r in plan["proposedFolds"]), 2795)
        self.assertTrue(all(r["sharedDateNamesBetweenTrainAndValidation"] == 0
                            for r in plan["proposedFolds"]))
        self.assertFalse(plan["realModelTrainingEnabled"])
        self.assertFalse(plan["physicalCaptureSessionIdentityVerified"])

    def test_day_without_verified_mites_must_not_claim_positive_truth(self):
        plan = conservative_day_heldout_plan(set(original_like_records()),
                                             verified_positive_dates=("20240307",))
        folds = {x["validationDayFromFileName"]: x for x in plan["proposedFolds"]}
        self.assertTrue(folds["20240307"]["confirmedInHiveMitePositiveAbsentFromTrain"])
        self.assertFalse(folds["20240117"]["confirmedInHiveMitePositiveInValidation"])
        self.assertTrue(all(not r["readyForActualDetectorBenchmark"] for r in folds.values()))

    def test_cannot_suggest_day_heldout_on_incomplete_source_frames(self):
        names = original_like_records()
        with self.assertRaises(ValueError):
            conservative_day_heldout_plan(names[:-1])
        with self.assertRaises(ValueError):
            conservative_day_heldout_plan(names, ("20230101",))

    def test_no_measured_ground_truth_even_for_real_manifest(self):
        r = audit_pinned_split_files(fetch=lambda p: fake_author_files()[p])
        self.assertFalse(r["realBeeEntranceInOutGroundTruthValidated"])
        self.assertFalse(r["beesWithMitesReliableGTInHive"])
        self.assertFalse(r["videoCleanupAuthorized"])


if __name__ == "__main__":
    unittest.main()
