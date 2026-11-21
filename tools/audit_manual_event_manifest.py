"""Fail-closed audit of an externally supplied explicit bee-event ID manifest.

No author ID list is shipped here. Passing numeric checks is NOT verification of
provenance, licensing, physical hive in/out or permission to run inference.
"""
from collections import Counter

PAPER_TOTAL = 1194
PAPER_COMPOUND = 374
COMPOUND = frozenset({'DU', 'UD'})
VALID = frozenset({'D', 'U', 'DU', 'UD'})


def audit_explicit_selection(source_rows, selected_ids):
    """Compare explicit unique IDs against parsed original CSV rows.

    source_rows: mapping {int group_id: row dict with 'event'}
    selected_ids: list of int IDs from externally supplied author evidence.
    Returns aggregate-only report. Does not verify manifest authorship.
    """
    if type(source_rows) is not dict or not source_rows:
        raise ValueError('source rows must be nonempty mapping')
    if type(selected_ids) is not list:
        raise ValueError('explicit selected ID list required')
    if any(type(x) is not int or x < 0 for x in selected_ids):
        raise ValueError('invalid selection ID')
    if len(set(selected_ids)) != len(selected_ids):
        raise ValueError('duplicate selection ID')
    if len(selected_ids) != PAPER_TOTAL:
        raise ValueError('author paper total not reproduced')
    if any(group not in source_rows for group in selected_ids):
        raise ValueError('selection references missing source ID')
    labels = [source_rows[group].get('event') for group in selected_ids]
    if any(code not in VALID for code in labels):
        raise ValueError('selection contains unlabeled or unrecognized events')
    counts = Counter(labels)
    compound = sum(counts[x] for x in COMPOUND)
    return {
        'selectedEvents': len(selected_ids),
        'compoundEvents': compound,
        'classCounts': {key: counts[key] for key in sorted(VALID)},
        'matchesPublishedTotals': compound == PAPER_COMPOUND,
        'authorManifestAuthenticityVerified': False,
        'sourceVideoBytesVerified': False,
        'codebookVerified': False,
        'reuseRightsVerified': False,
        'realTrafficValidationAuthorized': False,
        'videoCleanupAuthorized': False,
    }
