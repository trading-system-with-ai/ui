# Development Log — UI

Newest entries first.

---

## 2026-08-10 — Iteration 4: Backtests page v1 + watchlist research columns

**Built:**
- `app/backtests/page.tsx` (placeholder replaced): config panel with grouped
  editable params (Fills & Costs / Entry & Exit / Data Split) prefilled with
  engine defaults; run history with newest-first summaries; results with the
  §35 metrics table in three labeled columns — In-Sample | Out-of-Sample (amber,
  from oos_start_date) | Full; equity + drawdown SVG charts with the OOS region
  shaded and divider-marked (dataviz-skill palette, crosshair + keyboard);
  trades table showing entry_reason / exit_reason for every trade (§38);
  "LONG STOCK ONLY (V1)" scope note + stub-data source note (§39).
  Honors ?id= and ?ticker= (Suspense-wrapped useSearchParams per Next 15).
- Watchlist table upgraded via `/api/watchlist/overview`: Price / Regime /
  Edge (signed, colored) / Bias / Opportunity badge (ENTRY_READY green,
  SETUP_FORMING amber, DATA_ISSUE red, WATCH/NO_SIGNAL dim) / Backtest link.
- Symbol page Backtest tab enabled: latest run summary (full + OOS) + link.
- `lib/backtest-metrics.ts` shared formatting; backtest/overview types + API.

**Verified:** typecheck + build clean (verifier also cleaned stale macOS
"file 2.ts" duplicates from .next/types that broke typecheck); all eight
static UX checks passed.

**Next (iteration 5):**
1. Risk page v1 (NAV/cash/heat/limits + risk decisions) once backend lands.
2. Order preview flow UI (gate-chain visualization).

**Built:**
- `app/watchlist/[ticker]/page.tsx` — Symbol Analysis (plan §33): tabs
  Overview / Technical / Audit live; Price, Options, News, Backtest, Trade Plan
  disabled with their delivery phase labeled.
- Overview: stat tiles (price, regime, bull/bear scores, edge, bias badge) and
  the signal-component explainability table (name/side/triggered/weight/detail
  with real numbers) — no opaque confidence numbers anywhere (§33), plus the
  regime feature grid.
- Technical: 10-indicator table (null → "insufficient data") and a hand-rolled
  inline-SVG close/SMA20/SMA50 chart built per the dataviz skill (palette
  contrast-validated on the dark panel, null-safe segments, gridlines, legend,
  crosshair tooltip with keyboard support, own horizontal-scroll container).
- Audit tab reuses the audit API filtered to the symbol.
- 404 (not on watchlist) renders a clear message + link back; every tab shows
  "source: … (stub data) · as of …" (§39). `ApiError` now carries HTTP status.
- Watchlist rows gained an "Analyze" action (first action, links to the page).

**Verified:** typecheck + build clean; independent verifier confirmed all six
static UX checks (fail-states, staleness line, explainability table, scrolling
chart container, insufficient-data rendering, Analyze link).

**Next (iteration 4):**
1. Backtests page v1 (config form + §35 results once backend lands).
2. Watchlist columns for regime/scores/status.

**Built:**
- Dashboard banner now driven by the backend global kill switch
  (`GET /api/trading/status`), fail-safe: loading/error/unknown always renders as
  PAUSED with no Resume button — an ambiguous trading state is never shown.
- PAUSE ALL TRADING requires a non-empty reason (sent to the audit trail);
  Resume is confirm()-guarded. Mutations invalidate status + audit queries.
- Secondary line under the banner: per-symbol enabled count, "global pause
  overrides per-symbol enablement", paused-by/at metadata.
- Indices panel: SPY/QQQ/VIX price + signed change (green/red), STALE badge,
  provider source label with explicit "(stub data)" marker, as_of timestamp
  (plan §39: data-source and staleness always visible).
- Market Regime stat filled from `GET /api/market/overview`.
- Trading Pool page shows the same global status line above the table.
- `lib/api.ts` + `lib/types.ts`: trading.{status,pause,resume}, market.overview.

**Verified:** typecheck + production build clean; independent verify agent
confirmed fail-safe paused rendering, required pause reason, and visible
stub-data indicator.

**Next (iteration 3):**
1. Symbol analysis page skeleton (tabs per plan §33) with computed indicators.
2. Watchlist columns for regime/scores once backend exposes them.

---

## 2026-08-10 — Iteration 1: App shell + Watchlist/Trading Pool/Activity

**Built:**
- Next.js 15 + TypeScript + TanStack Query scaffold (App Router, standalone output,
  Dockerfile). Dark professional theme, no CSS framework dependency.
- Sidebar navigation with the nine plan-mandated sections.
- Dashboard: trading-status banner (PAUSED/ENABLED derived from Trading Pool state),
  stat bar (regime/NAV/cash/heat placeholders + live watchlist/pool counts), recent
  activity feed from the audit API.
- Watchlist page: add (with ticker normalization), remove (confirm dialog warns about
  Trading Pool revocation), promote to Trading Pool, IN TRADING POOL vs RESEARCH ONLY
  badges.
- Trading Pool page: enable/disable per symbol (enabling requires confirmation),
  PAUSE ALL TRADING control, allowed-strategies display, remove.
- Activity page: full audit trail with actor badges (USER/SYSTEM/LLM) and ticker filter.
- Placeholder pages for Recommendations/Positions/Backtests/Risk/Settings, each stating
  which phase delivers it.
- `lib/api.ts` typed client; 15s polling via React Query (WebSocket later).

**Verified:** `npm run build` clean — 12 static routes.

**Next (iteration 2):**
1. Market overview data on Dashboard once backend exposes `/api/market/overview`.
2. Kill-switch banner wired to backend trading pause state (not just pool-derived).
3. Symbol analysis page skeleton (tabs per plan §33).
