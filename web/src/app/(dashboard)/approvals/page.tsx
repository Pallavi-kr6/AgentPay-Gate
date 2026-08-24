"use client";
import { AnimatePresence } from "framer-motion";
import { useApi } from "@/lib/use-api";
import { getApprovals } from "@/lib/api";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";

export default function ApprovalsPage() {
  const { data, loading, error, refetch } = useApi(getApprovals, [], { pollMs: 5000 });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Approvals</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Transactions waiting for human authorization.
        </p>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No approvals yet"
          description="When an AI purchase requires human authorization, it will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AnimatePresence>
            {data.map((item) => (
              <ApprovalCard key={item.trace_id} item={item} onResolved={refetch} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
