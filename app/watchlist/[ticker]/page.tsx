"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import CandlestickChart from "@/components/charts/CandlestickChart";
import OptionChainTable from "@/components/options/OptionChainTable";
import { api, ApiError } from "@/lib/api";
import { METRIC_ROWS } from "@/lib/backtest-metrics";
import {
  DECISION_BADGE,
  INSTRUMENT_BADGE,
  VOL_REGIME_BADGE,
  fmtPct,
  fmtProposedContract,
  fmtUsd,
} from "@/lib/risk-format";
import type {
  AnalysisIndicators,
  AnalysisSeries,
  GateName,
  OrderApproveErrorDetail,
  OrderPreview,
  OrderPreviewGate,
  SymbolAnalysis,
} from "@/lib/types";

/* ---------------------------------------------------------------- tabs */

type ActiveTab =
  | "overview"
  | "price"
  | "technical"
  | "options"
  | "backtest"
  | "trade-plan"
  | "audit";

const TABS: { id: string; label: string; phase?: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "price", label: "Price" },
  { id: "technical", label: "Technical" },
  { id: "options", label: "Options" },
  { id: "news", label: "News", phase: "Phase 8" },
  { id: "backtest", label: "Backtest" },
  { id: "trade-plan", label: "Trade Plan" },
  { id: "audit", label: "Audit" },
];

/* ---------------------------------------------------------------- formatting */

function fmtPrice(v: number | null): string {
  return v == null ? "—" : `$${v.toFixed(2)}`;
}

function fmtScore(v: number): string {
  return v.toFixed(1);
}

function fmtSigned(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

function fmtFeature(v: number | boolean): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/* Null-safe % helpers for the §7 vol chip (fields arrive as FRACTIONS). */
function pctOrDash(v: number | null | undefined): string {
  return v == null ? "—" : fmtPct(v);
}

function signedPctOrDash(v: number | null | undefined): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${fmtPct(v)}`;
}

function plusMinusPctOrDash(v: number | null | undefined): string {
  return v == null ? "—" : `±${fmtPct(v)}`;
}

const INSUFFICIENT = (
  <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>insufficient data</span>
);

function indicatorValue(v: number | null, fmt: (v: number) => string) {
  return v == null ? INSUFFICIENT : fmt(v);
}

const INDICATOR_ROWS: { key: keyof AnalysisIndicators; label: string; fmt: (v: number) => string }[] = [
  { key: "sma20", label: "SMA 20", fmt: (v) => `$${v.toFixed(2)}` },
  { key: "sma50", label: "SMA 50", fmt: (v) => `$${v.toFixed(2)}` },
  { key: "sma200", label: "SMA 200", fmt: (v) => `$${v.toFixed(2)}` },
  { key: "rsi14", label: "RSI 14", fmt: (v) => v.toFixed(1) },
  { key: "atr14", label: "ATR 14", fmt: (v) => `$${v.toFixed(2)}` },
  { key: "atr_pct", label: "ATR %", fmt: (v) => `${v.toFixed(2)}%` },
  { key: "macd", label: "MACD", fmt: (v) => v.toFixed(3) },
  { key: "macd_signal", label: "MACD signal", fmt: (v) => v.toFixed(3) },
  { key: "macd_histogram", label: "MACD histogram", fmt: (v) => v.toFixed(3) },
  { key: "realized_vol20", label: "Realized vol 20", fmt: (v) => v.toLocaleString(undefined, { maximumFractionDigits: 4 }) },
];

/* ---------------------------------------------------------------- chart */

// Palette validated with the dataviz skill's validate_palette.js on the dark
// panel surface #161b22 (all six checks pass, all-pairs):
//   close  #4493f8 (--accent) · sma20 #b8860b · sma50 #d15c8f
const SMA20_COLOR = "#b8860b";
const SMA50_COLOR = "#d15c8f";

const VB_W = 960;
const VB_H = 340;
const PAD = { top: 14, right: 16, bottom: 30, left: 64 };

function buildPath(
  values: (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
    pen = true;
  });
  return d;
}

function PriceChart({ series }: { series: AnalysisSeries }) {
  const [hover, setHover] = useState<number | null>(null);

  const n = series.dates.length;
  const all = [...series.close, ...series.sma20, ...series.sma50].filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (n === 0 || all.length === 0) {
    return <p className="empty">No price series available.</p>;
  }

  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.04;
  const yLo = lo - pad;
  const yHi = hi + pad;

  const plotW = VB_W - PAD.left - PAD.right;
  const plotH = VB_H - PAD.top - PAD.bottom;
  const denom = Math.max(1, n - 1);
  const x = (i: number) => PAD.left + (i / denom) * plotW;
  const y = (v: number) => PAD.top + ((yHi - v) / (yHi - yLo)) * plotH;

  const gridValues = [hi, (hi + lo) / 2, lo];

  const moveTo = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * VB_W;
    const i = Math.round(((vx - PAD.left) / plotW) * denom);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const legend = [
    { name: "Close", color: "var(--accent)" },
    { name: "SMA 20", color: SMA20_COLOR },
    { name: "SMA 50", color: SMA50_COLOR },
  ];

  const hoverRows =
    hover == null
      ? []
      : [
          { name: "Close", color: "var(--accent)", value: series.close[hover] ?? null },
          { name: "SMA 20", color: SMA20_COLOR, value: series.sma20[hover] ?? null },
          { name: "SMA 50", color: SMA50_COLOR, value: series.sma50[hover] ?? null },
        ];

  return (
    <div className="chart-scroll">
      <div className="chart-inner">
        <div className="chart-legend">
          {legend.map((s) => (
            <span key={s.name}>
              <span className="key" style={{ borderTopColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          style={{ width: "100%", height: "auto", display: "block", outline: "none" }}
          role="img"
          aria-label={`Close price with SMA 20 and SMA 50 overlays, ${series.dates[0]} to ${series.dates[n - 1]}`}
          tabIndex={0}
          onPointerMove={(e) => moveTo(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover((h) => h ?? n - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const step = e.key === "ArrowLeft" ? -1 : 1;
              setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + step)));
            }
          }}
        >
          {/* recessive hairline grid + y reference labels (min / mid / max) */}
          {gridValues.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={VB_W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(v) + 3.5}
                textAnchor="end"
                fontSize={11}
                fontFamily="var(--font-mono)"
                fill="var(--text-dim)"
              >
                {v.toFixed(2)}
              </text>
            </g>
          ))}

          {/* x reference labels: first / last date */}
          <text
            x={PAD.left}
            y={VB_H - 8}
            fontSize={11}
            fontFamily="var(--font-mono)"
            fill="var(--text-dim)"
          >
            {series.dates[0]}
          </text>
          <text
            x={VB_W - PAD.right}
            y={VB_H - 8}
            textAnchor="end"
            fontSize={11}
            fontFamily="var(--font-mono)"
            fill="var(--text-dim)"
          >
            {series.dates[n - 1]}
          </text>

          {/* series: 2px lines, round joins; sma overlays under the close line */}
          <path
            d={buildPath(series.sma50, x, y)}
            fill="none"
            stroke={SMA50_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={buildPath(series.sma20, x, y)}
            fill="none"
            stroke={SMA20_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={buildPath(series.close, x, y)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* crosshair + hover markers (2px surface ring) */}
          {hover != null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--text-dim)"
                strokeWidth={1}
              />
              {hoverRows.map(
                (r) =>
                  r.value != null && (
                    <circle
                      key={r.name}
                      cx={x(hover)}
                      cy={y(r.value)}
                      r={4}
                      fill={r.color}
                      stroke="var(--bg-panel)"
                      strokeWidth={2}
                    />
                  ),
              )}
            </g>
          )}
        </svg>

        {hover != null && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(x(hover) / VB_W) * 100}%`,
              transform: x(hover) > VB_W / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
          >
            <div className="tt-date">{series.dates[hover]}</div>
            {hoverRows.map((r) => (
              <div key={r.name} className="tt-row">
                <span className="key" style={{ borderTop: `2px solid ${r.color}`, width: 12, display: "inline-block" }} />
                <span className="tt-val">{r.value == null ? "—" : `$${r.value.toFixed(2)}`}</span>
                <span className="tt-name">{r.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- price tab */

const BAR_RANGES = [60, 120, 250] as const;
type BarRange = (typeof BAR_RANGES)[number];

function PriceTab({ ticker }: { ticker: string }) {
  // Range strategy: fetch once at the LARGEST offered range (250, also the
  // server default) and slice client-side — the 60/120 toggles are instant,
  // never refetch, and always agree with the 250-bar view's tail.
  const [range, setRange] = useState<BarRange>(250);

  const bars = useQuery({
    queryKey: ["bars", ticker],
    queryFn: () => api.watchlist.bars(ticker),
    enabled: ticker.length > 0,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
  });

  if (bars.isPending) {
    return (
      <div className="panel">
        <p className="empty">Loading price history for {ticker}…</p>
      </div>
    );
  }
  if (bars.isError) {
    const notOnWatchlist = bars.error instanceof ApiError && bars.error.status === 404;
    return (
      <div className="panel">
        {notOnWatchlist ? (
          <>
            <p className="error">{bars.error.message || `${ticker} is not on the Watchlist.`}</p>
            <p style={{ marginTop: 8, color: "var(--text-dim)" }}>
              Historical data exists only for Watchlist symbols. Add {ticker} on the{" "}
              <Link href="/watchlist" style={{ color: "var(--accent)" }}>
                Watchlist page
              </Link>{" "}
              to start research.
            </p>
          </>
        ) : (
          <p className="error">Price history unavailable: {bars.error.message}</p>
        )}
      </div>
    );
  }

  const all = bars.data.bars;
  if (all.length === 0) {
    return (
      <div className="panel">
        <p className="empty">No price bars stored for {ticker}.</p>
      </div>
    );
  }
  const visible = all.slice(-range);

  return (
    <div className="panel">
      <div
        className="row"
        style={{ justifyContent: "space-between", flexWrap: "wrap", marginBottom: 12 }}
      >
        <h2 style={{ marginBottom: 0 }}>Daily OHLC · last {visible.length} bars</h2>
        <span className="row" role="group" aria-label="Bar range">
          {BAR_RANGES.map((r) => (
            <button
              key={r}
              className={range === r ? "primary" : ""}
              aria-pressed={range === r}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </span>
      </div>
      <CandlestickChart bars={visible} />
      <p className="datasource" style={{ marginTop: 12, marginBottom: 0 }}>
        source: {bars.data.source} (stub data) · showing {visible.length} of {all.length} bars ·{" "}
        {visible[0].date} → {visible[visible.length - 1].date}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- tab bodies */

/**
 * §33 context strip — one wrapping row of chips: symbol regime, market regime,
 * the §7 volatility INPUTS, and the bias badge. The vol chip only DISPLAYS the
 * numbers the options summary reports (null-safe "—" per field) — the §7
 * classification itself happens server-side and is never re-derived here.
 */
function OverviewContextStrip({ ticker, analysis }: { ticker: string; analysis: SymbolAnalysis }) {
  const market = useQuery({ queryKey: ["market-overview"], queryFn: api.market.overview });
  // Same key as the Options tab's default view — the two share one cache entry.
  const options = useQuery({
    queryKey: ["options", ticker, "AUTO"],
    queryFn: () => api.watchlist.options(ticker),
    enabled: ticker.length > 0,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
  });

  const s = options.data?.summary;
  return (
    <div className="row" style={{ flexWrap: "wrap", marginBottom: 16 }}>
      <span className="chip" title="Symbol regime (§6.1 classification)">
        regime {analysis.regime.classification}
      </span>
      <span className="chip" title="Market regime (market overview)">
        market {market.data?.market_regime ?? "—"}
      </span>
      <span
        className="chip"
        title="§7 volatility inputs from the options summary — display only; the vol regime is classified server-side"
      >
        ATM IV {pctOrDash(s?.atm_iv)} · RV20 {pctOrDash(s?.rv20)} · IV−RV{" "}
        {signedPctOrDash(s?.iv_rv_spread)} · exp move {plusMinusPctOrDash(s?.expected_move_pct)}
      </span>
      <span className={`badge ${analysis.signal.bias.toLowerCase()}`}>
        {analysis.signal.bias}
      </span>
    </div>
  );
}

function OverviewTab({ ticker, analysis }: { ticker: string; analysis: SymbolAnalysis }) {
  const { signal, regime } = analysis;
  const featureEntries = Object.entries(regime.features);
  return (
    <>
      <OverviewContextStrip ticker={ticker} analysis={analysis} />

      <div className="statbar">
        <div className="stat">
          <div className="label">Price</div>
          <div className="value">{fmtPrice(analysis.price)}</div>
        </div>
        <div className="stat">
          <div className="label">Regime</div>
          <div className="value" style={{ fontSize: 15 }}>{regime.classification}</div>
        </div>
        <div className="stat">
          <div className="label">Bull score</div>
          <div className="value">{fmtScore(signal.bull_score)}</div>
        </div>
        <div className="stat">
          <div className="label">Bear score</div>
          <div className="value">{fmtScore(signal.bear_score)}</div>
        </div>
        <div className="stat">
          <div className="label">Directional edge</div>
          <div className="value">{fmtSigned(signal.directional_edge)}</div>
        </div>
        <div className="stat">
          <div className="label">Bias</div>
          <div className="value">
            <span className={`badge ${signal.bias.toLowerCase()}`}>{signal.bias}</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Signal components</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
          The scores above are the weighted sum of these checks — no opaque confidence numbers.
        </p>
        {signal.components.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th>Side</th>
                <th>Triggered</th>
                <th style={{ textAlign: "right" }}>Weight</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {signal.components.map((c) => (
                <tr key={`${c.side}-${c.name}`}>
                  <td>{c.name}</td>
                  <td>
                    <span className={`badge ${c.side === "bull" ? "bull" : "bear"}`}>
                      {c.side.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {c.triggered ? (
                      <span style={{ color: "var(--green)" }}>✓</span>
                    ) : (
                      <span style={{ color: "var(--text-dim)" }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>{c.weight.toFixed(1)}</td>
                  <td style={{ color: "var(--text-dim)" }}>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">No signal components reported.</p>
        )}
      </div>

      <div className="panel">
        <h2>Regime features</h2>
        {featureEntries.length > 0 ? (
          <div className="kv">
            {featureEntries.map(([k, v]) => (
              <div key={k}>
                <div className="k">{k}</div>
                <div className="v">{fmtFeature(v)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">No regime features reported.</p>
        )}
      </div>
    </>
  );
}

function TechnicalTab({ analysis }: { analysis: SymbolAnalysis }) {
  return (
    <>
      <div className="panel">
        <h2>Indicators</h2>
        <table>
          <thead>
            <tr>
              <th>Indicator</th>
              <th style={{ textAlign: "right" }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {INDICATOR_ROWS.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td style={{ textAlign: "right" }}>
                  {indicatorValue(analysis.indicators[row.key], row.fmt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>
          Close · last {analysis.series.dates.length} bars
        </h2>
        <PriceChart series={analysis.series} />
      </div>
    </>
  );
}

function BacktestTab({ ticker }: { ticker: string }) {
  const list = useQuery({
    queryKey: ["backtests", ticker],
    queryFn: () => api.backtests.list(ticker),
  });
  const latest =
    list.data && list.data.length > 0
      ? [...list.data].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      : undefined;
  const record = useQuery({
    queryKey: ["backtest", latest?.id],
    queryFn: () => api.backtests.get(latest!.id),
    enabled: latest != null,
    staleTime: Infinity,
    refetchInterval: false,
  });

  return (
    <div className="panel">
      <h2>Latest backtest</h2>
      {list.isPending ? (
        <p className="empty">Loading backtests for {ticker}…</p>
      ) : list.isError ? (
        <p className="error">Backtests unavailable: {list.error.message}</p>
      ) : !latest ? (
        <p className="empty">
          No backtests for {ticker} yet.{" "}
          <Link
            href={`/backtests?ticker=${encodeURIComponent(ticker)}`}
            style={{ color: "var(--accent)" }}
          >
            Run one on the Backtests page →
          </Link>
        </p>
      ) : (
        <>
          <p className="datasource" style={{ marginBottom: 12 }}>
            run #{latest.id} · {new Date(latest.created_at).toLocaleString()} ·{" "}
            <span className={`badge ${latest.status === "COMPLETED" ? "green" : "red"}`}>
              {latest.status}
            </span>
            {latest.oos_start_date && <> · out-of-sample from {latest.oos_start_date}</>}
          </p>
          {record.data && record.data.status === "COMPLETED" ? (
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th style={{ textAlign: "right" }}>Full</th>
                  <th className="oos-col" style={{ textAlign: "right" }}>
                    Out-of-Sample
                  </th>
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td style={{ textAlign: "right" }}>{r.fmt(record.data.metrics.full[r.key])}</td>
                    <td className="oos-col" style={{ textAlign: "right" }}>
                      {r.fmt(record.data.metrics.out_of_sample[r.key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : record.data && record.data.status === "FAILED" ? (
            <p className="error">
              Latest backtest failed: {record.data.error ?? "unknown error"}
            </p>
          ) : record.isError ? (
            <p className="error">Run #{latest.id} unavailable: {record.error.message}</p>
          ) : (
            <p className="empty">Loading run #{latest.id}…</p>
          )}
          <p style={{ marginTop: 12 }}>
            <span className="row">
              <Link href={`/backtests?ticker=${encodeURIComponent(ticker)}`} className="btn">
                Run / view backtests
              </Link>
              <Link href={`/backtests?id=${latest.id}`} className="btn">
                Full results →
              </Link>
            </span>
          </p>
        </>
      )}
      <p className="datasource" style={{ marginTop: 12, marginBottom: 0 }}>
        scope: LONG STOCK ONLY (V1) · computed from stored stub/sample bars
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- trade plan */

// §10 gate order — the stepper always renders in exactly this sequence.
const GATE_ORDER: GateName[] = [
  "TRADING_POOL_AUTHORIZATION",
  "DATA_QUALITY",
  "REGIME",
  "DIRECTIONAL_SIGNAL",
  "VOLATILITY",
  "INSTRUMENT",
  "LIQUIDITY",
  "CONTRACT_SELECTION",
  "RISK_APPROVAL",
];

function gateRank(name: string): number {
  const i = GATE_ORDER.indexOf(name as GateName);
  return i === -1 ? GATE_ORDER.length : i;
}

function GateStep({ gate }: { gate: OrderPreviewGate }) {
  const cls = gate.status.toLowerCase(); // pass | fail | skipped
  const glyph = gate.status === "PASS" ? "✓" : gate.status === "FAIL" ? "✕" : "–";
  return (
    <li className={`gate-step ${cls}`}>
      <span className={`g-icon ${cls}`} aria-hidden="true">
        {glyph}
      </span>
      <div>
        <div className="g-name">
          {gate.name}{" "}
          <span
            className={`badge ${
              gate.status === "PASS" ? "green" : gate.status === "FAIL" ? "red" : "dim"
            }`}
          >
            {gate.status}
          </span>
        </div>
        <div className="g-detail">{gate.detail}</div>
      </div>
    </li>
  );
}

function WhyList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <h2>{title}</h2>
      {items.length > 0 ? (
        <ul className="why-list">
          {items.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      ) : (
        <p className="none">none</p>
      )}
    </div>
  );
}

function isApproveErrorDetail(d: unknown): d is OrderApproveErrorDetail {
  if (typeof d !== "object" || d === null) return false;
  const obj = d as Record<string, unknown>;
  if (typeof obj.message !== "string") return false;
  const preview = obj.preview;
  return (
    typeof preview === "object" &&
    preview !== null &&
    Array.isArray((preview as { gates?: unknown }).gates)
  );
}

function ApproveErrorView({ ticker, error }: { ticker: string; error: Error }) {
  if (error instanceof ApiError) {
    if (error.status === 422 && isApproveErrorDetail(error.detail)) {
      const failed = error.detail.preview.gates.find((g) => g.status === "FAIL");
      return (
        <div>
          <p className="error">
            Approval rejected — the server re-ran the full gate chain at approval time (client
            previews are never trusted) and it no longer passes: {error.detail.message}
          </p>
          {failed && (
            <p className="error" style={{ fontFamily: "var(--font-mono)" }}>
              FAILED gate: {failed.name} — {failed.detail}
            </p>
          )}
        </div>
      );
    }
    if (error.status === 409) {
      return (
        <p className="error">
          {ticker} already has an open position — adding to an open position (pyramiding) is not
          supported in V1. Close it on the Positions page first.
        </p>
      );
    }
  }
  return <p className="error">Approval failed: {error.message}</p>;
}

function ApprovePanel({ ticker, plan }: { ticker: string; plan: OrderPreview }) {
  const qc = useQueryClient();
  // Idempotency key (§42): one UUID per click-intent. Accidental double-clicks
  // and retries reuse the same key — the server returns the existing order
  // instead of filling twice. Regenerated only after a successful fill, so the
  // next intent is a fresh order.
  const [clientOrderId, setClientOrderId] = useState(() => crypto.randomUUID());

  const approve = useMutation({
    mutationFn: () =>
      api.orders.approve(ticker, plan.proposed.quantity_requested ?? undefined, clientOrderId),
    onSuccess: () => {
      setClientOrderId(crypto.randomUUID());
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["portfolio-risk"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const risk = plan.risk;
  if (risk == null) return null;

  const { instrument, contract } = plan.proposed;
  const isOption = instrument === "LONG_CALL" || instrument === "LONG_PUT";
  const unit = isOption ? "CONTRACTS" : "SHARES";

  const onApprove = () => {
    const entry = plan.proposed.entry_price;
    // §39 — max loss is NEVER hidden: for options the confirm restates the
    // instrument, the exact contract, and the full premium at risk
    // (approved_quantity × max_loss_per_contract).
    const lines = [
      `APPROVE & EXECUTE (paper) — BUY_TO_OPEN ${risk.approved_quantity.toLocaleString()} ${ticker} ${unit}`,
      ``,
      `Instrument: ${instrument}`,
      ...(contract != null ? [`Contract: ${fmtProposedContract(contract)}`] : []),
      `Approved quantity: ${risk.approved_quantity.toLocaleString()} ${unit.toLowerCase()}${
        isOption ? " (multiplier ×100)" : ""
      }`,
      isOption
        ? `Entry premium: ${entry == null ? "unknown" : fmtUsd(entry, 2)} per contract (mid × 100)`
        : `Entry estimate: ${entry == null ? "unknown" : fmtUsd(entry, 2)} — paper fill = last stored close × (1 + paper_slippage_bps/10000), commission = paper_commission_per_share × qty`,
      isOption && contract != null
        ? `PREMIUM MAX LOSS: ${risk.approved_quantity.toLocaleString()} × ${fmtUsd(
            contract.max_loss_per_contract,
            2,
          )} = ${fmtUsd(
            risk.approved_quantity * contract.max_loss_per_contract,
          )} — the FULL premium is at risk (§12.1)`
        : `Max loss at stop: ${fmtUsd(risk.trade_risk_usd)}`,
      ``,
      `The server re-runs the FULL gate chain before filling — this client preview is never trusted.`,
    ];
    if (confirm(lines.join("\n"))) approve.mutate();
  };

  return (
    <div className="panel">
      <h2>Execute (paper)</h2>
      {approve.data ? (
        <>
          <p style={{ color: "var(--green)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
            FILLED — order #{approve.data.order.id} · {approve.data.order.side}{" "}
            {approve.data.order.quantity.toLocaleString()} {approve.data.order.ticker} @{" "}
            {fmtUsd(approve.data.order.fill_price, 2)} · commission{" "}
            {fmtUsd(approve.data.order.commission, 2)}
          </p>
          <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "8px 0" }}>
            Position #{approve.data.position.id}: {approve.data.position.quantity.toLocaleString()}{" "}
            {isOption ? "contracts" : "shares"} @ {fmtUsd(approve.data.position.avg_price, 2)} avg
            · stop {fmtUsd(approve.data.position.stop_price, 2)} · max loss{" "}
            {fmtUsd(approve.data.position.max_loss)}. The server re-ran all gates before this
            fill.
          </p>
          <Link href="/positions" className="btn">
            View on Positions →
          </Link>
        </>
      ) : (
        <>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="primary" onClick={onApprove} disabled={approve.isPending}>
              {approve.isPending ? "Executing…" : "Approve & Execute (paper)"}
            </button>
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
              Approval re-runs the full gate chain server-side before any paper fill.
            </span>
          </div>
          {approve.isError && <ApproveErrorView ticker={ticker} error={approve.error} />}
        </>
      )}
    </div>
  );
}

function TradePlanResult({ plan, execute }: { plan: OrderPreview; execute?: ReactNode }) {
  const gates = [...plan.gates].sort((a, b) => gateRank(a.name) - gateRank(b.name));
  const { proposed, risk, signal } = plan;
  // §14 — when the RISK_APPROVAL gate applied a vol-targeting multiplier to the
  // risk budget, surface its detail verbatim next to the budget figure (the
  // gate detail is the audited wording; it is never truncated).
  const riskGateDetail = gates.find((g) => g.name === "RISK_APPROVAL")?.detail;
  const multiplierNote =
    riskGateDetail != null && /multiplier/i.test(riskGateDetail) ? riskGateDetail : null;
  const isOption = proposed.instrument === "LONG_CALL" || proposed.instrument === "LONG_PUT";
  // Quantities are CONTRACTS (×100 multiplier) for options, SHARES for stock.
  const unitSuffix = isOption ? " CONTRACTS" : proposed.instrument === "LONG_STOCK" ? " SHARES" : "";
  return (
    <>
      <p className="datasource">
        as of {new Date(plan.as_of).toLocaleString()} · instrument: {proposed.instrument}
        {signal.bias != null && <> · signal bias {signal.bias}</>}
        {signal.edge != null && <> · edge {signal.edge > 0 ? "+" : ""}{signal.edge.toFixed(1)}</>}
        {signal.strength != null && <> · strength {signal.strength}</>}
      </p>

      <div className="panel">
        <h2>Gate chain</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
          Every order proposal passes these gates in order — a FAIL stops evaluation and the
          remaining gates are not evaluated. Nothing is hidden.
        </p>
        <ul className="gate-list">
          {gates.map((g) => (
            <GateStep key={g.name} gate={g} />
          ))}
        </ul>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Proposed sizing</h2>
          {risk != null && (
            <span className={`badge ${DECISION_BADGE[risk.decision]}`}>{risk.decision}</span>
          )}
        </div>

        {/* Instrument line — §8 matrix verdict + volatility regime input. */}
        <div className="row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ color: "var(--text-dim)", fontSize: 12 }}>Instrument</span>
          <span className={`badge ${INSTRUMENT_BADGE[proposed.instrument] ?? "dim"}`}>
            {proposed.instrument}
          </span>
          {proposed.vol_regime != null && (
            <span
              className={`badge ${VOL_REGIME_BADGE[proposed.vol_regime] ?? "dim"}`}
              title="Volatility regime — input to the §8 instrument matrix"
            >
              VOL {proposed.vol_regime}
            </span>
          )}
          {isOption ? (
            <span className="chip">sized in CONTRACTS · multiplier ×100</span>
          ) : proposed.instrument === "LONG_STOCK" ? (
            <span className="chip">sized in SHARES</span>
          ) : null}
        </div>
        {(proposed.instrument_rationale ?? []).length > 0 && (
          <ul className="why-list" style={{ color: "var(--text-dim)", marginBottom: 12 }}>
            {proposed.instrument_rationale.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
        {proposed.contract != null && (
          <p
            className="chip"
            title="Top-ranked §9 contract candidate"
            style={{ fontSize: 12, padding: "6px 10px", marginBottom: 12 }}
          >
            {fmtProposedContract(proposed.contract)}
          </p>
        )}

        {risk != null && (
          <>
            <div className="kv" style={{ marginBottom: 12 }}>
              <div>
                <div className="k">{isOption ? "Premium / contract (mid × 100)" : "Entry price"}</div>
                <div className="v">{proposed.entry_price == null ? "—" : fmtUsd(proposed.entry_price, 2)}</div>
              </div>
              <div>
                <div className="k">{isOption ? "Stop distance (full premium)" : "Stop distance"}</div>
                <div className="v">{proposed.stop_distance == null ? "—" : fmtUsd(proposed.stop_distance, 2)}</div>
              </div>
              <div>
                <div className="k">Quantity requested</div>
                <div className="v">
                  {proposed.quantity_requested == null
                    ? "auto"
                    : `${proposed.quantity_requested.toLocaleString()}${unitSuffix}`}
                </div>
              </div>
              <div>
                <div className="k">Quantity approved</div>
                <div className="v">
                  {risk.approved_quantity.toLocaleString()}
                  {unitSuffix}
                  {isOption ? " (×100)" : ""}
                </div>
              </div>
              <div>
                <div className="k">Signal strength</div>
                <div className="v">{risk.signal_strength ?? "—"}</div>
              </div>
              <div>
                <div className="k">Risk budget</div>
                <div className="v">{risk.risk_budget_pct == null ? "—" : `${fmtPct(risk.risk_budget_pct, 2)} of NAV`}</div>
              </div>
              <div>
                <div className="k">Trade risk</div>
                <div className="v">{fmtUsd(risk.trade_risk_usd)}</div>
              </div>
              <div>
                <div className="k">Heat before → after</div>
                <div className="v">
                  {fmtPct(risk.heat_before_pct)} → {fmtPct(risk.heat_after_pct)}
                </div>
              </div>
              <div>
                <div className="k">Cash after</div>
                <div className="v">{risk.cash_after_pct == null ? "—" : fmtPct(risk.cash_after_pct)}</div>
              </div>
            </div>
            {multiplierNote != null && (
              <p
                style={{
                  color: "var(--text-dim)",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  marginBottom: 8,
                }}
                title="From the RISK_APPROVAL gate — §14 vol-targeting multiplier applied to the risk budget. Hard risk caps always apply."
              >
                {multiplierNote}
              </p>
            )}
            {isOption && (
              <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 8 }}>
                §12.1 options sizing: entry price and stop distance are BOTH the full premium
                (mid × 100), so the approved quantity IS the number of contracts and every
                stock risk cap applies unchanged.
              </p>
            )}
            {risk.reason_codes.length > 0 && (
              <p className="row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
                {risk.reason_codes.map((c) => (
                  <span key={c} className="chip">
                    {c}
                  </span>
                ))}
              </p>
            )}
            {risk.explanations.length > 0 && (
              <ul className="why-list" style={{ color: "var(--text-dim)" }}>
                {risk.explanations.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {execute}

      <div className="why-cols" style={{ marginBottom: 16 }}>
        <WhyList title="Why trade" items={plan.why_trade} />
        <WhyList title="Why not trade" items={plan.why_not_trade} />
      </div>
    </>
  );
}

function TradePlanTab({ ticker }: { ticker: string }) {
  const [qty, setQty] = useState("");
  const [inputError, setInputError] = useState("");

  const preview = useMutation({
    mutationFn: (quantity?: number) => api.orders.preview(ticker, quantity),
  });

  const onGenerate = () => {
    const trimmed = qty.trim();
    if (trimmed === "") {
      setInputError("");
      preview.mutate(undefined);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0) {
      setInputError("Quantity must be a positive whole number (or blank for auto-sizing).");
      return;
    }
    setInputError("");
    preview.mutate(n);
  };

  const canExecute =
    preview.data?.risk != null &&
    (preview.data.risk.decision === "APPROVE" ||
      preview.data.risk.decision === "APPROVE_WITH_RESIZE");

  return (
    <>
      <div className="preview-note">
        <strong>PREVIEW</strong> — generating a plan places no order; it runs the full gate
        chain and risk sizing and writes an auditable RISK_DECISION event. Approving executes a
        paper order, and approval re-runs ALL gates server-side — a stale client preview is
        never trusted.
      </div>

      <div className="panel">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <input
            type="number"
            min={1}
            step={1}
            placeholder="quantity (optional)"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            style={{ width: 170 }}
            aria-label="Requested quantity (optional — blank lets the risk engine size the trade)"
          />
          <button className="primary" onClick={onGenerate} disabled={preview.isPending}>
            {preview.isPending ? "Generating…" : "Generate Trade Plan"}
          </button>
          <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
            Leave quantity blank to let the risk engine size the trade.
          </span>
        </div>
        {inputError && <p className="error">{inputError}</p>}
        {preview.isError && (
          <p className="error">Trade plan unavailable: {preview.error.message}</p>
        )}
      </div>

      {preview.data ? (
        <TradePlanResult
          plan={preview.data}
          execute={
            canExecute ? (
              // Keyed per preview run: a regenerated plan resets the approve
              // state (fresh fill display + fresh idempotency key).
              <ApprovePanel key={preview.submittedAt} ticker={ticker} plan={preview.data} />
            ) : undefined
          }
        />
      ) : (
        !preview.isPending &&
        !preview.isError && (
          <div className="panel">
            <p className="empty">
              Generate a trade plan to see the gate chain, proposed sizing, and the reasons
              for and against trading {ticker}.
            </p>
          </div>
        )
      )}
    </>
  );
}

function AuditTab({ ticker }: { ticker: string }) {
  const audit = useQuery({
    queryKey: ["audit", ticker],
    queryFn: () => api.audit.list(ticker),
  });

  if (audit.isPending) return <div className="panel"><p className="empty">Loading audit events…</p></div>;
  if (audit.isError) {
    return (
      <div className="panel">
        <p className="error">Audit trail unavailable: {audit.error.message}</p>
      </div>
    );
  }
  return (
    <div className="panel">
      <h2>Events</h2>
      {audit.data.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {audit.data.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleString()}</td>
                <td>
                  <span className={`badge ${e.actor_type.toLowerCase()}`}>{e.actor_type}</span>
                </td>
                <td>{e.action}</td>
                <td className="ticker">{e.entity_id}</td>
                <td style={{ color: "var(--text-dim)" }}>
                  {Object.keys(e.details).length > 0 ? JSON.stringify(e.details) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">No audit events for {ticker}.</p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- page */

export default function SymbolAnalysisPage() {
  const params = useParams<{ ticker: string }>();
  const raw = params?.ticker;
  const ticker = decodeURIComponent(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "")).toUpperCase();

  const [tab, setTab] = useState<ActiveTab>("overview");

  const analysis = useQuery({
    queryKey: ["analysis", ticker],
    queryFn: () => api.watchlist.analysis(ticker),
    enabled: ticker.length > 0,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
    refetchInterval: (query) =>
      query.state.error instanceof ApiError && query.state.error.status === 404
        ? false
        : 15_000,
  });

  const notOnWatchlist =
    analysis.isError && analysis.error instanceof ApiError && analysis.error.status === 404;

  return (
    <>
      <p style={{ marginBottom: 8 }}>
        <Link href="/watchlist" style={{ color: "var(--text-dim)" }}>
          ← Watchlist
        </Link>
      </p>
      <h1>
        <span className="ticker">{ticker}</span> — Symbol Analysis
      </h1>
      <p className="subtitle">
        Research view: explainable indicators, regime, and signal components. Nothing here can
        trade — execution requires the Trading Pool.
      </p>

      <div className="tabs">
        {TABS.map((t) =>
          t.phase ? (
            <button key={t.id} disabled title={`Arrives with ${t.phase}`}>
              {t.label}
              <span className="phase">{t.phase}</span>
            </button>
          ) : (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id as ActiveTab)}
            >
              {t.label}
            </button>
          ),
        )}
      </div>

      {analysis.data && (
        <p className="datasource">
          source: {analysis.data.source} (stub data) · as of{" "}
          {new Date(analysis.data.as_of).toLocaleString()} · {analysis.data.bars.count} bars (
          {analysis.data.bars.first} → {analysis.data.bars.last})
        </p>
      )}

      {tab === "price" ? (
        <PriceTab ticker={ticker} />
      ) : tab === "options" ? (
        <OptionChainTable ticker={ticker} />
      ) : tab === "audit" ? (
        <AuditTab ticker={ticker} />
      ) : tab === "backtest" ? (
        <BacktestTab ticker={ticker} />
      ) : tab === "trade-plan" ? (
        <TradePlanTab ticker={ticker} />
      ) : analysis.isPending ? (
        <div className="panel">
          <p className="empty">Loading analysis for {ticker}…</p>
        </div>
      ) : analysis.isError ? (
        <div className="panel">
          {notOnWatchlist ? (
            <>
              <p className="error">
                {analysis.error.message || `${ticker} is not on the Watchlist.`}
              </p>
              <p style={{ marginTop: 8, color: "var(--text-dim)" }}>
                Historical data exists only for Watchlist symbols. Add {ticker} on the{" "}
                <Link href="/watchlist" style={{ color: "var(--accent)" }}>
                  Watchlist page
                </Link>{" "}
                to start research.
              </p>
            </>
          ) : (
            <p className="error">Analysis unavailable: {analysis.error.message}</p>
          )}
        </div>
      ) : tab === "overview" ? (
        <OverviewTab ticker={ticker} analysis={analysis.data} />
      ) : (
        <TechnicalTab analysis={analysis.data} />
      )}
    </>
  );
}
