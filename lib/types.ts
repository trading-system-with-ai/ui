/* ------------------------------------------------ not-configured error contract */

/**
 * Structured `detail` body of the 503 every market-data / LLM / broker
 * dependent endpoint returns when its provider is unset. the configured market-data provider (Alpaca per the data-source architecture) is the only price source: when it is not configured the server returns NO
 * numbers at all rather than synthetic ones, and the UI renders the
 * NotConfigured panel.
 *
 * BROKER_NOT_CONFIGURED is the same rule applied to EXECUTION: with no broker
 * the server places no order at all rather than filling against the internal
 * simulator. A simulated fill shown as a broker fill would be exactly the
 * fabricated data this contract exists to prevent.
 */
export interface NotConfiguredDetail {
  code: "MARKET_DATA_NOT_CONFIGURED" | "LLM_NOT_CONFIGURED" | "BROKER_NOT_CONFIGURED";
  message: string;
}

/**
 * Top-level block on GET /api/portfolio/risk. That endpoint is deliberately
 * NOT a 503 — NAV / cash / positions are real DB rows — so it reports the
 * market-data state inline and nulls out every market-derived field instead.
 */
export interface MarketDataState {
  configured: boolean;
  /** The ProviderNotConfigured message when unconfigured; null when configured. */
  message: string | null;
}

export interface WatchlistItem {
  ticker: string;
  added_by: string;
  note: string;
  created_at: string;
}

export interface TradingPoolItem {
  ticker: string;
  trading_enabled: boolean;
  allowed_strategies: string[];
  promoted_by: string;
  created_at: string;
}

/* ------------------------------------------------ trading-pool promotion checks (§4.3) */

/**
 * One §4.3 promotion check, evaluated in order:
 * MIN_HISTORY (stored bars >= RegimeParams.sma_slow), BACKTEST_COMPLETED,
 * BACKTEST_TRADES (latest COMPLETED backtest has >= 1 closed trade), and
 * LIQUIDITY (REPORT mode, risk-engine audit §7.3: always passes; `detail`
 * carries the measured ADV20 and the hypothetical verdict verbatim).
 */
export interface PromotionCheck {
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * 201 body from POST /api/trading-pool — the pool row plus the checks that
 * were evaluated and whether the user overrode failures. The TRADING_POOL_ADD
 * audit event ALWAYS records both, so an acknowledged override is permanently
 * visible in the audit trail (§4.3, §38).
 */
export interface TradingPoolPromoteResult extends TradingPoolItem {
  promotion_checks: PromotionCheck[];
  risks_acknowledged: boolean;
}

/**
 * 422 `detail` body from POST /api/trading-pool when any check fails and
 * acknowledge_risks was not set — review and acknowledge to proceed.
 */
export interface PromotionCheckErrorDetail {
  message: string;
  checks: PromotionCheck[];
}

export interface TradingStatus {
  trading_enabled: boolean;
  reason: string;
  updated_by: string;
  updated_at: string | null;
}

export interface IndexQuote {
  symbol: string;
  price: number;
  change_pct: number;
  ts: string;
}

export interface MarketOverview {
  provider: string;
  as_of: string;
  stale: boolean;
  market_regime: string;
  indices: IndexQuote[];
}

/* ---------------------------------------------------------------- data-plan capabilities (§16) */

/**
 * One probed capability's verdict: `true` = verified working against the real
 * provider API, `false` = the subscribed plan does not include it (the
 * provider answered HTTP 403), a string = the probe itself FAILED with this
 * error — a fault, NOT evidence the capability is absent.
 */
export type CapabilityStatus = boolean | string;

/**
 * GET /api/market/capabilities — live provider entitlements, PROBED against
 * the real API (never assumed from configuration) and cached ~5 min
 * server-side. Known keys today: stock_history, stock_realtime, option_chain
 * (the Starter+ snapshot with quotes/greeks/IV), option_contracts (the
 * Basic-tier reference list feeding the EOD view), news.
 * `capabilities` is null when the configured provider cannot probe at all
 * (e.g. the stub has no plan to detect) — `message` says why. 503
 * MARKET_DATA_NOT_CONFIGURED when no provider is configured.
 */
export interface MarketCapabilities {
  provider: string;
  as_of: string;
  capabilities: Record<string, CapabilityStatus> | null;
  message: string | null;
}

/** EOD options reference view (provider-agnostic: contracts reference +
 *  previous-day bars; the server NAMES what the view lacks rather than
 *  approximating it). */
export interface OptionsEod {
  ticker: string;
  as_of: string;
  data_recency: "end_of_day";
  spot_reference: number;
  spot_reference_note: string;
  expirations: {
    date: string;
    dte: number;
    strikes: number;
    calls: number;
    puts: number;
  }[];
  target_expiry: string | null;
  atm_contracts: {
    ticker: string;
    contract_type: "call" | "put";
    strike: number;
    expiration_date: string;
    dte: number;
    prev_day: {
      open: number | null;
      high: number | null;
      low: number | null;
      close: number;
      volume: number;
      vwap: number | null;
      date: string | null;
    } | null;
    prev_day_error: string | null;
  }[];
  /** What this EOD VIEW lacks — a view fact, not a plan claim. */
  not_in_this_view: string[];
  note: string;
}

export type RegimeClassification =
  | "STRONG_BULL"
  | "MILD_BULL"
  | "NEUTRAL_RANGE"
  | "MILD_BEAR"
  | "STRONG_BEAR"
  | "TRANSITION";

export interface AnalysisIndicators {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  atr14: number | null;
  atr_pct: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  realized_vol20: number | null;
}

export interface AnalysisRegime {
  classification: RegimeClassification;
  features: Record<string, number | boolean>;
}

export interface SignalComponent {
  name: string;
  side: "bull" | "bear";
  triggered: boolean;
  weight: number;
  /** Points this component adds to its side's 0–100 score (0 if untriggered).
   *  The side score is EXACTLY the sum of its contributions (upgrade §5/§44). */
  contribution: number;
  /** This component's weight share of the side's 0–100 scale. */
  max_contribution: number;
  detail: string;
}

/** Seven-band Directional Edge classification (upgrade §7). */
export type EdgeClass =
  | "STRONG_BULL"
  | "MODERATE_BULL"
  | "WEAK_BULL"
  | "NEUTRAL"
  | "WEAK_BEAR"
  | "MODERATE_BEAR"
  | "STRONG_BEAR";

/** One §8 legend band, derived server-side from the classifier's own
 *  parameters — the UI renders it verbatim and never hardcodes thresholds. */
export interface EdgeLegendBand {
  classification: EdgeClass;
  edge_min: number;
  edge_max: number;
  /** Present only on STRONG bands: minimum same-side score (§7). */
  requires_side_score?: number;
}

export interface AnalysisSignal {
  /** True: deterministic market-data calculation — no LLM in this score (§3). */
  deterministic: boolean;
  bull_score: number;
  bear_score: number;
  directional_edge: number;
  bias: "BULL" | "BEAR" | "NEUTRAL";
  classification: EdgeClass;
  weights_version: string;
  classification_version: string;
  edge_legend: EdgeLegendBand[];
  components: SignalComponent[];
}

export interface AnalysisSeries {
  dates: string[];
  close: number[];
  sma20: (number | null)[];
  sma50: (number | null)[];
}

/** Layer-2 environment verdict (upgrade §9) — direction-agnostic. */
export type TradeabilityState =
  | "TRADEABLE"
  | "CONDITIONAL"
  | "BLOCKED"
  | "DATA_INSUFFICIENT";

export interface TradeabilityCheck {
  name: string;
  status: "PASS" | "CONDITION" | "BLOCK" | "INSUFFICIENT";
  detail: string;
}

export interface TradeabilityDecision {
  state: TradeabilityState;
  /** One line per non-PASS check — the §10 "WHY" evidence, verbatim. */
  reasons: string[];
  checks: TradeabilityCheck[];
  version: string;
}

export interface SymbolAnalysis {
  ticker: string;
  as_of: string;
  source: string;
  bars: { count: number; first: string; last: string };
  price: number;
  indicators: AnalysisIndicators;
  regime: AnalysisRegime;
  tradeability: TradeabilityDecision;
  signal: AnalysisSignal;
  series: AnalysisSeries;
}

/** One daily OHLCV bar from GET /api/watchlist/{ticker}/bars (plan §33). */
export interface DailyBar {
  /** YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** GET /api/watchlist/{ticker}/bars — most recent `limit` bars, oldest first. */
export interface BarsResponse {
  ticker: string;
  source: string;
  bars: DailyBar[];
}

/* ---------------------------------------------------------------- options chain (§34) */

/** Direction hint for GET /api/watchlist/{ticker}/options (server default AUTO). */
export type OptionDirection = "AUTO" | "BULL" | "BEAR";

export type OptionRight = "C" | "P";

export interface OptionChainSummary {
  /** ATM implied vol at the nearest 30d+ expiry (fraction, 0.32 = 32%). */
  atm_iv: number | null;
  /** ATM-straddle-implied expected move, nearest 30d+ expiry, as a FRACTION of spot. */
  expected_move_pct: number | null;
  /** 20-bar realized vol, annualized from stored bars (fraction). */
  rv20: number | null;
  /** atm_iv - rv20 (fraction); positive = options priced rich vs realized. */
  iv_rv_spread: number | null;
  /** Always null for now — see iv_rank_note. */
  iv_rank: number | null;
  iv_rank_note: string;
}

export interface OptionExpiry {
  /** YYYY-MM-DD */
  expiry: string;
  /** Days to expiry. */
  dte: number;
}

export interface OptionContractRow {
  /** YYYY-MM-DD */
  expiry: string;
  dte: number;
  strike: number;
  right: OptionRight;
  /** Null on quotes-less plans (price_basis "day_close"): unknown, not zero. */
  bid: number | null;
  ask: number | null;
  mid: number;
  /** (ask - bid) / mid, as a fraction; null when quotes are unknown. */
  spread_pct: number | null;
  /** "quote" (NBBO/midpoint) or "day_close" (session close — real traded
   *  price, but bid/ask/spread unknown on this plan). */
  price_basis?: "quote" | "day_close";
  /** Last trade price — null on plans without the trades feed (honest null). */
  last: number | null;
  volume: number | null;
  open_interest: number | null;
  /** Implied vol (fraction) — null when the provider omits it (deep wings). */
  iv: number | null;
  /** Deep-ITM/OTM: premium ≈ intrinsic or |delta| ≈ 1 — the vendor's IV is
   *  mathematically unidentifiable there; shown but flagged. */
  iv_unreliable?: boolean;
  /** Provider greeks — null when omitted (deep ITM/OTM); never zero-filled. */
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  /** Passes the liquidity/eligibility checks; failures are listed in fail_reasons. */
  eligible: boolean;
  fail_reasons: string[];
  /** 1..N among selected candidates, null when the contract is not a candidate. */
  candidate_rank: number | null;
  score: number | null;
  score_components: Record<string, number | string | boolean> | null;
}

/** GET /api/watchlist/{ticker}/options — read-only research chain, no audit event. */
export interface OptionChainResponse {
  ticker: string;
  as_of: string;
  spot: number;
  source: string;
  /** null when AUTO resolves to NEUTRAL — no candidate side. */
  direction_used: "BULL" | "BEAR" | null;
  summary: OptionChainSummary;
  expiries: OptionExpiry[];
  chain: OptionContractRow[];
}

/* ---------------------------------------------------------------- backtests */

/**
 * §20.2 fill model, mapped onto daily-bar data (no historical bid/ask yet).
 * Effective slippage applied to next-open fills:
 *   OPTIMISTIC   -> 0 bps (next-open, frictionless best case)
 *   CONSERVATIVE -> slippage_bps (the existing default behavior)
 *   WORST        -> max(slippage_bps, worst_slippage_bps)
 * Commission is unchanged in all models. Once real quote data lands, WORST
 * becomes ask-to-buy / bid-to-sell instead of a bps proxy.
 */
export type FillModel = "OPTIMISTIC" | "CONSERVATIVE" | "WORST";

export interface BacktestParams {
  position_pct: number;
  commission_per_share: number;
  slippage_bps: number;
  /** §20.2 fill model — server-validated; default CONSERVATIVE. */
  fill_model: FillModel;
  /** Extra bps floor used only by WORST: max(slippage_bps, worst_slippage_bps). >= 0, validated. */
  worst_slippage_bps: number;
  entry_edge_threshold: number;
  exit_edge_threshold: number;
  atr_trail_k: number;
  time_stop_bars: number;
  min_move_atr: number;
  warmup_bars: number;
  /** "LONG_STOCK" (V1 stock engine) | "LONG_CALL" (options engine over real
   *  historical contract bars, ~Feb 2024+). */
  instrument: BacktestInstrument;
  target_dte_min: number;
  target_dte_max: number;
  /** 0 = ATM; 0.05 = 5% OTM. */
  strike_otm_pct: number;
  /** Equity fraction spent on premium per LONG_CALL entry. */
  option_premium_pct: number;
  commission_per_contract: number;
  /** §20.2 option-spread bps proxy (no historical NBBO exists). */
  option_slippage_bps: number;
  worst_option_slippage_bps: number;
  /** BULL_CALL_SPREAD: short strike ≈ long + this fraction of spot. */
  spread_width_pct: number;
}

export type BacktestInstrument =
  | "AUTO"
  | "LONG_STOCK"
  | "LONG_CALL"
  | "LONG_PUT"
  | "BULL_CALL_SPREAD"
  | "BEAR_PUT_SPREAD"
  | "COVERED_CALL"
  | "CASH_SECURED_PUT"
  | "SHORT_STOCK";

export interface BacktestSegmentMetrics {
  /** AUTO runs only: the §8 entry-decision audit trail (additive JSONB
   *  key persisted by the backend — auto-strategy Phase B). */
  auto_decisions?: AutoDecisionRow[];
  total_return_pct: number;
  cagr_pct: number | null;
  sharpe: number | null;
  sortino: number | null;
  max_drawdown_pct: number;
  win_rate: number | null;
  profit_factor: number | null;
  expectancy_pct: number | null;
  avg_trade_pct: number | null;
  avg_hold_bars: number | null;
  num_trades: number;
  exposure_pct: number;
}

export interface BacktestTrade {
  entry_date: string;
  entry_price: number;
  exit_date: string | null;
  exit_price: number | null;
  bars_held: number;
  return_pct: number;
  entry_reason: string;
  exit_reason: string;
  /** Option-leg trades — prices above are then premiums per share (NET
   *  debit per share for spread trades). */
  contracts?: number;
  contract_symbol?: string;
  strike?: number;
  contract_expiry?: string | null;
  /** BULL_CALL_SPREAD only: the short leg's identity. */
  short_symbol?: string;
  short_strike?: number;
}

/** One AUTO entry-decision (the §8 audit trail persisted in
 *  metrics.auto_decisions — auto-strategy program Phase B). */
export interface AutoDecisionRow {
  date: string;
  edge: number;
  tier: string | null;
  vol_regime: string | null;
  instrument: string;
  rationale: string;
}

/** One persisted portfolio backtest (auto-strategy Phase C): the whole
 *  watchlist (or a subset) replayed against ONE shared cash ledger, with
 *  the per-day signed allocation table. */
export interface PortfolioBacktestRecord {
  id: number;
  tickers: string[];
  created_at: string | null;
  status: "COMPLETED" | "FAILED";
  params: Record<string, unknown>;
  metrics: BacktestSegmentMetrics & { auto_decisions?: AutoDecisionRow[] };
  trades: {
    ticker: string;
    entry_date: string;
    entry_price: number;
    exit_date: string | null;
    exit_price: number;
    bars_held: number;
    return_pct: number;
    pnl: number;
    entry_reason: string;
    exit_reason: string;
    contracts?: number;
    contract_symbol?: string;
    strike?: number;
  }[];
  equity_curve: BacktestEquityCurve;
  allocations: {
    dates: string[];
    by_symbol: Record<string, number>[];
    cash_pct: number[];
  };
  decisions: (AutoDecisionRow & { ticker: string })[];
  /** Rebalance journal (2026-08-20 explainability): every ENTER carries
   *  the full sizing arithmetic; every SKIP names the capital constraint. */
  journal: {
    date: string;
    ticker: string;
    action: "ENTER" | "EXIT" | "SKIP";
    instrument: string;
    quantity: number;
    price: number | null;
    reason: string;
    sizing: string;
    cash_after: number;
    equity_prev: number;
  }[];
  /** Deterministic risk-model findings (live VaR/ES/drawdown/correlation
   *  libraries), each evidenced with a rationale. Server strings verbatim. */
  advice: {
    severity: "INFO" | "SUGGESTION" | "WARNING";
    code: string;
    /** Bilingual pairs generated server-side from one template — pick by
     *  the UI language; older rows may still carry plain strings. */
    finding: { en: string; zh: string } | string;
    evidence: Record<string, unknown>;
    suggestion: { en: string; zh: string } | string;
    rationale: { en: string; zh: string } | string;
  }[];
  error: string;
}

export interface BacktestEquityCurve {
  dates: string[];
  equity: number[];
  drawdown: number[];
}

export type BacktestStatus = "COMPLETED" | "FAILED";

export interface BacktestRecord {
  id: number;
  ticker: string;
  created_at: string;
  status: BacktestStatus;
  params: BacktestParams;
  error: string | null;
  /** ONE flat full-period metrics object (IS/OOS segmentation removed
   *  2026-08-16 — manual-only tuning until ML-driven search exists). */
  metrics: BacktestSegmentMetrics;
  trades: BacktestTrade[];
  equity_curve: BacktestEquityCurve;
}

export interface BacktestSummary {
  id: number;
  ticker: string;
  created_at: string;
  status: BacktestStatus;
  num_trades: number;
  total_return_pct: number;
  profit_factor: number | null;
  /** §20.2 fill model; absent/null on rows that predate the field — treat as CONSERVATIVE. */
  fill_model?: FillModel | null;
  /** "LONG_STOCK" | "LONG_CALL"; absent/null on rows before the option leg. */
  instrument?: BacktestInstrument | null;
}

/* ---------------------------------------------------------------- watchlist overview */

export type OpportunityStatus =
  | "NO_SIGNAL"
  | "WATCH"
  | "SETUP_FORMING"
  | "ENTRY_READY"
  | "DATA_ISSUE"
  | "BACKTEST_FAILED";

export interface WatchlistOverviewItem {
  ticker: string;
  price: number | null;
  regime: string | null;
  bull_score: number | null;
  bear_score: number | null;
  directional_edge: number | null;
  bias: "BULL" | "BEAR" | "NEUTRAL" | null;
  edge_class: EdgeClass | null;
  tradeability: TradeabilityState | null;
  opportunity_status: OpportunityStatus | null;
  backtest_status: string | null;
  last_backtest_id: number | null;
}

/* ---------------------------------------------------------------- portfolio risk */

export type HeatState = "NORMAL" | "ELEVATED" | "HIGH" | "BLOCKED";

export interface RiskPosition {
  ticker: string;
  quantity: number;
  avg_price: number;
  market_price: number | null;
  market_value: number | null;
  max_loss: number;
  opened_at: string;
}

/**
 * §12.4 — STATIC buckets are configured; DYNAMIC buckets are connected
 * components of rolling-60d correlation > 0.70 among open-position tickers,
 * computed from stored bars.
 */
export type BucketKind = "STATIC" | "DYNAMIC";

export interface RiskBucket {
  name: string;
  kind: BucketKind;
  tickers: string[];
  risk_usd: number;
  risk_pct: number;
  cap_pct: number;
  utilization_pct: number;
}

/* ------------------------------------------------ portfolio Greeks (§16) */

/** Per-position Greek contribution (stock rows: delta 1/share, other Greeks 0). */
export interface GreekPositionRow {
  ticker: string;
  /** Instrument label (LONG_STOCK / LONG_CALL / LONG_PUT). */
  instrument: string;
  /** Delta-equivalent shares (options: delta × 100 × contracts). */
  equivalent_shares: number;
  delta_notional_usd: number;
  gamma: number;
  theta_usd_per_day: number;
  vega_usd: number;
  /** false = no chain data for this row — its Greeks are unreliable. */
  data_ok: boolean;
}

export interface GreekLimits {
  /** All fractions of NAV (0.5 = 50%). */
  max_delta_notional_pct_nav: number;
  max_net_theta_pct_nav: number;
  max_net_vega_pct_nav: number;
}

/** §16 portfolio-level Greeks aggregated across open positions. */
export interface PortfolioGreeks {
  net_delta_shares: number;
  delta_adjusted_notional_usd: number;
  /** FRACTION of NAV (0.35 = 35%). */
  delta_notional_pct_nav: number;
  net_gamma: number;
  net_theta_usd_per_day: number;
  /** $ P&L per 1 IV point move. */
  net_vega_usd: number;
  limits: GreekLimits;
  /** Human-readable breach lines; empty when all Greek limits are respected. */
  breaches: string[];
  per_position: GreekPositionRow[];
}

/**
 * §14 volatility targeting — scales NEW risk budgets by target/forecast vol,
 * capped at max_multiplier. Hard risk caps always apply regardless.
 */
export interface VolTargeting {
  /** Annualized target vol (fraction, 0.12 = 12%). */
  target_vol: number;
  /** Forecast portfolio vol (fraction); null when there are no open positions. */
  forecast_vol: number | null;
  multiplier: number;
  max_multiplier: number;
  note: string;
  /**
   * Phase C (SHADOW) — the EWMA σ_p forecast shown BESIDE the crude v0 proxy
   * above, never instead of it: `multiplier` stays the one actually applied.
   * Fraction, annualized (σ_p/NAV × √252). Absent on older backends; null
   * when the book has too little history for an EWMA estimate.
   */
  ewma_sigma_p_annualized_pct_nav?: number | null;
  /** The multiplier the EWMA forecast WOULD produce (same clamps). SHADOW. */
  multiplier_ewma?: number | null;
  /** Server-generated note for the EWMA side, verbatim. */
  ewma_note?: string | null;
}

export interface RiskLimits {
  single_name_risk_pct: number;
  single_name_capital_pct: number;
  bucket_risk_pct: number;
  heat_elevated_pct: number;
  heat_high_pct: number;
  heat_reject_pct: number;
  abs_max_trade_risk_pct: number;
}

/* --------------------------------- statistical risk layer (Phase B, SHADOW) */

/**
 * §41 model health, reported per model. UNAVAILABLE = not enough data to
 * estimate (honest null, never a fabricated 0); FAILED = the estimator itself
 * errored. Every non-ACTIVE state arrives with a `reason` carrying the real
 * numbers.
 */
export type ModelHealth = "ACTIVE" | "DEGRADED" | "UNAVAILABLE" | "FAILED";

/** §70 — the statistical layer runs in SHADOW: it never alters a Tier 0 decision. */
export type RiskModelMode = "SHADOW";

/** §39/§59 model-risk state derived from health, dispersion and distribution. */
export type ModelRiskLevel = "LOW" | "ELEVATED" | "HIGH";

/** §15 distribution label; `primary` is the highest-priority flag. */
export type DistributionFlag =
  | "UNSTABLE"
  | "LEFT_SKEWED"
  | "HEAVY_TAIL"
  | "NORMAL_LIKE";

/** §15 — how much the Gaussian family can be trusted on this sample. */
export type GaussianTrust = "HIGH" | "REDUCED" | "LOW";

/** Estimator family behind a VaR/ES row — the UI never shows a number without it (§6). */
export type RiskModelFamily = "HISTORICAL" | "GAUSSIAN" | "HISTORICAL_VOL_SCALED";

/** Book P&L construction method (FULL_REVAL arrives in Phase D). */
export type PnlMethod = "DELTA_LINEAR" | "FULL_REVAL" | "FULL_REVAL_CONST_IV";

/**
 * §5 model tier — the CLASSIFICATION artefact, not a decision authority.
 *
 *  - TIER_0 — hard limits. The ONLY tier that vetoes a trade today.
 *  - TIER_1 — core statistical models (historical/Gaussian VaR & ES, σ,
 *             Euler contributions, drawdown, stress).
 *  - TIER_2 — conditional / advanced models (GARCH, vol-scaled views).
 *  - TIER_3 — documented-deferred research (EVT, copulas).
 *
 * A tier says WHAT KIND of model produced a number, never how much that
 * number is trusted — health (§41) and mode (§70) carry that separately. A
 * TIER_1 model in SHADOW still decides nothing.
 *
 * OPTIONAL everywhere it appears: backends that predate the taxonomy send no
 * `tier` field at all, and the UI renders no chip rather than guessing one.
 */
export type ModelTier = "TIER_0" | "TIER_1" | "TIER_2" | "TIER_3";

/** Snapshot-level data quality (§58): `valid` false blocks nothing in SHADOW, but is shown. */
export interface StatisticalDataQuality {
  valid: boolean;
  /** Server-generated strings — rendered verbatim. */
  reasons: string[];
  tickers_missing: string[];
  keys_excluded: string[];
}

/** §40 — model disagreement is information; never averaged into one number. */
export interface ModelDispersion {
  /**
   * max / min over comparable positive views. NULL (with health UNAVAILABLE
   * and a reason) when fewer than two comparable views exist — e.g. the
   * empty book. The block being present does NOT imply a measured ratio
   * (2026-08-20 crash regression: never call .toFixed on it unguarded).
   */
  ratio: number | null;
  /** true = MODEL_DISPERSION_HIGH. */
  high: boolean;
  min_model: string | null;
  max_model: string | null;
  n_comparable: number;
  health: ModelHealth;
  /** Server-generated string — rendered verbatim. */
  reason: string | null;
  /**
   * Per-row mode the server stamps: "SHADOW" for the accepted views,
   * "RESEARCH" for GARCH (`params.mode`). The panel currently derives the
   * RESEARCH badge from the model name/distribution; this is the
   * server-authoritative field to switch to if a GARCH view is ever promoted.
   */
  mode?: string;
}

/** §15 distribution diagnostics of the book P&L series. */
export interface DistributionDiagnostics {
  /** null when no flag applies; "UNSTABLE" when the variance is ~0. */
  primary: DistributionFlag | null;
  flags: DistributionFlag[];
  /** All four are null on an UNSTABLE series (0/0 has no value) — never render without a guard. */
  skew: number | null;
  excess_kurtosis: number | null;
  jarque_bera: number | null;
  /** χ²(2) p-value of the Jarque–Bera statistic. */
  jb_p: number | null;
  gaussian_trust: GaussianTrust;
  n: number;
  health: ModelHealth;
  /** Server-generated string — rendered verbatim. */
  reason: string | null;
}

/** §39/§59 aggregate model-risk verdict with the real triggers listed. */
export interface ModelRiskState {
  state: ModelRiskLevel;
  /** Server-generated strings — rendered verbatim. */
  reasons: string[];
}

/** Portfolio volatility σ of the book P&L series, USD per day. */
export interface StatisticalVolatility {
  value_usd: number | null;
  /** FRACTION of NAV. */
  pct_nav: number | null;
  /** FRACTION of NAV, σ × √252. */
  annualized_pct_nav: number | null;
  health: ModelHealth;
  reason: string | null;
  sample_size: number;
  model_name: string;
  model_version: string;
  /**
   * Phase E (§13/§58) — which conditional-volatility forecaster actually
   * produced this σ, e.g. "EWMA" or "GARCH". The fallback hierarchy means
   * the ACTIVE forecaster is not always the preferred one, so the tile names
   * the one that ran rather than the one that was configured.
   *
   * OPTIONAL on purpose: backends that predate Phase E send no such field,
   * and `model_name` is then the only provenance the tile can show.
   */
  forecaster?: string | null;
  /** Free-form forecaster diagnostics (persistence, half-life, Ljung–Box p, …). */
  diagnostics?: Record<string, unknown> | null;
}

/**
 * One VaR or ES estimate. VaR/ES are LOSSES (positive = money lost); a
 * negative value is reported honestly (the tail still gains) and never
 * floored. `value_usd` is null exactly when the model could not estimate.
 */
export interface RiskMetricRow {
  model: RiskModelFamily;
  model_name: string;
  model_version: string;
  /** "EMPIRICAL" | "NORMAL" | "EMPIRICAL_VOL_SCALED" | … */
  distribution: string;
  confidence: number;
  horizon_days: number;
  value_usd: number | null;
  /** FRACTION of NAV. */
  pct_nav: number | null;
  health: ModelHealth;
  reason: string | null;
  sample_size: number;
  /** k = ceil(n·(1−α)) — the number of tail observations averaged/indexed. */
  tail_size: number | null;
  /** "SQRT_TIME" when a 1D estimate was scaled to a longer horizon; null when estimated directly. */
  scaling: string | null;
  /**
   * §5 tier of the estimator behind this row. ADDITIVE and optional — absent
   * on backends that predate the taxonomy, in which case no chip renders.
   * It classifies the model; it does not qualify the number (health does).
   */
  tier?: ModelTier | null;
}

/** §10 — one position's share of total portfolio risk vs its share of capital. */
export interface RiskContributionRow {
  /** Unique per position row, e.g. "AAPL#12". */
  key: string;
  ticker: string;
  instrument: string;
  contribution_usd: number;
  /** FRACTION of the total (risk weight); null when the total is not positive. */
  share: number | null;
  /** FRACTION of deployed capital (capital weight) — deliberately NOT the risk weight. */
  capital_weight: number | null;
}

export interface RiskContributionBlock {
  /** Present on the ES block; absent (null) on the volatility block. */
  confidence?: number | null;
  total_usd: number | null;
  /** FRACTION of NAV. */
  pct_nav: number | null;
  health: ModelHealth;
  /** Server-generated string — rendered verbatim. */
  reason: string | null;
  rows: RiskContributionRow[];
}

export interface RiskContributions {
  es: RiskContributionBlock | null;
  vol: RiskContributionBlock | null;
  /**
   * §10 — the SAME Euler decomposition at 99% instead of 95%. Identical
   * shape to `es`; the block's own `reason` carries the server's noise
   * warning ("noisy at 99%: k=6 tail observations"), which is why the audit
   * asked for it shown-with-a-warning rather than left absent.
   *
   * ADDITIVE and optional: absent on backends that predate it, and null when
   * the 99% tail was too thin to decompose. Never a substitute for `es` —
   * the 95% block stays the panel's primary column.
   */
  es99?: RiskContributionBlock | null;
}

/** A position the P&L series could not include, with the honest reason. */
export interface ExcludedPosition {
  key: string;
  /** Server-generated string — rendered verbatim. */
  reason: string;
}

/* ------------------------------- Phase D stress engine (SHADOW) */

/**
 * §21–§27 scenario family.
 *  - HISTORICAL   — shocks measured from a real stored window;
 *  - HYPOTHETICAL — the research grid (equity/IV combinations);
 *  - IV_GRID      — pure volatility shocks (crush / spike);
 *  - USER         — a scenario the user typed on this page.
 */
export type StressKind = "HISTORICAL" | "HYPOTHETICAL" | "IV_GRID" | "USER";

/**
 * How each option leg was priced under the scenario. FULL_REVAL is the §22
 * Black–Scholes reprice; DELTA_LINEAR is the honest fallback when a leg has
 * no IV, and it is LABELLED rather than silently blended — a delta-linear
 * option P&L understates convexity in exactly the tail the scenario is
 * probing.
 */
export type StressMethod = "FULL_REVAL" | "DELTA_LINEAR";

/**
 * One scenario's result on the current book. `pnl_usd` is a P&L: a LOSS is
 * NEGATIVE. Null (with a `reason`) whenever the scenario could not be run —
 * a window outside stored history, no positions, no usable prices.
 */
export interface StressRow {
  /** Scenario name, server-worded — rendered verbatim, never paraphrased. */
  name: string;
  kind: StressKind;
  /**
   * false = the parameterisation is a RESEARCH DEFAULT, not validated
   * against data. The whole hypothetical grid is false and must carry the
   * UNVALIDATED badge (§11: no silent production thresholds).
   */
  validated: boolean;
  /** P&L in USD; NEGATIVE = a loss. Null when the scenario is UNAVAILABLE. */
  pnl_usd: number | null;
  /** Same as a FRACTION of NAV (−0.031 = −3.1% of NAV). */
  pnl_pct_nav: number | null;
  /**
   * The SAME number restated in the VaR/ES sign: POSITIVE = money lost.
   * The server sends both so the UI never negates a server figure itself
   * (house rule: server-generated values are rendered verbatim). Render
   * `loss_usd` next to the VaR/ES rows and `pnl_usd` where a signed P&L is
   * wanted — never compute one from the other.
   */
  loss_usd: number | null;
  /** `loss_usd` as a FRACTION of NAV; positive = lost. */
  loss_pct_nav: number | null;
  /** Legs priced by each method, e.g. { FULL_REVAL: 3, DELTA_LINEAR: 1 }. */
  method_coverage: Partial<Record<StressMethod, number>> & Record<string, number>;
  health: ModelHealth;
  /** Server-generated string, verbatim — the ONLY explanation for a null P&L. */
  reason: string | null;
  /** Scenario parameters as plain scalars (spot_shock, iv_shock, days_forward, …). */
  params?: Record<string, unknown> | null;
}

/**
 * The single worst row, as the server picked it (never recomputed
 * client-side). On `statistical.stress.worst` the server sends a COMPLETE
 * scenario row — the same shape as any entry of `rows` — so this is an
 * alias rather than a narrower object.
 */
export type StressWorst = StressRow;

/**
 * The worst scenario as the PRE-TRADE shadow block reports it
 * (`shadow.statistical.stress.worst_before` / `worst_after`, orders.py
 * `_worst_row_api`). Deliberately NOT `StressWorst`: the audit row is not
 * the place for the whole catalogue, so this shape is narrower AND keys the
 * name as `scenario`, carries no `pnl_pct_nav`, and states the loss in the
 * VaR/ES sign. Keeping the two types distinct is what stops a component
 * reading `.name` off a row that has none.
 */
export interface StressWorstBrief {
  /** Scenario name — keyed `scenario` here, `name` on a catalogue row. */
  scenario: string;
  kind: StressKind;
  validated: boolean;
  /** Signed P&L: NEGATIVE = a loss. */
  pnl_usd: number | null;
  /** POSITIVE = money lost (VaR/ES sign). */
  loss_usd: number | null;
  /** `loss_usd` as a FRACTION of NAV; positive = lost. */
  loss_pct_nav: number | null;
  method_coverage: Partial<Record<StressMethod, number>> & Record<string, number>;
  health: ModelHealth;
  reason: string | null;
}

/**
 * §51 stress block of GET /api/portfolio/risk. Absent on backends that
 * predate Phase D; `rows` empty when the book produced no scenario at all.
 */
export interface StressBlock {
  rows: StressRow[];
  /** Null when no scenario produced a usable P&L. */
  worst: StressWorst | null;
  /**
   * Run-level health: the WORST health among the rows that actually PRICED.
   * A named window that falls outside the stored history is NOT a run
   * failure — it is one UNAVAILABLE row carrying its own dates in `reason`,
   * and it does not drag this field down.
   */
  health: ModelHealth;
  /** Bumped when the scenario catalogue changes — pinned so rows stay comparable. */
  catalogue_version: string;
  /** Server-generated string, verbatim; present when the block itself degraded. */
  reason?: string | null;
  /** Always "SHADOW" today; read from the server so a promotion changes the badge. */
  mode?: string | null;
  /** Version of the stress model that produced these rows. */
  model_version?: string | null;
  /**
   * §5 tier of the stress model. ADDITIVE and optional — absent on backends
   * that predate the taxonomy, and no chip renders then.
   */
  tier?: ModelTier | null;
  /** Legs the run priced — the book behind the numbers, not a position count. */
  n_stock_legs?: number | null;
  n_option_legs?: number | null;
  /**
   * The WORST row's method coverage, lifted to the block so the headline
   * number's pricing quality travels with it. Per-row counts stay on the row.
   */
  method_coverage?: (Partial<Record<StressMethod, number>> & Record<string, number>) | null;
  /** The WORST row's per-leg P&L, keyed by position key (spec §52). */
  per_position?: Record<string, number> | null;
  /**
   * The STRESS view's OWN gap list — positions with no stress leg (contract
   * off today's chain, no spot). Deliberately NOT
   * `statistical.positions_excluded`: a position can be in one view and out
   * of the other, and one merged list would misreport both.
   */
  positions_excluded?: ExcludedPosition[] | null;
}

/**
 * POST /api/risk/stress/run body (design §8.5). Ranges are validated
 * SERVER-side (422 out of range); the form mirrors them client-side so the
 * user is told before a round trip, never instead of one.
 */
export interface StressRunRequest {
  /** Fractional underlying move, −0.9 … 2 (−0.10 = −10%). */
  equity_shock: number;
  /** RELATIVE multiplicative IV move, −0.9 … 5 (+0.40 ⇒ iv1 = iv0 × 1.40). */
  iv_shock: number;
  /** Calendar days of decay, 0 … 365. */
  days_forward: number;
  /** Optional user-supplied label; the server names the row when omitted. */
  name?: string;
  /**
   * §26 per-ticker OVERRIDES of `equity_shock`, so "SPY −5% / QQQ −8%" is
   * expressible instead of one uniform β = 1 move. Fractions, in the SAME
   * range as `equity_shock` (−0.9 … 2) and validated server-side identically.
   *
   * A ticker listed here uses its own shock; every other underlying keeps
   * `equity_shock`, which therefore stays REQUIRED — this map narrows the
   * uniform move, it does not replace it.
   *
   * OMITTED ENTIRELY when the user added no rows: an empty object and an
   * absent key are the same request on the wire, and sending `{}` would make
   * a pre-§26 backend reject a scenario it can actually run.
   */
  spot_shock_by_ticker?: Record<string, number>;
}

/**
 * The response of `POST /api/risk/stress/run` (routers/risk.py). NOT a bare
 * `StressRow`: the endpoint wraps the row in the book context that produced
 * it, and the row itself lives under `scenario`. Read the P&L from
 * `res.scenario`, never from `res` directly.
 */
export interface StressRunResponse {
  mode: "SHADOW";
  as_of: string;
  /** Primary key of the persisted `stress_runs` row (spec §56 history). */
  run_id: number;
  /** Null when NAV is unknown — every percent-of-NAV field is then null too. */
  nav: number | null;
  n_stock_legs: number;
  n_option_legs: number;
  /** Positions with no stress leg, server-worded — the view's own gap list. */
  positions_excluded: Array<Record<string, unknown>>;
  /** The scenario result, same shape as a catalogue row. */
  scenario: StressRow;
  /** Per-leg P&L under this scenario, keyed by position key. */
  per_position: Record<string, number>;
  /** Server-generated SHADOW disclaimer, rendered verbatim. */
  note: string;
}

/* ------------------------------- Phase E VaR/ES model validation (SHADOW/RESEARCH) */

/**
 * §42/§43 backtest verdict for ONE model view, by Kupiec p-value against the
 * documented parameters (0.05 / 0.01 — Basel-style, not a UI constant):
 *  - GREEN  — exceedance count is consistent with the confidence level;
 *  - YELLOW — borderline; the model is questionable, not rejected;
 *  - RED    — the coverage hypothesis is rejected.
 *
 * A verdict rates CALIBRATION, not profitability, and decides nothing: the
 * whole block is SHADOW (the GARCH rows are RESEARCH on top of that).
 */
export type BacktestVerdict = "GREEN" | "YELLOW" | "RED";

/**
 * One walk-forward backtest row (design §9.4). Every forecast for day t used
 * only `pnl[t−window:t]` — §43 forbids hindsight, so a row here is a genuine
 * out-of-sample count rather than an in-sample fit statistic.
 *
 * Honest nulls: below the minimum forecast count the server sends the row
 * with `health: "UNAVAILABLE"`, its own `reason`, and null statistics — the
 * counts (`n_forecasts`, `exceedances`) may still be real, so they are NOT
 * nullable-by-fabrication; the p-values are.
 */
export interface ValidationRow {
  /** Estimator that produced the forecasts, e.g. "historical_var". */
  model_name: string;
  model_version: string;
  /** "EMPIRICAL" | "NORMAL" | "EMPIRICAL_VOL_SCALED" | "EMPIRICAL_GARCH_SCALED" | … */
  distribution: string;
  /** FRACTION (0.95 = 95%). */
  confidence: number;
  horizon_days: number;
  /** Rolling estimation window each forecast was fitted on (trading days). */
  window: number;
  /** Out-of-sample forecast days actually scored. */
  n_forecasts: number;
  /** Days the realized loss exceeded the forecast VaR. */
  exceedances: number;
  /** FRACTION — exceedances ÷ n_forecasts; null when nothing was scored. */
  rate: number | null;
  /** FRACTION — the level's own 1 − α; what `rate` should be if calibrated. */
  expected_rate: number | null;
  /**
   * Kupiec POF likelihood-ratio statistic, χ²(1). NOT sent by the current
   * backend — `_row_api`/`BacktestRowResult.api` serve the p-value only, and
   * the LR stays in the persisted column. Optional so a payload that omits
   * it typechecks; the panel reads the p-value.
   */
  kupiec_lr?: number | null;
  /** Kupiec p-value — the number the verdict is read from. */
  kupiec_p: number | null;
  /** Christoffersen independence LR (2-state Markov), χ²(1). Not sent — see `kupiec_lr`. */
  christoffersen_lr?: number | null;
  /** Christoffersen p-value — LOW means exceedances CLUSTER. */
  christoffersen_p: number | null;
  /** Mean realized loss on exceedance days ÷ mean forecast ES. > 1 = ES too small. */
  es_severity_ratio: number | null;
  /** Null when the row could not be scored at all. */
  verdict: BacktestVerdict | null;
  health: ModelHealth;
  /** Server-generated string — rendered verbatim. */
  reason: string | null;
  /**
   * §5 tier of the model being backtested. ADDITIVE and optional — absent on
   * backends that predate the taxonomy. It is orthogonal to the RESEARCH
   * badge this panel already derives: a TIER_2 model can be RESEARCH, and a
   * tier chip never replaces that badge.
   */
  tier?: ModelTier | null;
}

/**
 * §63 EWMA-vs-GARCH comparison. `preferred` is the server's read of the
 * documented criterion; it is a RESEARCH observation, never a promotion —
 * moving GARCH out of RESEARCH is an explicit user action.
 */
export interface ValidationComparison {
  ewma_kupiec_p: number | null;
  garch_kupiec_p: number | null;
  /** GARCH's Christoffersen p — the clustering half of the §63 bar. */
  garch_christoffersen_p?: number | null;
  /** Forecast days the GARCH view scored (§63 wants ≥ 250). */
  garch_n_forecasts?: number;
  /**
   * The better-calibrated view, as the server's MODEL-NAME key —
   * "conditional_var" (EWMA) or "garch_var" — NOT a display word. Null when
   * either side lacks a p-value; a comparison with a missing half is not a
   * preference. Render through `preferredLabel`, never raw.
   */
  preferred: string | null;
  /** The criterion sentence, server-worded — rendered VERBATIM (§26/§36). */
  criterion: string;
  /** Whether the numbers currently clear the §63 bar. Promotion is still a user action. */
  criterion_met?: boolean;
  /** Server-worded reasons the bar is unmet — rendered verbatim. */
  criterion_unmet_reasons?: string[];
  /** Server-worded promotion status — always "NONE …" today. */
  promotion?: string;
}

/**
 * §42/§43 `statistical.validation`. Absent on backends that predate Phase E;
 * null when no backtest has ever been persisted (the panel then shows its
 * empty state rather than an empty table implying a run happened).
 *
 * These rows are READ from the newest persisted backtest — never recomputed
 * on a page read.
 */
export interface ValidationBlock {
  /** ISO timestamp of the backtest run these rows came from. */
  as_of: string;
  rows: ValidationRow[];
  comparison: ValidationComparison | null;
}

/** The response of `POST /api/risk/validation/run` — the fresh rows. */
export interface ValidationRunResponse {
  as_of: string;
  rows: ValidationRow[];
}

/**
 * §45 statistical risk snapshot — SHADOW. Null only when there is no account
 * at all (the same "no venue" branch that nulls NAV); otherwise an object
 * with honest nulls inside.
 */
export interface StatisticalRisk {
  mode: RiskModelMode;
  /** risk_snapshots.id when persisted. */
  snapshot_id: number | null;
  snapshot_version: string;
  as_of: string;
  /** true = older than the statistical TTL (one trading day). */
  stale: boolean;
  pnl_method: PnlMethod;
  n_obs: number;
  window_start: string | null;
  window_end: string | null;
  data_quality: StatisticalDataQuality;
  /** model_name → health, e.g. { historical_var: "ACTIVE" }. */
  model_health: Record<string, ModelHealth>;
  model_risk: ModelRiskState | null;
  dispersion: ModelDispersion | null;
  distribution: DistributionDiagnostics | null;
  volatility: StatisticalVolatility | null;
  /** Ordered by the server: HISTORICAL 95/99, GAUSSIAN 95/99, HISTORICAL_VOL_SCALED 95. */
  var: RiskMetricRow[];
  es: RiskMetricRow[];
  contributions: RiskContributions;
  positions_excluded: ExcludedPosition[];
  /**
   * Phase C (SHADOW) §19 correlation regime of the open book. Absent on
   * backends that predate Phase C; null when it could not be computed.
   */
  correlation_state?: CorrelationState | null;
  /**
   * §11 single-factor (SPY) RESEARCH diagnostic. Absent on backends that
   * predate it; always an object when present (honest nulls live inside).
   */
  factor?: FactorRisk | null;
  /**
   * §34 diversification ratio Σ_i σ_i / σ_p. Absent on older backends;
   * always an object when present.
   */
  diversification_ratio?: DiversificationRatio | null;
  /**
   * Phase D (SHADOW) §21–§27 stress engine. Absent on backends that predate
   * Phase D; null when no stress run could be attempted at all.
   */
  stress?: StressBlock | null;
  /**
   * Phase E (SHADOW/RESEARCH) §42/§43 VaR/ES backtests. Absent on backends
   * that predate Phase E; null when no backtest has been persisted yet.
   */
  validation?: ValidationBlock | null;
}

/**
 * Book drawdown over the persisted NAV series. `reconstructed` is a DIFFERENT
 * thing and labelled as such: today's book replayed over the return window,
 * not a real NAV history.
 */
export interface DrawdownNavSeries {
  n: number;
  /** First snapshot date; null when no snapshot exists yet. */
  since: string | null;
  /** Provenance, e.g. "risk_snapshots SCHEDULED". */
  source: string;
}

export interface ReconstructedDrawdown {
  /** Always "RECONSTRUCTED_CURRENT_BOOK" — never presented as realized NAV. */
  label: string;
  /** FRACTION, ≤ 0. */
  current_pct: number | null;
  max_pct: number | null;
  n_obs: number;
  health: ModelHealth;
  /** Server-generated string — rendered verbatim. */
  reason: string | null;
}

export interface DrawdownBlock {
  nav_series: DrawdownNavSeries;
  /** FRACTIONS, ≤ 0 (nav / running max − 1). */
  current_pct: number | null;
  max_pct: number | null;
  peak_date: string | null;
  trough_date: string | null;
  peak_nav: number | null;
  health: ModelHealth;
  reason: string | null;
  reconstructed: ReconstructedDrawdown | null;
}

/**
 * GET /api/portfolio/risk. Deliberately NOT a 503 when market data is
 * unconfigured: NAV, cash, positions, buckets and limits are real DB rows and
 * configured values. Everything DERIVED from market prices instead becomes an
 * honest null — market_regime, greeks, vol_targeting, and each position's
 * market_price / market_value — and `market_data` explains why.
 */
export interface PortfolioRisk {
  as_of: string;
  /**
   * ALL account numbers are null when no execution venue is connected: the
   * account IS the broker's, so with no broker there is nothing to report —
   * the platform never fabricates a default-cash portfolio for display.
   * `venue` explains the state.
   */
  nav: number | null;
  cash: number | null;
  cash_pct: number | null;
  /** null when market data is unconfigured — the regime cannot be classified. */
  market_regime: string | null;
  cash_floor_pct: number | null;
  trading_enabled: boolean;
  portfolio_heat_pct: number | null;
  heat_state: HeatState | null;
  max_new_risk_usd: number | null;
  max_new_risk_pct: number | null;
  positions: RiskPosition[];
  buckets: RiskBucket[];
  limits: RiskLimits;
  /** null when market data is unconfigured — Greeks need chain data. */
  greeks: PortfolioGreeks | null;
  /** null when market data is unconfigured — the vol forecast needs bars. */
  vol_targeting: VolTargeting | null;
  /**
   * §45 statistical risk layer (Phase B) — SHADOW: informational only, it
   * never alters a Tier 0 decision or the gate chain. Absent on backends
   * that predate the block; null when there is no account at all.
   */
  statistical?: StatisticalRisk | null;
  /**
   * Book drawdown (persisted NAV series + the labelled reconstructed view).
   * Absent on backends that predate the block; null when there is no account.
   */
  drawdown?: DrawdownBlock | null;
  /** Absent on older backends; treat a missing block as configured. */
  market_data?: MarketDataState;
  /** The execution venue whose account this view reports (absent on older backends). */
  venue?: { configured: boolean; provider: string; message: string | null };
}

/* ---------------------------------------------------------------- order preview */

export type GateName =
  | "TRADING_POOL_AUTHORIZATION"
  | "DATA_QUALITY"
  | "REGIME"
  | "DIRECTIONAL_SIGNAL"
  | "VOLATILITY"
  | "INSTRUMENT"
  | "SQUEEZE_RISK"
  | "LIQUIDITY"
  | "CONTRACT_SELECTION"
  | "RISK_APPROVAL";

export type GateStatus = "PASS" | "FAIL" | "SKIPPED";

export interface OrderPreviewGate {
  name: GateName;
  status: GateStatus;
  detail: string;
}

/** §8 instrument matrix verdict — what the system will actually buy. */
export type Instrument = "LONG_STOCK" | "LONG_CALL" | "LONG_PUT";

/** Volatility classification feeding the §8 instrument matrix. */
export type VolRegime = "LOW" | "NORMAL" | "HIGH" | "EXTREME";

/**
 * The top-ranked §9 option contract chosen for an options trade plan
 * (proposed.contract — null for LONG_STOCK or when no eligible contract).
 */
export interface ProposedContract {
  /**
   * §25 — the SERVER-built OCC symbol: the exact contract identity the broker
   * would be addressed with. `null` means the server could NOT build one (the
   * UI renders "—", never a client-side guess). Absent only on backends that
   * predate the field — the ONLY case where the display-side construction is
   * an acceptable fallback.
   */
  option_symbol?: string | null;
  /** YYYY-MM-DD */
  expiry: string;
  dte: number;
  strike: number;
  right: OptionRight;
  /** §25 — the live quote the mid came from (absent on older backends). */
  bid?: number;
  ask?: number;
  mid: number;
  /** (ask − bid) / mid, as a fraction (absent on older backends). */
  spread_pct?: number;
  open_interest?: number;
  volume?: number;
  delta: number;
  /** Implied vol (fraction, 0.32 = 32%). */
  iv: number;
  /** Always 100 — one contract controls 100 shares. */
  multiplier: number;
  /** mid × 100 — the FULL premium, entirely at risk (§12.1 / §39). */
  max_loss_per_contract: number;
}

export type RiskDecision = "APPROVE" | "APPROVE_WITH_RESIZE" | "REJECT";

export interface OrderPreviewRisk {
  decision: RiskDecision;
  approved_quantity: number;
  signal_strength: string | null;
  risk_budget_pct: number | null;
  trade_risk_usd: number;
  reason_codes: string[];
  explanations: string[];
  heat_before_pct: number;
  heat_after_pct: number;
  cash_after_pct: number | null;
  /**
   * Phase C (SHADOW) — the §46 CURRENT vs AFTER TRADE table at the approved
   * quantity. ABSENT on backends that predate Phase C and on plans stored
   * before it; every consumer must treat it as optional and never crash.
   */
  comparison?: RiskComparisonBlock | null;
  /** §47 — the reason codes above, each paired with its layer. Absent on older backends. */
  binding_constraints?: BindingConstraint[] | null;
  /** §70 — the hypothetical statistical verdict. It changed NOTHING. Absent on older backends. */
  shadow_statistical?: ShadowStatistical | null;
}

/* ------------------------------- Phase C pre-trade comparison (SHADOW) */

/**
 * §46 CURRENT vs AFTER TRADE — one metric row. EVERY field is optional or
 * nullable on purpose: the block is additive, the backend omits it entirely
 * on older plans, and an individual row reports an honest null the moment
 * its model could not estimate at the requested quantity.
 *
 * `unit` decides the formatter, never a guess from the label:
 *  - "usd"     → fmtUsd (VaR/ES/σ/incremental ES/net delta notional);
 *  - "pct_nav" → fmtPct of a FRACTION of NAV (heat, cash);
 *  - "pct"     → fmtPct of a plain FRACTION (ES shares — of the ES total,
 *                NOT of NAV; the two must never share a formatter path).
 */
export type ComparisonUnit = "usd" | "pct_nav" | "pct";

export interface RiskComparisonRow {
  /** Stable machine id, e.g. "es_hist_95" / "bucket_es_share:TECH_MEGA". */
  metric: string;
  /** Server-worded display label — rendered verbatim, never paraphrased. */
  label: string;
  before: number | null;
  after: number | null;
  /** after − before, computed SERVER-side; null whenever either side is null. */
  delta: number | null;
  unit: ComparisonUnit;
  /** Per-row model health; absent on rows that are pure Tier 0 arithmetic. */
  health?: ModelHealth | null;
  /** Server-generated string, verbatim — the only explanation for a "—". */
  reason?: string | null;
  /**
   * Phase D only: the scenario name(s) the `worst_stress_loss` row was
   * measured in (`before_scenario` / `after_scenario`), so the number is
   * never anonymous. Server-worded, verbatim; null on every other row.
   */
  scenario?: string | null;
  /**
   * Glossary key for a click-to-open explainer on the row's label. A UI-side
   * concern, never sent by the server: it is set only on rows this component
   * synthesises and whose meaning is genuinely non-obvious (incremental VaR
   * is not the candidate's own VaR). Absent on every other row, which then
   * renders its label unadorned.
   */
  termKey?: string;
}

/**
 * The §46 table for ONE quantity. `mode` is server-sent (always "SHADOW" in
 * Phase C) rather than a UI constant: if the layer is ever promoted the
 * badge must move with it.
 */
/**
 * ONE statistical row exactly as the gateway sends it (design contract §7.1
 * / §46). The gateway sends machine slugs and RAW field names — no `label`,
 * no `unit` — so `TradeComparison` normalises these into
 * {@link RiskComparisonRow} before rendering. Every numeric field is
 * nullable: an UNAVAILABLE statistical view emits the row with null sides
 * and a `reason` rather than omitting it.
 */
export interface RiskComparisonWireRow {
  metric: string;
  before_usd: number | null;
  after_usd: number | null;
  before_pct_nav?: number | null;
  after_pct_nav?: number | null;
  delta_usd: number | null;
  delta_pct_nav?: number | null;
  before_health?: ModelHealth | null;
  after_health?: ModelHealth | null;
  reason?: string | null;
  /**
   * Which shadow layer produced the row; present on the Phase D
   * `worst_stress_loss` row ("STRESS"). Absent on the Phase C rows.
   */
  layer?: ConstraintLayer | null;
  /**
   * Phase D `worst_stress_loss` only: the scenario each side was measured
   * in, server-worded. Without them the loss figure is anonymous, so
   * TradeComparison folds them into the row's note.
   */
  before_scenario?: string | null;
  after_scenario?: string | null;
}

/**
 * One TIER 0 row: the ENGINE's own hard-limit measurement, carried verbatim.
 * Fractions, not dollars, and no health (Tier 0 is arithmetic, not a model).
 */
export interface RiskComparisonTier0WireRow {
  metric: string;
  before_pct: number | null;
  after_pct: number | null;
  layer?: ConstraintLayer | null;
}

export interface RiskComparisonBlock {
  /** The quantity every row was evaluated at (the Tier 0 approved quantity). */
  quantity: number;
  /**
   * NOT sent by the gateway today — the mode lives on
   * `shadow_statistical.limits.mode`. Optional so the component can fall
   * back through both.
   */
  mode?: RiskModelMode;
  rows: RiskComparisonWireRow[];
  /** The Tier 0 hard-limit rows (heat, cash), before/after as fractions. */
  tier0_rows?: RiskComparisonTier0WireRow[];
  /** Euler/incremental headline figures (§7.1), all nullable. */
  incremental_es_95_usd?: number | null;
  incremental_es_95_pct_nav?: number | null;
  marginal_es_95_per_unit?: number | null;
  candidate_es_share_after?: number | null;
  max_single_es_share_before?: number | null;
  max_single_es_share_after?: number | null;
  net_delta_notional_before?: number | null;
  net_delta_notional_after?: number | null;
  bucket_es_share_after?: Record<string, number> | null;
  /**
   * §46 net vega before/after the candidate, in $ per IV POINT — the row the
   * audit found absent on both sides. Same sign convention as the Greeks
   * panel: positive = the book GAINS when IV rises, so a positive delta means
   * the trade adds long-vol exposure.
   *
   * ADDITIVE and optional; both sides null on a stock-only candidate or when
   * no chain IV was resolvable. A null side is an honest gap, never a 0 —
   * "no vega measured" and "vega is zero" are different facts.
   */
  net_vega_before?: number | null;
  net_vega_after?: number | null;
  /**
   * §8 incremental VaR 95% — VaR(after) − VaR(before), USD, first-class
   * rather than only reachable as a row delta. LOSS sign: positive = the
   * trade DEEPENS the 95% tail.
   *
   * ADDITIVE and optional; null when either side could not be estimated.
   */
  incremental_var_95_usd?: number | null;
  /** The same figure as a FRACTION of NAV. */
  incremental_var_95_pct_nav?: number | null;
  n_obs?: number | null;
  tail_size_95?: number | null;
  /** Comparison-level health: UNAVAILABLE when the candidate has no returns. */
  health?: ModelHealth | null;
  /** Server-generated string, verbatim. */
  reason?: string | null;
}

/**
 * Which layer a binding constraint belongs to. HARD_LIMIT constraints ARE
 * deciding today; STATISTICAL / CONCENTRATION (Phase C) and STRESS (Phase D)
 * ones are SHADOW and changed nothing — the UI must keep the two visually
 * separate.
 */
export type ConstraintLayer =
  | "HARD_LIMIT"
  | "STATISTICAL"
  | "CONCENTRATION"
  | "STRESS";

/** §47 — one reason code paired with the layer that produced it. */
export interface BindingConstraint {
  code: string;
  layer: ConstraintLayer;
}

/** §11/§37 — one hypothetical statistical cap on the requested quantity. */
export interface StatisticalCap {
  /** e.g. "PORTFOLIO_ES_LIMIT", "BUCKET_ES_CONTRIBUTION_CAP:TECH_MEGA". */
  code: string;
  layer: ConstraintLayer;
  /** Largest quantity in [0, requested] satisfying the limit; 0 = would REJECT. */
  cap_qty: number;
  /** §47 explanation with the real numbers — rendered verbatim. */
  sentence: string;
  /** Values measured at the requested quantity and at cap_qty. */
  measured?: Record<string, number | null>;
}

/** What the STATISTICAL layer ALONE would have decided (it decided nothing). */
export interface ShadowHypothetical {
  decision: RiskDecision;
  quantity: number;
  /** Cap codes binding at the Tier 0 approved quantity, most restrictive first. */
  binding: string[];
}

/**
 * §19 correlation regime of the open book. Null when the state could not be
 * computed at all; UNAVAILABLE inside carries the reason with real numbers.
 */
export interface CorrelationState {
  state: "NORMAL" | "ELEVATED" | "CONVERGING" | "UNAVAILABLE";
  /** Average pairwise correlation over the long window (FRACTION, −1..1). */
  normal_avg: number | null;
  /** Same over the short window — the §19 "0.61 → 0.84" right-hand number. */
  current_avg: number | null;
  /** Same over the worst stress-quantile days; null when too few such days. */
  stress_avg: number | null;
  /** current_avg − normal_avg; null when either side is null. */
  delta: number | null;
  /** Up to three [a, b, current_rho] rows, highest current correlation first. */
  worst_pairs: [string, string, number][];
  n_pairs: number;
  /**
   * §18 rolling SPEARMAN average over the SAME short window as `current_avg`.
   * A rank correlation: robust to outliers, so a wide gap from the Pearson
   * twin means a few extreme days are driving the linear number. Optional
   * because it is additive — a backend mid-rollout omits it entirely.
   */
  current_avg_spearman?: number | null;
  /** Server-generated string, verbatim; null when the state is available. */
  reason: string | null;
}

/** One position's regression against the §11 factor. */
export interface FactorPositionBeta {
  label: string;
  beta: number | null;
  r2: number | null;
  n: number;
  health: ModelHealth;
  reason: string | null;
}

/**
 * §11 single-factor (SPY) RESEARCH diagnostic — how much of the book's P&L
 * variation is just the market. Display only: it derives no cap and gates
 * nothing. Every statistic is nullable; a null means NOT MEASURED, never
 * "no market exposure" — `reason` says which.
 */
export interface FactorRisk {
  portfolio_beta: number | null;
  /** var(beta_p·f)/var(pnl_total) ∈ [0,1] — the share the factor explains. */
  explained_variance_share: number | null;
  /** 1 − explained_variance_share. */
  idiosyncratic_share: number | null;
  positions?: FactorPositionBeta[];
  /** The series actually used, never assumed (e.g. "SPY"). */
  factor: string;
  n: number;
  health: ModelHealth;
  reason: string | null;
  model_name?: string;
  model_version?: string;
  mode?: string;
}

/**
 * §34 diversification ratio: Σ_i σ_i / σ_p. A pure RATIO, not a fraction of
 * NAV — 1.0 means no diversification benefit at all.
 */
export interface DiversificationRatio {
  value: number | null;
  health: ModelHealth;
  reason: string | null;
  n_obs?: number;
  model_name?: string;
  model_version?: string;
  estimator?: string;
  mode?: string;
}

/**
 * §70 SHADOW statistical layer attached to an order preview. Its verdict was
 * COMPUTED AND LOGGED ONLY — the Tier 0 decision above it is untouched.
 */
export interface ShadowStatistical {
  hypothetical: ShadowHypothetical;
  /**
   * The gateway sends {health, reason, rows}; a mid-rollout payload may send
   * a bare array. `TradeComparison` accepts both.
   */
  caps:
    | StatisticalCap[]
    | { health?: ModelHealth | null; reason?: string | null; rows?: StatisticalCap[] };
  /** asdict(StatisticalLimits) — research defaults, UNVALIDATED. */
  limits: Record<string, number | string>;
  /** Null when the book has too few tickers/observations for a regime read. */
  correlation_state: CorrelationState | null;
  /**
   * Phase D (§27) stress view of THIS trade: the worst scenario loss before
   * and after it, and the hypothetical STRESS cap. Absent on backends that
   * predate Phase D.
   */
  stress?: ShadowStress | null;
  /**
   * §36/§37/§59 sizing-v2 composition — SHADOW. Absent on backends that
   * predate it. Every modifier is in (0, 1]: this layer may only THROTTLE
   * the budget Tier 0 already set, never raise it.
   */
  sizing_v2?: ShadowSizingV2 | null;
  /** Present only when the shadow layer itself raised — rendered verbatim. */
  note?: string | null;
}

/**
 * §36/§37/§59 sizing-v2 SHADOW composition: the ES, correlation and
 * model-health modifiers the PRODUCTION budget does not compose, plus the
 * risk-linked cash floor. `budget_pct_used` and `regime_floor_pct` are what
 * Tier 0 actually used — nothing here changed either of them.
 */
export interface ShadowSizingV2 {
  /** All three ∈ (0, 1]; null when the input behind one was missing. */
  es_modifier?: number | null;
  correlation_modifier?: number | null;
  model_health_modifier?: number | null;
  /** tier_budget × vol_multiplier × the three modifiers. */
  candidate_budget_pct?: number | null;
  /** What Tier 0 actually used (pre-abs_max_trade_risk). */
  budget_pct_used?: number | null;
  /** candidate − used; ≤ 0 by construction. */
  budget_delta_pct?: number | null;
  risk_linked_cash_floor_pct?: number | null;
  risk_linked_cash_floor_binds?: boolean | null;
  /** The hard Tier 0 floor this shadow floor is compared against. */
  regime_floor_pct?: number | null;
  cash_floor_addons?: Record<string, number> | null;
  inputs?: Record<string, unknown> | null;
  health?: ModelHealth | null;
  /** Server-generated strings, rendered verbatim. */
  reason?: string | null;
  notes?: string[] | null;
  mode?: string | null;
  note?: string | null;
}

/**
 * §27 stress gate as a hypothetical cap. SHADOW in Phase D: the cap is
 * computed, logged and displayed, and it resized nothing. `worst_before` /
 * `worst_after` are P&L (a LOSS is NEGATIVE), measured at the Tier 0
 * approved quantity.
 */
export interface ShadowStress {
  worst_before: StressWorstBrief | null;
  worst_after: StressWorstBrief | null;
  /** Null when the stress layer produced no cap (UNAVAILABLE ⇒ never a cap). */
  cap: StatisticalCap | null;
  /** What the STRESS layer alone would have decided; it decided nothing. */
  hypothetical?: ShadowHypothetical | null;
  health?: ModelHealth | null;
  /** Server-generated string, verbatim. */
  reason?: string | null;
}

/** §15/§20 — execution authorization facts, reported separately from the
 *  research verdict; research never gates on them. */
export interface ExecutionAuthorization {
  authorized: boolean;
  in_trading_pool: boolean;
  symbol_trading_enabled: boolean;
  global_trading_enabled: boolean;
  /** Every unmet authorization, server-worded, verbatim. */
  missing: string[];
}

export interface OrderPreview {
  ticker: string;
  as_of: string;
  /** "research" (preview, §16 chain — no pool gate) or "execution" (approve).
   *  Absent on backends that predate the split. */
  mode?: "research" | "execution";
  /** Absent on backends that predate the research/execution split. */
  execution_authorization?: ExecutionAuthorization;
  gates: OrderPreviewGate[];
  signal: {
    edge: number | null;
    bias: string | null;
    strength: string | null;
  };
  proposed: {
    /**
     * What the §8 matrix chose. When the INSTRUMENT gate fails with NO_TRADE
     * the field still reports "NO_TRADE" (the cell + degradation rationale
     * lives in the gate detail and instrument_rationale).
     */
    instrument: Instrument | "NO_TRADE";
    /** Real volatility classification (VOLATILITY gate detail); null when unavailable. */
    vol_regime: VolRegime | null;
    /** §8/§5 citations, rendered as-is. */
    instrument_rationale: string[];
    /** Top-ranked §9 candidate; null for LONG_STOCK / NO_TRADE / no eligible contract. */
    contract: ProposedContract | null;
    /**
     * Sizing units (§12.1):
     * - LONG_STOCK: entry_price = per-share entry, stop_distance = per-share stop distance.
     * - Options: contract-level units — entry_price and stop_distance are BOTH
     *   mid × 100 (the premium is fully at risk), so approved_quantity IS the
     *   number of contracts and every existing risk cap applies unchanged.
     */
    entry_price: number | null;
    stop_distance: number | null;
    quantity_requested: number | null;
  };
  risk: OrderPreviewRisk | null;
  /** §24 — how the position would be exited, visible BEFORE any Apply.
   *  Absent on backends that predate Phase F. */
  exit_plan?: {
    signal_invalidation: string;
    exit_edge_threshold: number;
    hard_stop: string | null;
    premium_hard_stop_pct: number | null;
    atr_trail: string;
    atr_trail_k: number;
    time_stop: string;
    time_stop_bars: number;
    dte_exit_threshold: number | null;
    /** V1: always null — no fixed profit target; honest, not invented. */
    profit_target: string | null;
  };
  why_trade: string[];
  why_not_trade: string[];
}

/* ---------------------------------------------------------------- LLM catalyst (§11/§38) */

/** One stored LLM interpretation — INTERPRETIVE content, never market data. */
export interface CatalystLlm {
  generated_at: string;
  /** provider/model recorded AT GENERATION; "" = pre-upgrade row (unknown). */
  model: string;
  status: "PENDING" | "DISMISSED" | "PROMOTED";
  sentiment: number;
  impact: number;
  novelty: number;
  source_reliability: number;
  horizon: string;
  catalyst_type: string;
  reason_codes: string[];
  summary: string;
  evidence: { source: string; published_at: string; snippet: string }[];
}

export interface CatalystArticle {
  title: string;
  publisher: string;
  published_at: string;
  url: string;
}

/** GET /api/watchlist/{ticker}/catalyst — read-only stored LLM context. */
export interface SymbolCatalyst {
  ticker: string;
  generated: true;
  llm: CatalystLlm | null;
  articles: CatalystArticle[];
  latest_source_published_at: string | null;
}

/* ---------------------------------------------------------------- research trade plans (§40) */

export type PlanStatus =
  | "DRAFT"
  | "GENERATED"
  | "REVIEWED"
  | "APPLIED"
  | "ACTIVE"
  | "SUPERSEDED"
  | "CANCELLED"
  | "EXPIRED";

/** §42 — computed fresh on every read; a stored plan can never present
 *  itself as current without saying so. */
export interface PlanRevalidation {
  revalidation_required: boolean;
  stale_market_data: boolean;
  market_data_as_of: string | null;
  last_expected_trading_date: string;
  /** Per §41 key: { plan, current } for every drifted configuration version. */
  config_changed: Record<string, { plan: string | null; current: string }>;
}

/** One persisted research trade plan (§19/§40/§41). `preview` is the exact
 *  §16 research payload the user reviewed. */
export interface TradePlan {
  id: number;
  ticker: string;
  status: PlanStatus;
  direction: "AUTO" | "BULL" | "BEAR";
  quantity_requested: number | null;
  preview: OrderPreview;
  /** §41 configuration identifiers active at generation time. */
  versions: Record<string, string>;
  /** Last bar date the research saw (YYYY-MM-DD). */
  market_data_as_of: string | null;
  generated_at: string | null;
  applied_at: string | null;
  superseded_by: number | null;
  created_by: string;
  revalidation: PlanRevalidation;
}

/** §42 revalidate outcome: a fresh plan beside the old one. */
export interface PlanRevalidateResult {
  plan: TradePlan;
  revalidated_from: number;
  previous: {
    id: number;
    status: PlanStatus;
    market_data_as_of: string | null;
    instrument: string | null;
    veto_gates: string[];
  };
}

/** §19 apply outcome: authorization state only — never an order. */
export interface PlanApplyResult {
  plan: TradePlan;
  trading_pool: boolean;
  trading_enabled: boolean;
  global_trading_enabled: boolean;
  superseded_plan_id: number | null;
  /** Always false — applying a plan never places an order (§19). */
  order_placed: boolean;
}

/* ---------------------------------------------------------------- paper orders & positions */

export type OrderSide = "BUY_TO_OPEN" | "SELL_TO_CLOSE";

/**
 * Order lifecycle (§11/§26). PENDING_SUBMIT | ACCEPTED | PARTIALLY_FILLED are
 * the NON-terminal states — an order in one of them is still in flight at the
 * broker and is what GET /api/orders/open reports. Internally simulated fills
 * are FILLED immediately.
 */
export type OrderStatus =
  | "PENDING_SUBMIT"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED";

/** Option-contract identity block on an order (§27); null for stock orders. */
export interface OrderContractBlock {
  /**
   * Server-built OCC symbol — the same string the broker is addressed with,
   * so the UI never reconstructs it. Null when the stored fields cannot build
   * one (reported honestly, never guessed).
   */
  option_symbol: string | null;
  /** YYYY-MM-DD */
  expiry: string;
  strike: number;
  right: OptionRight;
  /** Always 100. */
  multiplier: number;
}

/** Broker identity block; null for internally simulated fills (honest null). */
export interface OrderBrokerBlock {
  broker_order_id: string | null;
  /** The broker's RAW status word, preserved verbatim. */
  broker_status: string | null;
}

/**
 * One order row as the API reports it (§11). `quantity` is what was REQUESTED
 * and `filled_quantity` what actually filled — separate facts, never conflated
 * (partial fills are first-class). Paper fill model (constants shared with
 * server settings):
 *   BUY fill  = last stored close * (1 + paper_slippage_bps / 10000)
 *   SELL fill = last stored close * (1 - paper_slippage_bps / 10000)
 *   commission = paper_commission_per_share * quantity, charged both ways.
 */
export interface PaperOrder {
  id: number;
  client_order_id: string | null;
  ticker: string;
  instrument: Instrument;
  side: OrderSide;
  quantity: number;
  filled_quantity: number;
  fill_price: number;
  commission: number;
  status: OrderStatus;
  /**
   * The local position this order opened/closes (§26/§27) — null until a
   * BUY's first fill lands, and for pre-lifecycle rows.
   */
  position_id: number | null;
  contract: OrderContractBlock | null;
  broker: OrderBrokerBlock | null;
  created_at: string;
}

/**
 * GET /api/orders/open — every NON-terminal order (PENDING_SUBMIT / ACCEPTED /
 * PARTIALLY_FILLED), oldest first. Local rows only: never needs a broker,
 * never 503s. The positions UI derives PENDING_UPDATE (§26) from this list —
 * a position whose order is still working is honestly in flux until the
 * order-sync sweep settles it.
 */
export interface OpenOrdersResponse {
  orders: PaperOrder[];
}

export interface OrderPositionSummary {
  id: number;
  ticker: string;
  quantity: number;
  avg_price: number;
  /**
   * Stock: the fixed §11.3 underlying stop. Options: null — their stop is
   * premium-based and reported by the position monitor's live read.
   */
  stop_price: number | null;
  max_loss: number;
}

export interface OrderApproveResult {
  order: PaperOrder;
  /**
   * Null when the broker accepted the order but nothing has filled yet
   * (§11 zero-fill): no position exists until real quantity fills — the
   * order-sync sweep opens it when fills arrive.
   */
  position: OrderPositionSummary | null;
  /** The gate-chain re-run the server performed at approval time (§10). */
  preview: OrderPreview;
}

/**
 * 422 body from POST /api/orders/approve — the server ALWAYS re-runs the full
 * gate chain at approval time and rejects with the fresh preview embedded.
 */
export interface OrderApproveErrorDetail {
  message: string;
  preview: OrderPreview;
}

export interface OrderCloseResult {
  order: PaperOrder;
  position: OrderPositionSummary;
  realized_pnl: number;
}

export type PositionStatus = "OPEN" | "CLOSED";
export type ExitStatus = "HOLD" | "EXIT_SIGNALED";

/** Option-contract details attached to a LONG_CALL / LONG_PUT position row. */
export interface PositionContract {
  /**
   * Server-built OCC symbol (§27). Optional: GET /api/positions does not send
   * it yet (the order payloads do) — when absent the UI may fall back to the
   * display-side construction; a null means the server could not build one.
   */
  option_symbol?: string | null;
  /** YYYY-MM-DD */
  expiry: string;
  strike: number;
  right: OptionRight;
  /** Always 100. */
  multiplier: number;
  /** REMAINING days to expiry; null when unknown (e.g. CLOSED rows). */
  dte: number | null;
  current_mid: number | null;
  /** current_mid / entry_premium − 1 (fraction, 0.12 = +12%). */
  premium_pnl_pct: number | null;
}

/**
 * §37 — a position row always carries WHY the system is still holding
 * (exit_status + exit_reasons). Nulls mean data is missing or the row is CLOSED.
 *
 * Option rows (instrument LONG_CALL / LONG_PUT): avg_price = entry premium PER
 * SHARE (mid at fill), quantity = number of CONTRACTS, market_value =
 * quantity × current_mid × 100, max_loss = premium paid. exit_reasons include
 * the option families (§11.3 PREMIUM_HARD_STOP, §11.7 DTE_EXIT) alongside the
 * underlying-driven rules.
 *
 * GET /api/positions is NOT a 503 when market data is unconfigured — these are
 * real DB rows. Every market-derived field (current_price, market_value,
 * unrealized_pnl*, current_edge, signal_decay, contract.current_mid,
 * contract.premium_pnl_pct, exit_status) simply arrives null instead of being
 * estimated, and the UI renders "—".
 */
export interface PositionRow {
  id: number;
  ticker: string;
  status: PositionStatus;
  instrument: Instrument;
  /** null for LONG_STOCK rows. */
  contract: PositionContract | null;
  quantity: number;
  avg_price: number;
  opened_at: string;
  closed_at: string | null;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  realized_pnl: number | null;
  max_loss: number;
  /**
   * Stock: the fixed §11.3 underlying stop. Options: null — their stop is
   * premium-based and reported via the monitor's live read, not this field.
   */
  stop_price: number | null;
  trail_price: number | null;
  entry_edge: number;
  current_edge: number | null;
  /** entry_edge - current_edge (positive = the signal has weakened since entry). */
  signal_decay: number | null;
  bars_held: number | null;
  time_stop_remaining: number | null;
  exit_status: ExitStatus | null;
  exit_reasons: string[];
  /**
   * Phase D (§52 "stock vs option risk display") option risk fields, served
   * by GET /api/positions (routers/positions.py). ABSENT on backends that
   * predate Phase D; ALL FOUR are null on a stock row — a share has no
   * premium at risk, no expiry and no IV, and null is more honest than 0.
   * A null on an option row is an honest gap (no chain quote, no IV, no
   * persisted stress run) and is never rendered as 0.
   */
  /** Premium currently at risk in USD (what a total loss of the option costs). */
  premium_at_risk?: number | null;
  /** REMAINING days to expiry. */
  dte?: number | null;
  /**
   * Baseline implied vol the stress reprice anchored on, as a FRACTION
   * (0.32 = 32%). This is the PROVIDER's IV, passed through unchanged
   * (positions.py `_option_iv0`): the backend never solves for it on this
   * surface and never sends a provenance field, so a value here is always a
   * vendor number and null means the chain had none. A spread reports its
   * LONG leg's IV. Do NOT add an `iv0_source` field until the server sends
   * one — an internally solved IV would have to be labelled (provenance
   * rule) and is currently not served here at all.
   */
  iv0?: number | null;
  /**
   * This position's P&L in the WORST catalogue scenario, USD. A LOSS is
   * negative (it is a P&L, not a VaR-style positive loss).
   */
  worst_scenario_pnl?: number | null;
  /** Name of the scenario `worst_scenario_pnl` was measured in, verbatim. */
  worst_scenario_name?: string | null;
}

export interface CheckExitsResult {
  checked: number;
  exits_triggered: { ticker: string; rule: string; order_id: number }[];
  held: { ticker: string; reasons: string[] }[];
}

/**
 * GET /api/positions/monitor — status of the automated exit-sweep monitor.
 * `last_sweep_at` / `last_result` are null when no sweep has run yet.
 */
export interface PositionMonitorStatus {
  enabled: boolean;
  interval_seconds: number;
  last_sweep_at: string | null;
  sweeps_total: number;
  last_result: { checked: number; exits_triggered: number } | null;
}

/* ---------------------------------------------------------------- broker (paper-only execution) */

/**
 * Live broker account snapshot. Present only when a broker IS configured —
 * every figure comes from the broker itself and none is ever synthesized
 * locally.
 */
export interface BrokerAccount {
  cash: number;
  equity: number;
  buying_power: number;
  currency: string;
  /**
   * The broker's OWN paper flag. The adapter is paper-only and hard-refuses a
   * non-paper base URL, so a configured broker always reports true here; the
   * field is surfaced so the claim is the broker's, not the UI's.
   */
  is_paper: boolean;
  account_number: string;
}

/**
 * GET /api/broker/status — never 503s, because "no broker" is a real, reportable
 * state rather than a failure. `configured` is the authority every surface
 * renders against.
 *
 * `mode` is "paper" or null: there is no live mode to report. When unconfigured,
 * `account` is null — no cash or equity figure is invented, and no order can be
 * placed at all (the internal simulator is never substituted for a broker).
 */
export interface BrokerStatus {
  configured: boolean;
  /** "" when unset — there is no default broker. */
  provider: string;
  /** Always "paper" when configured; null when not. Live trading is unreachable. */
  mode: "paper" | null;
  /** Broker-sourced figures; null when unconfigured or unreachable. */
  account: BrokerAccount | null;
  /** Why the broker is unusable (unset, bad credentials, unreachable); null when fine. */
  error: string | null;
}

/**
 * One disagreement between the broker's view and the local DB (§18). `broker`
 * and `local` are rendered verbatim — the UI never reconciles or averages them.
 */
export interface BrokerReconcileMismatch {
  /** e.g. POSITION_MISSING_LOCALLY, QUANTITY_MISMATCH, CASH_MISMATCH. */
  kind: string;
  /** "" when the mismatch is not symbol-scoped (e.g. a cash difference). */
  symbol: string;
  /** The broker's value, pre-formatted server-side; null when it has none. */
  broker: string | number | null;
  /** The local DB's value; null when there is no local row. */
  local: string | number | null;
  detail: string;
}

/**
 * GET /api/broker/reconcile — broker truth vs local truth. A mismatch pauses
 * trading automatically (§18): the broker is authoritative about what actually
 * exists, so the system stops rather than trading against a stale local view.
 */
export interface BrokerReconcile {
  as_of: string;
  configured: boolean;
  /** Broker-side snapshot summary, rendered as-is. */
  broker: Record<string, unknown> | null;
  /** Local-side snapshot summary, rendered as-is. */
  local: Record<string, unknown> | null;
  mismatches: BrokerReconcileMismatch[];
  in_sync: boolean;
}

/* ---------------------------------------------------------------- recommendations */

export type RecommendationStatus = "PENDING" | "DISMISSED" | "PROMOTED" | "EXPIRED";

/**
 * One REAL citation (Phase 8): server-validated to reference a stored news
 * article — never free text the model invented.
 */
export interface RecommendationEvidence {
  /**
   * The cited article's URL. Usually http(s) and linkable; non-http values
   * (e.g. stub:// during dev) are rendered as plain text, never as a link.
   */
  source: string;
  /** Always predates the recommendation's `ts` — no hindsight sourcing (§20.3). */
  published_at: string;
  snippet: string;
}

/**
 * An LLM-proposed candidate (§30). Governance: the LLM only PROPOSES — a row
 * can reach the Watchlist solely through the explicit user promote action, and
 * there is never a direct recommendation→trade path.
 */
export interface Recommendation {
  id: number;
  ts: string;
  ticker: string;
  company: string | null;
  /** [-1, 1] — negative = bearish read of the catalyst. */
  sentiment: number;
  /** [0, 1] */
  impact: number;
  /** [0, 1] */
  novelty: number;
  /** [0, 1] */
  source_reliability: number;
  /** e.g. "1-5d" */
  horizon: string;
  catalyst_type: string;
  reason_codes: string[];
  summary: string;
  evidence: RecommendationEvidence[];
  status: RecommendationStatus;
}

export interface RecommendationSkip {
  ticker: string;
  reason: string;
}

/**
 * Phase 8 news-grounding summary on a refresh: what the news fetch actually
 * did before the LLM ran. All counts are the server's own figures.
 */
export interface RecommendationRefreshNews {
  /** Articles fetched from the provider on this refresh. */
  fetched: number;
  /** Of those, articles not already stored. */
  new: number;
  /** Stored articles the generated recommendations were grounded on. */
  grounding: number;
}

export interface RecommendationRefreshResult {
  created: Recommendation[];
  skipped: RecommendationSkip[];
  /** Absent on backends that predate Phase 8 news grounding. */
  news?: RecommendationRefreshNews;
}

/**
 * 503 `detail` body from POST /api/recommendations/refresh when the Massive
 * plan does not include the news endpoint (Phase 8). Distinct from the
 * *_NOT_CONFIGURED codes: a provider IS configured — its subscribed plan
 * simply lacks news, so no grounded recommendation can be generated.
 */
export interface NewsNotAvailableDetail {
  code: "NEWS_NOT_AVAILABLE";
  message: string;
}

/** POST /api/recommendations/{id}/promote — the ONLY recommendation→watchlist path. */
export interface RecommendationPromoteResult {
  recommendation: Recommendation;
  watchlist_ticker: string;
}

/* ---------------------------------------------------------------- strategy health */

export type StrategyHealthStatus =
  | "INSUFFICIENT_DATA"
  | "HEALTHY"
  | "WARNING"
  | "PAUSE_RECOMMENDED";

/**
 * §19 rolling stats over closed paper trades. Ratio fields are null where
 * undefined (e.g. no losses yet → profit_factor null) — never NaN/Infinity.
 */
export interface StrategyHealth {
  as_of: string;
  trade_count: number;
  min_trades_for_judgement: number;
  /** Fraction of closed trades that won (0.55 = 55%), null below judgement threshold. */
  win_rate: number | null;
  profit_factor: number | null;
  expectancy_usd: number | null;
  avg_win_usd: number | null;
  avg_loss_usd: number | null;
  gross_profit_usd: number;
  gross_loss_usd: number;
  cumulative_pnl_usd: number;
  max_drawdown_usd: number;
  current_drawdown_usd: number;
  status: StrategyHealthStatus;
  explanations: string[];
}

/* ---------------------------------------------------------------- platform config (§28, §44 rule 2) */

/**
 * §5 account permission flags — the §2 permission matrix in full. The first
 * four are the configurable milestone flags; the last six are the §2 hard
 * constraints and are ALWAYS false — paper mirrors the intended real account
 * (§23), so Alpaca Paper technically supporting a strategy never enables it.
 *
 * The six forbidden flags are optional because older backends sent only the
 * 4-field shape — the UI renders only the fields actually present.
 */
export interface AccountPermissions {
  long_stock: boolean;
  long_call: boolean;
  long_put: boolean;
  defined_risk_spreads: boolean;
  /** §2 — cash account: shorting stock is impossible. Always false. */
  short_stock?: boolean;
  /** §2 — unlimited risk: never allowed. Always false. */
  naked_short_call?: boolean;
  /** §2 — never allowed. Always false. */
  naked_short_put?: boolean;
  /** §4 — explicitly forbidden in this milestone. Always false. */
  covered_call?: boolean;
  /** §4 — explicitly forbidden in this milestone. Always false. */
  cash_secured_put?: boolean;
  /** §2 — cash account: margin does not exist. Always false. */
  margin?: boolean;
}

/**
 * §12/§13/§16 risk thresholds as the risk engine actually consumes them
 * (dataclasses.asdict of RiskLimits). All budget/cap/heat values are
 * FRACTIONS of NAV; strength_* are |edge| thresholds on the 0-100 scale.
 * Distinct from the PortfolioRisk `RiskLimits` summary type above.
 */
export interface ConfigRiskLimits {
  budget_weak: number;
  budget_moderate: number;
  budget_strong: number;
  budget_very_strong: number;
  abs_max_trade_risk: number;
  single_name_risk: number;
  single_name_capital: number;
  bucket_risk: number;
  heat_elevated: number;
  heat_high: number;
  heat_reject: number;
  strength_weak: number;
  strength_moderate: number;
  strength_strong: number;
  strength_very_strong: number;
  /** Regime name -> minimum cash fraction of NAV (§13). */
  cash_floors: Record<string, number>;
  /** Bucket name -> member tickers sharing one risk cap (§12.4). */
  correlation_buckets: Record<string, string[]>;
  max_delta_notional_pct_nav: number;
  max_net_theta_pct_nav: number;
  max_net_vega_pct_nav: number;
}

/** §11 exit-engine parameters (ExitParams dataclass). */
export interface ConfigExitParams {
  exit_edge_threshold: number;
  atr_trail_k: number;
  time_stop_bars: number;
  min_move_atr: number;
  atr_period: number;
  /** Fraction of entry premium (0.45 = 45%) — options only (§11.3). */
  premium_hard_stop_pct: number;
  /** DTE at or below which DTE_EXIT fires — options only (§11.7). */
  dte_exit_threshold: number;
}

/** §9 contract-selector thresholds and ranking weights (SelectorParams). */
export interface ConfigSelectorParams {
  dte_min: number;
  dte_max: number;
  abs_delta_min: number;
  abs_delta_max: number;
  min_open_interest: number;
  min_volume: number;
  /** (ask - bid) / mid, as a fraction. */
  max_spread_pct: number;
  /** Max |theta| / mid per calendar day, as a fraction. */
  max_theta_premium_pct: number;
  top_n: number;
  w_liquidity: number;
  w_theta: number;
  w_delta_fit: number;
}

/** §14 volatility-targeting parameters (VolTargetParams). */
export interface ConfigVolTargetParams {
  /** Annualized target vol (fraction, 0.12 = 12%). */
  target_vol: number;
  max_multiplier: number;
  min_multiplier: number;
}

/** §6.1 regime-classifier parameters (RegimeParams). */
export interface ConfigRegimeParams {
  sma_fast: number;
  sma_mid: number;
  sma_slow: number;
  slope_lookback: number;
  atr_period: number;
  /** ATR / close ratio (fraction) above which the regime is forced to TRANSITION. */
  extreme_atr_pct: number;
}

/** §6.2 directional-scorer parameters (DirectionalParams; tuples arrive as arrays). */
export interface ConfigDirectionalParams {
  sma_fast: number;
  sma_mid: number;
  sma_slow: number;
  slope_lookback: number;
  macd_fast: number;
  macd_slow: number;
  macd_signal: number;
  rsi_period: number;
  /** Inclusive (lo, hi) RSI band counted as bull continuation. */
  rsi_bull_zone: [number, number];
  rsi_bear_zone: [number, number];
  pivot_window: number;
  volume_sma_period: number;
  bias_threshold: number;
  weight_sma_fast: number;
  weight_sma_mid: number;
  weight_sma_slow: number;
  weight_sma_slope: number;
  weight_macd_cross: number;
  weight_macd_zero: number;
  weight_rsi_zone: number;
  weight_structure: number;
  weight_volume: number;
}

/** Paper fill-model constants shared with the paper order executor. */
export interface PaperTradingConfig {
  initial_cash: number;
  slippage_bps: number;
  commission_per_share: number;
  commission_per_contract: number;
}

/**
 * GET /api/config — read-only snapshot of the configuration the engines are
 * ACTUALLY using (§44 rule 2 made visible), built server-side from
 * dataclasses.asdict of the real parameter objects. Never contains secret
 * material; the UI only renders, never edits.
 */
export interface PlatformConfig {
  environment: string;
  /**
   * Provider names are "" when unset — there is no default provider and no
   * synthetic fallback. The *_configured booleans are the authority the UI
   * renders against; the name is only a label for a configured provider.
   */
  providers: {
    market_data: string;
    llm: string;
    llm_model: string;
    /** "" when unset. Execution is paper-only; there is no live broker to name. */
    broker?: string;
    /** Absent on older backends; treat a missing flag as "name is non-empty". */
    market_data_configured?: boolean;
    llm_configured?: boolean;
    broker_configured?: boolean;
  };
  account_permissions: AccountPermissions;
  risk_limits: ConfigRiskLimits;
  exit_params: ConfigExitParams;
  selector_params: ConfigSelectorParams;
  vol_target_params: ConfigVolTargetParams;
  regime_params: ConfigRegimeParams;
  directional_params: ConfigDirectionalParams;
  backtest_defaults: BacktestParams;
  paper_trading: PaperTradingConfig;
  kill_switch: {
    trading_enabled: boolean;
    reason: string;
  };
}

/* ---------------------------------------------------------------- provider connections (runtime config) */

/**
 * One provider's connection state on GET/PUT /api/config/providers.
 * `provider` is "" when unset — there is no default provider. `reason` is the
 * server's own explanation of why the provider is unusable; null when fine.
 */
export interface ProviderConnection {
  provider: string;
  configured: boolean;
  reason: string | null;
}

/** The LLM connection additionally carries the model name ("" when unset)
 *  and the language NEW narrative generations are produced in (stored rows
 *  keep the language they were generated in). */
export interface LlmProviderConnection extends ProviderConnection {
  model: string;
  output_language: "en" | "zh";
}

/**
 * Which write-only secrets the server currently has stored — BOOLEANS ONLY.
 * Secret values are write-only by contract: no API ever returns them, so no
 * response type anywhere carries one.
 */
export interface SecretsSet {
  massive_api_key: boolean;
  llm_api_key: boolean;
  alpaca_api_key_id: boolean;
  alpaca_api_secret_key: boolean;
  /** Catalyst research upgrade. Presence boolean ONLY — the key itself is
      never returned by any endpoint and never reaches the browser. */
  brave_api_key?: boolean;
}

/**
 * GET /api/config/providers — the UI-managed runtime provider layer. Contains
 * connection state and the stored-secret booleans; never secret material.
 */
export interface ProviderConnections {
  market_data: ProviderConnection;
  llm: LlmProviderConnection;
  broker: ProviderConnection;
  /** Catalyst research upgrade — external web search (keyed, opt-in). */
  web_search?: ProviderConnection;
  /** Catalyst research upgrade — prediction markets. READ-ONLY: this
      connection never carries a wallet or trading credential, and no
      request shape exists that could add one. */
  prediction_markets?: ProviderConnection;
  secrets_set: SecretsSet;
}

/**
 * PUT /api/config/providers response — the same shape as GET, plus
 * `cash_adopted` when connecting the broker while the local ledger was empty
 * adopted the real account's cash (reported so the UI can say so, loudly).
 */
export interface ProviderConnectionsPutResult extends ProviderConnections {
  cash_adopted?: number;
}

/**
 * PUT /api/config/providers request — any subset; only present fields change.
 * An EMPTY STRING disconnects a field. Provider name choices the UI offers:
 * market_data "" | "massive"; llm "" | "openai"; broker "" | "alpaca_paper"
 * (the stub/simulated values exist server-side for tests only). 422 on
 * invalid provider names. The *_key fields are write-only secrets: they are
 * sent here and never returned by any endpoint.
 */
export interface ProviderConnectionsUpdate {
  market_data_provider?: string;
  massive_api_key?: string;
  llm_provider?: string;
  llm_api_key?: string;
  llm_model?: string;
  /** "en" | "zh" — language of newly generated LLM narrative; "" = default en. */
  llm_output_language?: string;
  /** Instrument permissions — STRICT "true"/"false" (§5 real flags only;
   *  §33 forbidden capabilities are not settable anywhere). */
  allow_long_stock?: string;
  allow_long_call?: string;
  allow_long_put?: string;
  /** Roadmap Phase 1 scope: gates spread research+backtest; live spread
   *  execution stays under construction. */
  allow_defined_risk_spreads?: string;
  /** Phase 2 unlock (2026-08-17): collateralized short premium. */
  allow_covered_call?: string;
  allow_cash_secured_put?: string;
  /** Phase 3 unlock (2026-08-17): margin-backed short stock — margin
   *  exists to support shorting; levered long sizing stays off (§12). */
  allow_short_stock?: string;
  allow_margin?: string;
  /** Catalyst research upgrade. "" | "brave" | "stub" — no default: an
      unconfigured search provider reports NOT_CONFIGURED rather than
      quietly using one. */
  web_search_provider?: string;
  /** Write-only secret, exactly like the other *_key fields: sent here and
      returned by nothing. */
  brave_api_key?: string;
  /** "" | "polymarket" | "stub". Opt-in even though Polymarket is keyless —
      it is an outbound network dependency the operator must enable. */
  prediction_markets_provider?: string;
  broker_provider?: string;
  alpaca_api_key_id?: string;
  alpaca_api_secret_key?: string;
}

/** Who performed an audited action (mirrors the backend ActorType enum). */
export type AuditActorType = "USER" | "SYSTEM" | "LLM";

/* ---------------------------------------------------------------- alerts (§29) */

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

/**
 * One row from GET /api/alerts — a read-only, severity-classified view over
 * the audit trail (declarative ALERT_RULES, §18/§29/§38); fetching alerts
 * never writes audit events. Newest first.
 *
 * CRITICAL: TRADING_PAUSED, KILL_SWITCH_TRIGGERED, ORDER_REJECTED.
 * WARNING:  RISK_DECISION only when rejected or vetoed by an earlier gate
 *           (PASS/APPROVE/RESIZE previews are NOT alerts), EXIT_GENERATED,
 *           BACKTEST_FAILED.
 * INFO:     ORDER_FILLED, TRADING_RESUMED. Everything else is not an alert.
 */
export interface Alert {
  /** The underlying audit row id. */
  id: number;
  ts: string;
  severity: AlertSeverity;
  /** Human-readable, built server-side from action + details. */
  title: string;
  /** "" when the alert is not symbol-scoped. */
  ticker: string;
  action: string;
  correlation_id: string;
}

export interface AuditEvent {
  id: number;
  ts: string;
  actor_type: AuditActorType;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  correlation_id: string;
}

/* ------------------------------------------------ event registry (§5-§13, Phase B)
 *
 * GET /api/events is deliberately NOT part of the 503 not-configured family.
 * With no calendar provider set it answers 200 with `events: []` plus a
 * `capabilities` block explaining WHY the calendar is empty — hiding that
 * report behind a 503 would remove the very explanation the §11 ESTIMATED
 * contract exists to give. Nothing is fabricated to fill the silence.
 */

/** §6 taxonomy — the closed set the backend's EventType StrEnum emits. */
export type EventType =
  | "EARNINGS"
  | "CPI"
  | "PPI"
  | "PCE"
  | "GDP"
  | "EMPLOYMENT_REPORT"
  | "JOLTS"
  | "RETAIL_SALES"
  | "ISM"
  | "CONSUMER_SENTIMENT"
  | "FOMC_MEETING"
  | "FOMC_DECISION"
  | "FOMC_PRESS_CONFERENCE"
  | "FOMC_MINUTES"
  | "FED_SPEECH"
  | "FED_BOARD_EVENT"
  | "CORPORATE_EVENT"
  | "MARKET_HOLIDAY";

/**
 * §7 lifecycle of a DATE, not of the event itself. ESTIMATED means the
 * platform DERIVED the date (SEC filing cadence) and no source has confirmed
 * it — it must never render as a fact.
 */
export type EventStatus = "ESTIMATED" | "CONFIRMED" | "REVISED" | "CANCELED";

/** Release timing relative to the exchange session that day. */
export type EventSession =
  | "BEFORE_MARKET"
  | "DURING_MARKET"
  | "AFTER_MARKET"
  | "UNKNOWN";

/** Where the event sits on the clock relative to now (server-computed). */
export type EventLifecycle =
  | "SCHEDULED"
  | "PRE_EVENT"
  | "LIVE"
  | "POST_EVENT"
  | "ARCHIVED";

/** §12 ladder, highest relevance first. Sort order is the array order. */
export type RelevanceTier =
  | "POSITION"
  | "TRADING_POOL"
  | "WATCHLIST"
  | "MARKET_WIDE"
  | "OTHER";

/** Provenance rank of the date (USER outranks every automated source). */
export type EventSourceKind =
  | "USER"
  | "COMPANY_IR_SEC"
  | "GOVERNMENT_AGENCY"
  | "FEDERAL_RESERVE"
  | "STRUCTURED_PROVIDER"
  | "DERIVED"
  | "NEWS"
  | "LLM";

/**
 * Open-position exposure for the event's ticker, or null.
 *
 * `basis: "COST"` is load-bearing: the events router reads stored rows only
 * and never touches a market-data provider, so `position_market_value` is
 * quantity × avg_price × multiplier — the COST basis, not a live mark. The
 * UI must label it as such rather than calling it market value.
 */
export interface EventExposure {
  position_qty: number;
  position_market_value: number;
  basis: string;
}

/** One entry appended by §7's merge whenever a confirmed date moved. */
export interface EventRevision {
  scheduled_at?: string;
  status?: string;
  source_name?: string;
  at?: string;
}

/**
 * One event as GET /api/events renders it.
 *
 * Both timestamps travel by design: `scheduled_at_utc` is the instant the
 * platform compares on, `scheduled_at_local` the wall clock the event
 * asserts ("CPI at 08:30 ET"). `is_estimated` duplicates `status` on purpose
 * so a consumer that forgets the enum still cannot present a derived date as
 * a fact.
 */
export interface EventRow {
  event_id: number;
  event_key: string;
  event_type: EventType;
  title: string;
  ticker: string | null;
  company_id: string | null;
  scheduled_at_utc: string;
  /** ISO with offset, in `event_timezone`. */
  scheduled_at_local: string;
  event_timezone: string;
  session: EventSession;
  status: EventStatus;
  is_estimated: boolean;
  source: EventSourceKind;
  source_name: string;
  source_url: string | null;
  source_event_id: string | null;
  last_verified_at: string | null;
  previous_event_id: number | null;
  comparison_reason: string | null;
  /** Fractional days; negative once the event is in the past. */
  days_to_event: number;
  lifecycle: EventLifecycle;
  relevance_tier: RelevanceTier;
  /** §13: LIVE recomputation — the score the UI renders. */
  importance: number;
  /** What ingestion last PERSISTED; null until a tick has scored the row. */
  importance_stored: number | null;
  /** §13 "quantitative components must be identifiable" — the arithmetic. */
  importance_components: Record<string, number>;
  /** Sum BEFORE the 0-100 clamp, so "90 + 30 = 120 → 100" renders honestly. */
  importance_raw_total: number;
  importance_was_clamped: boolean;
  importance_model_version: string;
  series_id: string | null;
  agency: string | null;
  release_period: string | null;
  fiscal_quarter: number | null;
  fiscal_year: number | null;
  speaker: string | null;
  topic: string | null;
  revision_history: EventRevision[];
  exposure: EventExposure | null;
  /**
   * §54 research digest. Present ONLY when the feed was asked for it
   * (`summaries=true`); absent means "not requested", not "nothing found".
   */
  summary?: EventCardSummary | null;
}

/** GET /api/events/{id} adds the §15 previous comparable and WHY it compares. */
export interface EventDetail extends EventRow {
  previous_event: EventRow | null;
  comparison_reason: string | null;
}

/**
 * Per-provider capability verdicts, keyed by provider name. Values follow the
 * market-data probe semantics: `true` supported, `false` denied (e.g. the
 * Benzinga earnings 403), a STRING when the probe itself errored.
 */
export type EventCapabilities = Record<string, Record<string, boolean | string>>;

/** Last-known ingestion state per provider (never a live probe). */
export interface EventProviderFreshness {
  configured: boolean;
  last_ok_at: string | null;
  last_fetched_at: string | null;
  last_error: string | null;
  /** "NEVER_RUN" when configured but never ticked — distinct from absent. */
  note: string | null;
}

export interface EventFreshness {
  last_ingest_at: string | null;
  per_provider: Record<string, EventProviderFreshness>;
  configured_providers: string[];
}

export type EventHorizonKey = "today" | "7d" | "30d" | "custom";

export interface EventFeed {
  as_of: string;
  horizon: {
    start_utc: string;
    end_utc: string;
    label: string;
    key: EventHorizonKey;
  };
  display_timezone: string;
  events: EventRow[];
  counts: {
    total: number;
    by_type: Record<string, number>;
    by_relevance: Record<string, number>;
    estimated: number;
    confirmed: number;
  };
  capabilities: EventCapabilities;
  freshness: EventFreshness;
}

/** One stored exchange session. An absent date is an ABSENT ROW — the
 *  backend never synthesises a "probably 09:30-16:00" session. */
export interface MarketCalendarSession {
  session_date: string;
  exchange: string;
  open_utc: string | null;
  close_utc: string | null;
  session_open_utc: string | null;
  session_close_utc: string | null;
  is_early_close: boolean;
  source: string;
  fetched_at: string | null;
}

export interface MarketCalendarResponse {
  start: string;
  end: string;
  display_timezone: string;
  sessions: MarketCalendarSession[];
}

/** POST /api/events/refresh — one forced ingestion tick. Idempotent: a
 *  refresh that finds the same events creates ZERO rows. */
export interface EventRefreshResult {
  providers: Record<string, unknown>;
  created: number;
  updated: number;
  alerts: number;
  /** Named skips ({provider, reason}) — never a silent omission. */
  skipped: { provider?: string; reason?: string }[];
}

/** Body of POST /api/events/{id}/confirm — the user asserting the real date. */
export interface EventConfirmRequest {
  /** ISO-8601; an offsetless string is read as America/New_York. */
  scheduled_at: string;
  session?: EventSession;
  source_url?: string;
}

/** Confirm/cancel echo the updated event plus which merge branch fired. */
export interface EventMutationResult extends EventRow {
  change: string;
}

/* ------------------------------------------------------------------ Phase E1
 * GET /api/events/{id}/price-context — where the underlying stands going INTO
 * the event (§31/§32) and how it reacted to every previous comparable one
 * (§19/§64).
 *
 * Two rules run through every type below and neither is negotiable:
 *  1. NO FABRICATED NUMBERS. Every metric is `number | null`, and a null is
 *     always explained by a companion entry in the block's `reasons` map (or
 *     by the row's own `reason`). The UI renders "Unavailable — <reason>",
 *     never a zero and never an em dash on its own.
 *  2. PROVENANCE IS PART OF THE PAYLOAD. Bars are DATA (fetched, unaltered);
 *     everything derived from them is QUANT (computed here, from a stated
 *     formula) — never an LLM opinion. The tab labels each block accordingly.
 */

/** `reasons` maps a field name to the server's own verbatim explanation. */
export type PriceReasons = Record<string, string>;

/** Horizon-keyed maps arrive as JSON objects keyed by label: {"1D": 0.031, "3D": null, …}. */
export type PriceHorizonMap = Record<string, number | null>;

/** Pre-event positioning (§32 run-up framing). Every field may be null. */
export interface EventPricePreContext {
  as_of_date_et: string | null;
  /** The previous comparable event's date — the "since" in "since the last print". */
  anchor_date_et: string | null;
  anchor_close: number | null;
  /** Verbatim server token, e.g. "previous_event" or "63_bar_lookback". */
  anchor_basis: string | null;
  last_close: number | null;
  bars_through: string | null;
  n_bars: number;
  since_anchor_return: number | null;
  /** Spec §32's own label for the since-anchor return. Same number, its name. */
  run_up_pct: number | null;
  benchmark_return: number | null;
  /** Stock minus SPY over the same window — the run-up net of the market. */
  relative_return: number | null;
  max_drawdown: number | null;
  realized_vol_20d: number | null;
  realized_vol_since_anchor: number | null;
  volume_trend: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  sma20_distance_pct: number | null;
  sma50_distance_pct: number | null;
  sma200_distance_pct: number | null;
  atr14: number | null;
  atr_pct: number | null;
  high_52w: number | null;
  low_52w: number | null;
  distance_from_52w_high_pct: number | null;
  distance_from_52w_low_pct: number | null;
  reasons: PriceReasons;
}

/** One past event's own price reaction, measured on bars around it. */
export interface EventPriceReaction {
  event_date_et: string | null;
  session: EventSession | null;
  /** Which window rule produced the pair, e.g. "after_market_next_day". */
  basis: string | null;
  bars_available: boolean;
  pre_event_close: number | null;
  pre_event_date: string | null;
  react_open: number | null;
  react_close: number | null;
  react_date: string | null;
  gap_return: number | null;
  returns: PriceHorizonMap;
  abs_returns: PriceHorizonMap;
  max_favorable_excursion: number | null;
  max_adverse_excursion: number | null;
  reasons: PriceReasons;
}

/** The same windows measured on SPY, and the stock-minus-SPY difference. */
export interface EventPriceAbnormal {
  abnormal: PriceHorizonMap;
  abnormal_gap: number | null;
  benchmark_returns: PriceHorizonMap;
  benchmark_gap_return: number | null;
  benchmark_available: boolean;
  basis: string | null;
  reasons: PriceReasons;
}

/** One row of the "previous earnings reactions" table. */
export interface EventPricePreviousEvent {
  event_id: number;
  event_key: string;
  date_et: string | null;
  session: EventSession | null;
  status: EventStatus;
  reaction: EventPriceReaction;
  abnormal_vs_spy: EventPriceAbnormal | null;
  /** False when the event predates the first stored bar — an honest gap. */
  bars_available: boolean;
  reason?: string | null;
}

/**
 * §19/§64 — a historical distribution, ALWAYS carrying its sample size and
 * never phrased as a probability. `positive_count` of `n` is a count of what
 * happened, not a chance of what will.
 */
export interface EventPriceHistoryStats {
  /** The server sends the LABEL ("1D"), not the bare integer. */
  horizon: string;
  n: number;
  n_available: number;
  median_abs: number | null;
  mean_abs: number | null;
  p75_abs: number | null;
  p90_abs: number | null;
  max_abs: number | null;
  positive_count: number | null;
  positive_frequency: number | null;
  reasons: PriceReasons;
}

/** Which bars the whole block was computed from (DATA provenance). */
export interface EventPriceFreshness {
  bars_through: string | null;
  bars_source: string | null;
  n_bars: number;
}

/** A named field the server could NOT compute, with the reason it could not. */
export interface EventPriceUnavailable {
  field: string;
  reason: string;
}

/**
 * The full payload. `available: false` is a legitimate 200 — a macro/Fed
 * event has no single ticker to price (Phase G handles multi-asset), and an
 * unconfigured market-data provider is a state, not a failure.
 */
export interface EventPriceContext {
  available?: boolean;
  reason?: string | null;
  event_id?: number;
  ticker?: string | null;
  as_of?: string | null;
  provenance?: { bars: string; metrics: string };
  data_freshness?: EventPriceFreshness;
  pre_event?: EventPricePreContext | null;
  previous_events?: EventPricePreviousEvent[];
  /** Keyed by horizon label ("1D", "5D"), then by window ("last4"/"last8"/…). */
  history_stats?: Record<string, Record<string, EventPriceHistoryStats | null>>;
  /** Named metrics that are NOT backtested — shown so nothing reads as proven. */
  not_backtestable?: string[];
  unavailable?: EventPriceUnavailable[];
}

/* ------------------------------------------------------ Phase E2 fundamentals */

/**
 * Point-in-time fundamentals for an event (§28, §29, §30, §33, §58).
 *
 * Wire conventions this block relies on, all inherited from the Phase E1
 * price payload so one mental model covers both:
 *  - Ratios and margins are FRACTIONS (0.4612 = 46.12%), scaled once at
 *    render time. Multiples (P/E, P/S, P/B) and per-share values are NOT.
 *  - A metric the server could not compute is `null` AND carries a reason in
 *    the companion `reasons` map. `null` with no reason is a server bug the
 *    UI surfaces as "the server sent no reason" rather than papering over.
 *  - `available: false` is a legitimate 200 (macro/Fed event has no ticker;
 *    the provider does not sell financials), never an error.
 */

/** Metric → the server's own explanation for why it is null. */
export type FundamentalReasons = Record<string, string>;

/** Which filed statement a column of numbers came from (§7: as-of key is
 *  `acceptance_datetime`, the instant the filing became public — never the
 *  period end, which is knowable months before anyone could trade on it). */
export interface FundamentalStatementRef {
  label: string;
  fiscal_year?: number | null;
  fiscal_period?: string | null;
  end_date?: string | null;
  acceptance_datetime?: string | null;
  filing_date?: string | null;
  timeframe?: string | null;
}

/** One snapshot of every §28 metric, as of one instant. */
export interface FundamentalSnapshotPayload {
  ticker?: string | null;
  as_of?: string | null;
  available?: boolean;
  quarterly?: FundamentalStatementRef | null;
  ttm?: FundamentalStatementRef | null;
  metrics?: Record<string, number | null>;
  reasons?: FundamentalReasons;
  /** Caveats that travel WITH a computed number (e.g. "long-term only"). */
  notes?: Record<string, string>;
  quarters_available?: number;
  price?: number | null;
  market_cap?: number | null;
  model_version?: string | null;
  reason?: string | null;
}

/** One row of the §58 previous-vs-current comparison table. */
export interface FundamentalMetricChange {
  metric: string;
  previous?: number | null;
  current?: number | null;
  delta?: number | null;
  /** Present for ratio metrics only — "+70 bps" is meaningless for revenue. */
  delta_bps?: number | null;
  pct_change?: number | null;
  /** Verbatim server token: "up" / "down" / "flat". */
  direction?: string | null;
  /** The server's OWN rendered arrow (↑ / ↓ / →) — preferred over deriving
   *  one from `direction`, so the glyph can never disagree with the delta. */
  arrow?: string | null;
  /** "improving" / "deteriorating" / "flat" over the stored quarters. */
  trend?: string | null;
  trend_points?: number;
  reason?: string | null;
  note?: string | null;
}

/** One valuation multiple against its OWN history (§30). */
export interface FundamentalMultiple {
  metric?: string;
  available?: boolean;
  current?: number | null;
  median?: number | null;
  min?: number | null;
  max?: number | null;
  /** 0..1 fraction of the own-history sample at or below `current`. */
  percentile?: number | null;
  history_n?: number;
  reason?: string | null;
  history_reason?: string | null;
}

/** The §30 valuation block: multiples plus the explicitly-absent peer set. */
export interface FundamentalValuation {
  as_of?: string | null;
  price?: number | null;
  market_cap?: number | null;
  multiples?: Record<string, FundamentalMultiple>;
  own_history?: { available?: boolean; n?: number; reason?: string | null };
  sector?: { available?: boolean; reason?: string | null };
  peers?: { available?: boolean; reason?: string | null };
  provenance?: string | null;
  model_version?: string | null;
}

/** When the newest filing landed — the freshness line's whole content. */
export interface FundamentalFreshness {
  latest_filing_date?: string | null;
  acceptance_datetime?: string | null;
  fetched_at?: string | null;
  period_end?: string | null;
  statements_stored?: number;
  provider?: string | null;
  source_filing_url?: string | null;
  /** Date of the close used to price the multiples — a valuation is only as
   *  of the price it used, which is not necessarily the as-of date. */
  price_date?: string | null;
  price_source?: string | null;
}

/**
 * §33's consensus block. Always `available: false` in Phase E2 — the
 * Benzinga estimates endpoint 403s on this subscription — and the reason is
 * shown as a BANNER rather than hidden, because "beat by $0.04" is the single
 * most load-bearing number missing from an earnings preview.
 */
export interface FundamentalConsensus {
  available?: boolean;
  reason?: string | null;
}

/** The deterministic half of the §35 expectations gap — counts, no narrative. */
export interface FundamentalMomentum {
  label?: string | null;
  reason?: string | null;
  improved?: number;
  weakened?: number;
  unchanged?: number;
  unavailable?: number;
  compared?: number;
  metrics_considered?: string[];
  provenance?: string | null;
  model_version?: string | null;
}

/** A named field the server could NOT compute, with the reason it could not. */
export interface FundamentalUnavailable {
  field: string;
  reason: string;
}

/** The full `GET /api/events/{id}/fundamentals` payload. */
export interface EventFundamentalsContext {
  available?: boolean;
  reason?: string | null;
  event_id?: number;
  event_key?: string;
  ticker?: string | null;
  as_of?: string | null;
  provenance?: { statements?: string; metrics?: string };
  /** Whether any statement was stored at all — distinct from `available`,
   *  which additionally requires one that was ACCEPTED before `as_of`. */
  statements?: { available?: boolean; count?: number; reason?: string | null };
  current?: FundamentalSnapshotPayload | null;
  /** The §15 previous comparable event, with the snapshot taken at ITS
   *  instant nested inside — the two travel together because a previous
   *  snapshot without the event that dated it is uninterpretable. */
  previous_event?: {
    event_id?: number;
    event_key?: string;
    scheduled_at?: string | null;
    comparison_reason?: string | null;
    price_date?: string | null;
    snapshot?: FundamentalSnapshotPayload | null;
  } | null;
  changes?: FundamentalMetricChange[];
  valuation?: FundamentalValuation | null;
  freshness?: FundamentalFreshness | null;
  consensus?: FundamentalConsensus | null;
  fundamental_momentum?: FundamentalMomentum | null;
  /** The server's canonical metric order — the table renders in it. */
  metric_order?: string[];
  model_version?: string | null;
  not_backtestable?: string[];
  unavailable?: FundamentalUnavailable[];
}

/* ------------------------------------------------------- Phase C event replay
 * GET /api/events/{id}/replay  and  GET /api/events/{id}/history (§20, §60).
 *
 * Key spelling is inherited from the pure layer's own serializers
 * (trading_core.events.replay: `EventReplay.to_dict`, `intraday_reaction_to_dict`,
 * `history_table`), which the gateway hands to FastAPI unchanged. The rules
 * that carried through Phase E1 carry through here too:
 *
 *  1. Every number is `number | null`, and every null is explained — either by
 *     a companion entry in `reasons` or by the cell's own `{available:false,
 *     reason}` shape. The UI renders "Unavailable — <reason>", never a zero.
 *  2. `available: false` is a legitimate 200 RESULT: minute bars are
 *     backfilled one event at a time on USER action, so a freshly loaded
 *     replay legitimately has none, and a FUTURE event has not happened yet.
 *  3. `basis` and `confidence` travel WITH the numbers (§85). An
 *     UNKNOWN-session release is measured on an ASSUMPTION
 *     ("unknown_session_assumed_after_market", confidence "low") and the tab
 *     cannot flag it unless the payload says so.
 */

/** One +5m/+30m/+60m mark. `move` is a FRACTION vs the window's anchor. */
export interface IntradayWindowCell {
  minutes: number;
  target_ts_utc: string | null;
  bar_ts_utc: string | null;
  price: number | null;
  move: number | null;
  /** Seconds between the requested mark and the bar actually used. */
  lag_seconds: number | null;
  reason: string | null;
}

/**
 * The §20 immediate reaction, measured on 1-minute bars.
 *
 * `windows` is keyed by the label the server prints (`"5m"`, `"30m"`,
 * `"60m"`) — `intraday_reaction_to_dict` emits `f"{k}m"`, never a bare int.
 */
export interface EventIntradayReaction {
  available?: boolean;
  reason?: string | null;
  session?: EventSession | null;
  /** e.g. "after_market_next_open", "unknown_session_assumed_after_market". */
  basis?: string | null;
  /** "high" | "low" — "low" is the UNKNOWN-session assumption. */
  confidence?: string | null;
  event_ts_utc?: string | null;
  event_date_et?: string | null;
  session_date_et?: string | null;
  pre_event_close?: number | null;
  after_hours_move?: number | null;
  after_hours_last_ts?: string | null;
  after_hours_bars?: number;
  premarket_move?: number | null;
  premarket_last_ts?: string | null;
  premarket_bars?: number;
  reference_price?: number | null;
  reference_ts?: string | null;
  open_price?: number | null;
  open_ts?: string | null;
  gap_at_open?: number | null;
  windows?: Record<string, IntradayWindowCell>;
  max_move_first_hour?: number | null;
  volume_first_30m?: number | null;
  avg_volume_first_30m_prior_5_days?: number | null;
  volume_ratio_first_30m?: number | null;
  bars_used?: number;
  reasons?: PriceReasons;
  model_version?: string | null;
  /** Always "QUANT" — attached by build_event_replay. */
  provenance?: string | null;
}

/** The observed facts of the release itself (DATA). */
export interface EventReplayRelease {
  timestamp_utc?: string | null;
  timestamp_et?: string | null;
  session?: EventSession | null;
  source_name?: string | null;
  source_url?: string | null;
}

/** One `information_before` reference — a POINTER, never a copy. */
export interface EventReplayInfoRef {
  available?: boolean;
  reason?: string | null;
  [k: string]: unknown;
}

/** Phase E1's daily reaction plus the abnormal-vs-SPY overlay, unchanged. */
export interface EventReplaySubsequent {
  available?: boolean;
  reason?: string | null;
  reaction?: EventPriceReaction | null;
  abnormal?: (EventPriceAbnormal & { available?: boolean; reason?: string | null }) | null;
  provenance?: string | null;
}

/** The event ref every replay payload leads with. */
export interface EventReplayRef {
  event_id?: number | null;
  event_key?: string | null;
  event_type?: EventType | null;
  ticker?: string | null;
  date_et?: string | null;
  session?: EventSession | null;
  status?: EventStatus | string | null;
  source_url?: string | null;
  /** The gateway adds the scheduled instant so an unavailable (future)
   *  replay can still say WHEN the event is due. */
  scheduled_at_utc?: string | null;
}

/**
 * `GET /api/events/{id}/replay?as_of=` — the §20 bundle.
 *
 * `available: false` here means the replay could not be built AT ALL (a
 * future event, a macro event with no ticker). A built replay whose minute
 * bars were never backfilled is still `available: true` — the ABSENCE lives
 * on `immediate_reaction.available`, which is what the "Load minute bars"
 * button exists to fix.
 */
export interface EventReplayPayload {
  available?: boolean;
  reason?: string | null;
  event_id?: number;
  event_key?: string | null;
  ticker?: string | null;
  as_of?: string | null;
  event?: EventReplayRef;
  information_before?: Record<string, EventReplayInfoRef>;
  release?: EventReplayRelease;
  immediate_reaction?: EventIntradayReaction;
  subsequent_reaction?: EventReplaySubsequent;
  data_freshness?: Record<string, unknown>;
  provenance?: Record<string, string>;
  reasons?: PriceReasons;
  /** Named measurements that are NOT backtested — shown so nothing here
   *  reads as a proven signal. */
  not_backtestable?: string[];
  model_version?: string | null;
}

/** A §60 cell the platform cannot compute — the ONE shape it always takes. */
export interface EventHistoryCell {
  available?: boolean;
  reason?: string | null;
  /** Present only on an available intraday_30m cell. */
  move?: number | null;
  basis?: string | null;
  confidence?: string | null;
  bar_ts_utc?: string | null;
}

/** One §60 row, in the server's own column vocabulary. */
export interface EventHistoryRow {
  event_id?: number | null;
  event_key?: string | null;
  date_et: string | null;
  session: EventSession | null;
  status: EventStatus | string | null;
  gap: number | null;
  ret_1d: number | null;
  ret_5d: number | null;
  abnormal_1d: number | null;
  intraday_30m: EventHistoryCell;
  /** Always unavailable — no consensus vendor at any tier (§33/§98). */
  eps_surprise: EventHistoryCell;
  rev_surprise: EventHistoryCell;
  /** Always unavailable until Phase I ships options intelligence. */
  implied_move: EventHistoryCell;
  actual_move_abs: number | null;
  bars_available?: boolean;
  reasons?: PriceReasons;
}

/** `GET /api/events/{id}/history?as_of=` — the §60 LAST 4/8/12 table. */
export interface EventHistoryPayload {
  available?: boolean;
  reason?: string | null;
  /** The registry facts, carried even when `available` is false. */
  event?: EventReplayRef;
  event_id?: number;
  event_key?: string | null;
  ticker?: string | null;
  benchmark?: string | null;
  /** The server's own ceiling on a history backfill — never assumed here. */
  max_last?: number;
  as_of?: string | null;
  rows?: EventHistoryRow[];
  n_rows?: number;
  /** Keyed by horizon label ("1D"/"5D"), then window ("last4"/"last8"/"last12"). */
  summary?: Record<string, Record<string, EventPriceHistoryStats | null>>;
  /** The §60 column order, carried so the UI never hardcodes a stale one. */
  columns?: string[];
  provenance?: { bars?: string; metrics?: string };
  not_backtestable?: string[];
  data_freshness?: Record<string, unknown>;
  unavailable?: EventPriceUnavailable[];
  model_version?: string | null;
}

/**
 * One event window's backfill outcome — the shape BOTH POST routes speak.
 *
 * `fetched` is the honest verb: false means no provider call stored anything,
 * and `reason` says which of the legitimate causes it was (window already
 * stored, throttled, provider unconfigured, 403, macro event with no ticker).
 * Every one of those is a 200 — a button press must report why nothing
 * arrived rather than fail.
 */
export interface EventWindowBackfillResult {
  event_id?: number;
  event_key?: string | null;
  ticker?: string | null;
  /** False when nothing was stored; `reason` says why. */
  fetched?: boolean;
  /** Minute bars written by this call. Zero is a legitimate answer. */
  bars?: number;
  /** Bars already present for the window (the "already stored" case). */
  stored_bars?: number;
  reason?: string | null;
  provider?: string | null;
  window_start_utc?: string | null;
  window_end_utc?: string | null;
  window_basis?: string | null;
  first_ts_utc?: string | null;
  last_ts_utc?: string | null;
}

/**
 * `POST /api/events/{id}/replay/backfill` returns ONE window result;
 * `POST /api/events/{id}/history/backfill?last=N` returns the roll-up, whose
 * `bars` is the SUM across `results`.
 *
 * The bound is part of the payload, not a client convention: `requested` is
 * what was asked for, `last` what the server clamped it to, and `max_last`
 * the ceiling — so a UI can never quietly imply it fetched more windows than
 * the server was willing to.
 */
export interface EventBackfillResult extends EventWindowBackfillResult {
  requested?: number;
  /** The clamped window count actually attempted. */
  last?: number;
  max_last?: number;
  events_available?: number;
  events_attempted?: number;
  /** Per-event outcomes, newest-first. Absent on the single-event route. */
  results?: EventWindowBackfillResult[];
  as_of?: string | null;
}

/* ------------------------------------------------------------------ Phase D
   News evidence (§21-§27, §59, §81).

   Key spellings mirror the seam exactly: the article ref, cluster, theme and
   evidence dicts come from `libs/trading_core/events/news_intel.py`'s own
   `to_ref`/`to_dict` serializers, and the envelope from
   `apps/gateway/event_news.py::build_event_news`. Every field here is
   OPTIONAL for the same reason the Phase C ones are: an `available:false`
   payload legitimately carries almost none of them, and a required field
   would force the UI to invent a value the server never sent. */

/** The §24 materiality categories, in the library's own CATEGORY_ORDER. */
export type NewsCategory =
  | "EARNINGS"
  | "GUIDANCE"
  | "PRODUCT"
  | "CUSTOMER"
  | "CONTRACT"
  | "REGULATION"
  | "LEGAL"
  | "MANAGEMENT"
  | "M&A"
  | "CAPITAL_ALLOCATION"
  | "SUPPLY_CHAIN"
  | "COMPETITION"
  | "ANALYST_REVISION"
  | "MACRO_EXPOSURE"
  | "INDUSTRY"
  | "OTHER";

/**
 * One article, exactly as `RawArticle.to_ref()` emits it.
 *
 * `title`/`description` are the DISPLAY strings (React escapes them on the
 * way out); `safe_title`/`safe_description` are the §81 LLM-facing copies.
 * `suspicious_instruction` means the sanitizer found an instruction-shaped
 * line — a FLAG for the reader, never a reason to hide the article.
 */
export interface NewsArticleRef {
  id?: number | null;
  source_id: string;
  title?: string | null;
  publisher?: string | null;
  published_at?: string | null;
  url?: string | null;
  tickers?: string[];
  safe_title?: string | null;
  safe_description?: string | null;
  suspicious_instruction?: boolean;
}

/** The five §25 factors whose product IS the score. Never a subset. */
export interface NewsScoreComponents {
  relevance?: number | null;
  materiality?: number | null;
  novelty?: number | null;
  source_quality?: number | null;
  decay?: number | null;
}

/** One story (§23), as `ArticleCluster.to_dict()` emits it. */
export interface NewsCluster {
  cluster_id: string;
  article_count?: number;
  canonical_article?: NewsArticleRef;
  /** Member ids INCLUDING the canonical one; duplicates already folded in. */
  member_source_ids?: string[];
  /** duplicate source_id → the canonical it was folded into. */
  duplicate_of?: Record<string, string>;
  link_reasons?: string[];
  /** Full member refs when the seam expands them; ids-only otherwise. */
  members?: NewsArticleRef[];
}

/** One §26/§59 theme, as `NewsTheme.to_dict()` emits it. */
export interface NewsTheme {
  label: string;
  category?: NewsCategory | string;
  n_developments?: number;
  cluster_ids?: string[];
  terms?: string[];
  top_score?: number | null;
}

/** One ranked evidence row (§25/§27), as `analyze_window` emits it. */
export interface NewsEvidence {
  evidence_id: string;
  cluster_id?: string;
  score?: number | null;
  material?: boolean;
  components?: NewsScoreComponents;
  category?: NewsCategory | string;
  matched_terms?: string[];
  article_count?: number;
  article?: NewsArticleRef;
  model_version?: string | null;
}

/** The §26 five-number headline. A count of 0 is a fact, not a blank. */
export interface NewsCounts {
  raw?: number;
  unique?: number;
  clusters?: number;
  material?: number;
  themes?: number;
}

/** The analysis window and WHY it starts where it does (verbatim basis). */
export interface NewsWindow {
  start?: string | null;
  end?: string | null;
  basis?: string | null;
}

/** §81 — what was done to untrusted article text, and how much was flagged. */
export interface NewsTextPolicy {
  sanitized?: boolean;
  max_chars?: number;
  /** Verbatim server wording of the policy. */
  rule?: string | null;
  suspicious_articles?: number;
}

/** `GET /api/events/{id}/news?as_of=` — the Phase D news evidence payload. */
export interface EventNewsPayload {
  available?: boolean;
  reason?: string | null;
  event?: EventReplayRef;
  event_id?: number;
  event_key?: string | null;
  ticker?: string | null;
  as_of?: string | null;
  window?: NewsWindow;
  counts?: NewsCounts;
  themes?: NewsTheme[];
  clusters?: NewsCluster[];
  /** Ranked by score, descending; the server caps the list at `evidence_limit`. */
  evidence?: NewsEvidence[];
  /** Rows BEFORE the transport cut — the counts are computed over all of them. */
  evidence_total?: number;
  evidence_limit?: number;
  /** The documented §26 cut for "material". Carried so the UI never hardcodes it. */
  material_threshold?: number;
  /** Articles the window dropped, by cause (after_as_of, not_relevant, …). */
  excluded?: Record<string, number>;
  provenance?: { articles?: string; scores?: string };
  freshness?: {
    newest_article_at?: string | null;
    last_fetch_at?: string | null;
    /** Rows in the window — the denominator behind the two stamps above. */
    articles_stored?: number;
    [k: string]: unknown;
  };
  untrusted_text_policy?: NewsTextPolicy;
  unavailable?: EventPriceUnavailable[];
  /**
   * Not emitted by `build_event_news` today — the tab states the
   * not-backtested caveat unconditionally instead of depending on a key that
   * may never arrive. Kept optional so a later seam can name specific fields
   * without a type change.
   */
  not_backtestable?: string[];
  model_version?: string | null;
}

/**
 * `POST /api/events/{id}/news/backfill` — one news-window fetch outcome.
 *
 * Same honesty contract as the minute-bar backfill: `fetched:false` with a
 * reason is a 200, and the legitimate causes (throttled, provider
 * unconfigured, 403, macro event with no ticker) each name themselves rather
 * than surfacing as a failure.
 */
export interface EventNewsBackfillResult {
  event_id?: number;
  event_key?: string | null;
  ticker?: string | null;
  /** Whether any provider call actually ran; `reason` says which cause if not. */
  fetched?: number | boolean;
  /** Articles returned by the providers on this call. */
  articles?: number;
  /**
   * Rows actually WRITTEN (new source_ids). Zero is a legitimate answer and
   * is the normal one on a second press — every article was already stored,
   * which the seam reports as `fetched:true, stored:0` plus the reason "all
   * fetched articles were already stored". That is a state, not a failure.
   */
  stored?: number;
  window_start_utc?: string | null;
  window_end_utc?: string | null;
  window_basis?: string | null;
  /** Per-provider outcomes — a named skip is a result, not an error. */
  providers?: {
    provider?: string;
    fetched?: boolean;
    articles?: number;
    new_to_merge?: number;
    truncated?: boolean;
    reason?: string | null;
  }[];
  /** Verbatim server wording for a fetch that stored nothing. */
  reason?: string | null;
}

/* ------------------------------------------------------- Phase F (§46-§52)
 *
 * The event analysis payload: an EVIDENCE BUNDLE the backend computed and an
 * LLM NARRATIVE written over it, kept as two separate objects on the wire so
 * §49's "never mix them invisibly" survives serialization rather than
 * depending on the UI to remember which half was generated.
 *
 * Every field below is optional. Not laziness — the tab renders whatever the
 * server actually sent, and a shape that DEMANDS a key would turn a partial
 * answer (bundle stored, LLM failed) into a blank screen. `status` is what
 * tells the reader which half is trustworthy; the types never assert it.
 */

/** §49's three provenance tiers, plus the §70 tier for a stored prior opinion. */
export type EvidenceTier = "DATA" | "QUANT" | "LLM" | "LLM_PRIOR";

/**
 * §33 — the consensus block. The platform subscribes to no estimate
 * provider, so this is ALWAYS the unavailable marker: the one number a
 * reader most expects is the one nobody may invent.
 */
export interface EvidenceConsensus {
  status?: string;
  reason?: string | null;
  [k: string]: unknown;
}

/**
 * One section of the bundle. `tier` is DATA or QUANT (never LLM — the
 * narrative lives in `analysis`), and `coverage` says what the section could
 * NOT see, which is the part a confident-looking section otherwise hides.
 */
export interface EvidenceSection {
  tier?: EvidenceTier | string;
  coverage?: unknown;
  available?: boolean;
  reason?: string | null;
  [k: string]: unknown;
}

/** §69/§70 — a previously stored analysis, summarised. An OPINION, not evidence. */
export interface PriorAnalysisSummary {
  id?: number;
  event_id?: number;
  event_key?: string | null;
  as_of?: string | null;
  regime?: string | null;
  confidence?: string | null;
  executive_summary?: string | null;
  status?: string | null;
  created_at?: string | null;
  [k: string]: unknown;
}

/**
 * The §46 EventEvidenceBundle as it arrives on the wire.
 *
 * Indexed rather than exhaustively typed: U1 owns the section list and may
 * add sections (macro_context, peer_context, options_analysis) without the
 * UI needing a type change to keep rendering them.
 */
export interface EvidenceBundle {
  event?: Record<string, unknown>;
  as_of?: string | null;
  consensus?: EvidenceConsensus;
  prior_analyses?: PriorAnalysisSummary[];
  source_metadata?: Record<string, unknown>[];
  [k: string]: unknown;
}

/** §51 — one scenario leg. `conditions` is the trigger, not a probability. */
export interface AnalysisScenario {
  conditions?: string | null;
  guidance_conditions?: string | null;
  why_market_reacts?: string | null;
  evidence_refs?: string[];
  [k: string]: unknown;
}

/** §50 — the surprise threshold, with an explicitly NON-probabilistic confidence. */
export interface AnalysisSurpriseThreshold {
  narrative?: string | null;
  confidence?: string | null;
}

/**
 * §47's audit trail: every number the narrative uses, with the bundle path it
 * was quoted FROM. The validator checks these against the bundle's own fact
 * index — an entry whose path or value does not reproduce is a violation, and
 * the tab shows the violations rather than hiding a failed check.
 */
export interface AnalysisNumberQuote {
  path?: string;
  value?: number | string | null;
}

/** §48 — the LLM's structured output. Narrative only; it computes nothing. */
export interface EventAnalysisBody {
  executive_summary?: string | null;
  what_happened_last_time?: string | null;
  what_changed_since?: string | null;
  fundamental_developments?: string | null;
  price_and_positioning?: string | null;
  market_expectations?: string | null;
  /** v2: sourced-language narrative about prediction-market PRICING. null is
      the honest answer when the bundle carried no matched market. */
  prediction_market_expectations?: string | null;
  key_positive_catalysts?: string[];
  /** v2: named disagreements BETWEEN evidence layers — reported, never
      averaged into one view. May honestly be empty. */
  evidence_conflicts?: {
    layer_a?: string;
    layer_b?: string;
    description?: string;
    evidence_refs?: string[];
  }[];
  /** v2: accepted web documents the note leans on (web: keys only). */
  web_research_highlights?: { evidence_ref?: string; why_material?: string }[];
  key_negative_catalysts?: string[];
  what_matters_most?: string | null;
  scenarios?: {
    upside?: AnalysisScenario;
    base?: AnalysisScenario;
    downside?: AnalysisScenario;
    [k: string]: AnalysisScenario | undefined;
  };
  surprise_threshold?: AnalysisSurpriseThreshold;
  key_unknowns?: string[];
  invalidation?: string | null;
  expectations_gap_regime?: string | null;
  confidence?: string | null;
  evidence_refs?: string[];
  numbers_quoted?: AnalysisNumberQuote[];
  [k: string]: unknown;
}

/**
 * `GET|POST /api/events/{id}/analysis` — bundle + narrative + provenance.
 *
 * `status` is the honest verdict on the pair:
 *   OK           — the narrative validated against the bundle.
 *   INVALID      — it did not; `violations` names each failure and the
 *                  narrative is still shown, labelled, for transparency.
 *   FAILED       — the provider errored; the BUNDLE is still here and is
 *                  still worth reading. Deliberately a 200, not a 5xx.
 *   BUNDLE_ONLY  — no narrative was requested.
 */
export interface EventAnalysisPayload {
  event_id?: number;
  as_of?: string | null;
  kind?: string | null;
  status?: "OK" | "INVALID" | "FAILED" | "BUNDLE_ONLY" | string;
  /** True when the row was reused: the same bundle digest, model and prompt. */
  cached?: boolean;
  bundle?: EvidenceBundle | null;
  /** Null on BUNDLE_ONLY and on FAILED — never a placeholder narrative. */
  analysis?: EventAnalysisBody | null;
  provider?: string | null;
  model?: string | null;
  prompt_version?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number; [k: string]: unknown } | null;
  latency_ms?: number | null;
  /** Verbatim validator findings (§47). Empty on OK. */
  violations?: string[];
  error?: string | null;
  created_at?: string | null;
  /** Set when the event's own date is DERIVED rather than confirmed (§7). */
  /** Event date-status block (§7): the reader must know a DERIVED date is
   *  not confirmed. The backend sends a struct; legacy rows may be a bare
   *  string. Render via eventStatusBadge() — never directly. */
  event_status_badge?:
    | {
        status: string;
        is_estimated: boolean;
        source: string | null;
        source_name: string | null;
        note: string | null;
      }
    | string
    | null;
  /**
   * Present on a GET when the payload is the last GOOD analysis but a NEWER
   * run failed. The analysis is still served — a timeout must not cost the
   * reader research the platform still has — and this says, honestly, that
   * what they are reading may be stale and why the refresh did not land.
   * Absent (not null) when the newest row IS this one.
   */
  last_attempt?: AnalysisAttempt;
  /**
   * Present on a FAILED/INVALID POST when an OK analysis exists for the
   * event. A POINTER, never the package: inlining it would let a client
   * render an older answer as the answer to the question just asked.
   */
  last_good?: { id: number; created_at?: string | null; as_of?: string | null; status?: string };
  [k: string]: unknown;
}

/** The newer run that did not land, shown alongside the analysis it failed to replace. */
export interface AnalysisAttempt {
  id?: number;
  status?: "FAILED" | "INVALID" | string;
  error?: string | null;
  created_at?: string | null;
  as_of?: string | null;
  provider?: string | null;
  model?: string | null;
}

/** `GET /api/events/{id}/analyses` — the §69 event-memory list. */
export interface EventAnalysisHistory {
  items?: PriorAnalysisSummary[];
}

/* ------------------------------------------------- §54 card summaries (J) */

/**
 * The four-line research digest a calendar card carries when the feed was
 * asked for it (`GET /api/events?summaries=true`).
 *
 * The whole object is OPTIONAL on `EventRow` and every metric inside it is
 * nullable, and those two absences mean different things — which is the only
 * reason this type exists rather than four loose fields:
 *
 *  - `summary` ABSENT means the CALLER did not ask for summaries. The card
 *    renders nothing at all; a "—" there would claim the platform looked and
 *    found nothing, when in fact it never looked.
 *  - `summary` PRESENT with a null metric means the platform DID look and has
 *    no number. That renders as "—", because a silently dropped row would let
 *    an event with no option history look identical to one that was never
 *    queried.
 *
 * `analysis_status` is the SERVER's verdict, not a client derivation from
 * `analysis_as_of`: STALE is "an OK analysis exists but its as-of has aged
 * past the freshness window", and a client re-deriving that from a timestamp
 * would drift from the server's own window the first time it changed.
 */
export interface EventCardSummary {
  /**
   * READY — an OK analysis exists inside the freshness window.
   * STALE — one exists but it is older than the window.
   * NONE — none has ever run OK for this event.
   * Widened with `string` so a server that adds a fourth state renders it
   * verbatim rather than making the card unrenderable.
   */
  analysis_status: "READY" | "STALE" | "NONE" | string;
  /** As-of of the analysis behind `analysis_status`; null when NONE. */
  analysis_as_of?: string | null;
  /** Row id of that analysis, so a card can deep-link the exact run. */
  analysis_id?: number | null;
  /**
   * Latest stored implied move for THIS event, as a FRACTION (0.062 = 6.2%).
   * Option-market pricing, never a forecast — the card must say so wherever
   * it prints this.
   */
  implied_move_pct?: number | null;
  /**
   * Which measurement `implied_move_pct` is (a live chain snapshot and a
   * reconstruction from daily closes are not the same reading). Rendered as a
   * badge beside the number, never dropped.
   */
  implied_move_basis?: string | null;
  /** When that implied reading was taken — a stale quote is not a live one. */
  implied_move_as_of?: string | null;
  /**
   * The server's own "option-market pricing, not a forecast" sentence. Prefer
   * it over hardcoded copy so the disclaimer has ONE author: if the wording is
   * ever tightened it is tightened server-side and every surface follows.
   */
  implied_move_note?: string | null;
  /** Median |actual move| over the prior comparable events, as a FRACTION. */
  historical_move_median_abs?: number | null;
  /** Sample size behind the median (§64) — travels with it or neither shows. */
  historical_move_n?: number | null;
  /** The immediately previous comparable event's realized move, SIGNED. */
  previous_event_actual_move_pct?: number | null;
}
