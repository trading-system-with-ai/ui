"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import { OPPORTUNITY_BADGE } from "@/lib/risk-format";
import type { PromotionCheck, PromotionCheckErrorDetail } from "@/lib/types";

/** Narrow the 422 `detail` from POST /api/trading-pool to the §4.3 checks shape. */
function isPromotionCheckFailure(detail: unknown): detail is PromotionCheckErrorDetail {
  return (
    typeof detail === "object" &&
    detail !== null &&
    Array.isArray((detail as { checks?: unknown }).checks)
  );
}

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
  /** §4.3 — the ticker whose promotion checks failed, with the checks to review. */
  const [checkFailure, setCheckFailure] = useState<{
    ticker: string;
    checks: PromotionCheck[];
  } | null>(null);
  const [promoteNote, setPromoteNote] = useState<{
    ticker: string;
    risksAcknowledged: boolean;
  } | null>(null);

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

  // §4.3 promote flow: always try WITHOUT acknowledgement first. A 422 whose
  // detail carries the checks opens the review panel below the table; the
  // danger action there retries with acknowledge=true (permanently audited).
  const promote = useMutation({
    mutationFn: ({ ticker, acknowledge }: { ticker: string; acknowledge?: boolean }) =>
      api.tradingPool.promote(ticker, acknowledge),
    onSuccess: (res) => {
      setCheckFailure(null);
      setError("");
      setPromoteNote({
        ticker: res.ticker,
        risksAcknowledged: res.risks_acknowledged === true,
      });
      invalidate();
    },
    onError: (e: Error, vars) => {
      if (e instanceof ApiError && e.status === 422 && isPromotionCheckFailure(e.detail)) {
        setPromoteNote(null);
        setError("");
        setCheckFailure({ ticker: vars.ticker, checks: e.detail.checks });
      } else {
        setError(e.message);
      }
    },
  });

  const acknowledgeAndPromote = (failure: { ticker: string; checks: PromotionCheck[] }) => {
    const failed = failure.checks.filter((c) => !c.passed).map((c) => c.name);
    const ok = confirm(
      `Acknowledge risks and promote ${failure.ticker} anyway?\n\n` +
        `Failed checks: ${failed.length > 0 ? failed.join(", ") : "none"}.\n\n` +
        `Per §4.3, this override — including the full list of failed checks — is ` +
        `permanently recorded in the TRADING_POOL_ADD audit trail (§38). ` +
        `The acknowledgement cannot be hidden or removed later.`,
    );
    if (ok) promote.mutate({ ticker: failure.ticker, acknowledge: true });
  };

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

      {promoteNote && (
        <div className={`banner ${promoteNote.risksAcknowledged ? "paused" : "active"}`}>
          {promoteNote.ticker} promoted to the Trading Pool.
          {promoteNote.risksAcknowledged &&
            " Risks acknowledged — the override and the failed checks are permanently recorded in the audit trail (§4.3)."}
        </div>
      )}

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
                              onClick={() => promote.mutate({ ticker: w.ticker })}
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

      {checkFailure && (
        <div className="panel" style={{ borderColor: "var(--red)" }}>
          <h2 style={{ color: "var(--red)" }}>
            Promotion checks failed — {checkFailure.ticker}
          </h2>
          <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0 }}>
            {checkFailure.checks.map((c) => (
              <li
                key={c.name}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    color: c.passed ? "var(--green)" : "var(--red)",
                    fontWeight: 600,
                  }}
                >
                  {c.passed ? "✓" : "✗"} {c.name}
                </span>{" "}
                <span
                  style={
                    // The LIQUIDITY pass is a documented §4.3 stub, not real
                    // evidence — render its note dimmed so it never reads as a
                    // completed liquidity screen.
                    c.name === "LIQUIDITY"
                      ? { color: "var(--text-dim)", fontStyle: "italic" }
                      : undefined
                  }
                >
                  {c.detail}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            Promoting anyway records the override — including every failed check above — in
            the TRADING_POOL_ADD audit trail, permanently (§4.3, §38).
          </p>
          <div className="row">
            <button onClick={() => setCheckFailure(null)}>Cancel</button>
            <button
              className="danger"
              disabled={promote.isPending}
              onClick={() => acknowledgeAndPromote(checkFailure)}
            >
              Acknowledge risks &amp; promote anyway
            </button>
          </div>
        </div>
      )}
    </>
  );
}
