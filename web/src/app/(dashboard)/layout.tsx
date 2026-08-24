import { SidebarNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden w-60 shrink-0 border-r border-border md:block">
        <div className="sticky top-0 h-screen">
          <SidebarNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div className="hidden items-center justify-end border-b border-border px-6 py-2.5 md:flex">
          <div className="flex items-center gap-1.5 rounded-full border border-warning-border bg-warning-bg px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            <span className="text-[11px] font-medium text-warning">Razorpay Test Mode</span>
          </div>
        </div>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
