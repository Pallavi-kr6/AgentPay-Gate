import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/20",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("text-xs font-medium text-text-secondary", className)} {...props} />
);
