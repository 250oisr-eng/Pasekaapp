import unittest
from tools.audit_manual_event_manifest import audit_explicit_selection


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.rows = {i: {'event': 'DU' if i < 374 else 'D'} for i in range(1422)}
        self.ids = list(range(1194))

    def test_exact_counts_do_not_grant_authorization(self):
        result = audit_explicit_selection(self.rows, self.ids)
        self.assertTrue(result['matchesPublishedTotals'])
        self.assertEqual(result['compoundEvents'], 374)
        self.assertFalse(result['realTrafficValidationAuthorized'])
        self.assertFalse(result['videoCleanupAuthorized'])

    def test_bad_compound_count_is_explicitly_reported(self):
        self.rows[0]['event'] = 'D'
        self.assertFalse(audit_explicit_selection(self.rows, self.ids)['matchesPublishedTotals'])

    def test_missing_id_rejected(self):
        self.ids[-1] = 2000
        with self.assertRaises(ValueError): audit_explicit_selection(self.rows, self.ids)

    def test_duplicate_id_rejected(self):
        self.ids[-1] = self.ids[0]
        with self.assertRaises(ValueError): audit_explicit_selection(self.rows, self.ids)

    def test_unlabeled_rejected(self):
        self.rows[5]['event'] = 'x'
        with self.assertRaises(ValueError): audit_explicit_selection(self.rows, self.ids)

    def test_missing_event_key_rejected(self):
        del self.rows[5]['event']
        with self.assertRaises(ValueError): audit_explicit_selection(self.rows, self.ids)

    def test_wrong_total_rejected(self):
        with self.assertRaises(ValueError): audit_explicit_selection(self.rows, self.ids[:-1])

    def test_boolean_id_rejected(self):
        self.ids[0] = True
        with self.assertRaises(ValueError): audit_explicit_selection(self.rows, self.ids)

    def test_numeric_string_id_rejected(self):
        self.ids[0] = '0'
        with self.assertRaises(ValueError): audit_explicit_selection(self.rows, self.ids)

    def test_untrusted_id_container_rejected(self):
        with self.assertRaises(ValueError): audit_explicit_selection(self.rows, tuple(self.ids))

    def test_no_source_rejected(self):
        with self.assertRaises(ValueError): audit_explicit_selection({}, self.ids)

    def test_original_source_not_mutated(self):
        before = {k: dict(v) for k,v in self.rows.items()}
        audit_explicit_selection(self.rows, self.ids)
        self.assertEqual(before, self.rows)


if __name__ == '__main__': unittest.main()
