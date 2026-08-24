"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Bot, SlidersHorizontal, ShieldCheck, CreditCard, ScrollText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const FLOW = [
  { label: "AI Agent", icon: Bot, desc: "Requests a purchase on a human's behalf" },
  { label: "Policy", icon: SlidersHorizontal, desc: "Checked against merchant-defined bounds" },
  { label: "Approval", icon: ShieldCheck, desc: "A human decides when a rule says so" },
  { label: "Payment", icon: CreditCard, desc: "Executed on Razorpay, never before this" },
  { label: "Audit", icon: ScrollText, desc: "Every step recorded, explainable end to end" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <span className="text-xs font-bold">AP</span>
          </div>
          <span className="text-sm font-semibold text-text-primary">AgentPay Gate</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-warning-border bg-warning-bg px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          <span className="text-[11px] font-medium text-warning">Razorpay Test Mode</span>
        </div>
      </header>

      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-20 pt-16 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-3xl font-semibold leading-tight tracking-tight text-text-primary sm:text-4xl"
        >
          AI agents can shop.
          <br />
          They can&apos;t spend without boundaries.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="mt-4 max-w-xl text-sm leading-relaxed text-text-tertiary sm:text-base"
        >
          AgentPay Gate gives AI shopping agents a controlled path to purchase — with spending
          limits, human approval, payment execution, and a complete audit trail.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16 }}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <Button variant="accent" size="lg" asChild>
            <Link href="/dashboard">
              Open Dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/dashboard?demo=1">Run Demo</Link>
          </Button>
        </motion.div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {FLOW.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.3 + i * 0.08 }}
                className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-6 text-center"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2">
                  <Icon className="h-4 w-4 text-accent" />
                </div>
                <p className="text-sm font-medium text-text-primary">{step.label}</p>
                <p className="text-[11px] leading-relaxed text-text-tertiary">{step.desc}</p>
                {i < FLOW.length - 1 && (
                  <ArrowRight className="mt-1 hidden h-3.5 w-3.5 text-text-tertiary sm:block" />
                )}
              </motion.div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-text-tertiary">
        Built for the Razorpay AI Buildathon — Track 1: AI Growth &amp; Agentic Commerce.
      </footer>
    </div>
  );
}
