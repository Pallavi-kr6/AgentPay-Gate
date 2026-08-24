import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ExternalLink, ShieldCheck } from "lucide-react";

export default function SettingsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-tertiary">Environment and connection info.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backend connection</CardTitle>
          <CardDescription>This app talks to the FastAPI backend below for every screen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border bg-surface-2/50 px-3 py-2.5">
            <span className="text-xs text-text-tertiary">API URL</span>
            <span className="font-mono text-xs text-text-primary">{apiUrl}</span>
          </div>
          <a
            href={`${apiUrl}/docs`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            Open API docs <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-success" /> Where credentials live
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-text-secondary leading-relaxed">
            Razorpay and Groq API keys are configured only in the backend&apos;s own environment
            (<code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">RAZORPAY_KEY_SECRET</code>,{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">GROQ_API_KEY</code>,{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">RAZORPAY_WEBHOOK_SECRET</code>).
            This frontend never sees them, requests no permission to use them, and cannot bundle
            them - it only ever calls the backend over plain REST.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
