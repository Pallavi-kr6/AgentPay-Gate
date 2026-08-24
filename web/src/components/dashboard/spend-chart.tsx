"use client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { TransactionSummary } from "@/lib/types";
import { formatCurrency, formatTime } from "@/lib/utils";

export function SpendChart({
  transactions,
  dailyCap,
  approvalThreshold,
  currency,
}: {
  transactions: TransactionSummary[];
  dailyCap: number;
  approvalThreshold: number;
  currency: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const paidToday = transactions
    .filter((t) => t.status === "PAID" && t.created_at.slice(0, 10) === today)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (paidToday.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-text-tertiary">
        No completed payments yet today - this fills in as purchases settle.
      </div>
    );
  }

  const points = paidToday.reduce<{ label: string; cumulative: number }[]>(
    (acc, t) => {
      const previous = acc[acc.length - 1]?.cumulative ?? 0;
      acc.push({ label: formatTime(t.created_at), cumulative: previous + t.amount });
      return acc;
    },
    [{ label: "Start of day", cumulative: 0 }]
  );

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v) => formatCurrency(v, currency).replace(/\.00$/, "")}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--color-text-secondary)" }}
            formatter={(v) => [formatCurrency(Number(v) || 0, currency), "Cumulative spend"]}
          />
          <ReferenceLine
            y={dailyCap}
            stroke="var(--color-danger)"
            strokeDasharray="4 4"
            label={{ value: "Daily cap", position: "insideTopRight", fill: "var(--color-danger)", fontSize: 10 }}
          />
          <ReferenceLine
            y={approvalThreshold}
            stroke="var(--color-warning)"
            strokeDasharray="4 4"
            label={{ value: "Approval gate", position: "insideTopRight", fill: "var(--color-warning)", fontSize: 10 }}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="var(--color-accent)"
            strokeWidth={2}
            fill="url(#spendFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
