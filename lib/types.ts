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
