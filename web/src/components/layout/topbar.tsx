"use client";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "./sidebar";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <span className="text-[10px] font-bold">AP</span>
          </div>
          <span className="text-sm font-semibold text-text-primary">AgentPay Gate</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 border-r border-border bg-background">
            <div className="flex justify-end px-3 pt-3">
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
