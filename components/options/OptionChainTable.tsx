"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Fragment, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { fmtPct, fmtUsd } from "@/lib/risk-format";
import type {
  OptionChainResponse,
  OptionContractRow,
  OptionDirection,
} from "@/lib/types";

/* ---------------------------------------------------------------- formatting
 * §34 conventions: prices 2dp, greeks 3dp, IV as %, spread as %. All the
 * API's vol/spread fields arrive as FRACTIONS (0.32 = 32%) — fmtPct scales
 * by 100.
 */

function price2(v: number): string {
  return v.toFixed(2);
}

function pctOrDash(v: number | null, digits = 1): string {
  return v == null ? "—" : fmtPct(v, digits);
}

function signedPctOrDash(v: number | null, digits = 1): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${fmtPct(v, digits)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-18" → "Sep 18" (parsed by hand — Date("YYYY-MM-DD") is UTC and can shift a day). */
function fmtExpiryShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[((m ?? 1) - 1 + 12) % 12]} ${d ?? "?"}`;
}

function fmtComponentValue(v: number | string | boolean): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return v;
}

function contractKey(r: OptionContractRow): string {
  return `${r.expiry}|${r.strike}|${r.right}`;
}

/* ---------------------------------------------------------------- controls */

const DIRECTIONS: OptionDirection[] = ["AUTO", "BULL", "BEAR"];

type ChainView = "all" | "eligible" | "candidates";

const VIEWS: { id: ChainView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "eligible", label: "Eligible" },
  { id: "candidates", label: "Recommended Candidate" },
];

/** Sentinel for the "every expiry" chip. */
const ALL_EXPIRIES = "ALL";

// Rank/expand column + the 15 §34-required columns.
const COLS = 16;

/* ---------------------------------------------------------------- summary strip */

function SummaryStrip({ data }: { data: OptionChainResponse }) {
  const s = data.summary;
  const move = s.expected_move_pct;
  return (
    <div className="statbar">
      <div className="stat">
        <div className="label">Spot</div>
        <div className="value">{fmtUsd(data.spot, 2)}</div>
      </div>
      <div className="stat">
        <div className="label">ATM IV</div>
        <div className="value">{pctOrDash(s.atm_iv)}</div>
        <div className="sub">nearest 30d+ expiry</div>
      </div>
      <div className="stat">
        <div className="label">Expected move</div>
        <div className="value">{move == null ? "—" : `±${fmtPct(move)}`}</div>
        <div className="sub">
          {move == null
            ? "ATM straddle, nearest 30d+ expiry"
            : `±${fmtUsd(move * data.spot, 2)} · ATM straddle, nearest 30d+ expiry`}
        </div>
      </div>
      <div className="stat">
        <div className="label">RV20</div>
        <div className="value">{pctOrDash(s.rv20)}</div>
        <div className="sub">annualized, stored bars</div>
      </div>
      <div className="stat">
        <div className="label">IV − RV spread</div>
        <div className="value">{signedPctOrDash(s.iv_rv_spread)}</div>
        <div className="sub">positive = options rich vs realized</div>
      </div>
      <div className="stat" title={s.iv_rank_note}>
        <div className="label">IV rank</div>
        <div className="value">{s.iv_rank == null ? "—" : fmtPct(s.iv_rank)}</div>
        <div className="sub">{s.iv_rank_note}</div>
      </div>
      <div className="stat">
        <div className="label">Direction</div>
        <div className="value">
          {data.direction_used == null ? (
            <span className="badge neutral">NO SIGNAL</span>
          ) : (
            <span className={`badge ${data.direction_used === "BULL" ? "bull" : "bear"}`}>
              {data.direction_used}
            </span>
          )}
        </div>
        {data.direction_used == null && (
          <div className="sub">AUTO resolved to NEUTRAL — no candidate side</div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- detail row */

function ContractDetail({ r }: { r: OptionContractRow }) {
  const components = r.score_components == null ? [] : Object.entries(r.score_components);
  return (
    <div style={{ padding: "4px 2px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--text-dim)",
          marginBottom: 6,
        }}
      >
        {fmtExpiryShort(r.expiry)} {price2(r.strike)}
        {r.right} — selection detail
      </div>

      {r.candidate_rank != null && (
        <p style={{ fontSize: 13, marginBottom: 6 }}>
          <span className="rank-badge">#{r.candidate_rank}</span>{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>
            recommended candidate{r.score != null && <> · score {r.score.toFixed(3)}</>}
          </span>
        </p>
      )}
      {r.candidate_rank == null && r.score != null && (
        <p style={{ fontSize: 13, marginBottom: 6, fontFamily: "var(--font-mono)" }}>
          score {r.score.toFixed(3)} (not selected as a candidate)
        </p>
      )}

      {components.length > 0 && (
        <div className="kv" style={{ marginBottom: r.fail_reasons.length > 0 ? 8 : 0 }}>
          {components.map(([k, v]) => (
            <div key={k}>
              <div className="k">{k}</div>
              <div className="v">{fmtComponentValue(v)}</div>
            </div>
          ))}
        </div>
      )}

      {!r.eligible && (
        <>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "var(--red)",
              margin: "4px 0 4px",
            }}
          >
            Ineligible — fail reasons
          </div>
          {r.fail_reasons.length > 0 ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {r.fail_reasons.map((reason, i) => (
                <li key={i} style={{ color: "var(--red)", fontSize: 12, marginBottom: 2 }}>
                  {reason}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--text-dim)", fontSize: 12, fontStyle: "italic" }}>
              no reasons reported
            </p>
          )}
        </>
      )}
      {r.eligible && r.candidate_rank == null && components.length === 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
          Passes all eligibility checks; not among the top-ranked candidates.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- tab */

export default function OptionChainTable({ ticker }: { ticker: string }) {
  const [direction, setDirection] = useState<OptionDirection>("AUTO");
  // null = no explicit choice yet → default to the nearest expiry.
  const [expiry, setExpiry] = useState<string | null>(null);
  const [view, setView] = useState<ChainView>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const chain = useQuery({
    queryKey: ["options", ticker, direction],
    queryFn: () => api.watchlist.options(ticker, direction),
    enabled: ticker.length > 0,
    // Keep the previous chain on screen while a direction toggle refetches.
    placeholderData: keepPreviousData,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
  });

  if (chain.isPending) {
    return (
      <div className="panel">
        <p className="empty">Loading option chain for {ticker}…</p>
      </div>
    );
  }
  if (chain.isError) {
    const notOnWatchlist = chain.error instanceof ApiError && chain.error.status === 404;
    return (
      <div className="panel">
        {notOnWatchlist ? (
          <>
            <p className="error">{chain.error.message || `${ticker} is not on the Watchlist.`}</p>
            <p style={{ marginTop: 8, color: "var(--text-dim)" }}>
              Option chains exist only for Watchlist symbols. Add {ticker} on the{" "}
              <Link href="/watchlist" style={{ color: "var(--accent)" }}>
                Watchlist page
              </Link>{" "}
              to start research.
            </p>
          </>
        ) : (
          <p className="error">Option chain unavailable: {chain.error.message}</p>
        )}
      </div>
    );
  }

  const data = chain.data;

  // The stored expiry choice survives direction refetches; fall back to the
  // nearest expiry if it disappears from the response.
  const effectiveExpiry =
    expiry === ALL_EXPIRIES
      ? ALL_EXPIRIES
      : expiry != null && data.expiries.some((e) => e.expiry === expiry)
        ? expiry
        : (data.expiries[0]?.expiry ?? ALL_EXPIRIES);

  const inExpiry = data.chain.filter(
    (r) => effectiveExpiry === ALL_EXPIRIES || r.expiry === effectiveExpiry,
  );
  const counts = {
    all: inExpiry.length,
    eligible: inExpiry.filter((r) => r.eligible).length,
    candidates: inExpiry.filter((r) => r.candidate_rank != null).length,
  };
  const rows = inExpiry
    .filter((r) =>
      view === "eligible" ? r.eligible : view === "candidates" ? r.candidate_rank != null : true,
    )
    .sort(
      (a, b) =>
        a.expiry.localeCompare(b.expiry) || a.strike - b.strike || a.right.localeCompare(b.right),
    );

  const candidatesElsewhere =
    view === "candidates" &&
    rows.length === 0 &&
    data.chain.some((r) => r.candidate_rank != null);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const rowTitle = (r: OptionContractRow): string => {
    if (r.candidate_rank != null) {
      return `Recommended candidate #${r.candidate_rank}${
        r.score != null ? ` · score ${r.score.toFixed(3)}` : ""
      } — click for score components`;
    }
    if (!r.eligible && r.fail_reasons.length > 0) {
      return `Ineligible: ${r.fail_reasons.join("; ")} — click for detail`;
    }
    return "Click for selection detail";
  };

  return (
    <>
      <SummaryStrip data={data} />

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Option chain</h2>
          <span className="row" style={{ flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>Direction</span>
            <span className="row" role="group" aria-label="Direction">
              {DIRECTIONS.map((d) => (
                <button
                  key={d}
                  className={direction === d ? "primary" : ""}
                  aria-pressed={direction === d}
                  onClick={() => setDirection(d)}
                >
                  {d}
                </button>
              ))}
            </span>
            {chain.isFetching && (
              <span style={{ color: "var(--text-dim)", fontSize: 12 }}>refreshing…</span>
            )}
          </span>
        </div>

        <div className="row" style={{ flexWrap: "wrap", marginBottom: 8 }} role="group" aria-label="Expiry">
          {data.expiries.map((e) => (
            <button
              key={e.expiry}
              className={effectiveExpiry === e.expiry ? "primary" : ""}
              aria-pressed={effectiveExpiry === e.expiry}
              onClick={() => setExpiry(e.expiry)}
            >
              {fmtExpiryShort(e.expiry)} · {e.dte}d
            </button>
          ))}
          <button
            className={effectiveExpiry === ALL_EXPIRIES ? "primary" : ""}
            aria-pressed={effectiveExpiry === ALL_EXPIRIES}
            onClick={() => setExpiry(ALL_EXPIRIES)}
          >
            All expiries
          </button>
        </div>

        <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }} role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={view === v.id ? "primary" : ""}
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
            >
              {v.label} ({counts[v.id]})
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="empty">
            {view === "candidates"
              ? candidatesElsewhere
                ? "No recommended candidates in this expiry — try “All expiries”."
                : data.direction_used == null
                  ? "No recommended candidates — AUTO resolved to NEUTRAL (no candidate side). Force BULL or BEAR to see a candidate list."
                  : "No recommended candidates in this chain."
              : view === "eligible"
                ? "No contracts pass the eligibility checks in this expiry."
                : "No contracts in this expiry."}
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th aria-label="Candidate rank"></th>
                  <th>Expiration</th>
                  <th className="num">Strike</th>
                  <th>C/P</th>
                  <th className="num">Bid</th>
                  <th className="num">Ask</th>
                  <th className="num">Mid</th>
                  <th className="num">Spread %</th>
                  <th className="num">Last</th>
                  <th className="num">Volume</th>
                  <th className="num">OI</th>
                  <th className="num">IV</th>
                  <th className="num">Delta</th>
                  <th className="num">Gamma</th>
                  <th className="num">Theta</th>
                  <th className="num">Vega</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = contractKey(r);
                  const isCandidate = r.candidate_rank != null;
                  return (
                    <Fragment key={key}>
                      <tr
                        className={`click-row${
                          isCandidate ? " opt-candidate" : r.eligible ? " opt-eligible" : ""
                        }`}
                        onClick={() => toggleExpanded(key)}
                        title={rowTitle(r)}
                      >
                        <td>
                          {isCandidate ? (
                            <span className="rank-badge">#{r.candidate_rank}</span>
                          ) : !r.eligible ? (
                            <span
                              className="badge dim"
                              title={r.fail_reasons.join("; ") || undefined}
                            >
                              INELIG
                            </span>
                          ) : null}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {r.expiry} <span style={{ color: "var(--text-dim)" }}>({r.dte}d)</span>
                        </td>
                        <td className="num">{price2(r.strike)}</td>
                        <td>
                          <span className={`badge ${r.right === "C" ? "bull" : "bear"}`}>
                            {r.right}
                          </span>
                        </td>
                        <td className="num">{price2(r.bid)}</td>
                        <td className="num">{price2(r.ask)}</td>
                        <td className="num">{price2(r.mid)}</td>
                        <td className="num">{fmtPct(r.spread_pct)}</td>
                        <td className="num">{price2(r.last)}</td>
                        <td className="num">{r.volume.toLocaleString()}</td>
                        <td className="num">{r.open_interest.toLocaleString()}</td>
                        <td className="num">{fmtPct(r.iv)}</td>
                        <td className="num">{r.delta.toFixed(3)}</td>
                        <td className="num">{r.gamma.toFixed(3)}</td>
                        <td className="num">{r.theta.toFixed(3)}</td>
                        <td className="num">{r.vega.toFixed(3)}</td>
                      </tr>
                      {expanded.has(key) && (
                        <tr>
                          <td colSpan={COLS} style={{ background: "var(--bg)" }}>
                            <ContractDetail r={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="datasource" style={{ marginTop: 12, marginBottom: 4 }}>
          source: {data.source} · as of {new Date(data.as_of).toLocaleString()} · stub chain until
          Massive integration
        </p>
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 0 }}>
          Research only — this tab has no order or trade actions; contract execution arrives with
          the options strategy phase.
        </p>
      </div>
    </>
  );
}
