"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { getPolicy, updatePolicy, getCatalog } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { formatCurrency, categoryLabel } from "@/lib/utils";

export default function PoliciesPage() {
  const policy = useApi(getPolicy, []);
  const catalog = useApi(getCatalog, []);

  const [perTxCap, setPerTxCap] = useState(0);
  const [dailyCap, setDailyCap] = useState(0);
  const [approvalThreshold, setApprovalThreshold] = useState(0);
  const [blockedCategories, setBlockedCategories] = useState<Set<string>>(new Set());
  const [maxRetries, setMaxRetries] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Initializes editable local form state from freshly-fetched server data -
  // the standard "sync form from loaded record" pattern.
  useEffect(() => {
    if (policy.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPerTxCap(policy.data.per_transaction_cap);
      setDailyCap(policy.data.daily_cap);
      setApprovalThreshold(policy.data.requires_approval_above);
      setBlockedCategories(new Set(policy.data.blocked_categories));
      setMaxRetries(policy.data.max_retries_on_failure);
    }
  }, [policy.data]);

  const allCategories = Array.from(new Set((catalog.data ?? []).map((p) => p.category)));

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updatePolicy({
        per_transaction_cap: perTxCap,
        daily_cap: dailyCap,
        requires_approval_above: approvalThreshold,
        blocked_categories: Array.from(blockedCategories),
        max_retries_on_failure: maxRetries,
        approval_link_expiry_minutes: policy.data?.approval_link_expiry_minutes ?? 15,
      });
      await policy.refetch();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  function toggleCategory(cat: string) {
    setBlockedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  if (policy.error) return <ErrorState message={policy.error} onRetry={policy.refetch} />;
  if (policy.loading || !policy.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const currency = policy.data.currency;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">Spending Policies</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Define what your AI agents can purchase automatically.
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-text-tertiary">
          Policy version {policy.data.version}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending limits</CardTitle>
            <CardDescription>Hard bounds a purchase can never exceed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Maximum transaction</Label>
              <Input
                type="number"
                value={perTxCap}
                onChange={(e) => setPerTxCap(Number(e.target.value))}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Daily spending limit</Label>
              <Input
                type="number"
                value={dailyCap}
                onChange={(e) => setDailyCap(Number(e.target.value))}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Automatic approval threshold</Label>
              <Input
                type="number"
                value={approvalThreshold}
                onChange={(e) => setApprovalThreshold(Number(e.target.value))}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Retries on payment failure</Label>
              <Input
                type="number"
                min={0}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="mt-1.5"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blocked categories</CardTitle>
            <CardDescription>Agents can never purchase from these, regardless of price.</CardDescription>
          </CardHeader>
          <CardContent>
            {catalog.loading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="space-y-2.5">
                {allCategories.map((cat) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{categoryLabel(cat)}</span>
                    <Switch
                      checked={blockedCategories.has(cat)}
                      onCheckedChange={() => toggleCategory(cat)}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current policy</CardTitle>
          <CardDescription>How a purchase amount will be treated, based on the values above.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-[var(--radius-sm)] border border-success-border bg-success-bg px-3 py-3">
              <p className="text-xs font-medium text-success">≤ {formatCurrency(approvalThreshold, currency)}</p>
              <p className="mt-1 text-xs text-text-secondary">Automatically allowed</p>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-warning-border bg-warning-bg px-3 py-3">
              <p className="text-xs font-medium text-warning">
                {formatCurrency(approvalThreshold, currency)} – {formatCurrency(perTxCap, currency)}
              </p>
              <p className="mt-1 text-xs text-text-secondary">Human approval required</p>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-danger-border bg-danger-bg px-3 py-3">
              <p className="text-xs font-medium text-danger">&gt; {formatCurrency(perTxCap, currency)}</p>
              <p className="mt-1 text-xs text-text-secondary">Blocked automatically</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <Button variant="accent" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
