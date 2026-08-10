"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Dashboard() {
  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist.list });
  const pool = useQuery({ queryKey: ["trading-pool"], queryFn: api.tradingPool.list });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.audit.list() });

  const tradingActive = pool.data?.some((p) => p.trading_enabled) ?? false;

  return (
    <>
      <h1>Dashboard</h1>
      <p className="subtitle">Market regime, portfolio state, and active risk at a glance</p>

      <div className={`banner ${tradingActive ? "active" : "paused"}`}>
        {tradingActive
          ? "TRADING ENABLED — mechanical signals may generate orders for enabled Trading Pool symbols"
          : "TRADING PAUSED — no symbol currently has trading enabled"}
      </div>

      <div className="statbar">
        <div className="stat">
          <div className="label">Market Regime</div>
          <div className="value">—</div>
        </div>
        <div className="stat">
          <div className="label">Portfolio NAV</div>
          <div className="value">—</div>
        </div>
        <div className="stat">
          <div className="label">Cash</div>
          <div className="value">—</div>
        </div>
        <div className="stat">
          <div className="label">Portfolio Heat</div>
          <div className="value">0.0%</div>
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
