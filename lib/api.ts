import type {
  Alert,
  AuditActorType,
  AuditEvent,
  BacktestParams,
  BacktestRecord,
  BacktestSummary,
  BarsResponse,
  CheckExitsResult,
  MarketOverview,
  OptionChainResponse,
  OptionDirection,
  OrderApproveResult,
  OrderCloseResult,
  OrderPreview,
  PlatformConfig,
  PortfolioRisk,
  PositionMonitorStatus,
  PositionRow,
  PositionStatus,
  Recommendation,
  RecommendationPromoteResult,
  RecommendationRefreshResult,
  RecommendationStatus,
  StrategyHealth,
  SymbolAnalysis,
  TradingPoolItem,
  TradingPoolPromoteResult,
  TradingStatus,
  WatchlistItem,
  WatchlistOverviewItem,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  /** Structured `detail` body when the server sent one (e.g. approve 422 embeds a preview). */
  detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    let detail: unknown;
    try {
      const body = await res.json();
      detail = body.detail;
      message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, message, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  watchlist: {
    list: () => request<WatchlistItem[]>("/api/watchlist"),
    add: (ticker: string, note = "") =>
      request<WatchlistItem>("/api/watchlist", {
        method: "POST",
        body: JSON.stringify({ ticker, note }),
      }),
    remove: (ticker: string) =>
      request<void>(`/api/watchlist/${ticker}`, { method: "DELETE" }),
    analysis: (ticker: string) =>
      request<SymbolAnalysis>(`/api/watchlist/${encodeURIComponent(ticker)}/analysis`),
    /** Most recent `limit` daily OHLCV bars (10..600, server default 250), oldest first. */
    bars: (ticker: string, limit?: number) =>
      request<BarsResponse>(
        `/api/watchlist/${encodeURIComponent(ticker)}/bars${limit != null ? `?limit=${limit}` : ""}`,
      ),
    /**
     * §34 read-only research chain (no audit event). `direction` defaults to
     * AUTO server-side, so it is only sent when explicitly non-AUTO.
     */
    options: (ticker: string, direction?: OptionDirection) =>
      request<OptionChainResponse>(
        `/api/watchlist/${encodeURIComponent(ticker)}/options${
          direction != null && direction !== "AUTO" ? `?direction=${direction}` : ""
        }`,
      ),
    overview: () => request<WatchlistOverviewItem[]>("/api/watchlist/overview"),
  },
  backtests: {
    run: (ticker: string, params?: Partial<BacktestParams>) =>
      request<BacktestRecord>("/api/backtests", {
        method: "POST",
        body: JSON.stringify(params ? { ticker, params } : { ticker }),
      }),
    list: (ticker?: string, limit?: number) => {
      const qs = new URLSearchParams();
      if (ticker) qs.set("ticker", ticker);
      if (limit != null) qs.set("limit", String(limit));
      const q = qs.toString();
      return request<BacktestSummary[]>(`/api/backtests${q ? `?${q}` : ""}`);
    },
    get: (id: number) => request<BacktestRecord>(`/api/backtests/${id}`),
  },
  tradingPool: {
    list: () => request<TradingPoolItem[]>("/api/trading-pool"),
    /**
     * §4.3 promote — the server evaluates the promotion checks (MIN_HISTORY,
     * BACKTEST_COMPLETED, OOS_STATS, LIQUIDITY stub) in order. All passed (or
     * acknowledgeRisks true) -> 201 with promotion_checks + risks_acknowledged;
     * any failure without acknowledgement -> 422 whose `detail` is a
     * PromotionCheckErrorDetail. Either way the TRADING_POOL_ADD audit event
     * permanently records the checks and the acknowledged flag (§38).
     */
    promote: (ticker: string, acknowledgeRisks = false) =>
      request<TradingPoolPromoteResult>("/api/trading-pool", {
        method: "POST",
        body: JSON.stringify({
          ticker,
          ...(acknowledgeRisks ? { acknowledge_risks: true } : {}),
        }),
      }),
    toggle: (ticker: string, enabled: boolean) =>
      request<TradingPoolItem>(`/api/trading-pool/${ticker}/trading`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    remove: (ticker: string) =>
      request<void>(`/api/trading-pool/${ticker}`, { method: "DELETE" }),
  },
  trading: {
    status: () => request<TradingStatus>("/api/trading/status"),
    pause: (reason: string) =>
      request<TradingStatus>("/api/trading/pause", {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    resume: () =>
      request<TradingStatus>("/api/trading/resume", { method: "POST" }),
  },
  market: {
    overview: () => request<MarketOverview>("/api/market/overview"),
  },
  portfolio: {
    risk: () => request<PortfolioRisk>("/api/portfolio/risk"),
  },
  orders: {
    preview: (ticker: string, quantity?: number) =>
      request<OrderPreview>("/api/orders/preview", {
        method: "POST",
        body: JSON.stringify(quantity != null ? { ticker, quantity } : { ticker }),
      }),
    /**
     * Approve & execute a paper BUY. The server re-runs the FULL gate chain
     * (client previews are never trusted) — a 422 embeds the fresh preview as
     * OrderApproveErrorDetail; 409 means an open position already exists (no
     * pyramiding in V1). `clientOrderId` is an idempotency key (§42): the same
     * key returns the existing order instead of filling twice.
     */
    approve: (ticker: string, quantity?: number, clientOrderId?: string) =>
      request<OrderApproveResult>("/api/orders/approve", {
        method: "POST",
        body: JSON.stringify({
          ticker,
          ...(quantity != null ? { quantity } : {}),
          ...(clientOrderId != null ? { client_order_id: clientOrderId } : {}),
        }),
      }),
    /**
     * Close (fully or partially) a paper position. Allowed even while global
     * trading is paused — closing reduces risk (§18 risk-priority).
     */
    close: (ticker: string, quantity?: number, reason?: string) =>
      request<OrderCloseResult>("/api/orders/close", {
        method: "POST",
        body: JSON.stringify({
          ticker,
          ...(quantity != null ? { quantity } : {}),
          ...(reason != null ? { reason } : {}),
        }),
      }),
  },
  positions: {
    list: (status?: PositionStatus | "ALL") =>
      request<PositionRow[]>(`/api/positions${status ? `?status=${status}` : ""}`),
    checkExits: () =>
      request<CheckExitsResult>("/api/positions/check-exits", { method: "POST" }),
    /** Status of the automated exit-sweep monitor (read-only). */
    monitorStatus: () =>
      request<PositionMonitorStatus>("/api/positions/monitor"),
  },
  alerts: {
    /**
     * Newest-first severity-classified alerts (§29). `limit` 1..200, server
     * default 50. Read-only — fetching alerts writes no audit events.
     */
    list: (limit?: number) =>
      request<Alert[]>(`/api/alerts${limit != null ? `?limit=${limit}` : ""}`),
  },
  audit: {
    /** All provided filters combine with AND semantics on the server. */
    list: (entityId?: string, action?: string, actorType?: AuditActorType) => {
      const qs = new URLSearchParams();
      if (entityId) qs.set("entity_id", entityId);
      if (action) qs.set("action", action);
      if (actorType) qs.set("actor_type", actorType);
      const q = qs.toString();
      return request<AuditEvent[]>(`/api/audit${q ? `?${q}` : ""}`);
    },
    /** Sorted DISTINCT action values present in the audit table (for filter chips). */
    actions: () => request<string[]>("/api/audit/actions"),
  },
  recommendations: {
    /** Server default is PENDING when no status is given. */
    list: (status?: RecommendationStatus | "ALL") =>
      request<Recommendation[]>(
        `/api/recommendations${status ? `?status=${status}` : ""}`,
      ),
    /** Generate from the configured provider; skips tickers already on the Watchlist or already PENDING. */
    refresh: () =>
      request<RecommendationRefreshResult>("/api/recommendations/refresh", {
        method: "POST",
      }),
    dismiss: (id: number) =>
      request<Recommendation>(`/api/recommendations/${id}/dismiss`, {
        method: "POST",
      }),
    /**
     * The ONLY recommendation→watchlist path — an explicit USER action. 409 if
     * the ticker is already on the watchlist or the row is not PENDING.
     */
    promote: (id: number) =>
      request<RecommendationPromoteResult>(`/api/recommendations/${id}/promote`, {
        method: "POST",
      }),
  },
  health: {
    strategy: () => request<StrategyHealth>("/api/health/strategy"),
  },
  config: {
    /** Read-only engine configuration (§44 rule 2 made visible); no secret material. */
    get: () => request<PlatformConfig>("/api/config"),
  },
};
