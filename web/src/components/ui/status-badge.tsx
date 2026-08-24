import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/utils";
import { CheckCircle2, Clock, ShieldAlert, XCircle, CircleDashed } from "lucide-react";

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_BY_STATUS: Record<string, Tone> = {
  PAID: "success",
  AWAITING_APPROVAL: "warning",
  AWAITING_PAYMENT: "warning",
  BLOCKED: "danger",
  FAILED: "danger",
  REJECTED: "danger",
  PENDING: "neutral",
};

const ICON_BY_STATUS: Record<string, React.ComponentType<{ className?: string }>> = {
  PAID: CheckCircle2,
  AWAITING_APPROVAL: Clock,
  AWAITING_PAYMENT: Clock,
  BLOCKED: ShieldAlert,
  FAILED: XCircle,
  REJECTED: XCircle,
  PENDING: CircleDashed,
};

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-bg text-success border-success-border",
  warning: "bg-warning-bg text-warning border-warning-border",
  danger: "bg-danger-bg text-danger border-danger-border",
  neutral: "bg-surface-2 text-text-secondary border-border-strong",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = TONE_BY_STATUS[status] ?? "neutral";
  const Icon = ICON_BY_STATUS[status] ?? CircleDashed;
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        TONE_CLASSES[tone],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
