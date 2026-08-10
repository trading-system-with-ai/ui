# Development Log — UI

Newest entries first.

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
