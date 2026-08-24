"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTransaction, confirmPayment } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import type { TransactionDetail } from "@/lib/types";

function CheckoutInner() {
  const params = useSearchParams();
  const traceId = params.get("trace_id") ?? "";
  const orderId = params.get("order_id") ?? "";
  const amountParam = params.get("amount");
  const razorpayPaymentId = params.get("razorpay_payment_id");

  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [result, setResult] = useState<"paid" | "failed" | null>(null);

  useEffect(() => {
    if (!traceId) return;
    getTransaction(traceId)
      .then((d) => {
        setDetail(d);
        if (d.status === "PAID") setResult("paid");
        if (d.status === "FAILED" || d.status === "REJECTED") setResult("failed");
      })
      .catch(() => setLoadError(true));
  }, [traceId]);

  // Real Razorpay mode: the Payment Link's callback redirected here with a
  // real payment id already - auto-confirm instead of showing manual buttons.
  useEffect(() => {
    if (razorpayPaymentId && traceId) {
      confirmPayment(traceId, razorpayPaymentId, "captured")
        .then((r) => setResult(r.status === "PAID" ? "paid" : "failed"))
        .catch(() => setLoadError(true));
    }
  }, [razorpayPaymentId, traceId]);

  async function decide(mockStatus: "captured" | "failed") {
    setBusy(mockStatus === "captured" ? "approve" : "decline");
    try {
      const paymentId = `manual_${Math.random().toString(36).slice(2, 12)}`;
      const r = await confirmPayment(traceId, paymentId, mockStatus);
      setResult(r.status === "PAID" ? "paid" : "failed");
    } catch {
      setLoadError(true);
    } finally {
      setBusy(null);
    }
  }

  const amount = detail?.amount ?? (amountParam ? Number(amountParam) : 0);
  const currency = detail?.currency ?? "INR";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center"
      >
        <div className="mx-auto flex h-8 w-fit items-center gap-1.5 rounded-md bg-accent px-2.5 text-accent-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="text-xs font-bold">AGENTPAY GATE</span>
        </div>

        <h1 className="mt-5 text-base font-semibold text-text-primary">
          An agent wants to complete this purchase
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-text-tertiary">
          This amount is above the auto-approve threshold, so nothing has been charged yet -
          the agent is waiting for you.
        </p>

        <p className="mt-6 text-4xl font-semibold tabular-nums text-text-primary">
          {amount ? formatCurrency(amount, currency) : "—"}
        </p>
        {detail?.product && <p className="mt-1 text-sm text-text-secondary">{detail.product.name}</p>}

        {loadError ? (
          <div className="mt-6 rounded-[var(--radius-sm)] border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger">
            We couldn&apos;t reach AgentPay Gate. Check that the backend is running and try again.
          </div>
        ) : result === "paid" ? (
          <div className="mt-6 rounded-[var(--radius-sm)] border border-success-border bg-success-bg px-4 py-3 text-xs text-success">
            <CheckCircle2 className="mx-auto mb-1.5 h-5 w-5" />
            Payment approved and captured. The agent has been notified.
          </div>
        ) : result === "failed" ? (
          <div className="mt-6 rounded-[var(--radius-sm)] border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger">
            <XCircle className="mx-auto mb-1.5 h-5 w-5" />
            Payment declined. No money moved. The agent will not retry automatically.
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-[var(--radius-sm)] border border-accent/25 bg-accent/10 px-4 py-3 text-left text-xs leading-relaxed text-text-secondary">
              <span className="font-medium text-accent">Why you&apos;re seeing this: </span>
              {detail?.reason ?? "Loading policy reason…"}
            </div>
            <div className="mt-5 flex gap-2.5">
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => decide("failed")}
                disabled={busy !== null}
              >
                {busy === "decline" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Decline
              </Button>
              <Button
                variant="success"
                className="flex-1"
                onClick={() => decide("captured")}
                disabled={busy !== null}
              >
                {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve &amp; pay
              </Button>
            </div>
            <p className="mt-4 font-mono text-[10px] text-text-tertiary">
              Simulates Razorpay test UPI: success@razorpay / failure@razorpay
            </p>
          </>
        )}

        <p className="mt-6 font-mono text-[10px] text-text-tertiary">
          trace_id: {traceId} {orderId && `· order_id: ${orderId}`}
        </p>
      </motion.div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}
