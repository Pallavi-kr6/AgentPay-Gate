"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { runDemoScenario, runFullDemo } from "@/lib/api";
import { Zap, ShieldCheck, ShieldX, RefreshCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SCENARIOS = [
  { key: "allow" as const, label: "Successful purchase", icon: Zap, hint: "Earbuds, ₹1,299 - auto-allowed" },
  { key: "approval" as const, label: "Approval required", icon: ShieldCheck, hint: "Speaker, ₹2,299 - needs a human" },
  { key: "block" as const, label: "Policy blocked", icon: ShieldX, hint: "Laptop, ₹42,999 - blocked category" },
  { key: "failure" as const, label: "Payment failure", icon: RefreshCcw, hint: "Forced decline - bounded retry" },
];

export function DemoLauncher({
  onActivity,
  autoRunOnMount,
}: {
  onActivity?: () => void;
  autoRunOnMount?: boolean;
}) {
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  async function fire(scenario: (typeof SCENARIOS)[number]["key"], label: string) {
    setRunning(scenario);
    try {
      const result = await runDemoScenario(scenario);
      setLog((l) => [`${label}: ${result.status} — ${result.reason}`, ...l].slice(0, 4));
      onActivity?.();
    } catch {
      setLog((l) => [`${label}: request failed - is the backend running?`, ...l].slice(0, 4));
    } finally {
      setRunning(null);
    }
  }

  async function fireAll() {
    setRunning("all");
    setLog([]);
    try {
      await runFullDemo((label, result) => {
        setLog((l) => [`${label}: ${result.status} — ${result.reason}`, ...l].slice(0, 4));
        onActivity?.();
      });
    } catch {
      setLog((l) => ["Full demo failed - is the backend running?", ...l]);
    } finally {
      setRunning(null);
    }
  }

  const autoRunFired = useRef(false);
  useEffect(() => {
    if (autoRunOnMount && !autoRunFired.current) {
      autoRunFired.current = true;
      fireAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunOnMount]);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Demo scenarios</h3>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Fires real requests at your backend - nothing here is faked.
          </p>
        </div>
        <Button variant="accent" size="sm" onClick={fireAll} disabled={running !== null}>
          {running === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Run full demo
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SCENARIOS.map((s) => {
          const Icon = s.icon;
          const isRunning = running === s.key;
          return (
            <button
              key={s.key}
              onClick={() => fire(s.key, s.label)}
              disabled={running !== null}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-hover disabled:opacity-50"
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5 text-text-tertiary" />}
                {s.label}
              </span>
              <span className="text-[11px] text-text-tertiary">{s.hint}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {log.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-1 overflow-hidden border-t border-border pt-3"
          >
            {log.map((line, i) => (
              <p key={i} className="truncate text-[11px] text-text-tertiary">
                {line}
              </p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
