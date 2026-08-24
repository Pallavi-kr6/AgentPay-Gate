"""
Payment provider abstraction.

Two implementations of the same tiny interface:

  MockProvider     - no network calls, deterministic, used by default and by
                      the test suite. Lets anyone clone this repo and run the
                      full agent -> policy -> "payment" -> audit loop with
                      zero credentials.

  RazorpayProvider  - wraps the real Razorpay Python SDK against Razorpay
                      TEST MODE (rzp_test_... keys). Creates real Orders and
                      real Payment Links, no real money ever moves in test
                      mode. This is the "flip one env var" path to a genuine
                      Razorpay integration.

Both raise PaymentDeclined for a failed payment so the caller (service.py)
has one failure shape to handle gracefully, regardless of provider.
"""
from __future__ import annotations
import random
import time
import uuid
from dataclasses import dataclass
from backend.config import PAYMENT_PROVIDER, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, FRONTEND_URL


class PaymentDeclined(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


@dataclass
class OrderResult:
    order_id: str
    amount: float
    currency: str
    payment_link: str | None = None


@dataclass
class PaymentResult:
    payment_id: str
    order_id: str
    status: str  # "captured" | "failed"


class BasePaymentProvider:
    def create_order(self, amount: float, currency: str, receipt: str) -> OrderResult:
        raise NotImplementedError

    def create_payment_link(self, order: OrderResult, description: str, trace_id: str = "") -> str:
        raise NotImplementedError

    def simulate_or_check_payment(self, order: OrderResult, force_fail: bool = False) -> PaymentResult:
        """In mock mode: simulates an outcome immediately.
        In real mode: this method is not used for auto-capture (Razorpay
        payments must be completed via Checkout/Payment Link by a human -
        that IS the gate), callers should poll `fetch_payment_status` instead."""
        raise NotImplementedError

    def fetch_payment_status(self, payment_id: str) -> str:
        raise NotImplementedError


class MockProvider(BasePaymentProvider):
    """Deterministic fake payment rail. ~90% success unless force_fail=True."""

    def create_order(self, amount: float, currency: str, receipt: str) -> OrderResult:
        order_id = f"order_mock_{uuid.uuid4().hex[:14]}"
        return OrderResult(order_id=order_id, amount=amount, currency=currency)

    def create_payment_link(self, order: OrderResult, description: str, trace_id: str = "") -> str:
        return f"{FRONTEND_URL}/checkout?trace_id={trace_id}&order_id={order.order_id}&amount={order.amount}"

    def simulate_or_check_payment(self, order: OrderResult, force_fail: bool = False) -> PaymentResult:
        time.sleep(0.05)  # pretend there's network latency
        failed = force_fail or (random.random() < 0.10)
        if failed:
            raise PaymentDeclined("Simulated decline from mock rail (insufficient funds / bank timeout).")
        return PaymentResult(
            payment_id=f"pay_mock_{uuid.uuid4().hex[:14]}",
            order_id=order.order_id,
            status="captured",
        )

    def fetch_payment_status(self, payment_id: str) -> str:
        return "captured"


class RazorpayProvider(BasePaymentProvider):
    """Real Razorpay TEST MODE integration. Requires rzp_test_* credentials.

    Docs: https://razorpay.com/docs/api/orders/ and
          https://razorpay.com/docs/api/payment-links/
    Test instruments (no real money, no card needed):
          UPI id  success@razorpay  -> always succeeds
          UPI id  failure@razorpay  -> always fails
          https://razorpay.com/docs/payments/payments/test-card-upi-details/
    """

    def __init__(self):
        import razorpay  # local import so MockProvider users don't need the SDK configured
        if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
            raise RuntimeError(
                "PAYMENT_PROVIDER=razorpay but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. "
                "Get free test-mode keys from https://dashboard.razorpay.com/app/keys (toggle Test Mode first)."
            )
        self.client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

    def create_order(self, amount: float, currency: str, receipt: str) -> OrderResult:
        paise = int(round(amount * 100))
        order = self.client.order.create({
            "amount": paise,
            "currency": currency,
            "receipt": receipt,
            "payment_capture": 1,
        })
        return OrderResult(order_id=order["id"], amount=amount, currency=currency)

    def create_payment_link(self, order: OrderResult, description: str, trace_id: str = "") -> str:
        paise = int(round(order.amount * 100))
        link = self.client.payment_link.create({
            "amount": paise,
            "currency": order.currency,
            "description": description,
            "reference_id": trace_id or order.order_id,
            "notes": {"order_id": order.order_id, "trace_id": trace_id},
            "callback_url": f"{FRONTEND_URL}/checkout?trace_id={trace_id}&order_id={order.order_id}",
            "callback_method": "get",
        })
        return link["short_url"]

    def fetch_payment_status(self, payment_id: str) -> str:
        payment = self.client.payment.fetch(payment_id)
        return payment["status"]  # e.g. created, authorized, captured, failed

    def simulate_or_check_payment(self, order: OrderResult, force_fail: bool = False) -> PaymentResult:
        raise NotImplementedError(
            "Real Razorpay payments require a human to complete the Payment Link "
            "(that IS the approval gate). Use create_payment_link + poll fetch_payment_status."
        )


def get_provider() -> BasePaymentProvider:
    if PAYMENT_PROVIDER == "razorpay":
        return RazorpayProvider()
    return MockProvider()
