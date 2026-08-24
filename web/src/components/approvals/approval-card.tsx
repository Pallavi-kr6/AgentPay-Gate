"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, ArrowUpRight } from "lucide-react";
import type { ApprovalItem } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency, categoryLabel, relativeTime } from "@/lib/utils";
import { approveTransaction, rejectTransaction } from "@/lib/api";

export function ApprovalCard({ item, onResolved }: { item: ApprovalItem; onResolved: () => void }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("Not needed right now");

  async function approve() {
    setBusy("approve");
    try {
      await approveTransaction(item.trace_id);
      onResolved();
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy("reject");
    try {
      await rejectTransaction(item.trace_id, reason);
      onResolved();
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link
                href={`/transactions/${item.trace_id}`}
                className="group flex items-center gap-1 text-sm font-medium text-text-primary hover:text-accent"
              >
                {item.product?.name ?? "Unknown product"}
                <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-text-primary">
                {formatCurrency(item.amount, item.currency)}
              </p>
              {item.product && (
                <p className="mt-0.5 text-xs text-text-tertiary">{categoryLabel(item.product.category)}</p>
              )}
            </div>
            <span className="whitespace-nowrap text-xs text-text-tertiary">{relativeTime(item.requested_at)}</span>
          </div>

          <div className="mt-3 rounded-[var(--radius-sm)] border border-border bg-surface-2/50 px-3 py-2.5">
            <p className="text-xs font-medium text-text-secondary">Why approval is required</p>
            <p className="mt-1 text-xs text-text-tertiary">{item.reason}</p>
          </div>

          <p className="mt-3 text-xs text-text-tertiary">
            Requested by <span className="text-text-secondary">{item.buyer_ref}</span>
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="danger" size="sm" disabled={busy !== null}>
                  <XCircle className="h-3.5 w-3.5" /> Reject
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
                    <Button variant="outline" size="sm">Cancel</Button>
                  </DialogClose>
                  <Button variant="danger" size="sm" onClick={reject} disabled={busy !== null}>
                    {busy === "reject" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Confirm rejection
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="success" size="sm" disabled={busy !== null}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve {formatCurrency(item.amount, item.currency)}
                </Button>
              </DialogTrigger>
              <DialogContent
                title="Approve this payment?"
                description="This simulates the human completing the payment link. The transaction will be marked as paid."
              >
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" size="sm">Cancel</Button>
                  </DialogClose>
                  <Button variant="success" size="sm" onClick={approve} disabled={busy !== null}>
                    {busy === "approve" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Confirm approval
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
