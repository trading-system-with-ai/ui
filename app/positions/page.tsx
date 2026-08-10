"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { INSTRUMENT_BADGE, fmtPct, fmtStrike, fmtUsd } from "@/lib/risk-format";
import type { CheckExitsResult, PositionRow } from "@/lib/types";

/* ---------------------------------------------------------------- formatting */

const NO_DATA = <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>no data</span>;
const DASH = <span style={{ color: "var(--text-dim)" }}>—</span>;

function usd(v: number | null, digits = 2): ReactNode {
  return v == null ? DASH : fmtUsd(v, digits);
}

function signedUsd(v: number, digits = 2): string {
  return `${v > 0 ? "+" : ""}${fmtUsd(v, digits)}`;
}

function PnlCell({ pnl, pct }: { pnl: number | null; pct: number | null }) {
  if (pnl == null) return NO_DATA;
  const color = pnl >= 0 ? "var(--green)" : "var(--red)";
  return (
    <span style={{ color, whiteSpace: "nowrap" }}>
      {signedUsd(pnl)}
      {/* *_pct fields arrive as fractions (0.04 = 4%), same convention as the
          portfolio-risk API — fmtPct scales by 100. */}
      {pct != null && <span style={{ fontSize: 11 }}> ({pnl >= 0 ? "+" : ""}{fmtPct(pct)})</span>}
    </span>
  );
}

function InstrumentBadge({ p }: { p: PositionRow }) {
  // Older backend responses may omit `instrument` — fall back to LONG_STOCK
  // (the only instrument that existed before the §8 matrix shipped).
  const instrument = p.instrument ?? "LONG_STOCK";
  return (
    <span className={`badge ${INSTRUMENT_BADGE[instrument] ?? "dim"}`}>{instrument}</span>
  );
}

/**
 * For option rows: the contract line shown under the ticker
 * (right / expiry / strike / remaining DTE) plus the premium P&L chip
 * (current_mid / entry_premium − 1). Renders nothing for stock rows.
 */
function ContractLine({ p }: { p: PositionRow }) {
  const c = p.contract;
  if (c == null) return null;
  const pct = c.premium_pnl_pct;
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--text-dim)",
        marginTop: 2,
        whiteSpace: "nowrap",
      }}
    >
      {c.right} {c.expiry} {fmtStrike(c.strike)}
      {c.dte != null && <> · {c.dte} DTE</>}
      {pct != null && (
        <span
          className="chip"
          title="premium P&L: current_mid / entry_premium − 1"
          style={{ marginLeft: 6, color: pct >= 0 ? "var(--green)" : "var(--red)" }}
        >
          {pct >= 0 ? "+" : ""}
          {fmtPct(pct)}
        </span>
      )}
    </div>
  );
}

function ExitBadge({ p }: { p: PositionRow }) {
  if (p.exit_status == null) return DASH;
  const signaled = p.exit_status === "EXIT_SIGNALED";
  return (
    <span
      className={`badge ${signaled ? "red" : "dim"}`}
      title={p.exit_reasons.length > 0 ? p.exit_reasons.join("\n") : undefined}
    >
      {p.exit_status}
    </span>
  );
}

function EdgeCell({ p }: { p: PositionRow }) {
  // signal_decay = entry_edge - current_edge; the chip shows the edge CHANGE
  // (current - entry), so a weakening signal reads as a negative red delta.
  const change = p.signal_decay == null ? null : -p.signal_decay;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {p.entry_edge.toFixed(1)} → {p.current_edge == null ? "—" : p.current_edge.toFixed(1)}{" "}
      {change != null && (
        <span
          className="chip"
          title={`signal decay (entry edge − current edge): ${p.signal_decay!.toFixed(1)}`}
          style={{
            color:
              change < 0 ? "var(--red)" : change > 0 ? "var(--green)" : "var(--text-dim)",
          }}
        >
          Δ{change > 0 ? "+" : ""}
          {change.toFixed(1)}
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- page */

const OPEN_COLS = 15;

export default function PositionsPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [checkResult, setCheckResult] = useState<CheckExitsResult | null>(null);
  const [actionMsg, setActionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const open = useQuery({
    queryKey: ["positions", "OPEN"],
    queryFn: () => api.positions.list("OPEN"),
  });
  const closed = useQuery({
    queryKey: ["positions", "CLOSED"],
    queryFn: () => api.positions.list("CLOSED"),
  });

  const invalidateAfterTrade = () => {
    qc.invalidateQueries({ queryKey: ["positions"] });
    qc.invalidateQueries({ queryKey: ["portfolio-risk"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const checkExits = useMutation({
    mutationFn: () => api.positions.checkExits(),
    onSuccess: (data) => {
      setCheckResult(data);
      invalidateAfterTrade();
    },
    onError: (e: Error) => setActionMsg({ kind: "err", text: `Exit check failed: ${e.message}` }),
  });

  const closePosition = useMutation({
    mutationFn: (args: { ticker: string; quantity?: number }) =>
      api.orders.close(args.ticker, args.quantity, "manual close from Positions page"),
    onSuccess: (res) => {
      setActionMsg({
        kind: "ok",
        text:
          `Closed ${res.order.quantity} ${res.order.ticker} @ ${fmtUsd(res.order.fill_price, 2)}` +
          ` (order #${res.order.id}, commission ${fmtUsd(res.order.commission, 2)})` +
          ` — realized P&L ${signedUsd(res.realized_pnl)}.`,
      });
      invalidateAfterTrade();
    },
    onError: (e: Error) => setActionMsg({ kind: "err", text: `Close failed: ${e.message}` }),
  });

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onClose = (p: PositionRow) => {
    const input = prompt(
      `Close ${p.ticker} — quantity to sell (1–${p.quantity}; blank or ${p.quantity} = close the full position):`,
      String(p.quantity),
    );
    if (input === null) return;
    const trimmed = input.trim();
    let quantity: number | undefined;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n <= 0 || n > p.quantity) {
        setActionMsg({
          kind: "err",
          text: `Invalid quantity "${trimmed}" — must be a whole number between 1 and ${p.quantity}.`,
        });
        return;
      }
      if (n !== p.quantity) quantity = n;
    }
    const qty = quantity ?? p.quantity;
    const ok = confirm(
      `SELL_TO_CLOSE ${qty} ${p.ticker} (paper).\n\n` +
        `Paper fill model: the SELL fills at the last stored close × (1 − paper_slippage_bps/10000); ` +
        `commission = paper_commission_per_share × ${qty} is charged on this close, just as it was on entry ` +
        `(constants shared with server settings).\n\n` +
        `Closing is allowed even while global trading is paused — closing reduces risk (§18 risk-priority).`,
    );
    if (!ok) return;
    closePosition.mutate({ ticker: p.ticker, quantity });
  };

  return (
    <>
      <h1>Positions</h1>
      <p className="subtitle">
        Paper positions with live P&L, the exit rules protecting each one, and — per §37 —
        exactly why the system is still holding.
      </p>
      <p className="datasource">
        paper execution · fills = last stored close ± paper_slippage_bps · commission =
        paper_commission_per_share × qty, charged both ways (constants shared with settings) ·
        closing stays allowed while trading is paused (§18: closing reduces risk)
      </p>

      {actionMsg && (
        <div className={`banner ${actionMsg.kind === "ok" ? "active" : "paused"}`}>
          {actionMsg.text}
        </div>
      )}

      {checkResult && (
        <div className={`banner ${checkResult.exits_triggered.length > 0 ? "paused" : "active"}`}>
          Exit check: {checkResult.checked}{" "}
          {checkResult.checked === 1 ? "position" : "positions"} checked —{" "}
          {checkResult.exits_triggered.length > 0
            ? `${checkResult.exits_triggered.length} exit${
                checkResult.exits_triggered.length === 1 ? "" : "s"
              } triggered: ${checkResult.exits_triggered
                .map((e) => `${e.ticker} (${e.rule}, order #${e.order_id})`)
                .join(", ")}`
            : "all held"}
        </div>
      )}

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginBottom: 4 }}>
          <h2 style={{ marginBottom: 0 }}>Open positions</h2>
          <button onClick={() => checkExits.mutate()} disabled={checkExits.isPending}>
            {checkExits.isPending ? "Checking…" : "Run Exit Check"}
          </button>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
          The exit sweep evaluates every open position against its stop, trail, time stop, and
          signal rules — the same sweep the automated position monitor will run continuously in
          a later phase.
        </p>

        {open.isPending ? (
          <p className="empty">Loading open positions…</p>
        ) : open.isError ? (
          <p className="error">Positions unavailable: {open.error.message}</p>
        ) : open.data.length === 0 ? (
          <p className="empty">
            No open positions — approve a trade plan from a symbol&apos;s{" "}
            <Link href="/watchlist" style={{ color: "var(--accent)" }}>
              Trade Plan tab
            </Link>
            .
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Instrument</th>
                  <th className="num">Qty</th>
                  <th className="num">Avg price</th>
                  <th className="num">Current</th>
                  <th className="num">Mkt value</th>
                  <th className="num">Unrealized P&L</th>
                  <th className="num">Max loss</th>
                  <th className="num">Stop</th>
                  <th className="num">Trail</th>
                  <th>Edge entry → now</th>
                  <th className="num">Bars held</th>
                  <th className="num">Time stop</th>
                  <th>Exit status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {open.data.map((p) => (
                  <Fragment key={p.id}>
                    <tr
                      className="click-row"
                      onClick={() => toggleExpanded(p.id)}
                      title="Click to show the full exit-rule evaluation"
                    >
                      <td>
                        <Link href={`/watchlist/${encodeURIComponent(p.ticker)}`} className="ticker">
                          {p.ticker}
                        </Link>
                        <ContractLine p={p} />
                      </td>
                      <td>
                        <InstrumentBadge p={p} />
                      </td>
                      <td className="num">{p.quantity.toLocaleString()}</td>
                      <td className="num">{fmtUsd(p.avg_price, 2)}</td>
                      <td className="num">{p.current_price == null ? NO_DATA : fmtUsd(p.current_price, 2)}</td>
                      <td className="num">{usd(p.market_value)}</td>
                      <td className="num">
                        <PnlCell pnl={p.unrealized_pnl} pct={p.unrealized_pnl_pct} />
                      </td>
                      <td className="num" style={{ color: "var(--red)" }}>
                        {fmtUsd(p.max_loss, 0)}
                      </td>
                      <td className="num">{fmtUsd(p.stop_price, 2)}</td>
                      <td className="num">{usd(p.trail_price)}</td>
                      <td>
                        <EdgeCell p={p} />
                      </td>
                      <td className="num">{p.bars_held == null ? DASH : p.bars_held}</td>
                      <td className="num">
                        {p.time_stop_remaining == null ? DASH : `${p.time_stop_remaining} bars`}
                      </td>
                      <td>
                        <ExitBadge p={p} />
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className="row">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(p.id);
                            }}
                            aria-expanded={expanded.has(p.id)}
                            title="Show why the system is still holding"
                          >
                            {expanded.has(p.id) ? "Hide why" : "Why?"}
                          </button>
                          <button
                            className="danger"
                            disabled={closePosition.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              onClose(p);
                            }}
                          >
                            Close
                          </button>
                        </span>
                      </td>
                    </tr>
                    {expanded.has(p.id) && (
                      <tr>
                        <td colSpan={OPEN_COLS} style={{ background: "var(--bg)" }}>
                          <div style={{ padding: "4px 2px" }}>
                            <div
                              style={{
                                fontSize: 11,
                                textTransform: "uppercase",
                                letterSpacing: 0.5,
                                color: "var(--text-dim)",
                                marginBottom: 6,
                                fontFamily:
                                  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }}
                            >
                              Exit rules — why the system is{" "}
                              {p.exit_status === "EXIT_SIGNALED"
                                ? "signaling an exit"
                                : "still holding"}
                            </div>
                            {p.exit_reasons.length > 0 ? (
                              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                                {p.exit_reasons.map((r, i) => (
                                  <li
                                    key={i}
                                    style={{
                                      color: r.startsWith("OK:")
                                        ? "var(--text-dim)"
                                        : "var(--red)",
                                      fontSize: 12,
                                      marginBottom: 2,
                                    }}
                                  >
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span style={{ fontSize: 12 }}>{NO_DATA}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Closed positions</h2>
        {closed.isPending ? (
          <p className="empty">Loading closed positions…</p>
        ) : closed.isError ? (
          <p className="error">Closed positions unavailable: {closed.error.message}</p>
        ) : closed.data.length === 0 ? (
          <p className="empty">No closed positions yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Instrument</th>
                  <th className="num">Qty</th>
                  <th className="num">Avg price</th>
                  <th className="num">Realized P&L</th>
                  <th>Opened</th>
                  <th>Closed</th>
                </tr>
              </thead>
              <tbody>
                {closed.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/watchlist/${encodeURIComponent(p.ticker)}`} className="ticker">
                        {p.ticker}
                      </Link>
                      <ContractLine p={p} />
                    </td>
                    <td>
                      <InstrumentBadge p={p} />
                    </td>
                    <td className="num">{p.quantity.toLocaleString()}</td>
                    <td className="num">{fmtUsd(p.avg_price, 2)}</td>
                    <td className="num">
                      {p.realized_pnl == null ? (
                        NO_DATA
                      ) : (
                        <span
                          style={{
                            color: p.realized_pnl >= 0 ? "var(--green)" : "var(--red)",
                          }}
                        >
                          {signedUsd(p.realized_pnl)}
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(p.opened_at).toLocaleDateString()}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {p.closed_at == null ? DASH : new Date(p.closed_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
