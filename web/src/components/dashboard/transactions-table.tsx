"use client";
import { useRouter } from "next/navigation";
import type { TransactionSummary } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/state";
import { formatCurrency, formatDateTime, DECISION_LABEL } from "@/lib/utils";

export function TransactionsTable({ transactions }: { transactions: TransactionSummary[] }) {
  const router = useRouter();

  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No transactions yet"
        description="Once an AI agent requests a purchase, it will show up here with its policy decision and payment status."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/60 text-xs text-text-tertiary">
            <th className="px-4 py-2.5 font-medium">Product</th>
            <th className="px-4 py-2.5 font-medium">Agent</th>
            <th className="px-4 py-2.5 font-medium">Amount</th>
            <th className="px-4 py-2.5 font-medium">Policy decision</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Time</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr
              key={t.trace_id}
              onClick={() => router.push(`/transactions/${t.trace_id}`)}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/50"
            >
              <td className="px-4 py-3">
                <span className="block font-medium text-text-primary">{t.product_name}</span>
                <span className="text-xs text-text-tertiary">{t.trace_id}</span>
              </td>
              <td className="px-4 py-3 text-text-secondary">{t.agent}</td>
              <td className="px-4 py-3 tabular-nums text-text-primary">
                {formatCurrency(t.amount, t.currency)}
              </td>
              <td className="px-4 py-3 text-xs text-text-secondary">
                {t.decision ? DECISION_LABEL[t.decision] ?? t.decision : "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={t.status} />
              </td>
              <td className="px-4 py-3 text-xs text-text-tertiary">{formatDateTime(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
