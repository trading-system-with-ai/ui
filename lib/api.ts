import type {
  AuditEvent,
  BacktestParams,
  BacktestRecord,
  BacktestSummary,
  CheckExitsResult,
  MarketOverview,
  OrderApproveResult,
  OrderCloseResult,
  OrderPreview,
  PortfolioRisk,
  PositionRow,
  PositionStatus,
  SymbolAnalysis,
  TradingPoolItem,
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
    promote: (ticker: string) =>
      request<TradingPoolItem>("/api/trading-pool", {
        method: "POST",
        body: JSON.stringify({ ticker }),
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
  },
  audit: {
    list: (entityId?: string) =>
      request<AuditEvent[]>(
        `/api/audit${entityId ? `?entity_id=${encodeURIComponent(entityId)}` : ""}`,
      ),
  },
};
