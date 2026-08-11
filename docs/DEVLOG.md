# Development Log — UI

Newest entries first.

---

## 2026-08-10 — Iteration 12: Settings page v1 + Dashboard opportunities panel

**Built:**
- Settings (§28) placeholder replaced: ten grouped read-only panels each with
  a plan-section chip — environment/providers (amber STUB flags), kill switch
  state, §5 permissions as ALLOWED/BLOCKED badges (explicit "Short stock:
  BLOCKED — no flag exists" row), §12 risk limits with per-regime cash-floor
  sub-table and buckets, §11 exit params, §9 selector, §14 vol targeting,
  §6 signal params (collapsed), §20 backtest defaults, paper fill model.
  Prominent "read-only — editing arrives later" note.
- Dashboard "Top Watchlist Opportunities" placeholder replaced: top-6 rows
  sorted ENTRY_READY > SETUP_FORMING > WATCH > NO_SIGNAL > DATA_ISSUE then
  |edge|, with ticker links, colored edge, bias/opportunity badges;
  OPPORTUNITY_BADGE hoisted to lib/risk-format.ts and shared with Watchlist.

**Verified:** typecheck + build clean; verifier passed all checks zero-fix.

**Status note:** every §28 navigation section now has real content — no
placeholders remain in the app.

**Built:**
- Risk page Portfolio Greeks panel (§36/§16): Net Delta (equivalent shares),
  Delta-Adjusted Notional ($ + % NAV vs limit with BREACH state), Net Gamma,
  Net Theta ($/day, red past half the cap), Net Vega; per-position
  contribution table with dimmed "no chain data" rows; red breach banners.
- Vol-targeting line (§14): forecast vs target vs multiplier with the
  "hard risk caps always apply" note; amber when scaling down.
- Bucket rows now show STATIC/DYNAMIC chips + the 60d/0.70 explainer.
- Trade Plan renders the full RISK_APPROVAL detail (multiplier note included).

**Verified:** typecheck + build clean (stale .next cleared once more); all six
static UX checks passed, fraction formatting confirmed correct.

**Next (iteration 12):**
1. Settings page v1 (read-only config view) once backend exposes it.
2. Dashboard: watchlist opportunities panel using the overview endpoint.

**Built:**
- Trade Plan: instrument badge (LONG_STOCK/LONG_CALL/LONG_PUT/NO_TRADE),
  vol-regime chip (LOW→EXTREME color ladder), §8/§5 rationale list rendered
  verbatim, contract card (right/expiry/strike/Δ/IV/DTE/mid/max-loss-per-
  contract); quantities labeled CONTRACTS (×100) vs SHARES; approve confirm
  restates instrument + contract + total premium max loss (§39 never hide
  max loss).
- Positions: instrument column badge, option contract line with DTE, premium
  P&L % chip, ×100-consistent market values; PREMIUM_HARD_STOP / DTE_EXIT
  render in the existing exit-reason expansion.
- Dashboard mini-table gains the compact instrument badge.

**Verified:** typecheck + build clean first run; verifier passed all five
static UX checks with zero fixes (incl. null-safety for stock-only previews).

**Next (iteration 11):**
1. Risk page: portfolio Greeks + delta-adjusted exposure once backend lands.
2. Consider per-position sparkline of premium P&L.

**Built:**
- Options tab enabled on the symbol page; new
  `components/options/OptionChainTable.tsx`: summary strip (spot, ATM IV,
  expected move ±% and ±$, RV20, signed IV−RV, IV Rank "—" with the
  no-history note, direction badge incl. NO SIGNAL), AUTO/BULL/BEAR toggle
  (keepPreviousData refetch), expiry chips, the exact §34 All / Eligible /
  Recommended Candidate view toggle with counts, and the 15-column chain table
  (prices 2dp, greeks 3dp, IV/spread as %) in its own scroll container.
- Eligible rows accent-washed; candidates rank-badged (#1…#3) with expandable
  score-component grids; ineligible rows expand to red fail_reasons.
- Research-only note (no trade actions on the chain) + stub-chain data-source
  line. 404/loading/error states mirror the Price tab.

**Verified:** typecheck + build clean; verifier confirmed all §34 checks with
no source fixes (stale .next macOS duplicates cleared again — build cache
only; recurring environment artifact, not source).

**Next (iteration 10):**
1. Trade Plan shows the §8 instrument decision + selected contract once the
   backend matrix lands.
2. Consider a small IV smile / term-structure visual on the Options tab.

**Built:**
- Price tab enabled on the symbol page (§33): new
  `components/charts/CandlestickChart.tsx` — inline-SVG candlesticks (hollow
  green up / filled red down, CVD-safe fill-state encoding validated with the
  dataviz palette checker), wicks, price gridlines, volume panel sharing the
  x-domain, 60/120/250 range toggles, crosshair + keyboard tooltip with full
  OHLCV, data-source line, own scroll container.
- Activity page: actor-type chips (USER/SYSTEM/LLM) + action chips built from
  the live `/api/audit/actions` endpoint, AND-combined with the ticker input;
  active-filter count with Clear all; explicit loading/error states.
- GitHub Actions CI (node 22: npm ci + typecheck + build).

**Verified:** typecheck + build clean; UI verifier passed all checks with zero
fixes.

**Next (iteration 9):**
1. Options tab (§34 chain table with eligibility highlighting) once the stub
   chain API lands.
2. UI container joins docker compose.

**Built:**
- `app/recommendations/page.tsx` (§30, placeholder replaced): card grid with
  ticker/company, sentiment badge (documented ±0.15 thresholds), catalyst +
  horizon chips, summary, reason-code chips, impact/novelty/reliability score
  meters (ARIA), View Evidence expansion (sources with published_at + §20.3
  note), status filter tabs, Generate button with created/skipped result
  banner. **No trade action exists on this page by design** — the only
  mutations are refresh/dismiss/promote; permanent governance subtitle
  "The LLM proposes — you decide."
- Add to Watchlist confirm dialog frames the click as the explicit user
  approval step; success invalidates watchlist/recommendations/audit queries.
- Risk page gained the Strategy Health panel (§19): status badge, trade count
  vs minimum sample, win rate / profit factor / expectancy / gross P&L /
  drawdowns (null-safe), explanations list, "pause automation later" note.

**Verified:** typecheck + build clean first run; verifier grep-confirmed zero
trade/order/execute verbs among the page's actions and all §30 fields present.

**Next (iteration 8):**
1. Symbol page Price tab (candles/volume) once backend serves OHLC series.
2. Activity page action-type filter chips.

**Built:**
- `app/positions/page.tsx` (§37, placeholder replaced): open-positions table
  with P&L coloring, max loss, stop/trail prices, entry→current edge with
  signal-decay delta chip, bars held, time-stop countdown, HOLD/EXIT_SIGNALED
  badges, and expandable per-position exit_reasons (OK-prefixed dimmed,
  triggered red) — the "why are we still holding" view; per-row Close with
  partial-quantity prompt and a confirm dialog stating the paper fill model
  and the closing-while-paused rule; Run Exit Check button with result banner;
  closed-positions panel with realized P&L.
- Trade Plan tab: "Approve & Execute (paper)" appears only for
  APPROVE/APPROVE_WITH_RESIZE; crypto.randomUUID() client_order_id per
  click-intent (idempotent double-clicks, regenerated after success); confirm
  restates qty/entry/max loss; structured 422 renders the server's re-run
  failed gate; success links to /positions.
- Dashboard Active Positions panel wired live.

**Verified:** typecheck + build clean (verifier again cleared stale macOS
".next" duplicate artifacts — build output only); all eight §37/§42 UX checks
passed with no source fixes needed.

**Next (iteration 7):**
1. Recommendations page (§30) once the backend Recommendation Pool lands.
2. Activity page filter chips (action-type filters) as audit volume grows.

**Built:**
- `app/risk/page.tsx` (§36, placeholder replaced): stat tiles — NAV, Cash with
  floor sub-line (amber near / red below floor), Portfolio Heat with state
  badge, Max New Risk, Market Regime, Trading status; correlation-bucket
  utilization meters (severity-colored, ARIA meter roles); positions table
  (null market data → "no data", max loss always visible in red); hard-limits
  panel with plan meanings; recent RISK_DECISION audit events.
- Trade Plan tab enabled on the symbol page (§33): Generate Trade Plan calls
  the order-preview API; the §10 gate chain renders as a vertical stepper with
  every gate always visible (PASS/FAIL/SKIPPED + detail); sizing panel
  (entry/stop/requested vs approved/budget/heat before-after/cash after) with
  decision badge + reason-code chips; Why Trade and Why Not Trade side by side;
  prominent "PREVIEW — no order is placed" note.
- Dashboard NAV/Cash/Heat tiles now live from the portfolio API.
- `lib/risk-format.ts` shared badge/format helpers.

**Verified:** typecheck + build clean. The adversarial UI verifier caught and
fixed 3 real unit bugs before they shipped: fmtPct treated fractions as
percents (100% cash rendered "1.0%"), the cash near-floor band compared
fraction to percent (always amber), and bucket utilization bars never exceeded
1% width (severity always green). All §36/§33 UX checks pass post-fix.

**Next (iteration 6):**
1. Positions page v1 (§37) with exit-status context.
2. Order approve flow from Trade Plan once backend lands.

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
