"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  Package,
  ScrollText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/policies", label: "Policies", icon: SlidersHorizontal },
  { href: "/catalog", label: "Catalog", icon: Package },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <span className="text-xs font-bold">AP</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-text-primary">
            AgentPay Gate
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-surface-2 text-text-primary"
                  : "text-text-secondary hover:bg-surface-2/60 hover:text-text-primary"
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-text-tertiary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors",
            pathname === "/settings"
              ? "bg-surface-2 text-text-primary"
              : "text-text-secondary hover:bg-surface-2/60 hover:text-text-primary"
          )}
        >
          <Settings className="h-4 w-4 text-text-tertiary" />
          Settings
        </Link>
      </div>

      <div className="border-t border-border px-5 py-4">
        <p className="text-xs font-medium text-text-primary">Test Store</p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          <span className="text-[11px] text-text-tertiary">Test Mode</span>
        </div>
      </div>
    </div>
  );
}
