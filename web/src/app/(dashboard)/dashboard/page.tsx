"use client";
import { Wallet, Receipt, ShieldCheck, ShieldBan } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SpendChart } from "@/components/dashboard/spend-chart";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { DemoLauncher } from "@/components/demo/demo-launcher";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useApi } from "@/lib/use-api";
import { getDashboardSummary, getTransactions } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function OverviewContent() {
  const searchParams = useSearchParams();
  const autoRunDemo = searchParams.get("demo") === "1";
  const summary = useApi(getDashboardSummary, [], { pollMs: 6000 });
  const transactions = useApi(() => getTransactions(50), [], { pollMs: 6000 });

  const refetchAll = () => {
    summary.refetch();
    transactions.refetch();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">{greeting()}</h1>
        <p className="mt-1 text-sm text-text-tertiary">Your agent commerce activity at a glance.</p>
      </div>

      {summary.error ? (
        <ErrorState message={summary.error} onRetry={refetchAll} />
      ) : summary.loading || !summary.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Today's spend"
            value={formatCurrency(summary.data.daily_spent, summary.data.currency)}
            sublabel={`of ${formatCurrency(summary.data.daily_cap, summary.data.currency)}`}
            icon={Wallet}
            progress={(summary.data.daily_spent / summary.data.daily_cap) * 100}
            tone={summary.data.daily_spent / summary.data.daily_cap > 0.8 ? "danger" : "neutral"}
          />
          <KpiCard
            label="Transactions"
            value={String(summary.data.transactions_total)}
            sublabel={`+${summary.data.transactions_today} today`}
            icon={Receipt}
          />
          <KpiCard
            label="Pending approvals"
            value={String(summary.data.pending_approvals)}
            sublabel={summary.data.pending_approvals > 0 ? "Requires review" : "All clear"}
            icon={ShieldCheck}
            tone={summary.data.pending_approvals > 0 ? "warning" : "neutral"}
          />
          <KpiCard
            label="Policy blocks"
            value={String(summary.data.policy_blocks_today)}
            sublabel="Prevented automatically"
            icon={ShieldBan}
            tone={summary.data.policy_blocks_today > 0 ? "danger" : "neutral"}
          />
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Daily spend</CardTitle>
            <CardDescription>
              {summary.data
                ? `${formatCurrency(summary.data.daily_spent, summary.data.currency)} / ${formatCurrency(summary.data.daily_cap, summary.data.currency)}`
                : "Loading…"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {transactions.data && summary.data ? (
            <SpendChart
              transactions={transactions.data}
              dailyCap={summary.data.daily_cap}
              approvalThreshold={summary.data.requires_approval_above}
              currency={summary.data.currency}
            />
          ) : (
            <Skeleton className="h-48 w-full" />
          )}
        </CardContent>
      </Card>

      <DemoLauncher onActivity={refetchAll} autoRunOnMount={autoRunDemo} />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-primary">Recent transactions</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/transactions">View all</Link>
          </Button>
        </div>
        {transactions.error ? (
          <ErrorState message={transactions.error} onRetry={refetchAll} />
        ) : transactions.loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <TransactionsTable transactions={(transactions.data ?? []).slice(0, 8)} />
        )}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={null}>
      <OverviewContent />
    </Suspense>
  );
}
