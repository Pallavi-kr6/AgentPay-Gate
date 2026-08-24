"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  CreditCard,
  Loader2,
} from "lucide-react";
import { useApi } from "@/lib/use-api";
import { getTransaction, approveTransaction, rejectTransaction } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDateTime, categoryLabel } from "@/lib/utils";

export default function TransactionDetailPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = use(params);
  const router = useRouter();
  const { data, loading, error, refetch } = useApi(() => getTransaction(traceId), [traceId], {
    pollMs: 5000,
  });
  const [acting, setActing] = useState(false);
  const [rejectReason, setRejectReason] = useState("Not needed right now");

  async function handleApprove() {
    setActing(true);
    try {
      await approveTransaction(traceId);
      await refetch();
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    setActing(true);
    try {
      await rejectTransaction(traceId, rejectReason);
      await refetch();
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="space-y-5">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-text-tertiary">Transaction #{data.trace_id}</p>
              <div className="mt-1.5 flex items-center gap-3">
                <h1 className="text-lg font-semibold text-text-primary">{data.product?.name ?? "Unknown product"}</h1>
                <StatusBadge status={data.status} />
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
                {formatCurrency(data.amount, data.currency)}
              </p>
            </div>

            {data.status === "AWAITING_APPROVAL" && (
              <div className="flex gap-2">
                <RejectDialog reason={rejectReason} setReason={setRejectReason} onConfirm={handleReject} busy={acting} />
                <ApproveDialog amount={formatCurrency(data.amount, data.currency)} onConfirm={handleApprove} busy={acting} />
              </div>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Policy Evaluation</CardTitle>
              <CardDescription>{data.reason}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.checks.length === 0 ? (
                <p className="text-xs text-text-tertiary">No per-check breakdown recorded for this transaction.</p>
              ) : (
                data.checks.map((c, i) => (
                  <motion.div
                    key={c.label}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start justify-between gap-4 rounded-[var(--radius-sm)] border border-border bg-surface-2/50 px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2">
                      {c.passed ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      )}
                      <div>
                        <p className="text-sm text-text-primary">{c.label}</p>
                        <p className="text-xs text-text-tertiary">{c.detail}</p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-text-tertiary">Provider</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 text-text-primary">
                    <CreditCard className="h-3.5 w-3.5 text-text-tertiary" />
                    {data.provider === "razorpay" ? "Razorpay (Test Mode)" : "Mock rail"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-tertiary">Order ID</dt>
                  <dd className="mt-0.5 font-mono text-xs text-text-secondary">{data.order_id ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-tertiary">Payment ID</dt>
                  <dd className="mt-0.5 font-mono text-xs text-text-secondary">{data.payment_id ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-tertiary">Category</dt>
                  <dd className="mt-0.5 text-text-secondary">
                    {data.product ? categoryLabel(data.product.category) : "—"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit Trail</CardTitle>
              <CardDescription>Every decision and action recorded, in order.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-0">
                {data.timeline.map((e, i) => (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="relative border-l border-border pb-5 pl-5 last:pb-0"
                  >
                    <span className="absolute -left-[4.5px] top-1 h-2 w-2 rounded-full bg-accent" />
                    <p className="text-xs text-text-tertiary">{formatDateTime(e.timestamp)}</p>
                    <p className="mt-0.5 text-sm font-medium text-text-primary">
                      {humanizeEvent(e.event_type)}
                    </p>
                    {e.reason && <p className="mt-0.5 text-xs text-text-secondary">{e.reason}</p>}
                  </motion.li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function humanizeEvent(eventType: string): string {
  const map: Record<string, string> = {
    PURCHASE_REQUESTED: "Request received",
    POLICY_CHECK: "Policy evaluated",
    ORDER_CREATED: "Order created",
    APPROVAL_REQUIRED: "Approval required",
    APPROVAL_REJECTED: "Approval rejected",
    AWAITING_PAYMENT: "Awaiting payment",
    PAYMENT_CAPTURED: "Payment captured",
    PAYMENT_FAILED: "Payment attempt failed",
    PURCHASE_COMPLETED: "Purchase completed",
    PURCHASE_FAILED_FINAL: "Purchase failed (final)",
    POLICY_UPDATED: "Policy updated",
  };
  return map[eventType] ?? eventType;
}

function ApproveDialog({
  amount,
  onConfirm,
  busy,
}: {
  amount: string;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="success" size="sm">
          <CheckCircle2 className="h-4 w-4" /> Approve {amount}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Approve this payment?"
        description="This simulates the human completing the payment link. The agent will be notified and the transaction will be marked as paid."
      >
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button variant="success" size="sm" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirm approval
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  reason,
  setReason,
  onConfirm,
  busy,
}: {
  reason: string;
  setReason: (v: string) => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="danger" size="sm">
          <XCircle className="h-4 w-4" /> Reject
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Reject this purchase?"
        description="No payment will ever be attempted. The agent will be told exactly why."
      >
        <label className="text-xs font-medium text-text-secondary">Reason (shown to the agent)</label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5" />
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirm rejection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
