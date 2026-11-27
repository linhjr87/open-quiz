"""Reconcile the AI answer with comment votes (stdlib only).

Shared by merge_comments.py (writes status) and validate.py (checks it).
"""


def _filter_votes(votes, options, pick):
    """Keep only vote keys with ``pick`` letters, all of them in ``options``."""
    if not votes:
        return {}
    allowed = set(options)
    return {
        k: v for k, v in votes.items() if len(k) == pick and k and set(k) <= allowed
    }


def reconcile(ai, votes, options, pick):
    """Return ``(status, commentAnswer)`` from the AI answer and the vote distribution."""
    votes = _filter_votes(votes, options, pick)
    if not votes:
        return "ai-only", None
    aikey = "".join(sorted(ai))
    best = max(votes.values())
    top = [k for k, v in votes.items() if v == best]
    if aikey in top:
        return "verified", list(aikey)
    return "disputed", list(sorted(top)[0])
