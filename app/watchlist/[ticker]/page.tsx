"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import CandlestickChart from "@/components/charts/CandlestickChart";
import OptionChainTable from "@/components/options/OptionChainTable";
import { EventRiskPlanPanel } from "@/components/catalysts/RiskTab";
import TradeComparison from "@/components/risk/TradeComparison";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import Modal from "@/components/shared/Modal";
import NotConfigured, { NotConfiguredNote } from "@/components/shared/NotConfigured";
import Term from "@/components/shared/Term";
import { useToast } from "@/components/shared/Toast";
import {
  api,
  ApiError,
  isBrokerNotConfigured,
  isMarketDataNotConfigured,
  notConfiguredMessage,
  retryUnlessTerminal,
} from "@/lib/api";
import { METRIC_ROWS } from "@/lib/backtest-metrics";
import { useLang, useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import {
  DECISION_BADGE,
  INSTRUMENT_BADGE,
  TRADEABILITY_BADGE,
  VOL_REGIME_BADGE,
  fmtPct,
  fmtProposedContract,
  fmtUsd,
  occOptionSymbol,
} from "@/lib/risk-format";
import { useCapabilities } from "@/lib/use-capabilities";
import type { PlanEventRisk } from "@/lib/types-event-risk";
import type {
  AnalysisIndicators,
  AnalysisSeries,
  AnalysisSignal,
  EdgeClass,
  ExecutionAuthorization,
  GateName,
  OrderApproveErrorDetail,
  OrderPreview,
  OrderPreviewGate,
  PlanApplyResult,
  PlanRevalidation,
  PlanStatus,
  PromotionCheck,
  ProposedContract,
  SymbolAnalysis,
  TradePlan,
  TradeabilityState,
} from "@/lib/types";
import FlowNav from "@/components/shared/FlowNav";
import NotOnWatchlistBanner from "@/components/watchlist/NotOnWatchlistBanner";
import PriceChart from "@/components/watchlist/PriceChart";
import {
  fmtFeature,
  fmtPrice,
  fmtScore,
  fmtSigned,
  indicatorValue,
  pctOrDash,
  plusMinusPctOrDash,
  signedPctOrDash,
} from "@/components/watchlist/analysis-format";

/** Translator signature (from useT) — passed into helpers that build display
 *  strings outside a component body. */
type TFn = (en: string, zh: string) => string;

/* ---------------------------------------------------------------- tabs */

type ActiveTab =
  | "overview"
  | "price"
  | "technical"
  | "options"
  | "news"
  | "backtest"
  | "trade-plan"
  | "audit";

const TABS: { id: string; label: string; zh: string; phase?: string }[] = [
  { id: "overview", label: "Overview", zh: "总览" },
  { id: "price", label: "Price", zh: "价格" },
  { id: "technical", label: "Technical", zh: "技术面" },
  { id: "options", label: "Options", zh: "期权" },
  { id: "news", label: "News", zh: "新闻" },
  { id: "backtest", label: "Backtest", zh: "回测" },
  { id: "trade-plan", label: "Trade Plan", zh: "交易计划" },
  { id: "audit", label: "Audit", zh: "审计" },
];

/* ---------------------------------------------------------------- formatting */

const INDICATOR_ROWS: { key: keyof AnalysisIndicators; label: string; zh: string; fmt: (v: number) => string }[] = [
  { key: "sma20", label: "SMA 20", zh: "SMA 20", fmt: (v) => `$${v.toFixed(2)}` },
  { key: "sma50", label: "SMA 50", zh: "SMA 50", fmt: (v) => `$${v.toFixed(2)}` },
  { key: "sma200", label: "SMA 200", zh: "SMA 200", fmt: (v) => `$${v.toFixed(2)}` },
  { key: "rsi14", label: "RSI 14", zh: "RSI 14", fmt: (v) => v.toFixed(1) },
  { key: "atr14", label: "ATR 14", zh: "ATR 14", fmt: (v) => `$${v.toFixed(2)}` },
  // atr_pct arrives as a FRACTION (regime.py: atr/close, e.g. 0.0257) despite
  // the _pct name — scale ×100 at display.
  { key: "atr_pct", label: "ATR %", zh: "ATR %", fmt: (v) => `${(v * 100).toFixed(2)}%` },
  { key: "macd", label: "MACD", zh: "MACD", fmt: (v) => v.toFixed(3) },
  { key: "macd_signal", label: "MACD signal", zh: "MACD 信号线", fmt: (v) => v.toFixed(3) },
  { key: "macd_histogram", label: "MACD histogram", zh: "MACD 柱状图", fmt: (v) => v.toFixed(3) },
  // Annualized fraction (0.3478) — shown as % to match the Options tab's RV20.
  { key: "realized_vol20", label: "Realized vol 20", zh: "20日已实现波动率", fmt: (v) => `${(v * 100).toFixed(2)}%` },
];

/** zh labels for the backtest metric rows (the row definitions live in
 *  lib/backtest-metrics and stay untouched — labels resolve at render). */
const METRIC_LABEL_ZH: Record<string, string> = {
  total_return_pct: "总收益率",
  cagr_pct: "年化收益率 (CAGR)",
  sharpe: "夏普比率",
  sortino: "索提诺比率",
  max_drawdown_pct: "最大回撤",
  win_rate: "胜率",
  profit_factor: "盈利因子",
  expectancy_pct: "期望收益",
  avg_trade_pct: "平均每笔收益",
  avg_hold_bars: "平均持仓K线数",
  num_trades: "交易次数",
  exposure_pct: "持仓暴露",
};

/* ---------------------------------------------------------------- chart */

// Palette validated with the dataviz skill's validate_palette.js on the dark
// panel surface #161b22 (all six checks pass, all-pairs):
//   close  #4493f8 (--accent) · sma20 #b8860b · sma50 #d15c8f
/* ---------------------------------------------------------------- price tab */

const BAR_RANGES = [60, 120, 250] as const;
type BarRange = (typeof BAR_RANGES)[number];

function PriceTab({ ticker }: { ticker: string }) {
  const t = useT();
  // Range strategy: fetch once at the LARGEST offered range (250, also the
  // server default) and slice client-side — the 60/120 toggles are instant,
  // never refetch, and always agree with the 250-bar view's tail.
  const [range, setRange] = useState<BarRange>(250);

  const bars = useQuery({
    queryKey: ["bars", ticker],
    queryFn: () => api.watchlist.bars(ticker),
    enabled: ticker.length > 0,
    retry: retryUnlessTerminal,
  });

  if (bars.isPending) {
    return (
      <div className="panel">
        <p className="empty">
          {t(`Loading price history for ${ticker}…`, `正在加载 ${ticker} 的价格历史…`)}
        </p>
      </div>
    );
  }
  if (bars.isError) {
    // No provider means no bars at all — not a chart of made-up prices.
    if (isMarketDataNotConfigured(bars.error)) {
      return <NotConfigured message={notConfiguredMessage(bars.error)} />;
    }
    return (
      <div className="panel">
        <p className="error">
          {t("Price history unavailable:", "价格历史不可用：")} {bars.error.message}
        </p>
      </div>
    );
  }

  const all = bars.data.bars;
  if (all.length === 0) {
    return (
      <div className="panel">
        <p className="empty">
          {t(`No price bars stored for ${ticker}.`, `暂无 ${ticker} 的已存储K线。`)}
        </p>
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
        <h2 style={{ marginBottom: 0 }}>
          {t(`Daily OHLC · last ${visible.length} bars`, `日线 OHLC · 最近 ${visible.length} 根K线`)}
        </h2>
        <span className="row" role="group" aria-label={t("Bar range", "K线区间")}>
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
        {t("source:", "数据源：")} {bars.data.source} ·{" "}
        {t(
          `showing ${visible.length} of ${all.length} bars`,
          `显示 ${visible.length} / ${all.length} 根K线`,
        )}{" "}
        · {visible[0].date} → {visible[visible.length - 1].date}
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
  const t = useT();
  const el = useEnumLabel();
  const market = useQuery({
    queryKey: ["market-overview"],
    queryFn: api.market.overview,
    retry: retryUnlessTerminal,
  });
  // Same key as the Options tab's default view — the two share one cache entry.
  const options = useQuery({
    queryKey: ["options", ticker, "AUTO"],
    queryFn: () => api.watchlist.options(ticker),
    enabled: ticker.length > 0,
    retry: retryUnlessTerminal,
  });

  // Either dependency being unconfigured means the same single cause; show one
  // panel and dash out every chip it would have filled.
  const unconfigured =
    isMarketDataNotConfigured(market.error) || isMarketDataNotConfigured(options.error);
  const message =
    notConfiguredMessage(market.error) ?? notConfiguredMessage(options.error);

  const s = unconfigured ? undefined : options.data?.summary;
  return (
    <>
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 16 }}>
        <span className="chip" title={t("Symbol regime (§6.1 classification)", "标的态势（§6.1 分级）")}>
          {t("regime", "标的态势")} {el(analysis.regime.classification)}
        </span>
        <span className="chip" title={t("Market regime (market overview)", "市场态势（市场总览）")}>
          {t("market", "市场")} {unconfigured ? "—" : el(market.data?.market_regime)}
        </span>
        <span
          className="chip"
          title={t(
            "§7 volatility inputs from the options summary — display only; the vol regime is classified server-side",
            "§7 波动率输入，来自期权摘要——仅作展示；波动率状态由服务器端分级",
          )}
        >
          ATM IV {pctOrDash(s?.atm_iv)} · RV20 {pctOrDash(s?.rv20)} · IV−RV{" "}
          {signedPctOrDash(s?.iv_rv_spread)} · {t("exp move", "预期波动")}{" "}
          {plusMinusPctOrDash(s?.expected_move_pct)}
        </span>
        <span className={`badge ${analysis.signal.bias.toLowerCase()}`}>
          {el(analysis.signal.bias)}
        </span>
        <span
          className={`badge ${TRADEABILITY_BADGE[analysis.tradeability.state]}`}
          title={analysis.tradeability.reasons.join(" · ") || t("environment tradeable", "环境可交易")}
        >
          {el(analysis.tradeability.state)}
        </span>
      </div>
      {unconfigured && <NotConfigured message={message} />}
    </>
  );
}

/** Badge CSS class for a §7 edge classification. */
function edgeClassBadge(cls: EdgeClass): string {
  return cls.toLowerCase();
}

/** §10: direction and environment are separate verdicts — when strong
 *  directional evidence meets a non-tradeable environment, say exactly that
 *  instead of letting the pair read as a contradiction. */
function tradeabilityExplanation(
  cls: EdgeClass,
  state: TradeabilityState,
  t: TFn,
): string | null {
  if (state === "TRADEABLE" || cls === "NEUTRAL") return null;
  const side = cls.endsWith("BULL") ? t("bullish", "看多") : t("bearish", "看空");
  const strength = cls.startsWith("STRONG")
    ? t("Strong", "强")
    : cls.startsWith("MODERATE")
      ? t("Moderate", "中度")
      : t("Weak", "弱");
  const env =
    state === "BLOCKED"
      ? t("fails the tradeability gate", "未通过可交易性闸门")
      : state === "CONDITIONAL"
        ? t("passes the tradeability gate only conditionally", "仅有条件地通过可交易性闸门")
        : t("cannot be assessed on the current data", "在当前数据下无法评估");
  return t(
    `${strength} ${side} directional evidence exists, but the current environment ${env}.`,
    `存在${strength}${side}方向性证据，但当前环境${env}。`,
  );
}

/** §14 MARKET STATE block + §10 explanation + §26 "view veto reasons". */
function MarketStatePanel({ analysis }: { analysis: SymbolAnalysis }) {
  const t = useT();
  const el = useEnumLabel();
  const { tradeability, signal } = analysis;
  const [showReasons, setShowReasons] = useState(false);
  const check = (name: string) =>
    tradeability.checks.find((c) => c.name === name);
  const marketCheck = check("MARKET_REGIME");
  const volCheck = check("VOLATILITY_REGIME");
  const explanation = tradeabilityExplanation(signal.classification, tradeability.state, t);
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{t("Market state", "市场状态")}</h2>
        {tradeability.reasons.length > 0 && (
          <button onClick={() => setShowReasons(true)}>{t("View reasons", "查看原因")}</button>
        )}
      </div>
      <div className="kv" style={{ marginTop: 10 }}>
        <div>
          <div className="k">{t("Market regime", "市场态势")}</div>
          <div className="v" title={marketCheck?.detail}>
            {marketCheck?.status === "PASS" ? marketCheck.detail : (marketCheck?.status ?? "—")}
          </div>
        </div>
        <div>
          <div className="k">{t("Symbol regime", "标的态势")}</div>
          <div className="v">{el(analysis.regime.classification)}</div>
        </div>
        <div>
          <div className="k">{t("Volatility", "波动率")}</div>
          <div className="v" title={volCheck?.detail}>
            {volCheck?.status === "PASS"
              ? volCheck.detail
              : volCheck?.status === "CONDITION"
                ? `${el("UNKNOWN")} / ${el("DEGRADED")}`
                : volCheck?.status === "BLOCK"
                  ? el("EXTREME")
                  : "—"}
          </div>
        </div>
        <div>
          <div className="k"><Term k="tradeability">{t("Tradeability", "可交易性")}</Term></div>
          <div className="v">
            <span className={`badge ${TRADEABILITY_BADGE[tradeability.state]}`}>
              {el(tradeability.state)}
            </span>
          </div>
        </div>
      </div>
      {explanation && (
        <p style={{ fontSize: 12, color: "var(--amber)", margin: "10px 0 0" }}>
          {explanation}{" "}
          {t(
            "This is a valid state, not a contradiction — direction and permission are separate layers.",
            "这是一种有效状态，而非矛盾——方向与许可是相互独立的两层判断。",
          )}
        </p>
      )}
      {showReasons && (
        <Modal title={t("Tradeability — evidence", "可交易性 — 证据")} onClose={() => setShowReasons(false)}>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
            {t("Verdict", "判定")}{" "}
            <span className={`badge ${TRADEABILITY_BADGE[tradeability.state]}`}>
              {el(tradeability.state)}
            </span>{" "}
            · {t("rules", "规则版本")} <code>{tradeability.version}</code> ·{" "}
            {t(
              "deterministic environment checks — direction is never an input, and the LLM cannot override any of these (§12).",
              "确定性环境检查——方向从不作为输入，LLM 也无法推翻其中任何一项（§12）。",
            )}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Check", "检查项")}</th>
                  <th>{t("Status", "状态")}</th>
                  <th>{t("Detail", "详情")}</th>
                </tr>
              </thead>
              <tbody>
                {tradeability.checks.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name.replace(/_/g, " ")}</td>
                    <td>
                      <span
                        className={`badge ${
                          c.status === "PASS"
                            ? "green"
                            : c.status === "CONDITION"
                              ? "amber"
                              : c.status === "BLOCK"
                                ? "red"
                                : "dim"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-dim)" }}>{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Compact §8 threshold legend — bands come verbatim from the server, which
 *  derives them from the classifier's own parameters. */
function EdgeLegend({ signal }: { signal: AnalysisSignal }) {
  const t = useT();
  const el = useEnumLabel();
  return (
    <div
      className="edge-legend"
      aria-label={t("Directional edge classification legend", "方向性优势分级图例")}
    >
      {signal.edge_legend.map((band) => (
        <span
          key={band.classification}
          className={`band${band.classification === signal.classification ? " current" : ""}`}
          title={
            band.requires_side_score != null
              ? t(
                  `also requires the ${band.classification.endsWith("BULL") ? "bull" : "bear"} score ≥ ${band.requires_side_score}`,
                  `还需${band.classification.endsWith("BULL") ? "多头" : "空头"}得分 ≥ ${band.requires_side_score}`,
                )
              : undefined
          }
        >
          {band.edge_min <= -100
            ? `≤ ${band.edge_max}`
            : band.edge_max >= 100
              ? `≥ +${band.edge_min}`
              : `${band.edge_min > 0 ? "+" : ""}${band.edge_min}…${band.edge_max > 0 ? "+" : ""}${band.edge_max}`}{" "}
          {el(band.classification)}
          {band.requires_side_score != null ? " *" : ""}
        </span>
      ))}
      <span className="band current" style={{ fontWeight: 700 }}>
        {t("CURRENT", "当前")} {fmtSigned(signal.directional_edge)} → {el(signal.classification)}
      </span>
    </div>
  );
}

/** §5 "How is this calculated?" modal: formula, versions, contribution
 *  breakdown per side, and the research-parameter disclaimer. */
function ScoreExplainerModal({
  signal,
  source,
  asOf,
  onClose,
}: {
  signal: AnalysisSignal;
  source: string;
  asOf: string;
  onClose: () => void;
}) {
  const t = useT();
  const sides: { side: "bull" | "bear"; score: number; label: string }[] = [
    { side: "bull", score: signal.bull_score, label: t("BULL SCORE CONTRIBUTION", "多头得分构成") },
    { side: "bear", score: signal.bear_score, label: t("BEAR SCORE CONTRIBUTION", "空头得分构成") },
  ];
  return (
    <Modal title={t("How is this calculated?", "该分数如何计算？")} onClose={onClose} maxWidth={720}>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
        <span className="provenance data-driven">{t("DATA-DRIVEN", "数据驱动")}</span>{" "}
        {t(
          "Deterministic market-data calculation — no LLM is involved in this score.",
          "确定性市场数据计算——该分数不涉及任何 LLM。",
        )}{" "}
        {t("Source", "数据源")} {source} · {t("as of", "截至")} {new Date(asOf).toLocaleString()} ·{" "}
        {t("weights", "权重")} <code>{signal.weights_version}</code> · {t("thresholds", "阈值")}{" "}
        <code>{signal.classification_version}</code>
      </p>
      <div className="panel" style={{ marginBottom: 12 }}>
        <h2>{t("Formula", "公式")}</h2>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7 }}>
          {t(
            "Side score = 100 × (sum of triggered condition weights) ÷ (total side weight)",
            "单边得分 = 100 ×（已触发条件权重之和）÷（该边总权重）",
          )}
          <br />
          {t("Directional Edge = Bull Score − Bear Score", "方向性优势 = 多头得分 − 空头得分")} ={" "}
          {fmtScore(signal.bull_score)} − {fmtScore(signal.bear_score)} ={" "}
          {fmtSigned(signal.directional_edge)}
        </p>
      </div>
      {sides.map(({ side, score, label }) => {
        const rows = signal.components.filter((c) => c.side === side);
        return (
          <div className="panel" style={{ marginBottom: 12 }} key={side}>
            <h2>{label}</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Condition", "条件")}</th>
                    <th>{t("Triggered", "已触发")}</th>
                    <th style={{ textAlign: "right" }}>{t("Contribution", "贡献")}</th>
                    <th style={{ textAlign: "right" }}>{t("Max", "上限")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.name}>
                      <td title={c.detail}>{c.name}</td>
                      <td>
                        {c.triggered ? (
                          <span style={{ color: "var(--green)" }}>✓</span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {c.contribution > 0 ? `+${c.contribution.toFixed(1)}` : "0"}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-dim)",
                        }}
                      >
                        {c.max_contribution.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 700 }}>{t("TOTAL", "合计")}</td>
                    <td />
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      {fmtScore(score)} / 100
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <div className="panel" style={{ marginBottom: 12 }}>
        <h2>{t("Classification thresholds", "分级阈值")}</h2>
        <EdgeLegend signal={signal} />
        <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
          {t(
            "* STRONG bands additionally require the same-side score to clear its minimum — a one-sided but weak read cannot be labeled STRONG.",
            "* “强”档位还要求同边得分达到其最低门槛——单边但偏弱的读数不能被标记为“强”。",
          )}
        </p>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-dim)" }}>
        {t(
          "Weights and thresholds are versioned research parameters, not universal financial truths. Every backtest records the configuration version it ran under.",
          "权重与阈值是带版本号的研究参数，并非普适的金融真理。每次回测都会记录其运行所用的配置版本。",
        )}
      </p>
    </Modal>
  );
}

/** §11 LLM CATALYST ANALYSIS — Generated interpretation. Visually and
 *  logically separate from the deterministic quant panel (§25): amber
 *  LLM-GENERATED identity, its own timestamps (§38), citations, and
 *  explicit uncertainty language. Never mixes market-derived numbers in. */
function LlmCatalystPanel({ ticker }: { ticker: string }) {
  const t = useT();
  const el = useEnumLabel();
  const catalyst = useQuery({
    queryKey: ["catalyst", ticker],
    queryFn: () => api.catalyst(ticker),
    retry: retryUnlessTerminal,
  });
  if (catalyst.isPending || catalyst.isError) return null;
  const { llm, articles, latest_source_published_at } = catalyst.data;
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div>
        <span className="provenance llm-generated">{t("LLM-GENERATED", "LLM 生成")}</span>{" "}
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          {t("LLM CATALYST ANALYSIS — generated interpretation", "LLM 催化剂分析 — 生成式解读")}
        </span>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "6px 0 12px" }}>
        {t(
          "This section is interpretive and generated by the LLM from cited news and market information. It cannot override quant eligibility, risk limits, or any veto (§12).",
          "本节内容为 LLM 基于已引用的新闻与市场信息生成的解读性分析，无法推翻量化资格判定、风险限额或任何否决（§12）。",
        )}
        {llm != null && (
          <>
            {" "}{t("Generated", "生成于")} {new Date(llm.generated_at).toLocaleString()}
            {latest_source_published_at != null &&
              ` · ${t("latest source", "最新来源")} ${new Date(latest_source_published_at).toLocaleString()}`}
            {" "}· {t("model", "模型")} {llm.model || t("unknown (pre-upgrade row)", "未知（升级前记录）")}
          </>
        )}
      </p>
      {llm == null ? (
        <p className="empty">
          {t(
            `No LLM interpretation has been generated for ${ticker}. Interpretations are created on the Recommendations refresh from stored, cited news — nothing is invented here.`,
            `${ticker} 尚未生成 LLM 解读。解读在“推荐”页刷新时基于已存储、已引用的新闻生成——不会凭空捏造任何内容。`,
          )}
        </p>
      ) : (
        <>
          <div className="kv" style={{ marginBottom: 10 }}>
            <div>
              <div className="k">{t("Catalyst sentiment", "催化剂情绪")}</div>
              <div className="v">
                {llm.sentiment > 0 ? "+" : ""}
                {llm.sentiment.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="k">{t("Impact", "影响力")}</div>
              <div className="v">{llm.impact.toFixed(2)}</div>
            </div>
            <div>
              <div className="k">{t("Novelty", "新颖度")}</div>
              <div className="v">{llm.novelty.toFixed(2)}</div>
            </div>
            <div>
              <div className="k">{t("Source reliability", "来源可靠性")}</div>
              <div className="v">{llm.source_reliability.toFixed(2)}</div>
            </div>
            <div>
              <div className="k">{t("Expected horizon", "预期时间跨度")}</div>
              <div className="v">{el(llm.horizon)}</div>
            </div>
            <div>
              <div className="k">{t("Catalyst type", "催化剂类型")}</div>
              <div className="v" style={{ fontSize: 12 }}>{llm.catalyst_type}</div>
            </div>
          </div>
          {llm.summary && (
            <p style={{ fontSize: 13, marginBottom: 10 }}>{llm.summary}</p>
          )}
          {llm.evidence.length > 0 && (
            <>
              <div className="k" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {t(
                  `EVIDENCE (${llm.evidence.length} source${llm.evidence.length === 1 ? "" : "s"})`,
                  `证据（${llm.evidence.length} 个来源）`,
                )}
              </div>
              <ul className="why-list" style={{ marginTop: 4 }}>
                {llm.evidence.map((ev, i) => (
                  <li key={i} style={{ fontSize: 12 }}>
                    <a href={ev.source} target="_blank" rel="noreferrer">
                      {ev.snippet || ev.source}
                    </a>{" "}
                    <span style={{ color: "var(--text-dim)" }}>
                      ({new Date(ev.published_at).toLocaleString()})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {articles.length > 0 && (
        <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
          {t(
            `${articles.length} stored news article${articles.length === 1 ? "" : "s"} cite ${ticker}; the latest is from`,
            `已存储 ${articles.length} 篇引用 ${ticker} 的新闻；最新一篇发布于`,
          )}{" "}
          {new Date(articles[0].published_at).toLocaleString()} ({articles[0].publisher}).
        </p>
      )}
    </div>
  );
}

/** News tab (Phase 8/§11/§38): stored, cited articles for this symbol plus
 *  the LLM interpretation built on them. Everything here is either verbatim
 *  provider news (with its own timestamps) or labeled LLM-GENERATED —
 *  nothing is invented, and market data never mixes in. */
function NewsTab({ ticker }: { ticker: string }) {
  const t = useT();
  const catalyst = useQuery({
    queryKey: ["catalyst", ticker],
    queryFn: () => api.catalyst(ticker),
    retry: retryUnlessTerminal,
  });

  if (catalyst.isPending) {
    return (
      <div className="panel">
        <p className="empty">{t("Loading stored news…", "正在加载已存储新闻…")}</p>
      </div>
    );
  }
  if (catalyst.isError) {
    return (
      <div className="panel">
        <p className="error">
          {t("News unavailable:", "新闻不可用：")} {catalyst.error.message}
        </p>
      </div>
    );
  }
  const { articles, latest_source_published_at } = catalyst.data;
  return (
    <>
      <LlmCatalystPanel ticker={ticker} />

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>
            {t(`Stored news citing ${ticker}`, `引用 ${ticker} 的已存储新闻`)}
          </h2>
          {latest_source_published_at != null && (
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {t("latest source", "最新来源")}{" "}
              {new Date(latest_source_published_at).toLocaleString()}
            </span>
          )}
        </div>
        <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "6px 0 12px" }}>
          {t(
            "Real articles fetched verbatim from the market data provider and stored during the Recommendations refresh — each keeps its own publisher and timestamp. Nothing here is generated.",
            "真实文章在“推荐”页刷新时从行情数据提供商原样抓取并存储——每篇均保留其发布方与时间戳。此处没有任何生成内容。",
          )}
        </p>
        {articles.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Published", "发布时间")}</th>
                  <th>{t("Publisher", "发布方")}</th>
                  <th>{t("Title", "标题")}</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <tr key={a.url}>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {new Date(a.published_at).toLocaleString()}
                    </td>
                    <td style={{ fontSize: 12 }}>{a.publisher || "—"}</td>
                    <td style={{ fontSize: 13 }}>
                      <a href={a.url} target="_blank" rel="noreferrer">
                        {a.title}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            {t(
              `No stored articles cite ${ticker} yet. Articles are ingested when the Recommendations refresh runs — refresh there to fetch the latest news feed.`,
              `尚无引用 ${ticker} 的已存储文章。文章在“推荐”页刷新时摄入——请前往该页刷新以获取最新新闻。`,
            )}
          </p>
        )}
      </div>
    </>
  );
}

function OverviewTab({ ticker, analysis }: { ticker: string; analysis: SymbolAnalysis }) {
  const t = useT();
  const el = useEnumLabel();
  const { signal, regime } = analysis;
  const featureEntries = Object.entries(regime.features);
  const [showExplainer, setShowExplainer] = useState(false);
  return (
    <>
      <OverviewContextStrip ticker={ticker} analysis={analysis} />

      <MarketStatePanel analysis={analysis} />

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <span className="provenance data-driven">{t("DATA-DRIVEN", "数据驱动")}</span>{" "}
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              {t(
                "QUANTITATIVE ANALYSIS — deterministic market-data calculation",
                "量化分析 — 确定性市场数据计算",
              )}
            </span>
          </div>
          <button
            onClick={() => setShowExplainer(true)}
            title={t(
              "Formula, weights, thresholds and each component's contribution",
              "公式、权重、阈值及各分量的贡献",
            )}
          >
            ⓘ {t("How is this calculated?", "该分数如何计算？")}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "6px 0 12px" }}>
          {t("Source", "数据源")} {analysis.source} · {t("as of", "截至")}{" "}
          {new Date(analysis.as_of).toLocaleString()} ·{" "}
          {t("no LLM is involved in this score", "该分数不涉及任何 LLM")} · {t("weights", "权重")}{" "}
          {signal.weights_version}
        </p>

        <div className="statbar" style={{ marginBottom: 12 }}>
          <div className="stat">
            <div className="label">{t("Price", "价格")}</div>
            <div className="value">{fmtPrice(analysis.price)}</div>
          </div>
          <div className="stat">
            <div className="label"><Term k="market_regime">{t("Regime", "态势")}</Term></div>
            <div className="value" style={{ fontSize: 15 }}>{el(regime.classification)}</div>
          </div>
          <div className="stat">
            <div className="label"><Term k="bull_score">{t("Bull score", "多头得分")}</Term></div>
            <div className="value">{fmtScore(signal.bull_score)}</div>
          </div>
          <div className="stat">
            <div className="label"><Term k="bear_score">{t("Bear score", "空头得分")}</Term></div>
            <div className="value">{fmtScore(signal.bear_score)}</div>
          </div>
          <div className="stat">
            <div className="label">
              <Term k="directional_edge">{t("Directional edge", "方向性优势")}</Term>
            </div>
            <div className="value" title={`${fmtScore(signal.bull_score)} − ${fmtScore(signal.bear_score)} = ${fmtSigned(signal.directional_edge)}`}>
              {fmtSigned(signal.directional_edge)}
            </div>
          </div>
          <div className="stat">
            <div className="label">{t("Classification", "分级")}</div>
            <div className="value">
              <span className={`badge ${edgeClassBadge(signal.classification)}`}>
                {el(signal.classification)}
              </span>
            </div>
          </div>
        </div>

        <EdgeLegend signal={signal} />
      </div>

      <LlmCatalystPanel ticker={ticker} />

      {showExplainer && (
        <ScoreExplainerModal
          signal={signal}
          source={analysis.source}
          asOf={analysis.as_of}
          onClose={() => setShowExplainer(false)}
        />
      )}

      <div className="panel">
        <h2>{t("Signal components — advanced details", "信号分量 — 高级明细")}</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
          {t(
            "The scores above are exactly the sum of each side's triggered contributions — no opaque confidence numbers.",
            "上方得分正是每一边已触发贡献之和——没有不透明的置信度数字。",
          )}
        </p>
        {signal.components.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Component", "分量")}</th>
                  <th>{t("Side", "方向")}</th>
                  <th>{t("Triggered", "已触发")}</th>
                  <th style={{ textAlign: "right" }}>{t("Weight", "权重")}</th>
                  <th style={{ textAlign: "right" }}>{t("Contribution", "贡献")}</th>
                  <th>{t("Detail", "详情")}</th>
                </tr>
              </thead>
              <tbody>
                {signal.components.map((c) => (
                  <tr key={`${c.side}-${c.name}`}>
                    <td>{c.name}</td>
                    <td>
                      <span className={`badge ${c.side === "bull" ? "bull" : "bear"}`}>
                        {el(c.side.toUpperCase())}
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
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      {c.contribution > 0
                        ? `+${c.contribution.toFixed(1)}`
                        : `0 / ${c.max_contribution.toFixed(1)}`}
                    </td>
                    <td style={{ color: "var(--text-dim)" }}>{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">{t("No signal components reported.", "未报告任何信号分量。")}</p>
        )}
      </div>

      <div className="panel">
        <h2>{t("Regime features", "态势特征")}</h2>
        {featureEntries.length > 0 ? (
          <div className="kv">
            {featureEntries.map(([k, v]) => (
              <div key={k}>
                <div className="k">{k}</div>
                <div className="v">{fmtFeature(v, t)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">{t("No regime features reported.", "未报告任何态势特征。")}</p>
        )}
      </div>
    </>
  );
}

function TechnicalTab({ analysis }: { analysis: SymbolAnalysis }) {
  const t = useT();
  const insufficient = (
    <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>
      {t("insufficient data", "数据不足")}
    </span>
  );
  return (
    <>
      <div className="panel">
        <h2>{t("Indicators", "技术指标")}</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Indicator", "指标")}</th>
                <th style={{ textAlign: "right" }}>{t("Value", "数值")}</th>
              </tr>
            </thead>
            <tbody>
              {INDICATOR_ROWS.map((row) => (
                <tr key={row.key}>
                  <td>{t(row.label, row.zh)}</td>
                  <td style={{ textAlign: "right" }}>
                    {indicatorValue(analysis.indicators[row.key], row.fmt, insufficient)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>
          {t(
            `Close · last ${analysis.series.dates.length} bars`,
            `收盘价 · 最近 ${analysis.series.dates.length} 根K线`,
          )}
        </h2>
        <PriceChart series={analysis.series} />
      </div>
    </>
  );
}

function BacktestTab({ ticker, onWatchlist }: { ticker: string; onWatchlist: boolean }) {
  const t = useT();
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
      <h2>{t("Latest backtest", "最新回测")}</h2>
      {list.isPending ? (
        <p className="empty">
          {t(`Loading backtests for ${ticker}…`, `正在加载 ${ticker} 的回测…`)}
        </p>
      ) : list.isError ? (
        <p className="error">
          {t("Backtests unavailable:", "回测不可用：")} {list.error.message}
        </p>
      ) : !latest ? (
        <p className="empty">
          {t(`No backtests for ${ticker} yet.`, `尚无 ${ticker} 的回测。`)}{" "}
          {onWatchlist ? (
            <Link
              href={`/backtests?ticker=${encodeURIComponent(ticker)}`}
              style={{ color: "var(--accent)" }}
            >
              {t("Run one on the Backtests page →", "前往回测页运行一次 →")}
            </Link>
          ) : (
            // Backtesting is the one member-only surface (§4.2 amended
            // 2026-08-20) — don't advertise a run that would 404.
            <span style={{ color: "var(--text-dim)" }}>
              {t(
                "Backtests are for Watchlist symbols — add it above to unlock.",
                "回测仅面向自选列表标的 — 使用上方横幅加入后即可回测。",
              )}
            </span>
          )}
        </p>
      ) : (
        <>
          <p className="datasource" style={{ marginBottom: 12 }}>
            {t("run", "运行")} #{latest.id} · {new Date(latest.created_at).toLocaleString()} ·{" "}
            <span className={`badge ${latest.status === "COMPLETED" ? "green" : "red"}`}>
              {latest.status}
            </span>
          </p>
          {record.data && record.data.status === "COMPLETED" ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Metric", "指标")}</th>
                    <th style={{ textAlign: "right" }}>{t("Value", "数值")}</th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_ROWS.map((r) => (
                    <tr key={r.key}>
                      <td>{t(r.label, METRIC_LABEL_ZH[r.key] ?? r.label)}</td>
                      <td style={{ textAlign: "right" }}>{r.fmt(record.data.metrics[r.key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : record.data && record.data.status === "FAILED" ? (
            <p className="error">
              {t("Latest backtest failed:", "最新回测失败：")}{" "}
              {record.data.error ?? t("unknown error", "未知错误")}
            </p>
          ) : record.isError ? (
            <p className="error">
              {t(`Run #${latest.id} unavailable:`, `运行 #${latest.id} 不可用：`)}{" "}
              {record.error.message}
            </p>
          ) : (
            <p className="empty">
              {t(`Loading run #${latest.id}…`, `正在加载运行 #${latest.id}…`)}
            </p>
          )}
          <p style={{ marginTop: 12 }}>
            <span className="row">
              <Link href={`/backtests?ticker=${encodeURIComponent(ticker)}`} className="btn">
                {t("Run / view backtests", "运行 / 查看回测")}
              </Link>
              <Link href={`/backtests?id=${latest.id}`} className="btn">
                {t("Full results →", "完整结果 →")}
              </Link>
            </span>
          </p>
        </>
      )}
      <p className="datasource" style={{ marginTop: 12, marginBottom: 0 }}>
        {t(
          "scope: LONG STOCK ONLY (V1) · computed from the stored daily bars for this symbol",
          "范围：仅做多股票（V1）· 基于该标的已存储日线K线计算",
        )}
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
  "SQUEEZE_RISK",
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
  const t = useT();
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
        <p className="none">{t("none", "无")}</p>
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

/**
 * The 422 the server returns for an option instrument the broker cannot trade
 * (stock-only support). Its `detail` carries no preview — it is a plain message
 * about the broker's capabilities, so it is rendered plainly.
 */
function plainDetailMessage(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (typeof detail !== "object" || detail === null) return null;
  const m = (detail as { message?: unknown }).message;
  return typeof m === "string" && m.trim() !== "" ? m : null;
}

function ApproveErrorView({ ticker, error }: { ticker: string; error: Error }) {
  const t = useT();
  // The provider can go unset between preview and approve — the server refuses
  // to fill against numbers it cannot source, and so does this view.
  if (isMarketDataNotConfigured(error)) {
    return <NotConfigured message={notConfiguredMessage(error)} />;
  }
  // The broker can go unset between preview and approve too. Nothing was sent
  // anywhere — this is the explicit state, not a rejected order.
  if (isBrokerNotConfigured(error)) {
    return (
      <NotConfigured variant="broker" message={notConfiguredMessage(error)}>
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
          {t(
            "The plan above is unchanged and nothing was executed. Configure the paper broker to approve it.",
            "上方计划保持不变，未执行任何操作。请先配置模拟券商后再批准。",
          )}
        </p>
      </NotConfigured>
    );
  }
  if (error instanceof ApiError) {
    if (error.status === 422) {
      // A gate-chain rejection embeds the fresh preview…
      if (isApproveErrorDetail(error.detail)) {
        const failed = error.detail.preview.gates.find((g) => g.status === "FAIL");
        return (
          <div>
            <p className="error">
              {t(
                "Approval rejected — the server re-ran the full gate chain at approval time (client previews are never trusted) and it no longer passes:",
                "批准被拒绝——服务器在批准时重新运行了完整闸门链（客户端预览从不被信任），当前已无法通过：",
              )}{" "}
              {error.detail.message}
            </p>
            {failed && (
              <p className="error" style={{ fontFamily: "var(--font-mono)" }}>
                {t("FAILED gate:", "未通过闸门：")} {failed.name} — {failed.detail}
              </p>
            )}
          </div>
        );
      }
      // …a 422 WITHOUT one is a broker capability limit (option instrument
      // against stock-only broker support). Nothing to interpret or dress up:
      // render the server's own sentence.
      const message = plainDetailMessage(error.detail);
      if (message != null) return <p className="error">{message}</p>;
    }
    if (error.status === 409) {
      return (
        <p className="error">
          {t(
            `${ticker} already has an open position — adding to an open position (pyramiding) is not supported in V1. Close it on the Positions page first.`,
            `${ticker} 已有未平仓头寸——V1 不支持向已有头寸加仓（金字塔加仓）。请先在持仓页平仓。`,
          )}
        </p>
      );
    }
  }
  return (
    <p className="error">
      {t("Approval failed:", "批准失败：")} {error.message}
    </p>
  );
}

/**
 * §25 summary line above the approve button: the named gate's verdict from the
 * preview's own gates array, surfaced verbatim — never re-derived client-side.
 * INSTRUMENT is the permission verdict; RISK_APPROVAL is the risk verdict.
 */
function GateStatusLine({ label, gate }: { label: string; gate?: OrderPreviewGate }) {
  const t = useT();
  return (
    <p style={{ fontSize: 12, fontFamily: "var(--font-mono)", margin: "0 0 6px" }}>
      <span style={{ color: "var(--text-dim)" }}>{label}: </span>
      {gate == null ? (
        <span style={{ color: "var(--text-dim)" }}>{t("not evaluated", "未评估")}</span>
      ) : (
        <>
          <span
            className={`badge ${
              gate.status === "PASS" ? "green" : gate.status === "FAIL" ? "red" : "dim"
            }`}
          >
            {gate.status}
          </span>{" "}
          <span style={{ color: "var(--text-dim)" }}>{gate.detail}</span>
        </>
      )}
    </p>
  );
}

function ApprovePanel({ ticker, plan }: { ticker: string; plan: OrderPreview }) {
  const t = useT();
  const qc = useQueryClient();
  // Idempotency key (§42): one UUID per click-intent. Accidental double-clicks
  // and retries reuse the same key — the server returns the existing order
  // instead of filling twice. Regenerated only after a successful fill, so the
  // next intent is a fresh order.
  const [clientOrderId, setClientOrderId] = useState(() => crypto.randomUUID());
  // §27: the execution consent is an application dialog (declared before any
  // early return — rules of hooks).
  const [confirmingApprove, setConfirmingApprove] = useState(false);

  // Never 503s. Read BEFORE the click so an unconfigured broker disables the
  // button outright rather than letting the user commit to a guaranteed 503.
  const broker = useQuery({ queryKey: ["broker-status"], queryFn: api.broker.status });
  const brokerUnconfigured = broker.data != null && !broker.data.configured;

  const approve = useMutation({
    mutationFn: () =>
      api.orders.approve(ticker, plan.proposed.quantity_requested ?? undefined, clientOrderId),
    onSuccess: () => {
      setConfirmingApprove(false);
      setClientOrderId(crypto.randomUUID());
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["portfolio-risk"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["broker-status"] });
    },
    onError: () => {
      // A broker 503 here means the status line is stale — refresh it so the
      // button and the reason below agree with the server.
      qc.invalidateQueries({ queryKey: ["broker-status"] });
    },
  });

  const risk = plan.risk;
  if (risk == null) return null;

  const { instrument, contract } = plan.proposed;
  const isOption = instrument === "LONG_CALL" || instrument === "LONG_PUT";
  const unit = isOption ? t("CONTRACTS", "张合约") : t("SHARES", "股");

  // §25 — surface the two governing verdicts as summary lines, not re-derived:
  // INSTRUMENT ("Permission status") and RISK_APPROVAL ("Risk status").
  const permissionGate = plan.gates.find((g) => g.name === "INSTRUMENT");
  const riskGate = plan.gates.find((g) => g.name === "RISK_APPROVAL");

  const onApprove = () => setConfirmingApprove(true);
  const entry = plan.proposed.entry_price;

  return (
    <div className="panel">
      {confirmingApprove && (
        <ConfirmDialog
          title={t(
            `APPROVE & EXECUTE (paper) — BUY TO OPEN ${risk.approved_quantity.toLocaleString()} ${ticker} ${unit}`,
            isOption
              ? `批准并执行（模拟盘）— 买入开仓 ${risk.approved_quantity.toLocaleString()} 张 ${ticker} 合约`
              : `批准并执行（模拟盘）— 买入开仓 ${risk.approved_quantity.toLocaleString()} 股 ${ticker}`,
          )}
          confirmLabel={t("Approve & Execute", "批准并执行")}
          destructive
          loading={approve.isPending}
          onCancel={() => setConfirmingApprove(false)}
          onConfirm={() => approve.mutate()}
        >
          <ul className="why-list">
            <li>{t("Instrument:", "交易工具：")} {instrument}</li>
            {contract != null && <li>{t("Contract:", "合约：")} {fmtProposedContract(contract)}</li>}
            <li>
              {t("Approved quantity:", "批准数量：")} {risk.approved_quantity.toLocaleString()}{" "}
              {unit.toLowerCase()}
              {isOption ? t(" (multiplier ×100)", "（乘数 ×100）") : ""}
            </li>
            <li>
              {isOption
                ? t(
                    `Entry premium: ${entry == null ? "unknown" : fmtUsd(entry, 2)} per contract (mid × 100)`,
                    `每张合约入场权利金：${entry == null ? "未知" : fmtUsd(entry, 2)}（中间价 × 100）`,
                  )
                : t(
                    `Entry estimate: ${entry == null ? "unknown" : fmtUsd(entry, 2)} — paper fill = last stored close × (1 + paper_slippage_bps/10000), commission = paper_commission_per_share × qty`,
                    `入场估价：${entry == null ? "未知" : fmtUsd(entry, 2)} — 模拟成交 = 最近存储收盘价 × (1 + paper_slippage_bps/10000)，佣金 = paper_commission_per_share × 数量`,
                  )}
            </li>
            <li>
              {isOption && contract != null
                ? t(
                    `PREMIUM MAX LOSS: ${risk.approved_quantity.toLocaleString()} × ${fmtUsd(contract.max_loss_per_contract, 2)} = ${fmtUsd(risk.approved_quantity * contract.max_loss_per_contract)} — the FULL premium is at risk (§12.1)`,
                    `权利金最大亏损：${risk.approved_quantity.toLocaleString()} × ${fmtUsd(contract.max_loss_per_contract, 2)} = ${fmtUsd(risk.approved_quantity * contract.max_loss_per_contract)} — 全部权利金均处于风险中（§12.1）`,
                  )
                : t(
                    `Max loss at stop: ${fmtUsd(risk.trade_risk_usd)}`,
                    `止损处最大亏损：${fmtUsd(risk.trade_risk_usd)}`,
                  )}
            </li>
          </ul>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>
            {t(
              "The server re-runs the FULL gate chain before filling — this client preview is never trusted.",
              "服务器在成交前会重新运行完整闸门链——此客户端预览从不被信任。",
            )}
          </p>
        </ConfirmDialog>
      )}
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
        <h2 style={{ marginBottom: 0 }}>{t("Execute (paper)", "执行（模拟盘）")}</h2>
        {/* §25 explicit action label — loud, options and stock alike. The
            SELL TO CLOSE counterpart lives on the Positions close flow. */}
        <span className="badge green" style={{ fontSize: 12 }}>
          {t("BUY TO OPEN", "买入开仓")}
        </span>
      </div>
      {approve.data ? (
        <>
          <p
            style={{
              color:
                approve.data.order.status === "FILLED"
                  ? "var(--green)"
                  : "var(--amber)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}
          >
            {approve.data.order.status} — {t("order", "订单")} #{approve.data.order.id} ·{" "}
            {approve.data.order.side} {approve.data.order.quantity.toLocaleString()}{" "}
            {approve.data.order.ticker}
            {approve.data.order.filled_quantity > 0 ? (
              <>
                {" "}
                · {t("filled", "已成交")} {approve.data.order.filled_quantity.toLocaleString()} @{" "}
                {fmtUsd(approve.data.order.fill_price, 2)}
              </>
            ) : null}{" "}
            · {t("commission", "佣金")} {fmtUsd(approve.data.order.commission, 2)}
          </p>
          {approve.data.position ? (
            <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "8px 0" }}>
              {t("Position", "头寸")} #{approve.data.position.id}:{" "}
              {approve.data.position.quantity.toLocaleString()}{" "}
              {isOption ? t("contracts", "张合约") : t("shares", "股")} @{" "}
              {t(
                `${fmtUsd(approve.data.position.avg_price, 2)} avg`,
                `均价 ${fmtUsd(approve.data.position.avg_price, 2)}`,
              )}
              {approve.data.position.stop_price != null ? (
                <> · {t("stop", "止损")} {fmtUsd(approve.data.position.stop_price, 2)}</>
              ) : null}{" "}
              · {t("max loss", "最大亏损")} {fmtUsd(approve.data.position.max_loss)}.{" "}
              {t(
                "The server re-ran all gates before this fill.",
                "服务器在本次成交前重新运行了所有闸门。",
              )}
            </p>
          ) : (
            <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "8px 0" }}>
              {/* §11 zero-fill: the order is live at the broker but nothing has
                  filled — no position exists and no cash moved. The order-sync
                  sweep opens the position when real fills arrive. */}
              {t(
                "No quantity filled yet — the order stands at the broker and the position opens automatically when fills arrive (order-sync sweep).",
                "尚无成交数量——订单仍挂在券商处，成交到达后头寸将自动开立（订单同步轮询）。",
              )}
            </p>
          )}
          <Link href="/trading?tab=positions" className="btn">
            {t("View on Positions →", "前往持仓页查看 →")}
          </Link>
        </>
      ) : (
        <>
          {/* §25 — Permission status / Risk status, directly above the button. */}
          <div style={{ marginBottom: 10 }}>
            <GateStatusLine label={t("Permission status", "许可状态")} gate={permissionGate} />
            <GateStatusLine label={t("Risk status", "风险状态")} gate={riskGate} />
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button
              className="primary"
              onClick={onApprove}
              disabled={approve.isPending || brokerUnconfigured}
              title={
                brokerUnconfigured
                  ? t("Broker not configured — no order can be placed.", "券商未配置——无法下单。")
                  : undefined
              }
            >
              {approve.isPending
                ? t("Executing…", "执行中…")
                : t("Approve & Execute (paper)", "批准并执行（模拟盘）")}
            </button>
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
              {t(
                "Approval re-runs the full gate chain server-side before any paper fill.",
                "批准会先在服务器端重新运行完整闸门链，之后才会有任何模拟成交。",
              )}
            </span>
          </div>
          {/* The reason the control is disabled, stated inline next to it —
              the user is never left guessing why approval is unavailable. */}
          {brokerUnconfigured && (
            <NotConfiguredNote variant="broker" message={broker.data?.error} />
          )}
          {approve.isError && <ApproveErrorView ticker={ticker} error={approve.error} />}
        </>
      )}
    </div>
  );
}

/**
 * §25 option symbol: the SERVER's `option_symbol` is authoritative — it is
 * the exact OCC string the broker would be addressed with. The display-side
 * construction is a fallback ONLY when the field is absent (a backend that
 * predates it); a `null` means the server could NOT build one, and nothing is
 * guessed — the caller renders "—".
 */
function displayOptionSymbol(ticker: string, c: ProposedContract): string | null {
  return c.option_symbol === undefined ? occOptionSymbol(ticker, c) : c.option_symbol;
}

/** "—" (dim) for a quote field the payload does not carry — never invented. */
function quoteField(v: number | undefined, fmt: (v: number) => string): string {
  return v == null ? "—" : fmt(v);
}

/** §34 Execution Authorization — separate from the research verdict (§20:
 *  research approval ≠ execution approval). Facts verbatim from the server. */
function ExecutionAuthorizationPanel({ auth }: { auth: ExecutionAuthorization }) {
  const t = useT();
  const fact = (ok: boolean, label: string) => (
    <div>
      <div className="k">{label}</div>
      <div className="v">
        <span className={`badge ${ok ? "green" : "dim"}`}>
          {ok ? t("YES", "是") : t("NO", "否")}
        </span>
      </div>
    </div>
  );
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{t("Execution authorization", "执行授权")}</h2>
        <span className={`badge ${auth.authorized ? "green" : "amber"}`}>
          {auth.authorized ? t("AUTHORIZED", "已授权") : t("NOT AUTHORIZED", "未授权")}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "6px 0 10px" }}>
        {t(
          "Research approval ≠ execution approval. This plan is research — no order can result from it until every authorization below is granted AND the execution gate chain re-passes on live data.",
          "研究批准 ≠ 执行批准。该计划属于研究——在下方所有授权全部授予、且执行闸门链在实时数据上重新通过之前，不会产生任何订单。",
        )}
      </p>
      <div className="kv">
        {fact(auth.in_trading_pool, t("Trading Pool", "交易池"))}
        {fact(auth.symbol_trading_enabled, t("Symbol trading enabled", "标的交易已启用"))}
        {fact(auth.global_trading_enabled, t("Global trading enabled", "全局交易已启用"))}
      </div>
      {auth.missing.length > 0 && (
        <ul className="why-list" style={{ marginTop: 10, color: "var(--text-dim)" }}>
          {auth.missing.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TradePlanResult({ plan, execute }: { plan: OrderPreview; execute?: ReactNode }) {
  const t = useT();
  const el = useEnumLabel();
  const gates = [...plan.gates].sort((a, b) => gateRank(a.name) - gateRank(b.name));
  const { proposed, risk, signal } = plan;
  // §14 — when the RISK_APPROVAL gate applied a vol-targeting multiplier to the
  // risk budget, surface its detail verbatim next to the budget figure (the
  // gate detail is the audited wording; it is never truncated).
  const riskGateDetail = gates.find((g) => g.name === "RISK_APPROVAL")?.detail;
  const multiplierNote =
    riskGateDetail != null && /multiplier/i.test(riskGateDetail) ? riskGateDetail : null;
  // §16 additive context — when the market-data plan does not include option
  // chains, the chain-dependent parts of this plan honestly report "no chain
  // data" / a failed contract selection. The note below NAMES the plan gap as
  // the likely cause; it never replaces or hides those server-reported states.
  const capabilities = useCapabilities();
  const optionChainNotInPlan = capabilities.data?.capabilities?.option_chain === false;
  const volGate = gates.find((g) => g.name === "VOLATILITY");
  const contractGate = gates.find((g) => g.name === "CONTRACT_SELECTION");
  const chainDataAbsent =
    (volGate?.status === "PASS" && /no chain data/i.test(volGate.detail)) ||
    contractGate?.status === "FAIL";
  const isOption = proposed.instrument === "LONG_CALL" || proposed.instrument === "LONG_PUT";
  // Quantities are CONTRACTS (×100 multiplier) for options, SHARES for stock.
  const unitSuffix = isOption
    ? t(" CONTRACTS", " 张合约")
    : proposed.instrument === "LONG_STOCK"
      ? t(" SHARES", " 股")
      : "";
  return (
    <>
      <p className="datasource">
        {t("as of", "截至")} {new Date(plan.as_of).toLocaleString()} ·{" "}
        {t("instrument:", "交易工具：")} {proposed.instrument}
        {signal.bias != null && <> · {t("signal bias", "信号偏向")} {el(signal.bias)}</>}
        {signal.edge != null && (
          <> · {t("edge", "优势")} {signal.edge > 0 ? "+" : ""}{signal.edge.toFixed(1)}</>
        )}
        {signal.strength != null && <> · {t("strength", "强度")} {signal.strength}</>}
      </p>

      {/* §34/§35 Level 1 — Decision Summary: the answer first, never a gate
          dump. Verdict + the single controlling reason. */}
      <DecisionSummaryPanel plan={plan} gates={gates} />

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>{t("Proposed sizing", "建议仓位")}</h2>
          {risk != null && (
            <span className={`badge ${DECISION_BADGE[risk.decision]}`}>{risk.decision}</span>
          )}
        </div>

        {/* Instrument line — §8 matrix verdict + volatility regime input. */}
        <div className="row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
            {t("Instrument", "交易工具")}
          </span>
          <span className={`badge ${INSTRUMENT_BADGE[proposed.instrument] ?? "dim"}`}>
            {proposed.instrument}
          </span>
          {proposed.vol_regime != null && (
            <span
              className={`badge ${VOL_REGIME_BADGE[proposed.vol_regime] ?? "dim"}`}
              title={t(
                "Volatility regime — input to the §8 instrument matrix",
                "波动率状态——§8 工具矩阵的输入",
              )}
            >
              VOL {el(proposed.vol_regime)}
            </span>
          )}
          {isOption ? (
            <span className="chip">
              {t("sized in CONTRACTS · multiplier ×100", "以合约张数计 · 乘数 ×100")}
            </span>
          ) : proposed.instrument === "LONG_STOCK" ? (
            <span className="chip">{t("sized in SHARES", "以股数计")}</span>
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
          <>
            <p
              className="chip"
              title={t("Top-ranked §9 contract candidate", "§9 排名第一的合约候选")}
              style={{ fontSize: 12, padding: "6px 10px", marginBottom: 6 }}
            >
              {fmtProposedContract(proposed.contract)}
            </p>
            {/* §25 quote line — the live quote the mid came from (bid/ask/
                spread/OI/volume, server-built), so the user sees what they
                would actually cross, not just the midpoint. "—" when a field
                is absent (older backend) — never invented. */}
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-dim)",
                marginBottom: 6,
              }}
            >
              {t("bid", "买价")} {quoteField(proposed.contract.bid, (v) => fmtUsd(v, 2))} ·{" "}
              {t("ask", "卖价")} {quoteField(proposed.contract.ask, (v) => fmtUsd(v, 2))} ·{" "}
              {t("spread", "价差")} {quoteField(proposed.contract.spread_pct, (v) => fmtPct(v))} · OI{" "}
              {quoteField(proposed.contract.open_interest, (v) => v.toLocaleString())} ·{" "}
              {t("volume", "成交量")} {quoteField(proposed.contract.volume, (v) => v.toLocaleString())}
            </p>
            {/* §25 "Option symbol" — the SERVER-built OCC string: the exact
                contract identity the broker would be addressed with. The
                display-side construction is used ONLY when the backend
                predates the field; a null means the server could not build
                one — rendered "—", never guessed. */}
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-dim)",
                marginBottom: 12,
              }}
            >
              {t("Option symbol (OCC):", "期权代码（OCC）：")}{" "}
              {displayOptionSymbol(plan.ticker, proposed.contract) != null ? (
                <span style={{ color: "var(--text)" }}>
                  {displayOptionSymbol(plan.ticker, proposed.contract)}
                </span>
              ) : (
                <span
                  title={t(
                    "The server could not build an OCC symbol for this contract — nothing is guessed client-side.",
                    "服务器无法为该合约构建 OCC 代码——客户端不做任何猜测。",
                  )}
                >
                  —
                </span>
              )}
            </p>
          </>
        )}
        {/* §16 additive context — shown ONLY when the chain-dependent gates
            above actually reported missing chain data / failed contract
            selection AND the probed capabilities say the plan lacks option
            chains. The gates' own wording stays; this names the likely cause. */}
        {optionChainNotInPlan && chainDataAbsent && (
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
            {t(
              "Options data is not in the current market-data subscription — the chain-dependent gates above ran without option-chain data (§16).",
              "当前行情数据订阅不包含期权数据——上方依赖期权链的闸门在无期权链数据的情况下运行（§16）。",
            )}
          </p>
        )}

        {risk != null && (
          <>
            <div className="kv" style={{ marginBottom: 12 }}>
              <div>
                <div className="k">
                  {isOption
                    ? t("Premium / contract (mid × 100)", "每张权利金（中间价 × 100）")
                    : t("Entry price", "入场价")}
                </div>
                <div className="v">{proposed.entry_price == null ? "—" : fmtUsd(proposed.entry_price, 2)}</div>
              </div>
              <div>
                <div className="k">
                  {isOption
                    ? t("Stop distance (full premium)", "止损距离（全部权利金）")
                    : t("Stop distance", "止损距离")}
                </div>
                <div className="v">{proposed.stop_distance == null ? "—" : fmtUsd(proposed.stop_distance, 2)}</div>
              </div>
              <div>
                <div className="k">{t("Quantity requested", "请求数量")}</div>
                <div className="v">
                  {proposed.quantity_requested == null
                    ? t("auto", "自动")
                    : `${proposed.quantity_requested.toLocaleString()}${unitSuffix}`}
                </div>
              </div>
              <div>
                <div className="k">{t("Quantity approved", "批准数量")}</div>
                <div className="v">
                  {risk.approved_quantity.toLocaleString()}
                  {unitSuffix}
                  {isOption ? " (×100)" : ""}
                </div>
              </div>
              <div>
                <div className="k">{t("Signal strength", "信号强度")}</div>
                <div className="v">{risk.signal_strength ?? "—"}</div>
              </div>
              <div>
                <div className="k">{t("Risk budget", "风险预算")}</div>
                <div className="v">
                  {risk.risk_budget_pct == null
                    ? "—"
                    : t(`${fmtPct(risk.risk_budget_pct, 2)} of NAV`, `占净值 ${fmtPct(risk.risk_budget_pct, 2)}`)}
                </div>
              </div>
              <div>
                <div className="k">{t("Trade risk", "交易风险")}</div>
                <div className="v">{fmtUsd(risk.trade_risk_usd)}</div>
              </div>
              <div>
                <div className="k">{t("Heat before → after", "风险敞口 前 → 后")}</div>
                <div className="v">
                  {fmtPct(risk.heat_before_pct)} → {fmtPct(risk.heat_after_pct)}
                </div>
              </div>
              <div>
                <div className="k">{t("Cash after", "交易后现金")}</div>
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
                title={t(
                  "From the RISK_APPROVAL gate — §14 vol-targeting multiplier applied to the risk budget. Hard risk caps always apply.",
                  "来自 RISK_APPROVAL 闸门——§14 波动率目标乘数已应用于风险预算。硬性风险上限始终适用。",
                )}
              >
                {multiplierNote}
              </p>
            )}
            {isOption && (
              <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 8 }}>
                {t(
                  "§12.1 options sizing: entry price and stop distance are BOTH the full premium (mid × 100), so the approved quantity IS the number of contracts and every stock risk cap applies unchanged.",
                  "§12.1 期权仓位：入场价与止损距离均为全部权利金（中间价 × 100），因此批准数量即合约张数，所有股票风险上限原样适用。",
                )}
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

      {/* §46/§47 Phase C (SHADOW) — what this trade does to the WHOLE
          portfolio, and which constraints bound the size. Renders nothing on
          plans that predate the block. Placed AFTER the Tier 0 sizing panel:
          the approved quantity above is the one that will be traded. */}
      {risk != null && (
        <TradeComparison
          risk={risk}
          quantityRequested={proposed.quantity_requested}
          unitSuffix={unitSuffix}
        />
      )}

      {/* §24 — exit before entry: how the position would be EXITED, shown
          before any Apply/Execute affordance. */}
      {plan.exit_plan && <ExitPlanPanel exitPlan={plan.exit_plan} isOption={isOption} />}

      {plan.execution_authorization && (
        <ExecutionAuthorizationPanel auth={plan.execution_authorization} />
      )}

      {execute}

      <div className="why-cols" style={{ marginBottom: 16 }}>
        <WhyList title={t("Why trade", "交易理由")} items={plan.why_trade} />
        <WhyList title={t("Why not trade", "不交易理由")} items={plan.why_not_trade} />
      </div>

      {/* §34/§35 Level 3 — the full gate chain stays completely auditable,
          as the Advanced Decision Trace, no longer the page's opening. */}
      <details className="panel" style={{ marginBottom: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          {t("Advanced decision trace —", "高级决策追踪 —")}{" "}
          {plan.mode === "research" ? t("research gate chain", "研究闸门链") : t("gate chain", "闸门链")}{" "}
          {t(`(${gates.length} gates)`, `（${gates.length} 个闸门）`)}
        </summary>
        <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "10px 0 12px" }}>
          {plan.mode === "research"
            ? t(
                "The research chain evaluates market evidence only — Trading Pool authorization is an execution requirement, shown separately above. ",
                "研究链只评估市场证据——交易池授权属于执行要求，已在上方单独展示。",
              )
            : t(
                "Every order proposal passes these gates in order. ",
                "每个订单提案都按顺序通过这些闸门。",
              )}
          {t(
            "A FAIL stops evaluation and the remaining gates are not evaluated. Nothing is hidden.",
            "任何一个 FAIL 都会终止评估，其余闸门不再评估。没有任何内容被隐藏。",
          )}
        </p>
        <ul className="gate-list">
          {gates.map((g) => (
            <GateStep key={g.name} gate={g} />
          ))}
        </ul>
      </details>
    </>
  );
}

/** §34/§35 Level 1 — the decision, stated first in plain terms. */
function DecisionSummaryPanel({
  plan,
  gates,
}: {
  plan: OrderPreview;
  gates: OrderPreviewGate[];
}) {
  const t = useT();
  const { risk, proposed } = plan;
  const firstFail = gates.find((g) => g.status === "FAIL");
  const approved =
    risk != null && (risk.decision === "APPROVE" || risk.decision === "APPROVE_WITH_RESIZE");
  const noTrade = t("NO TRADE", "不交易");
  const verdict = approved
    ? proposed.instrument
    : proposed.instrument === "NO_TRADE"
      ? noTrade
      : firstFail != null
        ? noTrade
        : risk?.decision === "REJECT"
          ? noTrade
          : noTrade;
  const budgetPct = risk?.risk_budget_pct != null ? fmtPct(risk.risk_budget_pct, 2) : "—";
  const reason = approved
    ? t(
        `${risk!.approved_quantity.toLocaleString()} ${
          proposed.instrument === "LONG_STOCK" ? "shares" : "contracts"
        } within a ${budgetPct} risk budget`,
        `在 ${budgetPct} 的风险预算内批准 ${risk!.approved_quantity.toLocaleString()} ${
          proposed.instrument === "LONG_STOCK" ? "股" : "张合约"
        }`,
      )
    : (firstFail?.detail ?? risk?.explanations?.[0] ?? t("see the evidence below", "见下方证据"));
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>{t("Decision", "决策")}</h2>
        <span
          className={`badge ${approved ? INSTRUMENT_BADGE[proposed.instrument] ?? "green" : "red"}`}
          style={{ fontSize: 13 }}
        >
          {verdict}
        </span>
        {risk != null && (
          <span className={`badge ${DECISION_BADGE[risk.decision]}`}>{risk.decision}</span>
        )}
      </div>
      <p style={{ fontSize: 13, margin: "8px 0 0" }}>{reason}</p>
      {!approved && firstFail != null && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "6px 0 0" }}>
          {t(
            `Verdict from the ${firstFail.name} gate — full trace at the bottom of this page.`,
            `该判定来自 ${firstFail.name} 闸门——完整追踪见本页底部。`,
          )}
        </p>
      )}
    </div>
  );
}

/** §24 exit plan panel — every rule the exit engine will hold this position to. */
function ExitPlanPanel({
  exitPlan,
  isOption,
}: {
  exitPlan: NonNullable<OrderPreview["exit_plan"]>;
  isOption: boolean;
}) {
  const t = useT();
  return (
    <div className="panel">
      <h2>{t("Exit plan", "退出计划")}</h2>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 10 }}>
        {t(
          "How this position would be exited — enforced by the same exit engine that monitors every open position. Visible before you apply anything (§24).",
          "该头寸将如何退出——由监控所有未平仓头寸的同一退出引擎强制执行。在你应用任何内容之前即可见（§24）。",
        )}
      </p>
      <ul className="why-list">
        {exitPlan.hard_stop != null && <li>{exitPlan.hard_stop}</li>}
        <li>{exitPlan.signal_invalidation}</li>
        <li>{exitPlan.atr_trail}</li>
        <li>{exitPlan.time_stop}</li>
        {isOption && exitPlan.dte_exit_threshold != null && (
          <li>
            {t(
              `DTE exit: close at or below ${exitPlan.dte_exit_threshold} days to expiry`,
              `DTE 退出：距到期 ≤ ${exitPlan.dte_exit_threshold} 天时平仓`,
            )}
          </li>
        )}
        <li style={{ color: "var(--text-dim)" }}>
          {t(
            "Profit target: none in V1 — exits are stop / trail / signal-decay / time driven, never a hoped-for number.",
            "止盈目标：V1 无——退出仅由止损 / 追踪止损 / 信号衰减 / 时间驱动，从不依赖一个凭空期望的数字。",
          )}
        </li>
      </ul>
    </div>
  );
}

const PLAN_STATUS_BADGE: Record<PlanStatus, string> = {
  DRAFT: "dim",
  GENERATED: "amber",
  REVIEWED: "accent",
  APPLIED: "green",
  ACTIVE: "green",
  SUPERSEDED: "dim",
  CANCELLED: "dim",
  EXPIRED: "dim",
};

/** §19 Apply flow: ConfirmDialog with the §30 consequence copy; a 422 with
 *  failed §4.3 promotion checks escalates to an explicit acknowledge step. */
function ApplyPlanPanel({
  plan,
  onApplied,
}: {
  plan: TradePlan;
  onApplied: () => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [failedChecks, setFailedChecks] = useState<PromotionCheck[] | null>(null);
  const [staleDetail, setStaleDetail] = useState<PlanRevalidation | null>(null);
  const [result, setResult] = useState<PlanApplyResult | null>(null);

  const toast = useToast();
  const apply = useMutation({
    mutationFn: (acknowledge: boolean) => api.plans.apply(plan.id, acknowledge),
    onSuccess: (res) => {
      setConfirming(false);
      setFailedChecks(null);
      setResult(res);
      toast(
        "SUCCESS",
        t(
          `Plan #${res.plan.id} applied — ${res.plan.ticker} in Trading Pool, trading stays DISABLED, no order placed`,
          `计划 #${res.plan.id} 已应用 — ${res.plan.ticker} 已加入交易池，交易保持禁用，未下任何订单`,
        ),
      );
      onApplied();
    },
    onError: (err) => {
      if (err instanceof ApiError && isPromotionCheckFailureDetail(err.detail)) {
        setFailedChecks(err.detail.checks);
      } else if (err instanceof ApiError && isRevalidationRequiredDetail(err.detail)) {
        setStaleDetail(err.detail.revalidation);
      }
    },
  });
  // §42: the server refused to activate stale research — recompute instead.
  const revalidate = useMutation({
    mutationFn: () => api.plans.revalidate(plan.id),
    onSuccess: () => {
      setConfirming(false);
      setStaleDetail(null);
      onApplied(); // refresh the plans list — the fresh plan appears there
    },
  });

  if (result) {
    return (
      <div className="panel">
        <h2>{t("Plan applied", "计划已应用")}</h2>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <span className="badge green">{t("TRADING POOL: YES", "交易池：是")}</span>
          <span className="badge green">{t("PLAN:", "计划：")} {result.plan.status}</span>
          <span className="badge amber">{t("TRADING ENABLED: NO", "交易启用：否")}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>
          {t(
            "No order was placed. Enabling paper trading is a separate explicit step on the Trading Pool page — future qualifying signals may submit paper orders only after all execution and risk gates pass.",
            "未下任何订单。启用模拟交易是交易池页面上单独的显式步骤——未来符合条件的信号只有在所有执行与风险闸门通过后才可能提交模拟订单。",
          )}
          {result.superseded_plan_id != null && (
            <>
              {" "}
              {t(
                `Previous active plan #${result.superseded_plan_id} was superseded.`,
                `此前的活动计划 #${result.superseded_plan_id} 已被取代。`,
              )}
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{t("Apply this plan", "应用此计划")}</h2>
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "6px 0 0" }}>
            {t(
              `Your explicit approval step (§19): saves this plan as Active and adds ${plan.ticker} to the Trading Pool. It does NOT enable trading or place an order.`,
              `你的显式批准步骤（§19）：将此计划保存为活动计划，并把 ${plan.ticker} 加入交易池。它不会启用交易，也不会下单。`,
            )}
          </p>
        </div>
        <button className="primary" onClick={() => setConfirming(true)}>
          {t("Apply Plan", "应用计划")}
        </button>
      </div>
      {apply.isError && !failedChecks && (
        <p className="error">
          {t("Apply failed:", "应用失败：")} {apply.error.message}
        </p>
      )}

      {confirming && !failedChecks && !staleDetail && (
        <ConfirmDialog
          title={t(`Apply plan #${plan.id} for ${plan.ticker}`, `为 ${plan.ticker} 应用计划 #${plan.id}`)}
          confirmLabel={t("Apply Plan", "应用计划")}
          loading={apply.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => apply.mutate(false)}
        >
          <p>
            {t(
              `Applying this plan adds ${plan.ticker} to the Trading Pool, stores this plan as Active, and enables risk re-evaluation. It does NOT bypass risk controls.`,
              `应用此计划会把 ${plan.ticker} 加入交易池，将此计划存为活动计划，并启用风险重新评估。它不会绕过任何风控。`,
            )}
          </p>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>
            {t(
              "Trading stays DISABLED until you explicitly enable it, and any future order must still pass the full execution gate chain on live data.",
              "在你显式启用之前，交易保持禁用；任何未来订单仍须在实时数据上通过完整执行闸门链。",
            )}
          </p>
        </ConfirmDialog>
      )}

      {confirming && staleDetail && (
        <ConfirmDialog
          title={t("Plan revalidation required", "计划需要重新验证")}
          confirmLabel={t("Revalidate Now", "立即重新验证")}
          loading={revalidate.isPending}
          onCancel={() => {
            setConfirming(false);
            setStaleDetail(null);
          }}
          onConfirm={() => revalidate.mutate()}
        >
          <p>
            {t(
              `This plan was generated on ${
                staleDetail.stale_market_data
                  ? `market data as of ${staleDetail.market_data_as_of ?? "an unknown date"} — the market has traded since (${staleDetail.last_expected_trading_date})`
                  : "a configuration that has since changed"
              }. Stale research cannot become the active plan (§42).`,
              `此计划基于${
                staleDetail.stale_market_data
                  ? `截至 ${staleDetail.market_data_as_of ?? "未知日期"} 的市场数据生成——此后市场已有新交易日（${staleDetail.last_expected_trading_date}）`
                  : "一份此后已发生变更的配置生成"
              }。过期研究不能成为活动计划（§42）。`,
            )}
          </p>
          {Object.keys(staleDetail.config_changed).length > 0 && (
            <ul className="why-list" style={{ margin: "8px 0" }}>
              {Object.entries(staleDetail.config_changed).map(([k, v]) => (
                <li key={k}>
                  {k}: {v.plan ?? "—"} → {v.current}
                </li>
              ))}
            </ul>
          )}
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>
            {t(
              "Revalidating re-runs the research chain on current data and creates a fresh plan for your review — this plan is left untouched.",
              "重新验证会在当前数据上重新运行研究链，并生成一份新计划供你审阅——此计划保持不动。",
            )}
          </p>
        </ConfirmDialog>
      )}

      {confirming && failedChecks && (
        <ConfirmDialog
          title={t("Promotion checks failed", "晋升检查未通过")}
          confirmLabel={t("Acknowledge risks and apply", "确认风险并应用")}
          destructive
          loading={apply.isPending}
          onCancel={() => {
            setConfirming(false);
            setFailedChecks(null);
          }}
          onConfirm={() => apply.mutate(true)}
        >
          <p>
            {t(
              `Adding ${plan.ticker} to the Trading Pool did not pass the §4.3 readiness checks:`,
              `将 ${plan.ticker} 加入交易池未通过 §4.3 就绪性检查：`,
            )}
          </p>
          <ul className="why-list" style={{ margin: "8px 0" }}>
            {failedChecks
              .filter((c) => !c.passed)
              .map((c) => (
                <li key={c.name}>
                  <strong>{c.name}</strong>: {c.detail}
                </li>
              ))}
          </ul>
          <p style={{ color: "var(--amber)" }}>
            {t(
              "Acknowledging proceeds anyway. The acknowledgement and the failed checks are permanently recorded in the audit trail and cannot be hidden or removed later.",
              "确认后仍将继续执行。该确认与未通过的检查会永久记录在审计轨迹中，此后无法隐藏或删除。",
            )}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Past and active plans for this symbol (§33 "View Active Plan"). */
function PlansListPanel({
  plans,
  onChanged,
}: {
  plans: TradePlan[];
  onChanged: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const cancel = useMutation({
    mutationFn: (id: number) => api.plans.cancel(id),
    onSuccess: (p) => {
      toast("INFO", t(`Plan #${p.id} cancelled`, `计划 #${p.id} 已取消`));
      onChanged();
    },
  });
  // §42 "Recompute": produces a fresh GENERATED plan beside the stale one.
  const revalidate = useMutation({
    mutationFn: (id: number) => api.plans.revalidate(id),
    onSuccess: (res) => {
      toast(
        "SUCCESS",
        t(
          `Plan revalidated — fresh plan #${res.plan.id} generated on current data`,
          `计划已重新验证 — 已基于当前数据生成新计划 #${res.plan.id}`,
        ),
      );
      onChanged();
    },
  });
  if (plans.length === 0) return null;
  return (
    <div className="panel">
      <h2>{t("Plans for this symbol", "该标的的计划")}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{t("Status", "状态")}</th>
              <th>{t("Generated", "生成时间")}</th>
              <th>{t("Data as of", "数据截至")}</th>
              <th>{t("Freshness", "新鲜度")}</th>
              <th>{t("Verdict", "判定")}</th>
              <th style={{ textAlign: "right" }}>{t("Actions", "操作")}</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const reval = p.revalidation;
              const terminal =
                p.status === "SUPERSEDED" || p.status === "CANCELLED" || p.status === "EXPIRED";
              return (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>
                    <span className={`badge ${PLAN_STATUS_BADGE[p.status] ?? "dim"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {p.generated_at ? new Date(p.generated_at).toLocaleString() : "—"}
                  </td>
                  <td style={{ fontSize: 12 }}>{p.market_data_as_of ?? "—"}</td>
                  <td>
                    {reval?.revalidation_required ? (
                      <span
                        className="badge amber"
                        title={[
                          reval.stale_market_data
                            ? t(
                                `market data as of ${reval.market_data_as_of ?? "unknown"} lags ${reval.last_expected_trading_date}`,
                                `市场数据截至 ${reval.market_data_as_of ?? "未知"}，落后于 ${reval.last_expected_trading_date}`,
                              )
                            : null,
                          ...Object.entries(reval.config_changed).map(
                            ([k, v]) => `${k}: ${v.plan ?? "—"} → ${v.current}`,
                          ),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        {reval.stale_market_data
                          ? t("STALE DATA", "数据过期")
                          : t("CONFIG CHANGED", "配置已变更")}
                      </span>
                    ) : (
                      <span className="badge green">{t("CURRENT", "最新")}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {p.preview?.proposed?.instrument ?? "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      {reval?.revalidation_required && !terminal && (
                        <button
                          onClick={() => revalidate.mutate(p.id)}
                          disabled={revalidate.isPending}
                          title={t(
                            "Re-run the research chain on current data — creates a fresh plan; this one is left untouched (§42)",
                            "在当前数据上重新运行研究链——生成新计划；此计划保持不动（§42）",
                          )}
                        >
                          {revalidate.isPending
                            ? t("Revalidating…", "重新验证中…")
                            : t("Revalidate", "重新验证")}
                        </button>
                      )}
                      {(p.status === "GENERATED" || p.status === "ACTIVE") && (
                        <button
                          className="danger"
                          onClick={() => cancel.mutate(p.id)}
                          disabled={cancel.isPending}
                        >
                          {t("Cancel", "取消")}
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cancel.isError && (
        <p className="error">
          {t("Cancel failed:", "取消失败：")} {cancel.error.message}
        </p>
      )}
      {revalidate.isError && (
        <p className="error">
          {t("Revalidate failed:", "重新验证失败：")} {revalidate.error.message}
        </p>
      )}
    </div>
  );
}

function isPromotionCheckFailureDetail(
  d: unknown,
): d is { message: string; checks: PromotionCheck[] } {
  return (
    typeof d === "object" &&
    d !== null &&
    Array.isArray((d as { checks?: unknown }).checks)
  );
}

/** Narrow the §42 apply-refusal detail (code PLAN_REVALIDATION_REQUIRED). */
function isRevalidationRequiredDetail(
  d: unknown,
): d is { code: string; message: string; revalidation: PlanRevalidation } {
  return (
    typeof d === "object" &&
    d !== null &&
    (d as { code?: unknown }).code === "PLAN_REVALIDATION_REQUIRED" &&
    typeof (d as { revalidation?: unknown }).revalidation === "object"
  );
}

/**
 * Read the Phase K `event_risk` block off a plan.
 *
 * Typed as a lookup on an index signature rather than as a field on
 * `TradePlan`: the block is computed fresh on read by the plans router and is
 * absent whenever no event is upcoming, so this surface must render correctly
 * against a payload that has never carried the key. An older server, or a
 * plan for a ticker with no scheduled event, simply yields null and the panel
 * does not mount.
 */
function planEventRisk(plan: TradePlan | null | undefined): PlanEventRisk | null {
  const block = (plan as unknown as { event_risk?: unknown } | null | undefined)
    ?.event_risk;
  return block != null && typeof block === "object" ? (block as PlanEventRisk) : null;
}

function TradePlanTab({ ticker }: { ticker: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [qty, setQty] = useState("");
  const [inputError, setInputError] = useState("");

  const plans = useQuery({
    queryKey: ["plans", ticker],
    queryFn: () => api.plans.list(ticker),
  });
  const refreshPlans = () => qc.invalidateQueries({ queryKey: ["plans", ticker] });

  // §18 workflow: Generate persists the research plan (§19's Apply is a
  // separate explicit step below).
  const toast = useToast();
  const generate = useMutation({
    mutationFn: (quantity?: number) => api.plans.generate(ticker, quantity),
    onSuccess: (p) => {
      toast(
        "SUCCESS",
        t(
          `Research plan #${p.id} saved for ${ticker} (${p.status})`,
          `已为 ${ticker} 保存研究计划 #${p.id}（${p.status}）`,
        ),
      );
      refreshPlans();
    },
  });

  // A plan is a chain of market-data-derived judgements. With no provider there
  // is no plan to generate — the panel replaces the result, and the previous
  // (now unbacked) plan is not left on screen.
  const previewUnconfigured = isMarketDataNotConfigured(generate.error);

  const onGenerate = () => {
    const trimmed = qty.trim();
    if (trimmed === "") {
      setInputError("");
      generate.mutate(undefined);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0) {
      setInputError(
        t(
          "Quantity must be a positive whole number (or blank for auto-sizing).",
          "数量必须为正整数（或留空由系统自动决定仓位）。",
        ),
      );
      return;
    }
    setInputError("");
    generate.mutate(n);
  };

  const plan = generate.data ?? null;
  const preview = plan?.preview ?? null;
  const planFresh = plan != null && plans.data?.some(
    (p) => p.id === plan.id && (p.status === "GENERATED" || p.status === "REVIEWED"),
  );
  const canExecute =
    preview?.risk != null &&
    (preview.risk.decision === "APPROVE" ||
      preview.risk.decision === "APPROVE_WITH_RESIZE");

  return (
    <>
      <div className="preview-note">
        <strong>{t("RESEARCH", "研究")}</strong>
        {t(
          " — generating a plan places no order; it runs the research gate chain and risk sizing, stores the plan for review, and writes auditable events. Applying a plan authorizes research → Trading Pool (§19) without enabling trading; executing re-runs ALL gates server-side — a stale client preview is never trusted.",
          " — 生成计划不会下任何订单；它运行研究闸门链与风险仓位计算，存储计划以供审阅，并写入可审计事件。应用计划将研究授权至交易池（§19），但不启用交易；执行会在服务器端重新运行所有闸门——过期的客户端预览从不被信任。",
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <input
            type="number"
            min={1}
            step={1}
            placeholder={t("quantity (optional)", "数量（可选）")}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            style={{ width: 170 }}
            aria-label={t(
              "Requested quantity (optional — blank lets the risk engine size the trade)",
              "请求数量（可选——留空由风险引擎决定仓位）",
            )}
          />
          <button className="primary" onClick={onGenerate} disabled={generate.isPending}>
            {generate.isPending ? t("Generating…", "生成中…") : t("Generate Trade Plan", "生成交易计划")}
          </button>
          <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
            {t(
              "Leave quantity blank to let the risk engine size the trade.",
              "数量留空即由风险引擎决定仓位。",
            )}
          </span>
        </div>
        {inputError && <p className="error">{inputError}</p>}
        {generate.isError && !previewUnconfigured && (
          <p className="error">
            {t("Trade plan unavailable:", "交易计划不可用：")} {generate.error.message}
          </p>
        )}
      </div>

      {previewUnconfigured ? (
        <NotConfigured message={notConfiguredMessage(generate.error)}>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
            {t(
              "The gate chain, instrument choice and risk sizing are all derived from market data, so no trade plan can be produced — and no order can be approved — until the provider is configured.",
              "闸门链、工具选择与风险仓位均源自市场数据——在配置数据提供商之前，无法生成交易计划，也无法批准任何订单。",
            )}
          </p>
        </NotConfigured>
      ) : plan && preview ? (
        <>
          <p className="datasource">
            {t("plan", "计划")} #{plan.id} · <span className={`badge ${PLAN_STATUS_BADGE[plan.status] ?? "dim"}`}>{plan.status}</span>
            {" "}· {t("versions", "版本")} {Object.values(plan.versions).join(" · ")}
          </p>
          <TradePlanResult
            plan={preview}
            execute={
              canExecute ? (
                // Keyed per generate run: a regenerated plan resets the approve
                // state (fresh fill display + fresh idempotency key).
                <ApprovePanel key={generate.submittedAt} ticker={ticker} plan={preview} />
              ) : undefined
            }
          />
          {/* Phase K §65 — the EVENT RISK panel, between the plan and the
              apply step, because a print landing before the exit is a fact
              about THIS trade and belongs where the decision is made rather
              than on a tab the reader may not open. Read off `event_risk`,
              which the plan payload computes FRESH on every read (§42's rule
              applied to events: a stored plan can never present a passed
              event as still upcoming). The panel renders nothing when the
              field is absent — a plan with no event ahead of it gets no
              panel, never an empty "EVENT RISK: —" heading, which would read
              as a cleared check that in fact never ran. SHADOW throughout:
              nothing here has resized or blocked this plan. */}
          <EventRiskPlanPanel eventRisk={planEventRisk(plan)} />
          {planFresh && <ApplyPlanPanel plan={plan} onApplied={refreshPlans} />}
        </>
      ) : (
        !generate.isPending &&
        !generate.isError && (
          <div className="panel">
            <p className="empty">
              {t(
                `Generate a trade plan to see the gate chain, proposed sizing, and the reasons for and against trading ${ticker}.`,
                `生成交易计划即可查看闸门链、建议仓位，以及交易 ${ticker} 的正反理由。`,
              )}
            </p>
          </div>
        )
      )}

      {plans.data && (
        <PlansListPanel plans={plans.data} onChanged={refreshPlans} />
      )}
    </>
  );
}

function AuditTab({ ticker }: { ticker: string }) {
  const t = useT();
  const audit = useQuery({
    queryKey: ["audit", ticker],
    queryFn: () => api.audit.list(ticker),
  });

  if (audit.isPending)
    return (
      <div className="panel">
        <p className="empty">{t("Loading audit events…", "正在加载审计事件…")}</p>
      </div>
    );
  if (audit.isError) {
    return (
      <div className="panel">
        <p className="error">
          {t("Audit trail unavailable:", "审计轨迹不可用：")} {audit.error.message}
        </p>
      </div>
    );
  }
  return (
    <div className="panel">
      <h2>{t("Events", "事件")}</h2>
      {audit.data.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Time", "时间")}</th>
                <th>{t("Actor", "操作者")}</th>
                <th>{t("Action", "动作")}</th>
                <th>{t("Entity", "实体")}</th>
                <th>{t("Details", "详情")}</th>
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
        </div>
      ) : (
        <p className="empty">
          {t(`No audit events for ${ticker}.`, `暂无 ${ticker} 的审计事件。`)}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- page */

export default function SymbolAnalysisPage() {
  const t = useT();
  const params = useParams<{ ticker: string }>();
  const raw = params?.ticker;
  const ticker = decodeURIComponent(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "")).toUpperCase();

  const [tab, setTab] = useState<ActiveTab>("overview");

  const analysis = useQuery({
    queryKey: ["analysis", ticker],
    queryFn: () => api.watchlist.analysis(ticker),
    enabled: ticker.length > 0,
    retry: retryUnlessTerminal,
    // Stop polling on both terminal states: a missing symbol and a missing
    // provider are equally permanent until the user acts.
    refetchInterval: (query) => {
      const e = query.state.error;
      return e instanceof ApiError && (e.status === 404 || e.status === 503) ? false : 15_000;
    },
  });

  // Membership is a UI hint now (2026-08-20, §4.2 amended): research
  // surfaces serve any ticker; the banner offers tracking + backtests.
  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist.list });
  const onWatchlist = watchlist.data?.some((w) => w.ticker === ticker) ?? true;
  const analysisUnconfigured = isMarketDataNotConfigured(analysis.error);

  return (
    <>
      <p style={{ marginBottom: 8 }}>
        <Link href="/research?tab=watchlist" style={{ color: "var(--text-dim)" }}>
          {t("← Watchlist", "← 自选列表")}
        </Link>
      </p>
      <h1>
        <span className="ticker">{ticker}</span> — {t("Symbol Analysis", "标的分析")}
      </h1>
      <p className="subtitle">
        {t(
          "Research view: explainable indicators, regime, and signal components. Nothing here can trade — execution requires the Trading Pool.",
          "研究视图：可解释的指标、态势与信号分量。此处不产生任何交易——执行需经交易池授权。",
        )}
      </p>
      <FlowNav stage="research" />

      {!onWatchlist && <NotOnWatchlistBanner ticker={ticker} />}

      <div className="tabs">
        {TABS.map((tb) =>
          tb.phase ? (
            <button key={tb.id} disabled title={t(`Arrives with ${tb.phase}`, `随 ${tb.phase} 上线`)}>
              {t(tb.label, tb.zh)}
              <span className="phase">{tb.phase}</span>
            </button>
          ) : (
            <button
              key={tb.id}
              className={tab === tb.id ? "active" : ""}
              onClick={() => setTab(tb.id as ActiveTab)}
            >
              {t(tb.label, tb.zh)}
            </button>
          ),
        )}
      </div>

      {analysis.data && (
        <p className="datasource">
          {t("source:", "数据源：")} {analysis.data.source} · {t("as of", "截至")}{" "}
          {new Date(analysis.data.as_of).toLocaleString()} ·{" "}
          {t(`${analysis.data.bars.count} bars`, `${analysis.data.bars.count} 根K线`)} (
          {analysis.data.bars.first} → {analysis.data.bars.last})
        </p>
      )}

      {tab === "price" ? (
        <PriceTab ticker={ticker} />
      ) : tab === "options" ? (
        <OptionChainTable ticker={ticker} />
      ) : tab === "news" ? (
        <NewsTab ticker={ticker} />
      ) : tab === "audit" ? (
        <AuditTab ticker={ticker} />
      ) : tab === "backtest" ? (
        <BacktestTab ticker={ticker} onWatchlist={onWatchlist} />
      ) : tab === "trade-plan" ? (
        <TradePlanTab ticker={ticker} />
      ) : analysis.isPending ? (
        <div className="panel">
          <p className="empty">
            {t(`Loading analysis for ${ticker}…`, `正在加载 ${ticker} 的分析…`)}
          </p>
        </div>
      ) : analysisUnconfigured ? (
        // Indicators, regime and signal scores are all computed FROM bars —
        // with no provider there are none, so the tab shows the reason, not
        // zeros.
        <NotConfigured message={notConfiguredMessage(analysis.error)} />
      ) : analysis.isError ? (
        // Research surfaces are open (§4.2 amended) — an analysis error
        // here is a real failure, never a membership 404.
        <div className="panel">
          <p className="error">
            {t("Analysis unavailable:", "分析不可用：")} {analysis.error.message}
          </p>
        </div>
      ) : tab === "overview" ? (
        <OverviewTab ticker={ticker} analysis={analysis.data} />
      ) : (
        <TechnicalTab analysis={analysis.data} />
      )}
    </>
  );
}
