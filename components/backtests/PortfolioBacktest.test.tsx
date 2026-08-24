/**
 * Portfolio panel render tests (verifier findings 2026-08-20 pinned):
 *  1. skip-filter is applied BEFORE the 15-row cap — a journal whose first
 *     15 entries are all SKIP still shows non-skip rows by default.
 *  2. legacy rows (pre-029: journal=[] advice=[]) render the honest
 *     "predates the feature" copy, never "nothing rose to advice".
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/shared/Toast";
import type { PortfolioBacktestRecord } from "@/lib/types";
import PortfolioBacktestPanel from "./PortfolioBacktest";

const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
});
afterEach(() => {
  cleanup();
  store.clear();
});
beforeEach(() => vi.unstubAllGlobals());

function record(overrides: Partial<PortfolioBacktestRecord>): PortfolioBacktestRecord {
  return {
    id: 9,
    tickers: ["AAA"],
    created_at: "2026-08-20T00:00:00Z",
    status: "COMPLETED",
    params: {},
    metrics: {
      total_return_pct: 1.0, cagr_pct: null, sharpe: null, sortino: null,
      max_drawdown_pct: -2.0, win_rate: null, profit_factor: null,
      expectancy_pct: null, avg_trade_pct: null, avg_hold_bars: null,
      num_trades: 1, exposure_pct: 10.0,
    },
    trades: [],
    equity_curve: { dates: ["2026-08-01"], equity: [100000], drawdown: [0] },
    allocations: { dates: ["2026-08-01"], by_symbol: [{}], cash_pct: [100] },
    decisions: [],
    journal: [],
    advice: [],
    error: "",
    ...overrides,
  };
}

function stub(rec: PortfolioBacktestRecord) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/backtests/portfolio") {
        return { ok: true, status: 200, json: async () => [rec] } as Response;
      }
      return { ok: false, status: 404, statusText: "nope", json: async () => ({ detail: "x" }) } as Response;
    }),
  );
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <ToastProvider>
            <PortfolioBacktestPanel />
          </ToastProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

const skipEvent = (i: number) => ({
  date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
  ticker: "AAA", action: "SKIP" as const, instrument: "LONG_STOCK",
  quantity: 0, price: null, reason: `contention: max_positions reached #${i}`,
  sizing: "", cash_after: 100000, equity_prev: 100000,
});

describe("journal cap/filter interaction", () => {
  it("first 15 all-SKIP entries do not blank the default view", async () => {
    const journal = [
      ...Array.from({ length: 20 }, (_, i) => skipEvent(i)),
      {
        date: "2026-08-01", ticker: "AAA", action: "ENTER" as const,
        instrument: "LONG_STOCK", quantity: 87, price: 242.04,
        reason: "AUTO[...]", sizing: "tier MODERATE budget 0.75% ...",
        cash_after: 78000, equity_prev: 100000,
      },
    ];
    stub(record({ journal }));
    renderPanel();
    // the ENTER row must be visible by default despite 20 leading SKIPs
    expect(await screen.findByText("87 @ 242.04")).toBeTruthy();
  });
});

describe("legacy empty states", () => {
  it("pre-029 rows say the run predates the feature — no false all-clear", async () => {
    stub(record({ journal: [], advice: [] }));
    renderPanel();
    expect(
      await screen.findByText(/predates the risk-advice feature/),
    ).toBeTruthy();
    expect(screen.queryByText(/Nothing rose to advice/)).toBeNull();
    expect(screen.getByText(/predates the explainability feature/)).toBeTruthy();
  });
});
