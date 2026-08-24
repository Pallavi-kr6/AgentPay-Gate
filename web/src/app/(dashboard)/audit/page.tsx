"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  ScanSearch,
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  XCircle,
  CheckCircle2,
  RotateCcw,
  Ban,
  SlidersHorizontal,
} from "lucide-react";
import { useApi } from "@/lib/use-api";
import { getRecentAuditEvents } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime, formatDateTime, cn } from "@/lib/utils";

const EVENT_META: Record<string, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  PURCHASE_REQUESTED: { icon: FileText, tone: "text-text-tertiary" },
  POLICY_CHECK: { icon: ScanSearch, tone: "text-accent" },
  ORDER_CREATED: { icon: FileText, tone: "text-text-tertiary" },
  APPROVAL_REQUIRED: { icon: ShieldAlert, tone: "text-warning" },
  APPROVAL_REJECTED: { icon: Ban, tone: "text-danger" },
  AWAITING_PAYMENT: { icon: CreditCard, tone: "text-warning" },
  PAYMENT_CAPTURED: { icon: CheckCircle2, tone: "text-success" },
  PAYMENT_FAILED: { icon: XCircle, tone: "text-danger" },
  PURCHASE_COMPLETED: { icon: ShieldCheck, tone: "text-success" },
  PURCHASE_FAILED_FINAL: { icon: RotateCcw, tone: "text-danger" },
  POLICY_UPDATED: { icon: SlidersHorizontal, tone: "text-accent" },
};

const FILTERS = ["ALL", ...Object.keys(EVENT_META)];

export default function AuditLogPage() {
  const { data, loading, error, refetch } = useApi(() => getRecentAuditEvents(150), [], {
    pollMs: 4000,
  });
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("ALL");

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((e) => {
      if (eventFilter !== "ALL" && e.event_type !== eventFilter) return false;
      if (query && !e.trace_id.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [data, query, eventFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">Audit Log</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Every agent decision and payment action, recorded.
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-success-border bg-success-bg px-2.5 py-1 text-[11px] font-medium text-success">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> LIVE
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Filter by trace id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <Tabs value={eventFilter} onValueChange={setEventFilter}>
          <TabsList className="flex-wrap">
            {FILTERS.slice(0, 6).map((f) => (
              <TabsTrigger key={f} value={f}>
                {f === "ALL" ? "All" : f.replaceAll("_", " ")}
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
        <EmptyState title="No events yet" description="Agent activity will stream in here as it happens." />
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {filtered.map((e) => {
              const meta = EVENT_META[e.event_type] ?? { icon: FileText, tone: "text-text-tertiary" };
              const Icon = meta.icon;
              return (
                <motion.div
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-border bg-surface px-3.5 py-2.5"
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.tone)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-text-primary">
                        {e.event_type.replaceAll("_", " ")}
                      </span>
                      {e.decision && (
                        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-tertiary">
                          {e.decision}
                        </span>
                      )}
                      <Link
                        href={`/transactions/${e.trace_id}`}
                        className="truncate text-[11px] text-text-tertiary hover:text-accent"
                      >
                        {e.trace_id}
                      </Link>
                    </div>
                    {e.reason && <p className="mt-0.5 truncate text-xs text-text-secondary">{e.reason}</p>}
                  </div>
                  <span className="whitespace-nowrap text-[11px] text-text-tertiary" title={formatDateTime(e.timestamp)}>
                    {relativeTime(e.timestamp)}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
