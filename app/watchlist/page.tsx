"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { OPPORTUNITY_BADGE } from "@/lib/risk-format";

function backtestBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("FAIL")) return "red";
  if (s.includes("COMPLET") || s.includes("PASS")) return "green";
  if (s.includes("RUN") || s.includes("PEND")) return "amber";
  return "dim";
}

function edgeColor(v: number): string {
  if (v > 0) return "var(--green)";
  if (v < 0) return "var(--red)";
  return "var(--text-dim)";
}

export default function WatchlistPage() {
  const qc = useQueryClient();
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState("");

  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist.list });
  const pool = useQuery({ queryKey: ["trading-pool"], queryFn: api.tradingPool.list });
  const overview = useQuery({
    queryKey: ["watchlist-overview"],
    queryFn: api.watchlist.overview,
  });
  const poolTickers = new Set(pool.data?.map((p) => p.ticker));
  const overviewMap = new Map(overview.data?.map((o) => [o.ticker, o]) ?? []);
  // While the overview is still loading, fall back to a plain list: research
  // cells render a dim placeholder but add/remove/promote stay usable.
  const placeholder = overview.isPending ? "…" : "—";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["watchlist"] });
    qc.invalidateQueries({ queryKey: ["watchlist-overview"] });
    qc.invalidateQueries({ queryKey: ["trading-pool"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const add = useMutation({
    mutationFn: () => api.watchlist.add(ticker),
    onSuccess: () => {
      setTicker("");
      setError("");
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (t: string) => api.watchlist.remove(t),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const promote = useMutation({
    mutationFn: (t: string) => api.tradingPool.promote(t),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  return (
    <>
      <h1>Watchlist</h1>
      <p className="subtitle">
        Only you can add or remove symbols. Data download and research start after a symbol
        joins the Watchlist — the Watchlist itself can never trade.
      </p>

      <div className="panel">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (ticker.trim()) add.mutate();
          }}
        >
          <input
            type="text"
            placeholder="TICKER"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            maxLength={10}
          />
          <button type="submit" className="primary" disabled={add.isPending || !ticker.trim()}>
            Add to Watchlist
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="panel">
        <h2>Symbols ({watchlist.data?.length ?? 0})</h2>
        {overview.isError && (
          <p className="error" style={{ marginTop: 0, marginBottom: 8 }}>
            Research columns unavailable: {overview.error.message}
          </p>
        )}
        {watchlist.data && watchlist.data.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th className="num">Price</th>
                  <th>Regime</th>
                  <th className="num">Edge</th>
                  <th>Bias</th>
                  <th>Opportunity</th>
                  <th>Backtest</th>
                  <th>Pool status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.data.map((w) => {
                  const o = overviewMap.get(w.ticker);
                  return (
                    <tr key={w.ticker}>
                      <td className="ticker">{w.ticker}</td>
                      <td className="num">
                        {o?.price != null ? (
                          `$${o.price.toFixed(2)}`
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>{placeholder}</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {o?.regime ?? <span style={{ color: "var(--text-dim)" }}>{placeholder}</span>}
                      </td>
                      <td className="num">
                        {o?.directional_edge != null ? (
                          <span style={{ color: edgeColor(o.directional_edge) }}>
                            {o.directional_edge > 0 ? "+" : ""}
                            {o.directional_edge.toFixed(1)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>{placeholder}</span>
                        )}
                      </td>
                      <td>
                        {o?.bias ? (
                          <span className={`badge ${o.bias.toLowerCase()}`}>{o.bias}</span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>{placeholder}</span>
                        )}
                      </td>
                      <td>
                        {o?.opportunity_status ? (
                          <span
                            className={`badge ${OPPORTUNITY_BADGE[o.opportunity_status] ?? "dim"}`}
                          >
                            {o.opportunity_status.replace(/_/g, " ")}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>{placeholder}</span>
                        )}
                      </td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          {o?.backtest_status ? (
                            <span className={`badge ${backtestBadgeClass(o.backtest_status)}`}>
                              {o.backtest_status.replace(/_/g, " ")}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-dim)" }}>{placeholder}</span>
                          )}
                          {o?.last_backtest_id != null && (
                            <Link
                              href={`/backtests?id=${o.last_backtest_id}`}
                              style={{ color: "var(--accent)" }}
                            >
                              View
                            </Link>
                          )}
                        </span>
                      </td>
                      <td>
                        {poolTickers.has(w.ticker) ? (
                          <span className="badge on">IN TRADING POOL</span>
                        ) : (
                          <span className="badge off">RESEARCH ONLY</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="row" style={{ justifyContent: "flex-end" }}>
                          <Link href={`/watchlist/${encodeURIComponent(w.ticker)}`} className="btn">
                            Analyze
                          </Link>
                          {!poolTickers.has(w.ticker) && (
                            <button
                              onClick={() => promote.mutate(w.ticker)}
                              disabled={promote.isPending}
                            >
                              Promote to Trading Pool
                            </button>
                          )}
                          <button
                            className="danger"
                            onClick={() => {
                              if (
                                confirm(
                                  `Remove ${w.ticker} from Watchlist? This also revokes any Trading Pool authorization.`,
                                )
                              ) {
                                remove.mutate(w.ticker);
                              }
                            }}
                          >
                            Remove
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Watchlist is empty. Add a ticker above to begin research.</p>
        )}
      </div>
    </>
  );
}
