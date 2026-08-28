"""Phone number normalisation — single source of truth per RULES.md §5.9.

Every entrypoint that accepts a phone number from the client MUST call
`normalise_to_10` before storage or lookup. We accept any of these shapes:

    "9876543210"          → "9876543210"
    "+91 98765 43210"     → "9876543210"
    "919876543210"        → "9876543210"
    " 98 765-43210  "     → "9876543210"

Returns the 10-digit Indian mobile number, or the empty string if the
input has no digits. Callers should reject empty / non-10-digit values
with a 400.
"""


def normalise_to_10(raw) -> str:
    """Strip everything but digits, then drop a leading 91 country code."""
    if raw is None:
        return ""
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[-10:]
    return digits


def is_valid_indian_mobile(raw) -> bool:
    """True iff the input normalises to exactly 10 digits starting with 6-9.

    Indian mobile numbers always begin with 6, 7, 8, or 9. Anything else
    (landline, 11-digit with trunk prefix, etc.) is rejected.
    """
    n = normalise_to_10(raw)
    return len(n) == 10 and n[0] in "6789"


def mask_for_log(raw) -> str:
    """PII-safe mask for server logs (RULES.md §5.10)."""
    n = normalise_to_10(raw)
    if len(n) != 10:
        return "****"
    return f"{n[:2]}****{n[-4:]}"  # e.g. 98****5432
