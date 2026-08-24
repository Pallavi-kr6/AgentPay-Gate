"use client";
import { useMemo, useState } from "react";
import { Search, CheckCircle2, Clock, ShieldBan, Package as PackageIcon } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { getCatalog } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, categoryLabel, cn } from "@/lib/utils";

const STATE_META = {
  eligible: { label: "Eligible for automatic purchase", icon: CheckCircle2, tone: "text-success" },
  approval_required: { label: "Requires human approval", icon: Clock, tone: "text-warning" },
  blocked: { label: "Blocked by policy", icon: ShieldBan, tone: "text-danger" },
} as const;

export default function CatalogPage() {
  const { data, loading, error, refetch } = useApi(getCatalog, []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");

  const categories = useMemo(
    () => (data ? Array.from(new Set(data.map((p) => p.category))) : []),
    [data]
  );

  const filtered = (data ?? []).filter((p) => {
    if (category !== "ALL" && p.category !== category) return false;
    if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Catalog</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          What your AI agents see - and whether they can buy it automatically.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="Search products…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Tabs value={category} onValueChange={setCategory}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            {categories.map((c) => (
              <TabsTrigger key={c} value={c}>
                {categoryLabel(c)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No products found" description="Try a different search term or category." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const meta = STATE_META[p.policy_state];
            const Icon = meta.icon;
            return (
              <Card key={p.id} className="p-4">
                <div className="flex h-24 items-center justify-center rounded-[var(--radius-sm)] bg-surface-2">
                  <PackageIcon className="h-8 w-8 text-text-tertiary" />
                </div>
                <div className="mt-3">
                  <p className="text-sm font-medium text-text-primary">{p.name}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">
                    {formatCurrency(p.price, p.currency)}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                    <span>{categoryLabel(p.category)}</span>
                    <span>·</span>
                    <span>{p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}</span>
                  </div>
                </div>
                <div
                  className={cn(
                    "mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs",
                    meta.tone
                  )}
                  title={p.policy_reason}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
