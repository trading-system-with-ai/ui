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

/* ---------------------------------------------------------------- backtests */

export interface BacktestParams {
  position_pct: number;
  commission_per_share: number;
  slippage_bps: number;
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

export interface RiskBucket {
  name: string;
  tickers: string[];
  risk_usd: number;
  risk_pct: number;
  cap_pct: number;
  utilization_pct: number;
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
    instrument: "LONG_STOCK";
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

/**
 * §37 — a position row always carries WHY the system is still holding
 * (exit_status + exit_reasons). Nulls mean data is missing or the row is CLOSED.
 */
export interface PositionRow {
  id: number;
  ticker: string;
  status: PositionStatus;
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

export interface AuditEvent {
  id: number;
  ts: string;
  actor_type: "USER" | "SYSTEM" | "LLM";
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  correlation_id: string;
}
