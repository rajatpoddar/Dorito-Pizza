"""Unit tests for app.utils.phone — pure functions, no DB / no Flask."""
import pytest

from app.utils.phone import is_valid_indian_mobile, mask_for_log, normalise_to_10


class TestNormaliseTo10:
    # --- happy paths ---
    @pytest.mark.unit
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("9876543210", "9876543210"),
            ("+919876543210", "9876543210"),
            ("91 98765 43210", "9876543210"),
            (" 98 765-43210  ", "9876543210"),
            ("919876543210", "9876543210"),
        ],
    )
    def test_strips_country_code_and_separators(self, raw, expected):
        assert normalise_to_10(raw) == expected

    # --- edge cases ---
    @pytest.mark.unit
    def test_none_returns_empty(self):
        assert normalise_to_10(None) == ""

    @pytest.mark.unit
    def test_empty_returns_empty(self):
        assert normalise_to_10("") == ""

    @pytest.mark.unit
    def test_letters_only_returns_empty(self):
        assert normalise_to_10("abc-def") == ""

    @pytest.mark.unit
    def test_too_short_is_returned_as_is(self):
        # We don't pad — the route layer is responsible for rejecting.
        assert normalise_to_10("98765") == "98765"

    @pytest.mark.unit
    def test_does_not_strip_when_91_is_in_middle(self):
        # "9876591234" — leading 98, not 91, so nothing stripped.
        assert normalise_to_10("9876591234") == "9876591234"

    @pytest.mark.unit
    def test_preserves_more_than_12_digits_by_truncating_prefix_91(self):
        # 13 digits starting with 91 → keep last 10
        assert normalise_to_10("9198765432101") == "8765432101"


class TestIsValidIndianMobile:
    @pytest.mark.unit
    @pytest.mark.parametrize("n", ["9876543210", "6987654321", "7999999999", "8987654321"])
    def test_valid(self, n):
        assert is_valid_indian_mobile(n) is True

    @pytest.mark.unit
    @pytest.mark.parametrize("n", ["1234567890", "5987654321", "987654321", "98765432101"])
    def test_invalid(self, n):
        assert is_valid_indian_mobile(n) is False

    @pytest.mark.unit
    def test_empty_invalid(self):
        assert is_valid_indian_mobile("") is False

    @pytest.mark.unit
    def test_none_invalid(self):
        assert is_valid_indian_mobile(None) is False


class TestMaskForLog:
    @pytest.mark.unit
    def test_masks_middle_keeping_country_prefix_pattern(self):
        # RULES.md §5.10: log as `<2 digits>****<4 digits>`. Example
        # number 9876543210 → 98****3210. (RULES.md shows a generic
        # 98****5432; the actual code keeps the literal last 4 digits.)
        assert mask_for_log("9876543210") == "98****3210"

    @pytest.mark.unit
    def test_invalid_input_is_fully_masked(self):
        assert mask_for_log("") == "****"
        assert mask_for_log("not a phone") == "****"
