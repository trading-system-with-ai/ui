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
 * OOS_STATS (latest COMPLETED backtest has >= 1 out-of-sample trade), and
 * LIQUIDITY (documented stub — always passed until the Massive integration).
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
  detail: string;
}

export interface AnalysisSignal {
  bull_score: number;
  bear_score: number;
  directional_edge: number;
  bias: "BULL" | "BEAR" | "NEUTRAL";
  components: SignalComponent[];
}

export interface AnalysisSeries {
  dates: string[];
  close: number[];
  sma20: (number | null)[];
  sma50: (number | null)[];
}

export interface SymbolAnalysis {
  ticker: string;
  as_of: string;
  source: string;
  bars: { count: number; first: string; last: string };
  price: number;
  indicators: AnalysisIndicators;
  regime: AnalysisRegime;
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
  bid: number;
  ask: number;
  mid: number;
  /** (ask - bid) / mid, as a fraction. */
  spread_pct: number;
  last: number;
  volume: number;
  open_interest: number;
  /** Implied vol (fraction). */
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
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
  oos_split: number;
  warmup_bars: number;
}

export interface BacktestSegmentMetrics {
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
  oos_start_date: string | null;
  metrics: {
    full: BacktestSegmentMetrics;
    in_sample: BacktestSegmentMetrics;
    out_of_sample: BacktestSegmentMetrics;
  };
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
  oos_start_date: string | null;
  /** §20.2 fill model; absent/null on rows that predate the field — treat as CONSERVATIVE. */
  fill_model?: FillModel | null;
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

export interface PortfolioRisk {
  as_of: string;
  nav: number;
  cash: number;
  cash_pct: number;
  market_regime: string;
  cash_floor_pct: number;
  trading_enabled: boolean;
  portfolio_heat_pct: number;
  heat_state: HeatState;
  max_new_risk_usd: number;
  max_new_risk_pct: number;
  positions: RiskPosition[];
  buckets: RiskBucket[];
  limits: RiskLimits;
  greeks: PortfolioGreeks;
  vol_targeting: VolTargeting;
}

/* ---------------------------------------------------------------- order preview */

export type GateName =
  | "TRADING_POOL_AUTHORIZATION"
  | "DATA_QUALITY"
  | "REGIME"
  | "DIRECTIONAL_SIGNAL"
  | "VOLATILITY"
  | "INSTRUMENT"
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
  /** YYYY-MM-DD */
  expiry: string;
  dte: number;
  strike: number;
  right: OptionRight;
  mid: number;
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
}

export interface OrderPreview {
  ticker: string;
  as_of: string;
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
  why_trade: string[];
  why_not_trade: string[];
}

/* ---------------------------------------------------------------- paper orders & positions */

export type OrderSide = "BUY_TO_OPEN" | "SELL_TO_CLOSE";

/**
 * A filled paper order. Paper fill model (constants shared with server settings):
 *   BUY fill  = last stored close * (1 + paper_slippage_bps / 10000)
 *   SELL fill = last stored close * (1 - paper_slippage_bps / 10000)
 *   commission = paper_commission_per_share * quantity, charged both ways.
 */
export interface PaperOrder {
  id: number;
  client_order_id: string | null;
  ticker: string;
  side: OrderSide;
  quantity: number;
  fill_price: number;
  commission: number;
  status: "FILLED";
  created_at: string;
}

export interface OrderPositionSummary {
  id: number;
  ticker: string;
  quantity: number;
  avg_price: number;
  stop_price: number;
  max_loss: number;
}

export interface OrderApproveResult {
  order: PaperOrder;
  position: OrderPositionSummary;
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
  stop_price: number;
  trail_price: number | null;
  entry_edge: number;
  current_edge: number | null;
  /** entry_edge - current_edge (positive = the signal has weakened since entry). */
  signal_decay: number | null;
  bars_held: number | null;
  time_stop_remaining: number | null;
  exit_status: ExitStatus | null;
  exit_reasons: string[];
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

/* ---------------------------------------------------------------- recommendations */

export type RecommendationStatus = "PENDING" | "DISMISSED" | "PROMOTED";

export interface RecommendationEvidence {
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

export interface RecommendationRefreshResult {
  created: Recommendation[];
  skipped: RecommendationSkip[];
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
 * §5 account permission flags. Short stock deliberately has NO flag — it
 * does not exist in this system, so the UI renders it as a hardcoded
 * BLOCKED row rather than a configurable value.
 */
export interface AccountPermissions {
  long_stock: boolean;
  long_call: boolean;
  long_put: boolean;
  defined_risk_spreads: boolean;
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
  providers: {
    market_data: string;
    llm: string;
    llm_model: string;
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
