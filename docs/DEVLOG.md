# Development Log — UI

Newest entries first.

---

## 2026-08-10 — Iteration 2: Global kill switch + market overview wiring

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
