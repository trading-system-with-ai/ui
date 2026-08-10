"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";

export default function TradingPoolPage() {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const pool = useQuery({ queryKey: ["trading-pool"], queryFn: api.tradingPool.list });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trading-pool"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const toggle = useMutation({
    mutationFn: ({ t, enabled }: { t: string; enabled: boolean }) => api.tradingPool.toggle(t, enabled),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (t: string) => api.tradingPool.remove(t),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const anyEnabled = pool.data?.some((p) => p.trading_enabled) ?? false;

  const pauseAll = () => {
    if (!pool.data) return;
    if (confirm("PAUSE ALL TRADING — disable every Trading Pool symbol?")) {
      pool.data.filter((p) => p.trading_enabled).forEach((p) => toggle.mutate({ t: p.ticker, enabled: false }));
    }
  };

  return (
    <>
      <h1>Trading Pool</h1>
      <p className="subtitle">
        Symbols here are authorized to trade if the mechanical strategy and risk engine
        approve. Authorization is not an order — every trade still passes the full gate chain.
      </p>

      <div className={`banner ${anyEnabled ? "active" : "paused"}`}>
        <span className="row" style={{ justifyContent: "space-between" }}>
          <span>{anyEnabled ? "TRADING ENABLED for some symbols" : "ALL TRADING PAUSED"}</span>
          {anyEnabled && (
            <button className="danger" onClick={pauseAll}>
              PAUSE ALL TRADING
            </button>
          )}
        </span>
      </div>

      {error && (
        <div className="panel">
          <p className="error">{error}</p>
        </div>
      )}

      <div className="panel">
        <h2>Authorized Symbols ({pool.data?.length ?? 0})</h2>
        {pool.data && pool.data.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Trading</th>
                <th>Allowed Strategies</th>
                <th>Promoted</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pool.data.map((p) => (
                <tr key={p.ticker}>
                  <td className="ticker">{p.ticker}</td>
                  <td>
                    <span className={`badge ${p.trading_enabled ? "on" : "off"}`}>
                      {p.trading_enabled ? "ENABLED" : "DISABLED"}
                    </span>
                  </td>
                  <td>{p.allowed_strategies.join(", ")}</td>
                  <td>{new Date(p.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className="row" style={{ justifyContent: "flex-end" }}>
                      <button
                        onClick={() => {
                          if (
                            p.trading_enabled ||
                            confirm(`Enable trading for ${p.ticker}? Mechanical signals may then generate orders (still subject to risk approval).`)
                          ) {
                            toggle.mutate({ t: p.ticker, enabled: !p.trading_enabled });
                          }
                        }}
                      >
                        {p.trading_enabled ? "Disable Trading" : "Enable Trading"}
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          if (confirm(`Remove ${p.ticker} from Trading Pool?`)) remove.mutate(p.ticker);
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">
            No symbols authorized. Promote a researched symbol from the Watchlist page.
          </p>
        )}
      </div>
    </>
  );
}
