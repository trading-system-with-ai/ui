"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

export default function WatchlistPage() {
  const qc = useQueryClient();
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState("");

  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist.list });
  const pool = useQuery({ queryKey: ["trading-pool"], queryFn: api.tradingPool.list });
  const poolTickers = new Set(pool.data?.map((p) => p.ticker));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["watchlist"] });
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
        {watchlist.data && watchlist.data.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Added</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.data.map((w) => (
                <tr key={w.ticker}>
                  <td className="ticker">{w.ticker}</td>
                  <td>{new Date(w.created_at).toLocaleDateString()}</td>
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
                        <button onClick={() => promote.mutate(w.ticker)} disabled={promote.isPending}>
                          Promote to Trading Pool
                        </button>
                      )}
                      <button
                        className="danger"
                        onClick={() => {
                          if (confirm(`Remove ${w.ticker} from Watchlist? This also revokes any Trading Pool authorization.`)) {
                            remove.mutate(w.ticker);
                          }
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
          <p className="empty">Watchlist is empty. Add a ticker above to begin research.</p>
        )}
      </div>
    </>
  );
}
