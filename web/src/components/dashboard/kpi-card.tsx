import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  progress,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: LucideIcon;
  progress?: number;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneText = {
    neutral: "text-text-tertiary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  const toneBar = {
    neutral: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-tertiary">{label}</span>
        <Icon className="h-4 w-4 text-text-tertiary" />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-text-primary tabular-nums">
        {value}
      </div>
      {sublabel && <p className={cn("mt-1 text-xs", toneText)}>{sublabel}</p>}
      {progress !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn("h-full rounded-full transition-all", toneBar)}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </Card>
  );
}
