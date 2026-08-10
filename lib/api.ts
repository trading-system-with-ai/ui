import type {
  AuditEvent,
  BacktestParams,
  BacktestRecord,
  BacktestSummary,
  MarketOverview,
  SymbolAnalysis,
  TradingPoolItem,
  TradingStatus,
  WatchlistItem,
  WatchlistOverviewItem,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, detail);
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
  audit: {
    list: (entityId?: string) =>
      request<AuditEvent[]>(
        `/api/audit${entityId ? `?entity_id=${encodeURIComponent(entityId)}` : ""}`,
      ),
  },
};
