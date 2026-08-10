import type { AuditEvent, TradingPoolItem, WatchlistItem } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

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
    throw new Error(detail);
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
  audit: {
    list: (entityId?: string) =>
      request<AuditEvent[]>(
        `/api/audit${entityId ? `?entity_id=${encodeURIComponent(entityId)}` : ""}`,
      ),
  },
};
