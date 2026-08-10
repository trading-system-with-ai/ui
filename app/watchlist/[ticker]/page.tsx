"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { METRIC_ROWS } from "@/lib/backtest-metrics";
import type { AnalysisIndicators, AnalysisSeries, SymbolAnalysis } from "@/lib/types";

/* ---------------------------------------------------------------- tabs */

type ActiveTab = "overview" | "technical" | "backtest" | "audit";

const TABS: { id: string; label: string; phase?: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "price", label: "Price", phase: "Phase 1" },
  { id: "technical", label: "Technical" },
  { id: "options", label: "Options", phase: "Phase 1" },
  { id: "news", label: "News", phase: "Phase 8" },
  { id: "backtest", label: "Backtest" },
  { id: "trade-plan", label: "Trade Plan", phase: "Phase 4" },
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

/* ---------------------------------------------------------------- tab bodies */

function OverviewTab({ analysis }: { analysis: SymbolAnalysis }) {
  const { signal, regime } = analysis;
  const featureEntries = Object.entries(regime.features);
  return (
    <>
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

      {tab === "audit" ? (
        <AuditTab ticker={ticker} />
      ) : tab === "backtest" ? (
        <BacktestTab ticker={ticker} />
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
        <OverviewTab analysis={analysis.data} />
      ) : (
        <TechnicalTab analysis={analysis.data} />
      )}
    </>
  );
}
