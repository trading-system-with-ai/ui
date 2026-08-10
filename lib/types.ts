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
