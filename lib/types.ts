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
