/**
 * NotOnWatchlistBanner (2026-08-20, §4.2 amended): research is open — the
 * banner only offers tracking + backtest eligibility. Pins:
 *  1. The banner states research works right here and what adding actually
 *     adds (tracking + backtests) — no false "unlock" claims for open
 *     surfaces.
 *  2. Add flows through a research-only ConfirmDialog to POST /api/watchlist.
 *  3. 409 (already added elsewhere) recovers silently — no stuck modal.
 *  4. Pending recommendations surface as a hint linking to /recommendations.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/shared/Toast";
import NotOnWatchlistBanner from "./NotOnWatchlistBanner";

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

const calls: { url: string; method: string; status?: number }[] = [];
function stubFetch(opts: { recs?: unknown[]; addStatus?: number } = {}) {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      calls.push({ url: url.pathname, method });
      if (url.pathname === "/api/recommendations" && method === "GET") {
        return { ok: true, status: 200, json: async () => opts.recs ?? [] } as Response;
      }
      if (url.pathname === "/api/watchlist" && method === "POST") {
        const status = opts.addStatus ?? 200;
        return {
          ok: status < 400,
          status,
          statusText: String(status),
          json: async () =>
            status < 400 ? { ticker: "AMZN" } : { detail: "AMZN already on watchlist" },
        } as Response;
      }
      return { ok: false, status: 404, statusText: "nope", json: async () => ({ detail: "nope" }) } as Response;
    }),
  );
}

beforeEach(() => vi.unstubAllGlobals());

function renderBanner() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <ToastProvider>
            <NotOnWatchlistBanner ticker="AMZN" />
          </ToastProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("banner honesty", () => {
  it("says research works here; adding = tracking + backtests, not read access", async () => {
    stubFetch();
    renderBanner();
    expect(await screen.findByText(/You can research AMZN fully right here/)).toBeTruthy();
    expect(screen.getByText(/unlocks backtests/)).toBeTruthy();
  });

  it("pending recommendations surface as a hint", async () => {
    stubFetch({
      recs: [{ id: 1, ticker: "AMZN", status: "PENDING" }, { id: 2, ticker: "TSLA", status: "PENDING" }],
    });
    renderBanner();
    expect(await screen.findByText(/1 pending recommendation for this symbol/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Recommendations page" }).getAttribute("href")).toBe(
      "/research?tab=recommendations",
    );
  });
});

describe("add flow", () => {
  it("research-only dialog → POST /api/watchlist", async () => {
    stubFetch();
    renderBanner();
    await userEvent.click(await screen.findByRole("button", { name: "Add to Watchlist" }));
    expect(await screen.findByText(/starts continuous tracking only/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url === "/api/watchlist" && c.method === "POST")).toBe(true);
    });
  });

  it("409 recovers silently — dialog unmounts, no error shown", async () => {
    stubFetch({ addStatus: 409 });
    renderBanner();
    await userEvent.click(await screen.findByRole("button", { name: "Add to Watchlist" }));
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    await vi.waitFor(() => {
      expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    });
    expect(screen.queryByText(/already on watchlist/)).toBeNull();
  });
});
