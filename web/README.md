# AgentPay Gate — web

The dashboard: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + hand-authored shadcn-style components (Radix primitives + CVA, kept in `src/components/ui/`) + Framer Motion + Recharts.

## Run it

```bash
npm install
cp .env.example .env.local     # defaults to http://127.0.0.1:8000
npm run dev                     # http://localhost:3000
```

The backend (see the repo root README) must be running separately — this app is a pure client of it over REST, nothing more.

```bash
npm run build   # production build - type-checked, verified passing
npm run lint    # ESLint - verified passing
npm run start   # serve the production build
```

## Structure

```
src/
├── app/
│   ├── page.tsx                  # landing page
│   ├── checkout/page.tsx         # buyer-facing human approval gate
│   └── (dashboard)/              # route group: sidebar shell + TEST MODE bar
│       ├── layout.tsx
│       ├── dashboard/page.tsx    # overview: KPIs, spend chart, demo launcher
│       ├── transactions/         # list + [traceId] detail page
│       ├── approvals/            # approval cards with approve/reject dialogs
│       ├── policies/             # editable spending policy + live tier preview
│       ├── catalog/              # products with computed policy eligibility
│       ├── audit/                # live event feed
│       └── settings/
├── components/
│   ├── ui/                       # button, card, dialog, tabs, switch, status-badge, skeleton, empty/error states
│   ├── layout/                   # sidebar, mobile topbar
│   ├── dashboard/                # kpi-card, spend-chart, transactions-table
│   ├── approvals/                # approval-card
│   └── demo/                     # demo-launcher (fires REAL backend requests)
└── lib/
    ├── api.ts                    # every backend call - centralized, typed
    ├── types.ts                  # mirrors backend/models.py
    ├── use-api.ts                # generic loading/error/polling hook
    └── utils.ts                  # cn(), currency/date formatting, enum -> copy
```

## Notes

- **Why hand-authored `ui/` components instead of the shadcn CLI**: the CLI's non-interactive `init` wanted to install its own default theme, which would have fought the custom near-black palette in `globals.css`. The components here are the same architecture shadcn/ui generates (Radix primitives + `class-variance-authority` + Tailwind) - just written directly against our own design tokens.
- **Fonts**: uses the system font stack (`ui-sans-serif`, `-apple-system`, `Segoe UI`, …) rather than `next/font/google`, so the build has no external network dependency. Swap in `next/font/google` with Geist/Inter if you want a custom webfont - it's a two-line change in `layout.tsx` and `globals.css`.
- **Demo launcher and the landing page's "Run Demo" button** call the real `/purchase` endpoint on your backend, exactly like the CLI buyer agent does - nothing on this page is mocked or hardcoded.
- **Credentials**: this app never reads `RAZORPAY_KEY_SECRET`, `GROQ_API_KEY`, or `RAZORPAY_WEBHOOK_SECRET`. Only `NEXT_PUBLIC_API_URL` is used, and it points at the backend, not at Razorpay/Groq directly.
