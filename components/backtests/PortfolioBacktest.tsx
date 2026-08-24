"use client";

/**
 * Portfolio backtest section (auto-strategy Phase C/E,
 * docs/auto-strategy-portfolio-design.md): run the WHOLE watchlist (or a
 * subset) against one shared cash ledger and show the user's ask verbatim —
 * the per-day allocation of every symbol plus cash.
 *
 * The allocation chart follows the backtests page's own SVG idiom
 * (viewBox + linePath + chart-scroll classes): positive positions stack
 * upward from 0, shorts stack downward, and the cash line reads against
 * the right axis of 100%. Colors cycle a fixed categorical list built on
 * the app's CSS vars so light/dark both hold.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import EquityChart from "@/components/backtests/EquityChart";
import { api } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import type { PortfolioBacktestRecord } from "@/lib/types";

const VB_W = 720;
const CH_H = 240;
const PAD = { top: 12, right: 44, bottom: 20, left: 44 };

// Categorical series colors VALIDATED with the dataviz skill's
// validate_palette.js against the dark panel surface — all six checks
// pass (lightness band, chroma floor, CVD adjacent-pair ΔE ≥ 8,
// normal-vision floor, contrast). Fixed order, never cycled; symbols
// beyond six fold into "Other" per the ≤-series rule.
const SERIES_COLORS = [
  "#2ea043",
  "#4493f8",
  "#c8851c",
  "#c264d9",
  "#f85149",
  "#0e9aa7",
];
const MAX_SERIES = SERIES_COLORS.length;
const OTHER_COLOR = "var(--text-dim)";

function AllocationChart({ record }: { record: PortfolioBacktestRecord }) {
  const t = useT();
  const alloc = record.allocations;
  const n = alloc.dates.length;
  const [hover, setHover] = useState<number | null>(null);
  const named = record.tickers.slice(0, MAX_SERIES);
  const folded = record.tickers.slice(MAX_SERIES);
  const tickers = folded.length > 0 ? [...named, "OTHER"] : named;
  const colorOf = (tk: string) =>
    tk === "OTHER" ? OTHER_COLOR : SERIES_COLORS[named.indexOf(tk) % SERIES_COLORS.length];

  const { minY, maxY } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < n; i++) {
      const row = alloc.by_symbol[i] ?? {};
      let pos = 0;
      let neg = 0;
      for (const v of Object.values(row)) {
        if (v >= 0) pos += v;
        else neg += v;
      }
      hi = Math.max(hi, pos, alloc.cash_pct[i]);
      lo = Math.min(lo, neg);
    }
    return { minY: lo - 4, maxY: Math.max(hi, 100) + 4 };
  }, [alloc, n]);

  if (n === 0) {
    return <p className="empty">{t("No allocation data.", "暂无分配数据。")}</p>;
  }

  const plotW = VB_W - PAD.left - PAD.right;
  const plotH = CH_H - PAD.top - PAD.bottom;
  const denom = Math.max(1, n - 1);
  const x = (i: number) => PAD.left + (i / denom) * plotW;
  const y = (v: number) => PAD.top + ((maxY - v) / (maxY - minY)) * plotH;

  // stacked bands per ticker: positives up from 0, negatives down from 0
  const bands = tickers.map((tk) => ({ tk, top: new Array<number>(n), bot: new Array<number>(n) }));
  for (let i = 0; i < n; i++) {
    const raw = alloc.by_symbol[i] ?? {};
    const row: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = named.includes(k) ? k : "OTHER";
      row[key] = (row[key] ?? 0) + v;
    }
    let posBase = 0;
    let negBase = 0;
    for (const b of bands) {
      const v = row[b.tk] ?? 0;
      if (v >= 0) {
        b.bot[i] = posBase;
        b.top[i] = posBase + v;
        posBase += v;
      } else {
        b.top[i] = negBase;
        b.bot[i] = negBase + v;
        negBase += v;
      }
    }
  }

  const bandPath = (top: number[], bot: number[]) => {
    let d = "";
    for (let i = 0; i < n; i++) d += `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(top[i]).toFixed(2)}`;
    for (let i = n - 1; i >= 0; i--) d += `L${x(i).toFixed(2)},${y(bot[i]).toFixed(2)}`;
    return d + "Z";
  };

  let cashPath = "";
  for (let i = 0; i < n; i++) {
    cashPath += `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(alloc.cash_pct[i]).toFixed(2)}`;
  }

  const moveTo = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * VB_W;
    const i = Math.round(((vx - PAD.left) / plotW) * denom);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="chart-scroll">
      <div className="chart-inner">
        <svg
          viewBox={`0 0 ${VB_W} ${CH_H}`}
          style={{ width: "100%", height: "auto", display: "block", outline: "none" }}
          role="img"
          aria-label={t("Daily allocation by symbol", "每日各标的仓位分配")}
          onPointerMove={(e) => moveTo(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
        >
          {/* zero + 100% guides */}
          {[0, 50, 100].map((g) => (
            <g key={g}>
              <line
                x1={PAD.left} x2={VB_W - PAD.right} y1={y(g)} y2={y(g)}
                stroke="var(--border)" strokeWidth={g === 0 ? 1.2 : 0.6}
              />
              <text x={PAD.left - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)">
                {g}%
              </text>
            </g>
          ))}
          {bands.map((b) => (
            <path
              key={b.tk}
              d={bandPath(b.top, b.bot)}
              fill={colorOf(b.tk)}
              fillOpacity={0.6}
              stroke="var(--bg-panel)"
              strokeWidth={1.5}
            />
          ))}
          <path d={cashPath} fill="none" stroke="var(--text-dim)" strokeWidth={1.2} strokeDasharray="4 3" />
          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={CH_H - PAD.bottom} stroke="var(--text-dim)" strokeWidth={0.7} />
          )}
        </svg>
        {hover != null && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(x(hover) / VB_W) * 100}%`,
              transform: x(hover) > VB_W / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
              whiteSpace: "normal",
              maxWidth: 260,
            }}
          >
            <strong>{alloc.dates[hover]}</strong>{" "}
            {t("cash", "现金")} {alloc.cash_pct[hover].toFixed(1)}%
            {Object.entries(alloc.by_symbol[hover] ?? {}).map(([tk, v]) => (
              <span key={tk} style={{ marginLeft: 8, color: colorOf(tk) }}>
                {tk} {v.toFixed(1)}%
              </span>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 6, fontSize: 12 }}>
          {tickers.map((tk) => (
            <span key={tk} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, background: colorOf(tk), display: "inline-block", borderRadius: 2, opacity: 0.8 }} />
              {tk}
            </span>
          ))}
          <span style={{ color: "var(--text-dim)" }}>
            ┄ {t("cash %", "现金 %")} · {t("negative bands = short", "零轴下方 = 空头")}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Server advice text: bilingual pair or (legacy rows) a bare string. */
function adviceText(v: { en: string; zh: string } | string, lang: string): string {
  if (typeof v === "string") return v;
  return lang === "zh" ? v.zh : v.en;
}

export default function PortfolioBacktestPanel() {
  const t = useT();
  const { lang } = useLang();
  const el = useEnumLabel();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  const [showAllJournal, setShowAllJournal] = useState(false);
  const [showSkips, setShowSkips] = useState(false);

  const runs = useQuery({
    queryKey: ["portfolio-backtests"],
    queryFn: () => api.backtests.portfolio.list(5),
  });
  const latest = runs.data?.[0];

  const [maxGross, setMaxGross] = useState("1.0");
  const [cashFloor, setCashFloor] = useState("0");
  const [maxPositions, setMaxPositions] = useState("");

  const run = useMutation({
    mutationFn: () =>
      api.backtests.portfolio.run(undefined, undefined, undefined, {
        max_gross_pct: Number(maxGross) || 1.0,
        cash_floor_pct: Number(cashFloor) || 0.0,
        max_positions: maxPositions.trim() === "" ? null : Number(maxPositions),
      }),
    onSuccess: () => {
      setError("");
      qc.invalidateQueries({ queryKey: ["portfolio-backtests"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="panel" data-testid="portfolio-backtest">
      <h2>{t("Portfolio backtest — the whole watchlist", "组合回测 — 整个自选列表")}</h2>
      <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
        {t(
          "Every symbol runs the §8 AUTO decision stack against ONE shared cash ledger: live §12 tier-budget sizing, |edge|-priority capital contention, and a per-day allocation table (signed — shorts below zero) plus cash.",
          "所有标的共用一本现金账本运行 §8 AUTO 决策栈:实盘 §12 分档预算定仓、|edge| 优先级资金竞争,并输出每日分配表(带符号 — 空头在零轴下方)与现金比例。",
        )}
      </p>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        {/* the capital controls the risk advice names — adjustable in place
            so a suggestion can be acted on with the next click */}
        <label style={{ fontSize: 12 }}>
          {t("Max gross (× equity)", "总敞口上限(× 净值)")}
          <br />
          <input value={maxGross} onChange={(e) => setMaxGross(e.target.value)} style={{ width: 90 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          {t("Cash floor (0-1)", "现金下限(0-1)")}
          <br />
          <input value={cashFloor} onChange={(e) => setCashFloor(e.target.value)} style={{ width: 90 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          {t("Max positions", "最大同时持仓数")}
          <br />
          <input value={maxPositions} onChange={(e) => setMaxPositions(e.target.value)} placeholder={t("no cap", "不限")} style={{ width: 90 }} />
        </label>
        <button className="primary" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending
            ? t("Running…", "运行中…")
            : t("Run portfolio backtest", "运行组合回测")}
        </button>
        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      </div>

      {runs.isPending ? (
        <p className="empty">{t("Loading…", "正在加载…")}</p>
      ) : !latest ? (
        <p className="empty">{t("No portfolio runs yet.", "还没有组合回测记录。")}</p>
      ) : (
        <>
          <p className="datasource" style={{ marginTop: 12 }}>
            {t("run", "运行")} #{latest.id} · {latest.tickers.join(", ")} ·{" "}
            {latest.created_at ? new Date(latest.created_at).toLocaleString() : "—"} ·{" "}
            <span className={`badge ${latest.status === "COMPLETED" ? "green" : "red"}`}>
              {el(latest.status)}
            </span>
          </p>
          {latest.status === "COMPLETED" ? (
            <>
              <div className="statbar">
                <div className="stat">
                  <div className="label">{t("Total return", "总回报")}</div>
                  <div className="value">{latest.metrics.total_return_pct?.toFixed(2)}%</div>
                </div>
                <div className="stat">
                  <div className="label">{t("Max drawdown", "最大回撤")}</div>
                  <div className="value">{latest.metrics.max_drawdown_pct?.toFixed(2)}%</div>
                </div>
                <div className="stat">
                  <div className="label">{t("Trades", "交易数")}</div>
                  <div className="value">{latest.metrics.num_trades}</div>
                </div>
                <div className="stat">
                  <div className="label">{t("Exposure", "持仓时间占比")}</div>
                  <div className="value">{latest.metrics.exposure_pct?.toFixed(1)}%</div>
                </div>
              </div>

              <h3 style={{ marginTop: 16 }}>{t("Equity curve & drawdown", "净值曲线与回撤")}</h3>
              <EquityChart curve={latest.equity_curve} />

              <h3 style={{ marginTop: 16 }}>{t("Daily allocation", "每日仓位分配")}</h3>
              <AllocationChart record={latest} />

              <h3 style={{ marginTop: 16 }}>
                {t("Risk-model advice", "风控建议")}
              </h3>
              {latest.advice.length === 0 ? (
                <p className="empty">
                  {latest.journal.length === 0
                    ? t(
                        "This run predates the risk-advice feature — re-run to get an assessment.",
                        "此运行早于风控建议功能 — 重新运行即可获得评估。",
                      )
                    : t("Nothing rose to advice for this run.", "本次运行没有需要提示的风险发现。")}
                </p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {latest.advice.map((a, i) => (
                    <div key={i} className="panel" style={{ margin: 0, padding: "10px 12px" }}>
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <span
                          className={`badge ${
                            a.severity === "WARNING" ? "red" : a.severity === "SUGGESTION" ? "amber" : "dim"
                          }`}
                        >
                          {el(a.severity)}
                        </span>
                        <span className="chip">{el(a.code)}</span>
                        <strong style={{ fontSize: 13 }}>{adviceText(a.finding, lang)}</strong>
                      </div>
                      <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                        {t("Suggestion:", "建议:")} {adviceText(a.suggestion, lang)}
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-dim)" }}>
                        {t("Why:", "理由:")} {adviceText(a.rationale, lang)}
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                        {Object.entries(a.evidence)
                          .filter(([, v]) => v != null)
                          .map(([k, v]) =>
                            Array.isArray(v)
                              ? `${k}=${v
                                  .map((x) =>
                                    x != null && typeof x === "object"
                                      ? Object.values(x as Record<string, unknown>).join("/")
                                      : String(x),
                                  )
                                  .join(", ")}`
                              : typeof v === "object"
                                ? null
                                : `${k}=${v}`,
                          )
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <h3 style={{ marginTop: 16 }}>
                {t(
                  `Rebalance journal (${latest.journal.length})`,
                  `调仓日志（${latest.journal.length}）`,
                )}
              </h3>
              {latest.journal.length === 0 && (
                <p className="empty">
                  {t(
                    "No journal recorded — this run predates the explainability feature; re-run to get one.",
                    "没有调仓日志 — 此运行早于可解释性功能,重新运行即可生成。",
                  )}
                </p>
              )}
              <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 8 }}>
                {t(
                  "Every capital event: entries carry the full sizing arithmetic (hover), exits carry the live exit rule, skips name the capital constraint that crowded a candidate out.",
                  "每一次资金变动:入场悬停可见完整定仓算式,离场标注实盘离场规则,跳过项写明是哪个资金约束把候选挤出。",
                )}{" "}
                <label style={{ fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={showSkips}
                    onChange={(e) => setShowSkips(e.target.checked)}
                  />{" "}
                  {t("show skips", "显示跳过项")}
                </label>
              </p>
              <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: -4 }}>
                {t(
                  "Reason strings are exact records (never paraphrased). Key terms: ",
                  "原因字符串是精确记录(绝不转述)。关键词:",
                )}
                <code>contention</code>
                {t(
                  " = crowded out by capital (the parentheses name which cap); ",
                  " = 被资金约束挤出(括号内注明是哪个上限);",
                )}
                <code>exit pending</code>
                {t(
                  " = exit decided, waiting for a real fill bar; ",
                  " = 离场已判定,等待真实成交K线;",
                )}
                <code>settled at expiry intrinsic</code>
                {t(" = settled at intrinsic value on expiry.", " = 到期按内在价值结算。")}
              </p>
              {latest.journal.length > 0 && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Date", "日期")}</th>
                      <th>{t("Action", "动作")}</th>
                      <th>{t("Symbol", "标的")}</th>
                      <th>{t("Instrument", "工具")}</th>
                      <th>{t("Qty @ price", "数量@价格")}</th>
                      <th>{t("Reason", "原因")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const visible = latest.journal.filter(
                        (e) => showSkips || e.action !== "SKIP",
                      );
                      return (showAllJournal ? visible : visible.slice(0, 15)).map((e, i) => (
                        <tr key={i} title={e.sizing || e.reason}>
                          <td style={{ whiteSpace: "nowrap" }}>{e.date}</td>
                          <td>
                            <span
                              className={`badge ${
                                e.action === "ENTER" ? "green" : e.action === "EXIT" ? "amber" : "dim"
                              }`}
                            >
                              {e.action === "ENTER"
                                ? t("ENTER", "入场")
                                : e.action === "EXIT"
                                  ? t("EXIT", "离场")
                                  : t("SKIP", "跳过")}
                            </span>
                          </td>
                          <td className="ticker">{e.ticker}</td>
                          <td>{el(e.instrument)}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {e.quantity > 0 ? `${e.quantity} @ ${e.price?.toFixed(2) ?? "—"}` : "—"}
                          </td>
                          <td style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {e.reason}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
              )}
              {latest.journal.filter((e) => showSkips || e.action !== "SKIP").length > 15 && (
                <button onClick={() => setShowAllJournal((v) => !v)} style={{ marginTop: 6 }}>
                  {showAllJournal
                    ? t("Show fewer", "收起")
                    : t("Show all", "展开全部")}
                </button>
              )}

              <h3 style={{ marginTop: 16 }}>
                {t(`Decisions (${latest.decisions.length})`, `决策轨迹（${latest.decisions.length}）`)}
              </h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Date", "日期")}</th>
                      <th>{t("Symbol", "标的")}</th>
                      <th>edge</th>
                      <th>{t("Tier", "强度档")}</th>
                      <th>{t("Vol", "波动率")}</th>
                      <th>{t("Instrument", "工具")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllDecisions ? latest.decisions : latest.decisions.slice(0, 12)).map(
                      (d, i) => (
                        <tr key={i} title={d.rationale}>
                          <td style={{ whiteSpace: "nowrap" }}>{d.date}</td>
                          <td className="ticker">{d.ticker}</td>
                          <td>{d.edge.toFixed(1)}</td>
                          <td>{d.tier ? el(d.tier) : "—"}</td>
                          <td>{d.vol_regime ? el(d.vol_regime) : t("unknown", "未知")}</td>
                          <td>{el(d.instrument)}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              {latest.decisions.length > 12 && (
                <button onClick={() => setShowAllDecisions((v) => !v)} style={{ marginTop: 6 }}>
                  {showAllDecisions
                    ? t("Show fewer", "收起")
                    : t(`Show all ${latest.decisions.length}`, `展开全部 ${latest.decisions.length} 条`)}
                </button>
              )}
            </>
          ) : (
            <p className="error">{latest.error}</p>
          )}
        </>
      )}
    </div>
  );
}
