"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { METRIC_ROWS, fmtNum, fmtPct, returnColor } from "@/lib/backtest-metrics";
import type { BacktestEquityCurve, BacktestParams, BacktestRecord, FillModel } from "@/lib/types";

/* ---------------------------------------------------------------- params */

const DEFAULT_PARAMS: BacktestParams = {
  position_pct: 1.0,
  commission_per_share: 0.005,
  slippage_bps: 5.0,
  fill_model: "CONSERVATIVE",
  worst_slippage_bps: 25.0,
  entry_edge_threshold: 25.0,
  exit_edge_threshold: 10.0,
  atr_trail_k: 3.0,
  time_stop_bars: 20,
  min_move_atr: 1.0,
  oos_split: 0.7,
  warmup_bars: 200,
};

/** Every BacktestParams field except the enum — these run through the numeric inputs. */
type NumericParamKey = Exclude<keyof BacktestParams, "fill_model">;

interface NumericField {
  key: NumericParamKey;
  label: string;
  step: string;
}

/**
 * §20.2 fill models mapped to daily-bar data (no historical bid/ask yet — WORST
 * becomes ask-to-buy/bid-to-sell once real quote data lands). Commission is
 * unchanged in all models.
 */
const FILL_MODELS: { value: FillModel; desc: string }[] = [
  { value: "OPTIMISTIC", desc: "next-open, frictionless best case — upper bound, never plan on it" },
  { value: "CONSERVATIVE", desc: "next-open ± slippage bps (default)" },
  { value: "WORST", desc: "next-open ± max(slippage, worst) bps — worst practical case until real quote data lands" },
];

/** Rendered inside the fill-model block, enabled only when WORST is selected. */
const WORST_SLIPPAGE_FIELD: NumericField = {
  key: "worst_slippage_bps",
  label: "Worst-case slippage (bps)",
  step: "0.5",
};

const PARAM_GROUPS: { title: string; fields: NumericField[] }[] = [
  {
    title: "Fills & Costs",
    fields: [
      { key: "position_pct", label: "Position size (× equity)", step: "0.05" },
      { key: "commission_per_share", label: "Commission $/share", step: "0.001" },
      { key: "slippage_bps", label: "Slippage (bps)", step: "0.5" },
    ],
  },
  {
    title: "Entry & Exit",
    fields: [
      { key: "entry_edge_threshold", label: "Entry edge threshold", step: "1" },
      { key: "exit_edge_threshold", label: "Exit edge threshold", step: "1" },
      { key: "atr_trail_k", label: "ATR trail multiple", step: "0.5" },
      { key: "time_stop_bars", label: "Time stop (bars)", step: "1" },
      { key: "min_move_atr", label: "Min move (ATR)", step: "0.25" },
    ],
  },
  {
    title: "Data Split",
    fields: [
      { key: "oos_split", label: "In-sample fraction", step: "0.05" },
      { key: "warmup_bars", label: "Warmup bars", step: "10" },
    ],
  },
];

/* ---------------------------------------------------------------- chart */

// Colors validated with the dataviz skill's validate_palette.js on the dark
// panel surface #161b22 (all checks pass, incl. CVD + normal-vision floors):
//   equity #4493f8 (--accent) · drawdown #f85149 (--red)
// The OOS region wash/divider uses --amber as an annotation, not a series.
const VB_W = 960;
const EQ_H = 250;
const DD_H = 110;
const PADX = { left: 72, right: 16 };
const EQ_PAD = { top: 24, bottom: 8 };
const DD_PAD = { top: 6, bottom: 24 };

function fmtEquity(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
}

function linePath(values: number[], x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
    pen = true;
  });
  return d;
}

function EquityChart({
  curve,
  oosStartDate,
}: {
  curve: BacktestEquityCurve;
  oosStartDate: string | null;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const n = curve.dates.length;
  const eqVals = curve.equity.filter((v) => Number.isFinite(v));
  if (n === 0 || eqVals.length === 0) {
    return <p className="empty">No equity curve recorded for this run.</p>;
  }

  let eqLo = Math.min(...eqVals);
  let eqHi = Math.max(...eqVals);
  if (eqLo === eqHi) {
    eqLo -= 1;
    eqHi += 1;
  }
  const eqSpan = eqHi - eqLo;
  const eqTop = eqHi + eqSpan * 0.05;
  const eqBot = eqLo - eqSpan * 0.05;

  const dd = curve.drawdown.map((v) => (Number.isFinite(v) ? v : 0));
  let ddLo = Math.min(0, ...dd);
  let ddHi = Math.max(0, ...dd);
  if (ddLo === ddHi) {
    ddLo -= 1;
    ddHi += 0.1;
  }
  const ddSpan = ddHi - ddLo;
  const ddTop = ddHi + ddSpan * 0.08;
  const ddBot = ddLo - ddSpan * 0.08;

  const plotW = VB_W - PADX.left - PADX.right;
  const denom = Math.max(1, n - 1);
  const x = (i: number) => PADX.left + (i / denom) * plotW;
  const eqPlotH = EQ_H - EQ_PAD.top - EQ_PAD.bottom;
  const yE = (v: number) => EQ_PAD.top + ((eqTop - v) / (eqTop - eqBot)) * eqPlotH;
  const ddPlotH = DD_H - DD_PAD.top - DD_PAD.bottom;
  const yD = (v: number) => DD_PAD.top + ((ddTop - v) / (ddTop - ddBot)) * ddPlotH;

  const oosIdx = oosStartDate ? curve.dates.findIndex((d) => d >= oosStartDate) : -1;
  const oosX = oosIdx >= 0 ? x(oosIdx) : null;
  const plotRight = VB_W - PADX.right;

  // drawdown area: filled wash from the 0 baseline down to the value
  const zeroY = yD(0);
  let ddArea = `M${x(0).toFixed(2)},${zeroY.toFixed(2)}`;
  dd.forEach((v, i) => {
    ddArea += `L${x(i).toFixed(2)},${yD(v).toFixed(2)}`;
  });
  ddArea += `L${x(n - 1).toFixed(2)},${zeroY.toFixed(2)}Z`;

  const moveTo = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * VB_W;
    const i = Math.round(((vx - PADX.left) / plotW) * denom);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const pointerProps = {
    onPointerLeave: () => setHover(null),
  };

  return (
    <div className="chart-scroll">
      <div className="chart-inner">
        <svg
          viewBox={`0 0 ${VB_W} ${EQ_H}`}
          style={{ width: "100%", height: "auto", display: "block", outline: "none" }}
          role="img"
          aria-label={`Backtest equity curve, ${curve.dates[0]} to ${curve.dates[n - 1]}${oosStartDate ? `, out-of-sample from ${oosStartDate}` : ""}`}
          tabIndex={0}
          onPointerMove={(e) => moveTo(e.clientX, e.currentTarget)}
          onFocus={() => setHover((h) => h ?? n - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const step = e.key === "ArrowLeft" ? -1 : 1;
              setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + step)));
            }
          }}
          {...pointerProps}
        >
          {/* OOS region: shaded band + solid divider at oos_start_date */}
          {oosX != null && (
            <g>
              <rect x={oosX} y={0} width={Math.max(0, plotRight - oosX)} height={EQ_H} fill="rgba(210, 153, 34, 0.08)" />
              <line x1={oosX} x2={oosX} y1={0} y2={EQ_H} stroke="var(--amber)" strokeWidth={1} />
              {oosIdx > 0 && (
                <text x={PADX.left} y={14} fontSize={10} letterSpacing={1} fontFamily="var(--font-mono)" fill="var(--text-dim)">
                  IN-SAMPLE
                </text>
              )}
              <text x={plotRight} y={14} textAnchor="end" fontSize={10} letterSpacing={1} fontFamily="var(--font-mono)" fill="var(--amber)">
                OUT-OF-SAMPLE · from {oosStartDate}
              </text>
            </g>
          )}

          {/* hairline grid + y labels */}
          {[eqHi, (eqHi + eqLo) / 2, eqLo].map((v) => (
            <g key={v}>
              <line x1={PADX.left} x2={plotRight} y1={yE(v)} y2={yE(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={PADX.left - 8} y={yE(v) + 3.5} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-dim)">
                {fmtEquity(v)}
              </text>
            </g>
          ))}

          {/* equity line */}
          <path d={linePath(curve.equity, x, yE)} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* crosshair + marker */}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={EQ_PAD.top} y2={EQ_H} stroke="var(--text-dim)" strokeWidth={1} />
              {Number.isFinite(curve.equity[hover]) && (
                <circle cx={x(hover)} cy={yE(curve.equity[hover])} r={4} fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={2} />
              )}
            </g>
          )}
        </svg>

        <div className="chart-sublabel">Drawdown</div>

        <svg
          viewBox={`0 0 ${VB_W} ${DD_H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label="Backtest drawdown, same date range as the equity curve above"
          onPointerMove={(e) => moveTo(e.clientX, e.currentTarget)}
          {...pointerProps}
        >
          {oosX != null && (
            <g>
              <rect x={oosX} y={0} width={Math.max(0, plotRight - oosX)} height={DD_H - DD_PAD.bottom + 4} fill="rgba(210, 153, 34, 0.08)" />
              <line x1={oosX} x2={oosX} y1={0} y2={DD_H - DD_PAD.bottom + 4} stroke="var(--amber)" strokeWidth={1} />
            </g>
          )}

          {[ddHi, ddLo].map((v) => (
            <g key={v}>
              <line x1={PADX.left} x2={plotRight} y1={yD(v)} y2={yD(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={PADX.left - 8} y={yD(v) + 3.5} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-dim)">
                {v.toFixed(1)}%
              </text>
            </g>
          ))}

          {/* drawdown area (10% wash) + 2px line */}
          <path d={ddArea} fill="rgba(248, 81, 73, 0.1)" />
          <path d={linePath(dd, x, yD)} fill="none" stroke="var(--red)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* x labels: first / last date (shared x-domain) */}
          <text x={PADX.left} y={DD_H - 6} fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-dim)">
            {curve.dates[0]}
          </text>
          <text x={plotRight} y={DD_H - 6} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-dim)">
            {curve.dates[n - 1]}
          </text>

          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={DD_H - DD_PAD.bottom + 4} stroke="var(--text-dim)" strokeWidth={1} />
              <circle cx={x(hover)} cy={yD(dd[hover])} r={4} fill="var(--red)" stroke="var(--bg-panel)" strokeWidth={2} />
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
            <div className="tt-date">
              {curve.dates[hover]}
              {oosIdx >= 0 && (hover >= oosIdx ? " · OOS" : " · IS")}
            </div>
            <div className="tt-row">
              <span className="key" style={{ borderTop: "2px solid var(--accent)", width: 12, display: "inline-block" }} />
              <span className="tt-val">{Number.isFinite(curve.equity[hover]) ? fmtEquity(curve.equity[hover]) : "—"}</span>
              <span className="tt-name">Equity</span>
            </div>
            <div className="tt-row">
              <span className="key" style={{ borderTop: "2px solid var(--red)", width: 12, display: "inline-block" }} />
              <span className="tt-val">{dd[hover].toFixed(2)}%</span>
              <span className="tt-name">Drawdown</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- results */

function ResultsPanel({ record }: { record: BacktestRecord }) {
  return (
    <>
      <div className="panel">
        <h2>
          Result — <span className="ticker">{record.ticker}</span> · run #{record.id}
        </h2>
        <p className="datasource" style={{ marginBottom: 8 }}>
          {new Date(record.created_at).toLocaleString()} ·{" "}
          <span className={`badge ${record.status === "COMPLETED" ? "green" : "red"}`}>{record.status}</span>{" "}
          <span className="chip" title="§20.2 fill model">
            {record.params.fill_model ?? "CONSERVATIVE"}
          </span>
          {" "}· long stock only (V1) · computed from stored stub/sample bars
        </p>
        {record.status === "FAILED" && (
          <p className="error">Backtest failed: {record.error ?? "unknown error"}</p>
        )}
        {record.oos_start_date && (
          <div className="oos-note" style={{ marginBottom: 0 }}>
            <span className="badge amber" style={{ marginRight: 8 }}>IS / OOS SPLIT</span>
            Out-of-sample period starts <strong>{record.oos_start_date}</strong> — bars from that
            date on were held out of tuning. Judge the strategy on the Out-of-Sample column and the
            shaded region of the chart.
          </div>
        )}
      </div>

      {record.status === "COMPLETED" && (
        <>
          <div className="panel">
            <h2>Metrics — In-Sample vs Out-of-Sample</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="num">In-Sample</th>
                    <th className="num oos-col">
                      Out-of-Sample{record.oos_start_date ? ` · from ${record.oos_start_date}` : ""}
                    </th>
                    <th className="num">Full</th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_ROWS.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td className="num">{r.fmt(record.metrics.in_sample[r.key])}</td>
                      <td className="num oos-col">{r.fmt(record.metrics.out_of_sample[r.key])}</td>
                      <td className="num">{r.fmt(record.metrics.full[r.key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 10 }}>
              §20.2 — historical mid is never a guaranteed fill.
            </p>
          </div>

          <div className="panel">
            <h2>Equity curve & drawdown</h2>
            <EquityChart curve={record.equity_curve} oosStartDate={record.oos_start_date} />
          </div>

          <div className="panel">
            <h2>Trades ({record.trades.length})</h2>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
              Every trade lists the rule that opened it and the rule that closed it — no black boxes.
            </p>
            {record.trades.length > 0 ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Entry</th>
                      <th className="num">Entry px</th>
                      <th>Exit</th>
                      <th className="num">Exit px</th>
                      <th className="num">Bars</th>
                      <th className="num">Return</th>
                      <th>Entry reason</th>
                      <th>Exit reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.trades.map((t, i) => (
                      <tr key={`${t.entry_date}-${i}`}>
                        <td style={{ whiteSpace: "nowrap" }}>{t.entry_date}</td>
                        <td className="num">${t.entry_price.toFixed(2)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {t.exit_date ?? <span style={{ color: "var(--amber)" }}>open</span>}
                        </td>
                        <td className="num">{t.exit_price == null ? "—" : `$${t.exit_price.toFixed(2)}`}</td>
                        <td className="num">{t.bars_held}</td>
                        <td className="num" style={{ color: returnColor(t.return_pct) }}>
                          {fmtPct(t.return_pct, true)}
                        </td>
                        <td style={{ color: "var(--text-dim)", fontSize: 12 }}>{t.entry_reason}</td>
                        <td style={{ color: "var(--text-dim)", fontSize: 12 }}>{t.exit_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">No trades were taken in this run.</p>
            )}
          </div>
        </>
      )}

      <div className="panel">
        <h2>Parameters used</h2>
        <div className="kv">
          {Object.entries(record.params).map(([k, v]) => (
            <div key={k}>
              <div className="k">{k}</div>
              <div className="v">{String(v)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- page */

function parseId(v: string | null): number | null {
  if (!v) return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

function BacktestsView() {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const idParam = sp.get("id");
  const tickerParam = sp.get("ticker");

  const [selectedId, setSelectedId] = useState<number | null>(() => parseId(idParam));
  const [ticker, setTicker] = useState<string>((tickerParam ?? "").toUpperCase());
  const [fillModel, setFillModel] = useState<FillModel>(DEFAULT_PARAMS.fill_model);
  const [paramValues, setParamValues] = useState<Record<NumericParamKey, string>>(() => {
    const init = {} as Record<NumericParamKey, string>;
    (Object.keys(DEFAULT_PARAMS) as (keyof BacktestParams)[]).forEach((k) => {
      if (k === "fill_model") return;
      init[k] = String(DEFAULT_PARAMS[k]);
    });
    return init;
  });
  const [formError, setFormError] = useState("");

  // Honor ?id= / ?ticker= even on client-side navigations to this page.
  useEffect(() => {
    const id = parseId(idParam);
    if (id != null) setSelectedId(id);
  }, [idParam]);
  useEffect(() => {
    if (tickerParam) setTicker(tickerParam.toUpperCase());
  }, [tickerParam]);

  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist.list });
  const history = useQuery({ queryKey: ["backtests"], queryFn: () => api.backtests.list() });
  const record = useQuery({
    queryKey: ["backtest", selectedId],
    queryFn: () => api.backtests.get(selectedId as number),
    enabled: selectedId != null,
    staleTime: Infinity,
    refetchInterval: false,
  });

  const run = useMutation({
    mutationFn: (params: BacktestParams) => api.backtests.run(ticker, params),
    onSuccess: (rec) => {
      qc.setQueryData(["backtest", rec.id], rec);
      setSelectedId(rec.id);
      qc.invalidateQueries({ queryKey: ["backtests"] });
      qc.invalidateQueries({ queryKey: ["watchlist-overview"] });
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!ticker) {
      setFormError("Pick a ticker first.");
      return;
    }
    const parsed = {} as BacktestParams;
    const numericFields = [...PARAM_GROUPS.flatMap((g) => g.fields), WORST_SLIPPAGE_FIELD];
    for (const field of numericFields) {
      const raw = paramValues[field.key].trim();
      const num = Number(raw);
      if (raw === "" || !Number.isFinite(num)) {
        setFormError(`Invalid value for “${field.label}”.`);
        return;
      }
      parsed[field.key] = num;
    }
    if (parsed.worst_slippage_bps < 0) {
      setFormError("Worst-case slippage (bps) must be >= 0.");
      return;
    }
    parsed.fill_model = fillModel;
    run.mutate(parsed);
  };

  const tickers = watchlist.data?.map((w) => w.ticker) ?? [];
  const options = ticker && !tickers.includes(ticker) ? [ticker, ...tickers] : tickers;
  const runs = history.data
    ? [...history.data].sort((a, b) => b.created_at.localeCompare(a.created_at))
    : [];

  return (
    <>
      <h1>Backtests</h1>
      <p className="subtitle">
        Run the directional-edge strategy over stored history with explicit fills, costs, and a
        held-out out-of-sample segment. Backtests never place orders.
      </p>

      <div className="scope-note">
        <span className="badge amber">LONG STOCK ONLY (V1)</span>
        <span className="badge dim">STUB DATA</span>
        <span className="note-text">
          V1 backtests long stock only — no shorts, no options — and runs on the stub/sample bars
          stored for Watchlist symbols, not live market data.
        </span>
      </div>

      <div className="bt-layout">
        <div className="panel">
          <h2>Configure run</h2>
          <form onSubmit={submit}>
            <div className="param-group">
              <h3>Symbol</h3>
              {watchlist.isPending ? (
                <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Loading watchlist…</p>
              ) : watchlist.isError ? (
                <p className="error" style={{ marginTop: 0 }}>
                  Watchlist unavailable: {watchlist.error.message}
                </p>
              ) : options.length > 0 ? (
                <select
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  style={{ width: "100%" }}
                  aria-label="Ticker"
                >
                  <option value="" disabled>
                    Select ticker…
                  </option>
                  {options.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              ) : (
                <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
                  Watchlist is empty — backtests run only on Watchlist symbols.{" "}
                  <Link href="/watchlist" style={{ color: "var(--accent)" }}>
                    Add one on the Watchlist page
                  </Link>
                  .
                </p>
              )}
            </div>

            {PARAM_GROUPS.map((group) => (
              <div className="param-group" key={group.title}>
                <h3>{group.title}</h3>
                <div className="param-grid">
                  {group.fields.map((field) => (
                    <div className="param-field" key={field.key}>
                      <label htmlFor={`param-${field.key}`}>{field.label}</label>
                      <input
                        id={`param-${field.key}`}
                        type="number"
                        step={field.step}
                        value={paramValues[field.key]}
                        onChange={(e) =>
                          setParamValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>

                {group.title === "Fills & Costs" && (
                  <div className="fill-model-block">
                    <div className="param-field">
                      <label id="fill-model-label">Fill model (§20.2)</label>
                      <div className="seg-control" role="radiogroup" aria-labelledby="fill-model-label">
                        {FILL_MODELS.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            role="radio"
                            aria-checked={fillModel === m.value}
                            className={fillModel === m.value ? "active" : ""}
                            onClick={() => setFillModel(m.value)}
                          >
                            {m.value}
                          </button>
                        ))}
                      </div>
                      <p className="seg-desc">
                        {FILL_MODELS.find((m) => m.value === fillModel)?.desc}
                      </p>
                    </div>
                    <div className={`param-field${fillModel === "WORST" ? "" : " dimmed"}`}>
                      <label htmlFor={`param-${WORST_SLIPPAGE_FIELD.key}`}>
                        {WORST_SLIPPAGE_FIELD.label}
                      </label>
                      <input
                        id={`param-${WORST_SLIPPAGE_FIELD.key}`}
                        type="number"
                        step={WORST_SLIPPAGE_FIELD.step}
                        min="0"
                        disabled={fillModel !== "WORST"}
                        value={paramValues[WORST_SLIPPAGE_FIELD.key]}
                        onChange={(e) =>
                          setParamValues((prev) => ({
                            ...prev,
                            [WORST_SLIPPAGE_FIELD.key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            <button
              type="submit"
              className="primary"
              disabled={run.isPending || !ticker}
              style={{ width: "100%" }}
            >
              {run.isPending ? "Running backtest…" : "Run Backtest"}
            </button>
            {(formError || run.isError) && (
              <p className="error">{formError || run.error?.message}</p>
            )}
          </form>
        </div>

        <div className="panel">
          <h2>History</h2>
          {history.isPending ? (
            <p className="empty">Loading runs…</p>
          ) : history.isError ? (
            <p className="error">History unavailable: {history.error.message}</p>
          ) : runs.length === 0 ? (
            <p className="empty">No backtests yet. Configure and run one on the left.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>When</th>
                    <th>Status</th>
                    <th>Fill</th>
                    <th className="num">Trades</th>
                    <th className="num">Total return</th>
                    <th className="num">PF</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr
                      key={r.id}
                      className={`click-row${r.id === selectedId ? " selected" : ""}`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td className="ticker">{r.ticker}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString()}</td>
                      <td>
                        <span className={`badge ${r.status === "COMPLETED" ? "green" : "red"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {/* rows that predate the field carry no fill_model — default behavior was CONSERVATIVE */}
                        <span className="chip">{r.fill_model ?? "CONSERVATIVE"}</span>
                      </td>
                      <td className="num">{r.num_trades}</td>
                      <td className="num" style={{ color: returnColor(r.total_return_pct) }}>
                        {fmtPct(r.total_return_pct, true)}
                      </td>
                      <td className="num">{fmtNum(r.profit_factor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedId == null ? (
        <div className="panel">
          <p className="empty">
            Select a run from the history — or run a new backtest — to see full results.
          </p>
        </div>
      ) : record.isPending ? (
        <div className="panel">
          <p className="empty">Loading backtest #{selectedId}…</p>
        </div>
      ) : record.isError ? (
        <div className="panel">
          <p className="error">
            Could not load backtest #{selectedId}: {record.error.message}
          </p>
        </div>
      ) : (
        <ResultsPanel record={record.data} />
      )}
    </>
  );
}

export default function BacktestsPage() {
  return (
    <Suspense
      fallback={
        <div className="panel">
          <p className="empty">Loading backtests…</p>
        </div>
      }
    >
      <BacktestsView />
    </Suspense>
  );
}
