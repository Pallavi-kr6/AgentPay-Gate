"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { getTransactions } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDateTime, DECISION_LABEL } from "@/lib/utils";
import type { TransactionStatus } from "@/lib/types";

const FILTERS: { key: "ALL" | TransactionStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PAID", label: "Paid" },
  { key: "AWAITING_APPROVAL", label: "Awaiting approval" },
  { key: "BLOCKED", label: "Blocked" },
  { key: "FAILED", label: "Failed" },
];

export default function TransactionsPage() {
  const { data, loading, error, refetch } = useApi(() => getTransactions(200), [], { pollMs: 8000 });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | TransactionStatus>("ALL");
  const router = useRouter();

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((t) => {
      if (status !== "ALL" && t.status !== status) return false;
      if (query && !t.product_name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [data, query, status]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Transactions</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Every purchase an agent has attempted, with its policy decision and payment outcome.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="Search by product name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading ? (
        <Skeleton className="h-96 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matching transactions"
          description="Try a different search term or status filter."
        />
      ) : (
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
              {filtered.map((t) => (
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
      )}
    </div>
  );
}
