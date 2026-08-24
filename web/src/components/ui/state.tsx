import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Inbox, AlertTriangle } from "lucide-react";

export function EmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-border py-14 text-center",
        className
      )}
    >
      <Inbox className="h-5 w-5 text-text-tertiary" />
      <p className="text-sm font-medium text-text-secondary">{title}</p>
      <p className="max-w-xs text-xs text-text-tertiary">{description}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border border-danger-border bg-danger-bg py-14 text-center",
        className
      )}
    >
      <AlertTriangle className="h-5 w-5 text-danger" />
      <div>
        <p className="text-sm font-medium text-text-primary">
          We couldn&apos;t reach AgentPay Gate.
        </p>
        <p className="mt-1 max-w-xs text-xs text-text-tertiary">
          {message ?? "Check that the backend is running and try again."}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
