"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border border-border-strong bg-surface-2 outline-none transition-colors data-[state=checked]:bg-accent data-[state=checked]:border-accent",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-text-primary transition-transform data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}
