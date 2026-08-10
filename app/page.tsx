"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { HEAT_BADGE, fmtPct, fmtUsd } from "@/lib/risk-format";

export default function Dashboard() {
  const qc = useQueryClient();
  const [error, setError] = useState("");

  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist.list });
  const pool = useQuery({ queryKey: ["trading-pool"], queryFn: api.tradingPool.list });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.audit.list() });
  const status = useQuery({ queryKey: ["trading-status"], queryFn: api.trading.status });
  const overview = useQuery({ queryKey: ["market-overview"], queryFn: api.market.overview });
  const risk = useQuery({ queryKey: ["portfolio-risk"], queryFn: api.portfolio.risk });

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
        <h2>Top Watchlist Opportunities</h2>
        <p className="empty">
          Opportunity scoring arrives with the Feature & Signal engines (Phase 2). Add
          symbols on the Watchlist page to begin the data lifecycle.
        </p>
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
