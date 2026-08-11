"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import {
  HEAT_BADGE,
  INSTRUMENT_BADGE,
  INSTRUMENT_SHORT,
  OPPORTUNITY_BADGE,
  fmtPct,
  fmtUsd,
} from "@/lib/risk-format";
import type { WatchlistOverviewItem } from "@/lib/types";

/**
 * Sort rank per opportunity status — most actionable first. Anything not
 * listed (BACKTEST_FAILED, null, unknown values) sinks below DATA_ISSUE.
 */
const OPPORTUNITY_ORDER: Record<string, number> = {
  ENTRY_READY: 0,
  SETUP_FORMING: 1,
  WATCH: 2,
  NO_SIGNAL: 3,
  DATA_ISSUE: 4,
};

function opportunityRank(status: string | null): number {
  return (status != null ? OPPORTUNITY_ORDER[status] : undefined) ?? 5;
}

/** Top rows: opportunity first, then |directional_edge| descending. */
function topOpportunities(rows: WatchlistOverviewItem[], n: number): WatchlistOverviewItem[] {
  return [...rows]
    .sort((a, b) => {
      const byStatus =
        opportunityRank(a.opportunity_status) - opportunityRank(b.opportunity_status);
      if (byStatus !== 0) return byStatus;
      return Math.abs(b.directional_edge ?? 0) - Math.abs(a.directional_edge ?? 0);
    })
    .slice(0, n);
}

function edgeColor(v: number): string {
  if (v > 0) return "var(--green)";
  if (v < 0) return "var(--red)";
  return "var(--text-dim)";
}

export default function Dashboard() {
  const qc = useQueryClient();
  const [error, setError] = useState("");

  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist.list });
  const pool = useQuery({ queryKey: ["trading-pool"], queryFn: api.tradingPool.list });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.audit.list() });
  const status = useQuery({ queryKey: ["trading-status"], queryFn: api.trading.status });
  const overview = useQuery({ queryKey: ["market-overview"], queryFn: api.market.overview });
  const risk = useQuery({ queryKey: ["portfolio-risk"], queryFn: api.portfolio.risk });
  const positions = useQuery({
    queryKey: ["positions", "OPEN"],
    queryFn: () => api.positions.list("OPEN"),
  });
  const wlOverview = useQuery({
    queryKey: ["watchlist-overview"],
    queryFn: api.watchlist.overview,
  });

  const invalidateStatus = () => {
    qc.invalidateQueries({ queryKey: ["trading-status"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const pause = useMutation({
    mutationFn: (reason: string) => api.trading.pause(reason),
    onSuccess: () => {
      setError("");
      invalidateStatus();
    },
    onError: (e: Error) => setError(e.message),
  });

  const resume = useMutation({
    mutationFn: () => api.trading.resume(),
    onSuccess: () => {
      setError("");
      invalidateStatus();
    },
    onError: (e: Error) => setError(e.message),
  });

  // Safety: only an explicit backend "enabled" renders green. Loading, error, or
  // unknown status is always presented as PAUSED — never ambiguous.
  const statusKnown = status.data !== undefined;
  const tradingEnabled = status.data?.trading_enabled === true;
  const enabledCount = pool.data?.filter((p) => p.trading_enabled).length ?? 0;

  const onPauseAll = () => {
    const reason = prompt("PAUSE ALL TRADING — enter a reason (required):");
    if (reason === null) return;
    if (!reason.trim()) {
      setError("A reason is required to pause all trading.");
      return;
    }
    pause.mutate(reason.trim());
  };

  const onResume = () => {
    if (
      confirm(
        "Resume trading? Mechanical signals may generate orders for enabled Trading Pool symbols.",
      )
    ) {
      resume.mutate();
    }
  };

  return (
    <>
      <h1>Dashboard</h1>
      <p className="subtitle">Market regime, portfolio state, and active risk at a glance</p>

      <div className={`banner ${tradingEnabled ? "active" : "paused"}`}>
        <span className="row" style={{ justifyContent: "space-between" }}>
          <span>
            {tradingEnabled
              ? "TRADING ENABLED — mechanical signals may generate orders for enabled Trading Pool symbols"
              : statusKnown
                ? `TRADING PAUSED — ${status.data!.reason || "no reason given"}`
                : "TRADING PAUSED — global status unavailable; treated as paused"}
          </span>
          {tradingEnabled ? (
            <button className="danger" onClick={onPauseAll} disabled={pause.isPending}>
              PAUSE ALL TRADING
            </button>
          ) : statusKnown ? (
            <button onClick={onResume} disabled={resume.isPending}>
              Resume
            </button>
          ) : null}
        </span>
      </div>

      <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        {enabledCount} {enabledCount === 1 ? "symbol has" : "symbols have"} per-symbol trading
        enabled
        {tradingEnabled
          ? "."
          : " — the global pause overrides per-symbol enablement."}
        {!tradingEnabled && statusKnown && status.data!.updated_by
          ? ` Paused by ${status.data!.updated_by}${
              status.data!.updated_at
                ? ` at ${new Date(status.data!.updated_at).toLocaleString()}`
                : ""
            }.`
          : ""}
      </p>

      {error && (
        <div className="panel">
          <p className="error">{error}</p>
        </div>
      )}

      <div className="statbar">
        <div className="stat">
          <div className="label">Market Regime</div>
          <div className="value">
            {overview.data?.market_regime ?? (overview.isError ? "—" : "…")}
          </div>
        </div>
        <div className="stat">
          <div className="label">Portfolio NAV</div>
          <div className="value">{risk.data ? fmtUsd(risk.data.nav) : "—"}</div>
        </div>
        <div className="stat">
          <div className="label">Cash</div>
          <div className="value">{risk.data ? fmtUsd(risk.data.cash) : "—"}</div>
          {risk.data && <div className="sub">{fmtPct(risk.data.cash_pct)} of NAV</div>}
        </div>
        <div className="stat">
          <div className="label">Portfolio Heat</div>
          <div className="value">
            {risk.data ? fmtPct(risk.data.portfolio_heat_pct) : "—"}{" "}
            {risk.data && (
              <span className={`badge ${HEAT_BADGE[risk.data.heat_state]}`}>
                {risk.data.heat_state}
              </span>
            )}
          </div>
        </div>
        <div className="stat">
          <div className="label">Watchlist</div>
          <div className="value">{watchlist.data?.length ?? "…"}</div>
        </div>
        <div className="stat">
          <div className="label">Trading Pool</div>
          <div className="value">{pool.data?.length ?? "…"}</div>
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Indices</h2>
          {overview.data && (
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
              {overview.data.stale && <span className="badge stale">STALE</span>}{" "}
              source: {overview.data.provider}
              {overview.data.provider.toLowerCase().includes("stub") ? " (stub data)" : ""} · as
              of {new Date(overview.data.as_of).toLocaleTimeString()}
            </span>
          )}
        </div>
        {overview.data ? (
          overview.data.indices.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Price</th>
                  <th>Change</th>
                  <th>As of</th>
                </tr>
              </thead>
              <tbody>
                {overview.data.indices.map((q) => (
                  <tr key={q.symbol}>
                    <td className="ticker">{q.symbol}</td>
                    <td>{q.price.toFixed(2)}</td>
                    <td style={{ color: q.change_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                      {q.change_pct >= 0 ? "+" : ""}
                      {q.change_pct.toFixed(2)}%
                    </td>
                    <td>{new Date(q.ts).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">No index quotes returned.</p>
          )
        ) : (
          <p className="empty">
            {overview.isError ? "Market overview unavailable." : "Loading market overview…"}
          </p>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Active Positions</h2>
          <Link href="/positions" style={{ color: "var(--accent)", fontSize: 12 }}>
            All positions →
          </Link>
        </div>
        {positions.data ? (
          positions.data.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th className="num">Qty</th>
                  <th className="num">Unrealized P&L</th>
                  <th>Exit status</th>
                </tr>
              </thead>
              <tbody>
                {positions.data.map((p) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link href="/positions" className="ticker">
                        {p.ticker}
                      </Link>{" "}
                      {/* Compact instrument badge; older backends may omit the field. */}
                      <span
                        className={`badge ${INSTRUMENT_BADGE[p.instrument ?? "LONG_STOCK"] ?? "dim"}`}
                      >
                        {INSTRUMENT_SHORT[p.instrument ?? "LONG_STOCK"] ?? p.instrument}
                      </span>
                    </td>
                    <td className="num">{p.quantity.toLocaleString()}</td>
                    <td className="num">
                      {p.unrealized_pnl == null ? (
                        <span style={{ color: "var(--text-dim)" }}>—</span>
                      ) : (
                        <span
                          style={{
                            color: p.unrealized_pnl >= 0 ? "var(--green)" : "var(--red)",
                          }}
                        >
                          {p.unrealized_pnl >= 0 ? "+" : ""}
                          {fmtUsd(p.unrealized_pnl, 2)}
                          {p.unrealized_pnl_pct != null && (
                            <span style={{ fontSize: 11 }}>
                              {" "}
                              ({p.unrealized_pnl >= 0 ? "+" : ""}
                              {fmtPct(p.unrealized_pnl_pct)})
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td>
                      {p.exit_status == null ? (
                        <span style={{ color: "var(--text-dim)" }}>—</span>
                      ) : (
                        <span
                          className={`badge ${p.exit_status === "EXIT_SIGNALED" ? "red" : "dim"}`}
                        >
                          {p.exit_status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">No open positions.</p>
          )
        ) : (
          <p className="empty">
            {positions.isError ? "Positions unavailable." : "Loading positions…"}
          </p>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Top Watchlist Opportunities</h2>
          <Link href="/watchlist" style={{ color: "var(--accent)", fontSize: 12 }}>
            Full watchlist →
          </Link>
        </div>
        {wlOverview.data ? (
          wlOverview.data.length > 0 ? (
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
                  </tr>
                </thead>
                <tbody>
                  {topOpportunities(wlOverview.data, 6).map((o) => (
                    <tr key={o.ticker}>
                      <td>
                        <Link
                          href={`/watchlist/${encodeURIComponent(o.ticker)}`}
                          className="ticker"
                        >
                          {o.ticker}
                        </Link>
                      </td>
                      <td className="num">
                        {o.price != null ? (
                          `$${o.price.toFixed(2)}`
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {o.regime ?? <span style={{ color: "var(--text-dim)" }}>—</span>}
                      </td>
                      <td className="num">
                        {o.directional_edge != null ? (
                          <span style={{ color: edgeColor(o.directional_edge) }}>
                            {o.directional_edge > 0 ? "+" : ""}
                            {o.directional_edge.toFixed(1)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {o.bias ? (
                          <span className={`badge ${o.bias.toLowerCase()}`}>{o.bias}</span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {o.opportunity_status ? (
                          <span
                            className={`badge ${OPPORTUNITY_BADGE[o.opportunity_status] ?? "dim"}`}
                          >
                            {o.opportunity_status.replace(/_/g, " ")}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">
              Watchlist is empty —{" "}
              <Link href="/watchlist" style={{ color: "var(--accent)" }}>
                add symbols on the Watchlist page
              </Link>{" "}
              to begin the data lifecycle.
            </p>
          )
        ) : (
          <p className="empty">
            {wlOverview.isError
              ? "Watchlist overview unavailable."
              : "Loading watchlist opportunities…"}
          </p>
        )}
      </div>

      <div className="panel">
        <h2>Recent Activity</h2>
        {audit.data && audit.data.length > 0 ? (
          <table>
            <tbody>
              {audit.data.slice(0, 8).map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleTimeString()}</td>
                  <td>
                    <span className={`badge ${e.actor_type.toLowerCase()}`}>{e.actor_type}</span>
                  </td>
                  <td>{e.action}</td>
                  <td className="ticker">{e.entity_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">No activity yet.</p>
        )}
      </div>
    </>
  );
}
