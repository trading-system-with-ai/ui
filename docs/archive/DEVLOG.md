# Development Log — UI

Newest entries first.

---

## 2026-08-20 — Persona-driven UX review implemented (quant + stock analyst + design audit)

Three independent reviews (quant-analyst user, stock-analyst user, UI/UX
heuristic audit — 49 findings) drove four fix batches:

**Batch 1 — state semantics & navigation.** New shared
`TradingStatusBanner` (global kill switch × per-symbol enablement → ONE
effective headline: PAUSED / "no orders will be generated" neutral /
ENABLED, raw facts as a detail line) replaces the two contradictory
banners on Dashboard and Trading Pool; `.banner.neutral` variant.
Watchlist/Trading Pool lists get real `isPending` branches (no more
"empty" flash while loading). 观察列表→自选列表 unified; ENUM_ZH grows
COMPLETED/RUNNING/PENDING/CANCELLED, fill models, CALL/PUT/SPREAD/
INCOME/SHORT/STOCK. Nav: Catalysts joins Simple mode (event-driven
users' primary page — NavMode tests updated to seven destinations); a
hidden pro page reached by in-context link now temporarily lists + 
highlights itself (`owns()` also matches detail routes); Mode/Language
switch groups labeled.

**Batch 2 — cross-linking.** Dashboard "Next 7 Days" strip
(`UpcomingEvents`, api.events horizon=7d, T-N countdown, EST badge,
links to event pages) in both modes. Tickers link to
`/watchlist/<ticker>` from the watchlist table, recommendation cards,
and the event hero (`a.ticker-link`). EventCard's duplicate Open
Research/Open event links deduped — "Open Analysis" deep-links
`?tab=analysis` (event page reads the tab param post-mount).

**Batch 3 — backtests.** `.seg-control` grid→flex-wrap (kills the 2+1
ghost cell); fill-model buttons bilingual (乐观/保守/最差); stale "LONG
STOCK ONLY (V1)" scope note deleted (contradicted the 8-instrument
selector and PUT/SPREAD history); history ticker-filter chips
(client-side, `.chip-btn`); run selection/completion auto-scrolls to
results; status badge + fill/instrument chips through `useEnumLabel`.

**Batch 4 — readability.** Activity details: raw `JSON.stringify` wall →
3-key digest + expandable pretty JSON (`DetailsCell`), 50-row paging.
Risk: whole SHADOW cluster (tiles, VaR/ES, contribution, stress,
validation, drawdown) folds to one summary line when every model shares
the same UNAVAILABLE state; zero values stop wearing red/green (drawdown
0.00%, gross P&L $0). Catalysts provider matrix folds to "N sources
healthy · last success …" (auto-opens on trouble). Recommendations:
PENDING >48h gets STALE badge + dimmed card; source line names the
actual provider/model. Beginner "Worth a look" gains headers +
2-decimal right-aligned prices. Watchlist Promote button shortened
(tooltip keeps the full sentence) — actions column no longer clipped.
`button.primary` #4493f8→#1f6feb (≈4.6:1 AA contrast).

Verified: tsc clean; 924/924 vitest; full-page before/after screenshots
via headless Chromium.

**Backlog (needs backend):** BacktestSummary list metrics
(Sharpe/MaxDD/win-rate + params) and multi-run compare; 0-trade run
diagnostics; per-position Greeks columns + closed-position exit
price/reason; watchlist change%/as-of/next-event columns; rec
price-drift since generation. **Backlog (frontend):** Guide sticky TOC;
event detail 14-tab regroup + decision summary strip; locale-aware
date formatting via the language switch; Simple-mode jargon softening;
bid/ask off the red/green axis; font-size/spacing tokens.

## 2026-08-17 (3) — Bull call spread joins the backtest form; spreads toggle unlocked (scoped)

Backtests: third instrument option 牛市看涨价差 (desc states net debit =
MAX LOSS + the permission scope); spread-width field in the option param
group; contract column renders both legs (LONG / -SHORT ×n); result chip
+ history SPREAD chip. Settings: defined_risk_spreads moves from locked
to a REAL toggle whose row meaning states the partial scope (research +
backtest now; live execution under construction — live plans degrade to
the single leg with the § note). Types: BacktestInstrument +
BULL_CALL_SPREAD, spread_width_pct, trade short_symbol/short_strike,
allow_defined_risk_spreads. Verified: tsc clean; 20/20; real-data AAPL
spread run renders end-to-end (junk `.next/types/* 2.ts` duplicates from
the dev-server move to :3001 removed).

---

## 2026-08-17 (2) — Backtest instrument selector: Long Call joins

Backtests form: new Instrument segment control (正股做多 / 买入看涨期权)
with honest descriptions (real historical contracts ~Feb 2024+, live
premium-stop/21-DTE exits; long put pending the bear mirror); an Option
Leg param group (DTE window, OTM%, premium budget, per-contract
commission, option slippage) renders only for LONG_CALL. Results: header
chips the instrument; trades table gains a Contract column
(OCC symbol × contracts) when option trades are present; history rows
chip CALL. Subtitle's stale IS/OOS phrase removed. Types: BacktestParams
instrument + option fields, BacktestTrade contract extras,
BacktestSummary.instrument.

**Env:** the user's platform-ui container took host 3000 — THIS platform's
dev server now runs at **http://localhost:3001** (gateway :8011; CORS
updated). Verified: tsc clean; component tests 20/20; :3001 pages 200;
real-data AAPL LONG_CALL run renders end-to-end.

---

## 2026-08-17 — Account Permissions panel becomes interactive (three real flags)

Settings → Account Permissions: the three REAL §5 flags (Long stock /
Long calls / Long puts) now carry Enable/Disable buttons wired to the
runtime-config layer ("true"/"false" strict); a toggle applies at once to
plan generation, the live §10 gate chain and the backtest gate (success
toast says exactly that). Everything else in the matrix (short stock,
naked calls/puts, covered calls, CSPs, margin, spreads) renders a 🔒
locked marker with the §33 explanation — no code path exists, so no entry
point can enable them. New Action column; legacy short-stock fallback row
keeps alignment. Types: ProviderConnectionsUpdate gains allow_long_* keys.

**Env:** NEXT_PUBLIC_API_BASE → http://localhost:8011 (gateway host port
moved; see backend DEVLOG). Verified: tsc clean; component tests 20/20;
/, /settings, /backtests 200; live toggle round-trip against the deployed
gateway (disable → False, re-enable → True, "" → 422).

## 2026-08-16 (3) — Term cards portal to body (user: "Exposure explainer doesn't show")

**Root cause (a class, not one spot):** `.term-pop` was absolutely
positioned INSIDE the trigger; any ancestor with overflow (`.table-scroll`,
the `.tchain` 70vh viewport) clips absolutely-positioned children, so
cards near container edges were cut off — the LAST metric row's card
("Exposure") was fully invisible, only its top border peeking out.

**Structural fix in the component (one place, every surface):**
- Card now renders via `createPortal(document.body)` with
  `position: fixed`, z-index 1000 — no ancestor can clip it.
- Placement computed from the trigger rect: flips LEFT near the right
  viewport edge and flips ABOVE the trigger when there is no room below
  (exactly the last-row case); follows scroll (capture-phase listener, so
  nested scroll containers reposition too) and resize.
- Outside-click detection updated for the portaled card (trigger OR card
  counts as inside).

**Overlay audit of the whole UI (same bug class):** chart tooltips are
bounded inside their charts by design; meter fills clip intentionally;
gate-stepper connector is decorative; Modal (fixed z-200) and Toasts
(fixed z-300) are viewport-fixed already. Term was the only broken one.

**Tests:** +1 regression test (card's parentElement IS document.body,
rendered from inside an overflow container) — suite 20/20; tsc clean;
all five Term-bearing pages 200.

## 2026-08-16 (2) — IS/OOS removed from the backtest UI (user decision)

Paired with the backend parity refactor: metrics table is now a single
Value column (flat full-period metrics; legacy rows served flattened by
the API); IS/OOS banner + snooping counter replaced by one honest
methodology line (deterministic replay of the live rules, no ML, no
auto-fitting — the only untouchable test is future data); chart loses the
OOS shading/divider/IS-OOS tags; form loses the In-sample fraction field
("Data Split" group → "Data"); ticker-page Backtest tab single-column;
settings backtest-defaults row for oos_split dropped. Types updated
(flat metrics, no oos fields). Glossary: `is_oos` entry removed,
`hard_stop` added (backtest trades now show HARD_STOP exits — same §12.1
sizing as live); trades intro links HARD_STOP · ATR_TRAIL · TIME_STOP.

**Verified:** tsc clean; component tests 19/19; /backtests /watchlist/AAPL
/trading-pool 200 against the redeployed gateway.

## 2026-08-16 — Iteration 35: methodology transparency (user: "why IS/OOS? was something tuned? is this ML?")

**Ground truth established from engine.py before writing any copy:** the
backtest is a deterministic bar-by-bar replay of the SAME signal code live
uses (§21), no look-ahead, fills at next open with slippage+commission. NO
automatic fitting, NO machine learning anywhere in the engine; the OOS
segment is "reported on, never optimized against" (§44 rule 16). The
optimizer is the USER iterating parameters manually — which is exactly why
the held-out segment exists.

**UI upgrades:**
- IS/OOS banner rewritten to say precisely that (no auto-fitting, no ML,
  you are the optimizer, IS-good/OOS-bad = overfitting), both languages;
  banner chip + oos_split form field wired to a new `is_oos` glossary card.
- Glossary +20 entries — methodology (is_oos, backtest_v1, fill_model,
  slippage), metrics (cagr, sharpe, sortino, max_drawdown, win_rate,
  profit_factor, expectancy, exposure), exit rules (atr_trail, time_stop),
  LLM scores (impact, novelty, source_reliability), risk concepts
  (portfolio_heat, correlation_bucket, delta_notional). Each card ends
  with SEARCH KEYWORDS (中英) so beginners know what to study next — the
  user's explicit ask.
- Wired platform-wide: backtest metric-table labels, fill-model chip,
  "long stock only (V1)" chip, trades-intro ATR_TRAIL/TIME_STOP terms;
  recommendations Impact/Novelty/Reliability meters; risk page Portfolio
  Heat / Market Regime / Delta-Adj Notional / Net Theta / Net Vega /
  Correlation buckets; positions Stop/Trail/Time-stop headers.

**Verified:** tsc clean; component tests 19/19; /backtests /recommendations
/risk /positions all 200.

## 2026-08-15 — Iteration 34: percent-unit audit (user caught the drawdown chart)

**Trigger (user):** drawdown chart axis read "-0.3%" while the metrics table
said -34.67% for the same run — challenged the whole service's data accuracy.

**Data verdict: backend CORRECT, display wrong.** Max DD recomputed
independently from the equity curve = -0.346737 — bit-identical to the
stored drawdown series minimum and to metrics.max_drawdown_pct (-34.67).
The chart plotted the fraction series but printed it with "%" unscaled.

**Root cause (a class, not a typo):** the backend mixes two unit
conventions — most `*_pct` fields are true percents (backtest metrics
77.03, change_pct), while others are fractions (curve.drawdown, risk
fields, win_rate — and atr_pct DESPITE its name: regime.py atr/close).
The UI has two fmtPct helpers with OPPOSITE semantics (risk-format ×100
vs backtest-metrics unscaled), so every call site is a unit decision.

**Full audit of every `%` render site** (grep sweep + live-API unit checks
against /api/backtests/2, /api/portfolio/risk, /api/config,
/api/watchlist/AAPL/analysis). Three display bugs found, all fixed:
1. Backtest drawdown chart axis + tooltip: fraction ×100 now (-34.7%).
2. Technical tab `atr_pct` (fraction, misleading name): 0.03% → 2.57%.
   Also realized_vol20 now renders as % (34.78%) matching the Options
   tab's RV20 instead of a bare 0.3478.
3. Backtest Win Rate: fraction through the unscaled fmtPct → "0.25%";
   now ×100 → "25.00%".
Everything else verified correct (risk page fractions→fmtPct ✓, dashboard
change_pct percent→toFixed ✓, score meters ✓, strike-depth chips ✓,
options chain ✓, settings limits ✓).

**Regression protection:** lib/backtest-metrics.test.ts pins both
conventions (fmtPct verbatim on percents; win_rate 0.25 → "25.00%");
vitest include extended to lib/**. Suite 19/19; tsc clean; pages 200.

## 2026-08-15 — Iteration 33: LLM output language auto-follows the UI language

**Why (user):** don't make the generation language a separate setting — the
LLM should "recognize" the interface language: 中文 UI → Chinese analysis,
EN UI → English.

**How:** the sidebar language toggle now ALSO fire-and-forgets
`PUT /api/config/providers {llm_output_language}` (Nav.tsx mutation,
invalidates `provider-connections`). The UI switch itself never blocks on
the backend; a failed sync just leaves the previous generation language in
place, visible in Settings → LLM where the manual selector still works as
an override until the next switch (help text updated to say so, both
languages). No new backend surface — reuses the runtime-config layer from
Iteration 32.

**Tests:** 3 new Nav tests (zh switch flips labels + PUTs
`{llm_output_language:"zh"}`; re-clicking the active language sends nothing;
failed sync leaves the UI switched) — component suite 16/16; tsc clean;
/, /watchlist/AAPL, /settings all 200.

## 2026-08-15 — Iteration 32: full Simplified Chinese coverage (all pages) + LLM output language

**Why (user):** switching to 中文 only changed the nav — everything else,
including LLM-generated analysis, was still English. Requirement: everything
Chinese except tickers.

**Static copy — every page bilingual via t(en, zh):** dashboard, activity,
recommendations, trading-pool, watchlist index, watchlist/[ticker] (~320
sites), positions, risk, backtests, settings (~200 sites), option chain
(~75 sites), shared components (NotConfigured, Placeholder, charts).
Roughly 900 bilingual call sites in total. Module-level label constants
restructured to {en, zh}; helpers outside components take `t` as a param;
`t`-shadowing loop variables renamed.

**Enum display — `lib/i18n-labels.ts`:** deterministic 1:1 table for closed
backend enums (STRONG_BULL 强多头, NEUTRAL_RANGE 区间震荡, CONDITIONAL
有条件, MODERATE_BEAR 中度空头, BULLISH 看多 …) via `useEnumLabel()`; badge
CSS keys still use raw tokens; unmapped tokens render raw, never guessed.

**LLM-generated content — fixed at the SOURCE:** new
`Settings.llm_output_language` (en|zh, runtime-config) + a system-prompt
addendum on both real providers: NEW generations write summary + evidence
snippets in 简体中文; machine fields (horizon, catalyst_type, reason_codes)
stay English (filtering/analytics key on them). Stored rows keep their
generation language — records are never rewritten. Settings → LLM card got
an "Analysis language / 分析输出语言" selector; runtime config switched to
zh per the user's request.

**Verbatim-by-design (NOT translated):** server-generated audit-exact
strings — gate details, fail reasons, tradeability check details, audit
rows, order statuses (FILLED…), exit reasons. §26/§36: exact records are
never paraphrased; translation included. Their surrounding framing IS
translated.

**Verified:** tsc clean; component tests 13/13; §47 scan OK; all 10 routes
200; backend 961 passed; gateway redeployed (/api/config/providers now
serves llm.output_language).

## 2026-08-15 — Iteration 31: beginner metric explainers (bilingual glossary) + EN/简体中文 language switch

**Why (user):** make every metric understandable to a newcomer, and support
English + Simplified Chinese.

**Explainability — `<Term>` glossary cards:**
- `lib/glossary.ts`: ~25 metrics, each with name / one-line definition /
  "how to read it" guidance in BOTH languages — beginner-level but
  quantitatively correct (IV explained as priced-in expectation, not a
  forecast; IV−RV explicitly NOT "overpriced/underpriced"; platform
  semantics like selector direction labeled as research parameters).
- `components/shared/Term.tsx`: wraps a label with a dotted-underline
  trigger; click opens an explainer card (name/short/read), Escape or
  outside click closes, one card at a time, right-half triggers flip the
  card leftward, stopPropagation so chain-row expand doesn't fire. Unknown
  key → children unchanged (a label can never break).
- Wired into the highest-confusion surfaces: options summary strip (Spot,
  ATM IV, Expected move, RV20, IV−RV spread, IV rank, Selector direction),
  T-chain sub-headers (OI/Vol/IV/Δ/Bid/Mid/Ask, STRIKE), flat-view §34
  headers (…Gamma/Theta/Vega), EOD DTE, and the ticker Overview (Regime,
  Bull/Bear score, Directional edge, Tradeability).

**i18n — `lib/i18n.tsx`:**
- LanguageProvider (localStorage-persisted, default en, storage failures
  tolerated) + `useLang`/`useT`; EN/中文 toggle pinned to the sidebar
  bottom; nav labels bilingual.
- SCOPE BY DESIGN: UI chrome + glossary are bilingual; SERVER-GENERATED
  strings (gate details, fail reasons, audit text) stay verbatim English —
  they are exact records the UI must never paraphrase (§26/§36),
  translation included. Page-level copy migrates to `useT` progressively.

**Verified:** tsc clean; component tests 13/13 (4 new Term tests: EN card,
zh card via persisted lang, unknown-key passthrough, one-at-a-time);
§47 scan OK; /, /watchlist/RDW, /settings, /positions all 200.

## 2026-08-13 — Iteration 30: professional T-chain layout; Direction separated into a platform Selector strip

**Why (user, third round on this):** switching AUTO↔BULL showed no change —
correctly, because AUTO resolved to BULL — but that exposed the real
design flaw: a "direction" control on an option CHAIN is non-standard
(no professional platform has one; chains are neutral market data) and its
coupling to the display was unexplainable.

**Redesign (information architecture per §25):**
- **Chain = neutral market data, standard T-layout**: for a single expiry,
  calls | strike | puts (OI/Vol/IV/Δ/Bid/Mid/Ask per side), ATM boundary
  marked at the nearest-to-spot strike, candidate/eligible cells tinted,
  click-through to the per-contract §9 score detail. No direction concept
  in the chain at all. Flat list remains for All-expiries and for the
  Eligible/Candidates views.
- **Selector = platform layer, own strip above the chain**: "CONTRACT
  SELECTOR — what-if side" with AUTO·BULL/BULL/BEAR chips (AUTO now SHOWS
  its resolution, so AUTO ≡ BULL is self-explanatory, with copy telling
  the user to try BEAR to see the put side shopped), plus the outcome
  sentence: "N recommended / M eligible of K in view — blocked mainly by:
  DTE (34); open interest (12)" (top blockers computed from the shopped
  side's fail reasons).

**Verified:** tsc clean; component tests 9/9; §47 scan OK; /watchlist/RDW
200 against the live Alpaca-backed gateway.

## 2026-08-13 — Iteration 29: chain table null-safety for quotes-less plans

**Why (user-reported crash):** `price2` threw on `null.toFixed` — the
quotes-less options tier serves NO `last_trade`, so `chain[].last` is an
honest null the table had never seen.

**Fixed:** `OptionContractRow.last/volume/open_interest` are now nullable in
the type (matching the server's honest nulls); `price2` renders "—" for
null (never a fabricated 0.00); volume/OI cells guard with "—".
`tsc --noEmit` clean (strict nullability now covers every usage);
/watchlist/RDW 200 with the 435-contract real chain rendering.

## 2026-08-13 — Iteration 28: EOD options fallback view (free Massive plan)

**Why:** backend audit found the free Options Basic plan includes contracts
reference + EOD bars (see backend DEVLOG 2026-08-13); the Options tab
previously showed only "not in plan".

**Built:** `OptionsEodView` in OptionChainTable — renders below the chain
error when the live snapshot is plan-gated: amber END OF DAY badge, spot
reference with its provenance note, expirations table (DTE/strikes/
calls/puts, front-focus row highlighted), nearest-to-ATM contracts with
previous-session OHLC/volume/VWAP and session date, per-contract honest
"no previous-session bar" rows, and the fixed line naming what the plan
does not serve (quotes, greeks, IV, open interest → Starter+). The
plan-gate note now says the EOD data IS shown below instead of a dead end.
`api.watchlist.optionsEod` + `OptionsEod` type.

**Verified:** `tsc --noEmit` clean; /watchlist/RDW 200; the live gateway
serves real RDW EOD data (8 expirations, ATM $13/$13.5 bars).

## 2026-08-13 — Iteration 27: News tab enabled (Phase 8 landed long ago; the tab was still a placeholder)

**Why (user report):** the Symbol Analysis "News — Phase 8" tab was still
rendered disabled although Phase 8 news ingestion and the catalyst surface
both shipped.

**Built:** removed the `phase` placeholder marker from the News tab; new
`NewsTab` on `GET /api/watchlist/{ticker}/catalyst`: the `LlmCatalystPanel`
(LLM-GENERATED interpretation, §11/§38) on top, then "Stored news citing
{ticker}" — a verbatim-provenance table (published timestamp, publisher,
title linking to the real article URL) with the latest-source line and the
explicit note that these are REAL provider articles stored at
Recommendations refresh, nothing generated. Honest empty state points at
the refresh as the ingestion path.

**Verified:** `tsc --noEmit` clean; /watchlist/RDW 200; live data check —
RDW: 0 cited articles (honest empty state), SMCI: 1 cited article + stored
LLM interpretation render the populated path; 50 real articles in the
store.

## 2026-08-12 — Iteration 26: UPGRADE §47 dialog component tests — the last mandatory spec item

**Why:** §47 explicitly requires component tests for the dialog system:
focus trap, cancel, confirm, ESC, destructive state, loading state,
disabled submit, keyboard navigation.

**Built:**
- vitest + @testing-library/react + jsdom installed (devDependencies);
  `vitest.config.mts` (jsdom, `@` alias, components/**/*.test.tsx);
  `npm run test:components`; CI ui job runs it between typecheck and build.
- `components/shared/ConfirmDialog.test.tsx` — 9 tests against the REAL
  shipped components: ARIA dialog semantics; confirm/cancel callbacks; ESC
  closes; loading blocks confirm AND cancel AND ESC (no double-submit);
  disabled submit blocks confirm while cancel stays usable; destructive
  styling; Tab/Shift+Tab wrap INSIDE the dialog (focus trap); Modal returns
  focus to the opener on unmount (§29); backdrop click closes while inside
  clicks do not.

**Verified:** 9/9 pass first run — the Modal/ConfirmDialog implementations
already satisfied every §47 behavior; `tsc --noEmit` clean; §47 static scan
OK.

**Upgrade status after this iteration:** every MANDATORY item of
prompts/upgrade_2026-08-12.md is implemented and verified. The two
remaining "may include" features (§3 VWAP — needs intraday data from a
Massive plan upgrade; §3/§6 market/sector confirmation INSIDE the score —
overlaps the existing regime gates and §31 opportunity status, so putting
it in the score risks double-counting and backtest/live parity questions)
are deliberate research-design decisions left to the user.

## 2026-08-12 — Iteration 25: UPGRADE §31/§32 — Toast system, wired to every §31-listed flow

**Why:** §31 "Do not use blocking dialogs for normal success messages" —
the last unbuilt piece of the §28 dialog family. Consent stays in
ConfirmDialog; OUTCOMES now arrive as non-blocking toasts with the §32
severity system.

**Built:**
- `components/shared/Toast.tsx`: `ToastProvider` + `useToast()` (context
  hook). Top-right stack, `aria-live="polite"` + `role="status"`,
  auto-dismiss at 6s EXCEPT CRITICAL (stays until dismissed — §32),
  manual dismiss always. Severity dots use the exact badge palette
  (accent/green/amber/red) — §32: one semantics, no per-page palettes.
  Mounted in `app/providers.tsx`.
- Wired to every §31-listed flow with §30-consistent copy:
  - Watchlist added (add form + recommendation promote: "…research only, no
    trading authorized") · Watchlist removed (INFO)
  - Plan saved (generate) · Plan applied ("…trading stays DISABLED, no
    order placed") · Plan cancelled (INFO) · Plan revalidated
  - Trading enabled (WARNING — orders may now flow) / disabled (INFO) ·
    pool removal (INFO)
  - Position closed (with fill price + realized P&L)
  - Configuration updated (Settings provider connections)
  - Kill switch: pause = CRITICAL (persistent), resume = WARNING
- Existing informational panels (Apply outcome badges, close actionMsg with
  order id/commission) are kept — toasts announce, panels document.

**Verified:** `tsc --noEmit` clean; §47 scan OK; all 7 touched routes 200
against the live gateway.

**Remaining documented gaps:** VWAP + market/sector-confirmation features
(§3/§6, data-dependent); vitest dialog component tests (§47).

## 2026-08-12 — Iteration 24: UPGRADE Phase F UI — §34 plan hierarchy, §35 progressive disclosure, §24 Exit Plan panel

**Why:** §34 "the page should answer the trading decision from top to
bottom. Do not begin with a technical Gate Chain dump."

**Built — TradePlanResult reorganized to the §34 order:**
1. `DecisionSummaryPanel` (Level 1): the verdict stated first — instrument
   badge on approval, red NO TRADE otherwise, with the single controlling
   reason (approved sizing line, or the first failing gate's verbatim
   detail) and a pointer to the full trace.
2. Evidence/strategy sections (existing): proposed sizing, instrument
   rationale, contract + OCC identity, portfolio impact numbers.
3. `ExitPlanPanel` (§24, NEW — placed BEFORE any Apply/Execute affordance):
   hard stop with real dollars, signal invalidation, ATR trail, time stop,
   DTE exit for options, and the honest "Profit target: none in V1" line.
4. Execution Authorization (§20/§34) then the execute affordance.
5. Why trade / why not trade.
6. **Advanced decision trace** (Level 3): the FULL gate chain moved into a
   collapsed `<details>` at the bottom — completely auditable, no longer
   the opening. Research/execution copy preserved.
- `lib/types.ts`: `OrderPreview.exit_plan` (optional — tolerant of older
  backends).

**Verified:** `tsc --noEmit` clean; backend suite 921 green; deployed
gateway serves the §24 block with real RDW numbers; /watchlist/RDW 200.

**Next:** Phase H — closure: UI CI job (§47 scan + typecheck + build),
production build with the dev server stopped, §52 acceptance checklist
review, memory update.

## 2026-08-12 — Iteration 23: UPGRADE Phase E UI — LLM Catalyst panel (§11/§25/§38)

**Why:** the quant panel got its DATA-DRIVEN identity in iteration 17; §11
requires the interpretive layer to stand beside it with an equally explicit
LLM-GENERATED identity — separate timestamps, citations, and uncertainty
language, never styled as market data.

**Built:**
- `LlmCatalystPanel` on Symbol Overview (below the quant panel): amber
  `LLM-GENERATED` provenance tag + "LLM CATALYST ANALYSIS — generated
  interpretation" heading; the fixed §11 disclaimer ("This section is
  interpretive and generated by the LLM from cited news and market
  information. It cannot override quant eligibility, risk limits, or any
  veto (§12)."); §38 freshness line — Generated at · latest source at ·
  model (with "unknown (pre-upgrade row)" for blank models, honest).
- §11 fields grid: catalyst sentiment (signed), impact, novelty, source
  reliability, expected horizon, catalyst type; the summary; the EVIDENCE
  list as real links with their own published timestamps.
- Honest empty state: "No LLM interpretation has been generated for
  {ticker}… nothing is invented here." plus a cited-articles count line
  when stored news mentions the symbol.
- `lib/types.ts` `SymbolCatalyst`/`CatalystLlm`/`CatalystArticle`;
  `api.catalyst`.

**Verified:** `tsc --noEmit` clean; /watchlist/RDW 200 against the live
gateway (renders the honest empty state — RDW has no stored
interpretation).

**Next:** Phase F — Trade Plan page §34 hierarchy + §35 progressive
disclosure (gate chain becomes Advanced Decision Trace).

## 2026-08-12 — Iteration 22: UPGRADE §42 UI — freshness column, Revalidate flow, stale-apply dialog

**Why:** the backend now refuses to activate stale research (§42, backend
DEVLOG entries 9–10); the UI must show WHY a plan is stale and offer the
one-click recompute.

**Built:**
- Plans table gains a Freshness column: green CURRENT, or amber STALE DATA /
  CONFIG CHANGED with the full server detail (as-of vs expected date, each
  drifted §41 version `plan → current`) in the tooltip. The v0→v1 grouped-
  weights change from backend iteration 10 is exactly what this surfaces:
  every pre-change plan now shows CONFIG CHANGED.
- Revalidate button on stale non-terminal plans → `POST
  /api/plans/{id}/revalidate`; the fresh GENERATED plan appears in the list,
  the old plan stays untouched (§42 "Recompute").
- ApplyPlanPanel handles the §42 refusal: a 409 with code
  PLAN_REVALIDATION_REQUIRED swaps the confirm dialog for a "Plan
  revalidation required" dialog stating the cause (stale data with dates, or
  each drifted version) and offering Revalidate Now.
- `lib/types.ts`: `PlanRevalidation`, `TradePlan.revalidation`,
  `PlanRevalidateResult`; `api.plans.revalidate`.

**Verified:** `tsc --noEmit` clean; /watchlist and /watchlist/RDW 200
against the live gateway, where plan #1 genuinely shows CONFIG CHANGED
(score-weights-v0-equal → score-weights-v1-grouped).

**Next:** Phase E — LLM catalyst panel separation (§11/§25/§38): distinct
LLM-GENERATED visual identity beside the DATA-DRIVEN quant panel, with
model/provider, generation timestamp, and cited sources.

## 2026-08-12 — Iteration 21: UPGRADE Phase G — zero browser-native dialogs (§27), §47 static scan

**Why:** upgrade §27 is a mandatory UI/UX change: no window.alert / confirm /
prompt anywhere in production UI. All eleven remaining call sites converted
to the ConfirmDialog/Modal family with §30 consequence copy.

**Converted (all consequence copy preserved or strengthened):**
- Dashboard: Pause All Trading — destructive dialog with REQUIRED reason
  input (disabled submit until non-empty; reason goes to the audit trail);
  Resume Trading — consequences stated.
- Trading Pool: Pause-all (destructive), per-symbol Enable Trading (§20
  copy: "future qualifying signals may submit paper orders after all
  execution and risk gates pass"), Remove (destructive; clarifies research
  survives, execution authorization is revoked).
- Recommendations: Add-to-Watchlist approval dialog with the §29 example
  copy verbatim ("This is your explicit approval step. The LLM only
  proposed this symbol. Adding it starts research only. It does not
  authorize trading.").
- Positions: SELL TO CLOSE dialog replacing prompt+confirm — quantity input
  with live validation (1..position, disabled submit when invalid), the
  paper fill model, and the §18 closing-allowed-while-paused note (§30).
- Watchlist: acknowledge-risks promotion dialog (failed §4.3 checks listed
  verbatim + permanent-audit warning, destructive), Remove dialog.
- Symbol ApprovePanel: BUY TO OPEN execution consent dialog (§25 label,
  §39 max-loss never hidden — premium max loss line for options), replacing
  the multi-line native confirm. Idempotency key behavior unchanged.
- Hooks discipline: all dialog state declared before any early return.

**§47 static scan:** `scripts/check-native-dialogs.sh` greps app/,
components/, lib/ for global alert(/confirm(/prompt( calls (word-boundary
aware; comments excluded) — exits 1 on any hit. Wired as
`npm run check:dialogs`. Verified: passes now; backend CI has no UI job yet
(adding one is a Phase H item).

**Verified:** scan OK; `tsc --noEmit` clean; dev server 200 on /, /watchlist,
/watchlist/RDW, /trading-pool, /positions, /recommendations.

**Known limitations:** Toast system (§31) not yet built — success messages
still render as inline notes/banners (acceptable: §31 forbids blocking
dialogs for success, which we do not do); InlineAlert/severity audit (§32)
partially applied via badge conventions.

**Next:** Phase B — grouped score weights (§6) as an explicit, versioned
formula change with characterization-test updates; or §42 plan staleness
revalidation. Then Phase E/F.

## 2026-08-12 — Iteration 20: UPGRADE Phase D UI — persisted plans, Apply flow with ConfirmDialog, plan status column

**Why:** upgrade §18/§19/§30/§33 — the Generate → Review → Apply workflow
needs its UI: plans persist, applying is an explicit consent step with real
consequence copy, and plan status is visible from the dashboard.

**Built:**
- `components/shared/ConfirmDialog.tsx` (§28/§29, composing Modal):
  primary/destructive confirm, loading state (blocks double-submit and
  backdrop/ESC close), disabled-submit support. The Phase G dialog family's
  first member.
- Trade Plan tab reworked to the §18 workflow: Generate now calls
  `POST /api/plans/generate` — the plan PERSISTS (id + status + §41 versions
  shown above the result). The §16 preview renders through the existing
  TradePlanResult unchanged. ApprovePanel (execution) still appears only on
  an APPROVE/RESIZE risk verdict.
- `ApplyPlanPanel` (§19/§30): "Apply Plan" opens a ConfirmDialog with the
  §30 copy verbatim ("Applying this plan adds the symbol to the Trading
  Pool, stores this plan as Active, and enables risk re-evaluation. It does
  NOT bypass risk controls."). A 422 with failed §4.3 checks escalates to a
  DESTRUCTIVE acknowledge dialog listing each failed check verbatim and the
  permanent-audit warning. Success shows the §19 outcome as three badges:
  TRADING POOL: YES · PLAN: ACTIVE · TRADING ENABLED: NO, plus the
  superseded-plan note.
- `PlansListPanel`: all plans for the symbol (status badge, generated
  time, data as-of, verdict instrument, Cancel action with 409 guards
  server-side).
- Watchlist dashboard: Plan column (§33) — ACTIVE green / GENERATED amber
  per ticker from `GET /api/plans` (ACTIVE wins over newer non-active).
- `lib/api.ts` `plans` client + `lib/types.ts` `TradePlan` /
  `PlanApplyResult` / `PlanStatus`.
- Cleanup: removed macOS " 2" duplicate artifacts inside `.next` left by the
  earlier build/dev collision (they were breaking `tsc` with duplicate
  identifier errors).

**Verified:** `tsc --noEmit` clean; dev server /watchlist and /watchlist/RDW
200 against the live gateway (plan #1 for RDW lists with GENERATED badge).
Per loop practice, no production build during iterations (Phase H will).

**Known limitations:** the promote flow on the Watchlist page still uses a
browser-native confirm() (§27 — next targeted replacement now that
ConfirmDialog exists); REVIEWED state has no UI affordance yet; §24 exit
plan not yet shown inside the stored plan (Phase F).

**Next:** Phase G sweep — replace every remaining browser-native
alert/confirm/prompt with the dialog family + §47 static CI scan.

## 2026-08-12 — Iteration 19: UPGRADE Phase C UI — Execution Authorization section, research-chain framing

**Why:** upgrade §15/§20/§34 — the backend's research/execution split must be
visible: a research plan shows its market verdict AND, separately, what
execution would still require. Research approval ≠ execution approval.

**Built:**
- `lib/types.ts`: `ExecutionAuthorization` interface;
  `OrderPreview.mode?: "research" | "execution"` +
  `execution_authorization?` (optional — tolerant of pre-split backends).
- `ExecutionAuthorizationPanel` (§34 section): AUTHORIZED / NOT AUTHORIZED
  badge, the three facts as YES/NO rows (Trading Pool / Symbol trading
  enabled / Global trading enabled), every `missing` line verbatim, and the
  §20 copy: "Research approval ≠ execution approval. … no order can result
  from it until every authorization below is granted AND the execution gate
  chain re-passes on live data."
- Trade Plan gate chain heading becomes "Research gate chain" in research
  mode with copy explaining pool authorization is an execution requirement
  shown separately (the §16 chain no longer contains that gate row —
  rendered verbatim from the server as always).

**Ops fix (root cause of the intermittent 500s):** each loop iteration ran
`npm run build` into the SAME `.next` directory the long-running dev server
serves from, corrupting its runtime manifests — the "transient" 500s were
this, and eventually /watchlist stuck at 500. Dev server restarted; loop
practice changed to `tsc --noEmit` for verification during iterations, with
production builds reserved for Phase H verification (dev server stopped).

**Verified:** `tsc --noEmit` clean; dev server restarted — /, /watchlist,
/watchlist/RDW all 200 against the live gateway.

**Next:** Phase D backend — research plan persistence + lifecycle
(§19/§40/§41: Apply Plan → Trading Pool + ACTIVE plan, versioned, audited).

## 2026-08-12 — Iteration 18: UPGRADE Phase A-2 UI — Market State panel, tradeability verdict, §10 explanation

**Why:** upgrade §9/§10/§14 — the backend's new Layer-2 tradeability verdict
must be visible where direction is shown, so "STRONG BULL yet BLOCKED" reads
as the designed state, not a bug.

**Built:**
- `MarketStatePanel` (§14 information architecture): Market regime / Symbol
  regime / Volatility / Tradeability grid at the top of Symbol Overview,
  fed entirely from the analysis payload's `tradeability.checks` (market
  regime comes from the check's own detail — no second source to drift).
- §10 explanation line (`tradeabilityExplanation`): whenever directional
  evidence is non-NEUTRAL and the environment is not TRADEABLE, an amber
  sentence states exactly the doc's posture ("Strong bullish directional
  evidence exists, but the current environment fails the tradeability
  gate. This is a valid state, not a contradiction — direction and
  permission are separate layers.") — degrades wording for CONDITIONAL /
  DATA_INSUFFICIENT.
- "View reasons" → Modal (§26 evidence provenance): every check with
  PASS/CONDITION/BLOCK/INSUFFICIENT badge and its verbatim detail, plus the
  rules version and the §12 note that the LLM cannot override these.
- Context strip: tradeability badge next to the bias badge (reasons in the
  tooltip). Watchlist dashboard: new Tradeability column (§33).
- `TRADEABILITY_BADGE` severity map added to `lib/risk-format.ts` (§32:
  green/amber/red/dim — same semantics everywhere, no per-page palettes).
- `lib/types.ts`: `TradeabilityState`, `TradeabilityCheck`,
  `TradeabilityDecision`; `SymbolAnalysis.tradeability`;
  `WatchlistOverviewItem.tradeability`.

**Verified:** `tsc --noEmit` clean; production build passes; dev server 200
on /watchlist and /watchlist/RDW against the live gateway — RDW renders the
§10 scenario live: STRONG BULL classification beside a red BLOCKED badge
with SYMBOL_REGIME TRANSITION named in the reasons modal.

**Known limitations:** volatility cell shows UNKNOWN/DEGRADED while option
data is plan-gated (honest); FINAL DECISION row of the §14 card awaits the
research-plan work (Phase C/F); browser-native confirm() still pending
Phase G.

**Next:** Phase C backend — research/execution split (§15/§16): research
gate chain without TRADING_POOL_AUTHORIZATION.

## 2026-08-12 — Iteration 17: UPGRADE Phase A/B UI — quant provenance panel, edge classification, score explainer modal

**Why:** upgrade 2026-08-12 §3/§5/§7/§8/§25 — the deterministic score layer
must be visibly deterministic, classifiable at a glance, and reproducible by
the user without reverse-engineering. First UI consumption of the new
backend contract (classification, contributions, legend, versions).

**Built:**
- `components/shared/Modal.tsx` — the seed of the Phase G dialog framework:
  application-styled dark modal with backdrop dim/blur, ARIA dialog
  semantics, focus trap, ESC-close, focus return to the opener,
  click-outside close. ConfirmDialog/Toast will compose it in Phase G.
- Symbol Overview quant panel (§3/§25): the score statbar now lives inside a
  panel headed `DATA-DRIVEN · QUANTITATIVE ANALYSIS — deterministic
  market-data calculation` with `Source … · as of … · no LLM is involved in
  this score · weights <version>`. New `.provenance` visual identity
  (data-driven blue / llm-generated amber) ready for the §11 LLM panel.
- Edge classification (§7): the statbar's Bias cell became Classification —
  the server's seven-band label (`signal.classification`) with intensity-
  graded badge colors (`.badge.strong_bull` … `.badge.strong_bear`).
- §8 compact legend (`EdgeLegend`): renders `signal.edge_legend` verbatim —
  bands derive server-side from the classifier's params, so the UI cannot
  drift — with the CURRENT band highlighted and `CURRENT +66.7 → STRONG
  BULL` chip; STRONG bands show their side-score requirement as a `*` with
  tooltip.
- §5 "ⓘ How is this calculated?" → `ScoreExplainerModal`: formula with the
  actual numbers (`Bull − Bear = Edge`), BULL/BEAR contribution tables
  (condition / triggered / +points / max points, TOTAL row reconciling to
  the displayed score), the threshold legend, versions
  (weights + classification), and the research-parameter disclaimer.
- Components table (kept as Advanced Details, §5): gained a Contribution
  column (`+16.7` or `0 / 16.7`).
- Watchlist dashboard (§33): Bias column replaced by Classification (falls
  back to bias for pre-upgrade cached rows).
- `lib/types.ts`: `EdgeClass`, `EdgeLegendBand`, extended `AnalysisSignal`
  (+deterministic/classification/versions/legend) and `SignalComponent`
  (+contribution/max_contribution); `WatchlistOverviewItem.edge_class`.

**Verified:** `tsc --noEmit` clean; production build passes; dev server
serves /, /watchlist, /watchlist/RDW 200 against the live gateway (RDW
showing STRONG BULL from the real Massive data).

**Known limitations:** browser-native confirm() still used in the
promote/acknowledge flow (§27 — Phase G will replace it with ConfirmDialog
on the new Modal); Tradeability layer (§9) not yet in the UI; LLM catalyst
panel separation (§11/§25) pending.

**Next:** Phase A-2 backend Tradeability layer (§9/§10), then its UI state
line (Market/Symbol/Volatility/Tradeability) in the §14 decision card
direction.

## 2026-08-10 — Iteration 16: Massive-only data — explicit NOT-CONFIGURED states

**Why:** the backend defaulted `market_data_provider` / `llm_provider` to
`"stub"`, so an unconfigured install silently served crc32-seeded synthetic
prices, bars, option chains and template-generated recommendations that looked
real. Both defaults are now `""`, and every market-data-dependent endpoint
returns 503 `{"detail": {"code": "MARKET_DATA_NOT_CONFIGURED", "message": …}}`
instead of numbers. The UI had to stop rendering anything that could be
mistaken for data.

**Built:**
- `lib/api.ts`: `isMarketDataNotConfigured` / `isLlmNotConfigured` /
  `notConfiguredDetail` / `notConfiguredMessage` narrow the structured 503, plus
  `retryUnlessTerminal` (404 and 503 are both permanent — don't retry, don't
  poll). `lib/types.ts`: `NotConfiguredDetail`, `MarketDataState`; `PortfolioRisk`
  `market_regime` / `greeks` / `vol_targeting` are now nullable with a
  `market_data` block; `PlatformConfig.providers` gains the `*_configured` flags.
- `components/shared/NotConfigured.tsx`: the one amber panel (title, the
  server's verbatim message, and the fixed line "No data is shown rather than
  estimated or synthetic values"), with an `llm` variant and an inline
  `NotConfiguredNote` for table footnotes.
- Replaced per surface: Dashboard indices + Market Regime tile; symbol page
  Price / Technical / Options / Trade Plan / Overview context strip (and the
  approve path, in case the provider drops between preview and fill); Backtests
  Run button disabled with an inline reason via a pre-flight probe; Risk greeks,
  vol targeting and market-value columns off the new `market_data.configured`;
  Positions market columns as "—" with a footnote (rows still list — they are
  real DB records); Recommendations refresh (LLM variant); Watchlist research
  columns. Settings Providers is now a RED "NOT CONFIGURED" state, replacing the
  amber STUB badge.
- Removed every "stub data" / "stub chain" / "stub until Massive" label: a
  configured provider shows its actual name, and an unconfigured one shows the
  panel. Nothing anywhere falls back to a placeholder NUMBER — only "—" or the
  panel.

**Note:** the "stub" mentions in older entries below are left intact — this log
is a dated record of what was built at the time, not current UI copy.

**Verified:** `npm run typecheck` + `npm run build` clean.

---

## 2026-08-10 — Iteration 15: Promotion-check dialog + exit-monitor status

**Built:**
- Watchlist promote flow now §4.3-aware: unacknowledged attempt first; a 422
  with structured checks opens an inline review panel (✓/✗ per check with
  honest details, stub LIQUIDITY dimmed) offering Cancel or a
  confirm()-gated "Acknowledge risks & promote anyway" that restates the
  permanent audit recording; success banners distinguish acknowledged
  (amber + audit note) from clean promotions.
- Positions page: auto-exit-monitor status line (interval/last sweep/counts;
  amber "disabled — exits run only via the manual button" state).

**Verified:** typecheck + build clean first run; verifier passed all checks
zero-fix (incl. type-safe structured-422 narrowing).

**Next (iteration 16):** docs polish; possible loop wrap-up review.

**Built:**
- Dashboard Alerts panel above Recent Activity (§29 — always rendered, never
  hidden): severity badges (CRITICAL red with left border / WARNING amber /
  INFO dim), timestamps, human titles, ticker links, View-all link; distinct
  empty/loading/error states.
- Symbol Overview context strip (§33): symbol regime + market regime chips,
  §7 vol inputs displayed as numbers only (ATM IV / RV20 / IV−RV / expected
  move — display-only, no client-side re-classification), bias badge; shares
  the Options tab's query cache.

**Verified:** typecheck + build clean; verifier passed all checks zero-fix.

**Next (iteration 15):**
1. Promotion-check dialog for Trading Pool adds once backend lands.
2. Position-monitor status indicator.

**Built:**
- Backtests config: segmented control for OPTIMISTIC / CONSERVATIVE (default)
  / WORST with per-option §20.2 description text; worst_slippage_bps input
  enabled only under WORST; defaults updated.
- History rows + results header carry the fill-model chip (null-safe
  CONSERVATIVE fallback for older records); "§20.2 — historical mid is never
  a guaranteed fill" reminder under the metrics table.

**Verified:** typecheck + build clean; verifier passed all checks zero-fix.

**Next (iteration 14):**
1. Dashboard alerts feed once the backend alert rules land.
2. Symbol Overview tab regime/vol context strip.

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
