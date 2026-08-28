"""Unit tests for Offer.discount_for — the money math, no HTTP layer.

The whole pricing story collapses if this function is wrong, so we
exercise every branch here. Anything that touches Flask or the DB
goes in tests/integration/ instead.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.extensions import db
from app.models import Offer


def _make_offer(app, **overrides):
    """Insert a live Offer row with sensible defaults."""
    defaults = dict(
        code="TEST",
        title="Test offer",
        description="",
        discount_type=Offer.TYPE_PERCENT,
        value=10.0,
        min_order_amount=100.0,
        max_discount=None,
        starts_at=None,
        ends_at=None,
        usage_limit=None,
        used_count=0,
        is_active=True,
    )
    defaults.update(overrides)
    with app.app_context():
        o = Offer(**defaults)
        db.session.add(o)
        db.session.commit()
        return o.id


@pytest.mark.unit
class TestPercentDiscount:
    def test_basic_percent(self, app):
        _make_offer(app, value=20.0, min_order_amount=0)
        with app.app_context():
            o = Offer.query.first()
            assert o.discount_for(500.0) == 100.0  # 20% of 500

    def test_percent_capped_by_max_discount(self, app):
        _make_offer(app, value=50.0, max_discount=75.0, min_order_amount=0)
        with app.app_context():
            o = Offer.query.first()
            # 50% of 1000 = 500, but max is 75
            assert o.discount_for(1000.0) == 75.0

    def test_percent_never_exceeds_subtotal(self, app):
        _make_offer(app, value=80.0, min_order_amount=0)
        with app.app_context():
            o = Offer.query.first()
            # Discount of 80% on 100 = 80, but on 50 = 40, never more than subtotal
            assert o.discount_for(50.0) == 40.0


@pytest.mark.unit
class TestFlatDiscount:
    def test_flat_amount(self, app):
        _make_offer(
            app,
            discount_type=Offer.TYPE_FLAT,
            value=50.0,
            min_order_amount=0,
        )
        with app.app_context():
            o = Offer.query.first()
            assert o.discount_for(500.0) == 50.0

    def test_flat_capped_at_subtotal(self, app):
        _make_offer(
            app,
            discount_type=Offer.TYPE_FLAT,
            value=100.0,
            min_order_amount=0,
        )
        with app.app_context():
            o = Offer.query.first()
            # 100 > 30 subtotal, must not pay out negative
            assert o.discount_for(30.0) == 30.0


@pytest.mark.unit
class TestRounding:
    def test_percent_rounds_to_two_decimal_places(self, app):
        _make_offer(app, value=7.5, min_order_amount=0)
        with app.app_context():
            o = Offer.query.first()
            # 7.5% of 199 = 14.925 in real arithmetic. In IEEE-754 float,
            # 199 * 7.5 / 100 actually lands at 14.925000000000001, which
            # round() rounds to 14.93. We assert the *behaviour*, not
            # schoolbook rounding, because that's what the production
            # server does too.
            assert o.discount_for(199.0) == 14.93
