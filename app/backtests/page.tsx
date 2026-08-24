"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import NotConfigured from "@/components/shared/NotConfigured";
import Term from "@/components/shared/Term";
import {
  api,
  isMarketDataNotConfigured,
  notConfiguredMessage,
  retryUnlessTerminal,
  ApiError,
} from "@/lib/api";
import { METRIC_ROWS, fmtNum, fmtPct, returnColor } from "@/lib/backtest-metrics";
import { useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import type {
  AutoDecisionRow,
  BacktestInstrument,
  BacktestParams,
  BacktestRecord,
  BacktestSegmentMetrics,
  FillModel,
} from "@/lib/types";
import FlowNav from "@/components/shared/FlowNav";
import PortfolioBacktestPanel from "@/components/backtests/PortfolioBacktest";
import EquityChart from "@/components/backtests/EquityChart";
import HubTabs from "@/components/shared/HubTabs";
import TradeReturnHistogram from "@/components/backtests/TradeReturnHistogram";

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
  warmup_bars: 200,
  instrument: "LONG_STOCK",
  target_dte_min: 30,
  target_dte_max: 90,
  strike_otm_pct: 0.0,
  option_premium_pct: 0.1,
  commission_per_contract: 0.65,
  option_slippage_bps: 100,
  worst_option_slippage_bps: 300,
  spread_width_pct: 0.05,
};

/** Every BacktestParams field except the enum — these run through the numeric inputs. */
type NumericParamKey = Exclude<keyof BacktestParams, "fill_model" | "instrument">;

interface NumericField {
  key: NumericParamKey;
  label: { en: string; zh: string };
  step: string;
}

/**
 * §20.2 fill models mapped to daily-bar data (no historical bid/ask yet — WORST
 * becomes ask-to-buy/bid-to-sell once real quote data lands). Commission is
 * unchanged in all models.
 */
const FILL_MODELS: { value: FillModel; label: { en: string; zh: string }; desc: { en: string; zh: string } }[] = [
  {
    value: "OPTIMISTIC",
    label: { en: "Optimistic", zh: "乐观" },
    desc: {
      en: "next-open, frictionless best case — upper bound, never plan on it",
      zh: "次日开盘价、无摩擦的最佳情形 — 仅为上限，切勿以此为准",
    },
  },
  {
    value: "CONSERVATIVE",
    label: { en: "Conservative", zh: "保守" },
    desc: {
      en: "next-open ± slippage bps (default)",
      zh: "次日开盘价 ± 滑点 bps（默认）",
    },
  },
  {
    value: "WORST",
    label: { en: "Worst", zh: "最差" },
    desc: {
      en: "next-open ± max(slippage, worst) bps — worst practical case until real quote data lands",
      zh: "次日开盘价 ± max(滑点, 最差) bps — 真实报价数据接入前的最差实际情形",
    },
  },
];

/** Rendered inside the fill-model block, enabled only when WORST is selected. */
const WORST_SLIPPAGE_FIELD: NumericField = {
  key: "worst_slippage_bps",
  label: { en: "Worst-case slippage (bps)", zh: "最差滑点（bps）" },
  step: "0.5",
};

const PARAM_GROUPS: { title: { en: string; zh: string }; fields: NumericField[] }[] = [
  {
    title: { en: "Fills & Costs", zh: "成交与成本" },
    fields: [
      { key: "position_pct", label: { en: "Position size (× equity)", zh: "仓位规模（× 权益）" }, step: "0.05" },
      { key: "commission_per_share", label: { en: "Commission $/share", zh: "佣金 $/股" }, step: "0.001" },
      { key: "slippage_bps", label: { en: "Slippage (bps)", zh: "滑点（bps）" }, step: "0.5" },
    ],
  },
  {
    title: { en: "Entry & Exit", zh: "入场与离场" },
    fields: [
      { key: "entry_edge_threshold", label: { en: "Entry edge threshold", zh: "入场 edge 阈值" }, step: "1" },
      { key: "exit_edge_threshold", label: { en: "Exit edge threshold", zh: "离场 edge 阈值" }, step: "1" },
      { key: "atr_trail_k", label: { en: "ATR trail multiple", zh: "ATR 移动止损倍数" }, step: "0.5" },
      { key: "time_stop_bars", label: { en: "Time stop (bars)", zh: "时间止损（K线数）" }, step: "1" },
      { key: "min_move_atr", label: { en: "Min move (ATR)", zh: "最小波动（ATR）" }, step: "0.25" },
    ],
  },
  {
    title: { en: "Data", zh: "数据" },
    fields: [
      { key: "warmup_bars", label: { en: "Warmup bars", zh: "预热K线数" }, step: "10" },
    ],
  },
];

/** LONG_CALL leg parameters — rendered only when the instrument is
 *  LONG_CALL; contract choice is moneyness/DTE based (no historical
 *  greeks/OI exist — see the data-source architecture doc). */
const OPTION_PARAM_GROUP: { title: { en: string; zh: string }; fields: NumericField[] } = {
  title: { en: "Option Leg (Long Call)", zh: "期权腿（买入看涨）" },
  fields: [
    { key: "target_dte_min", label: { en: "Target DTE min", zh: "目标 DTE 下限" }, step: "5" },
    { key: "target_dte_max", label: { en: "Target DTE max", zh: "目标 DTE 上限" }, step: "5" },
    { key: "strike_otm_pct", label: { en: "Strike OTM % (0 = ATM)", zh: "行权价虚值 %（0 = 平值）" }, step: "0.01" },
    { key: "option_premium_pct", label: { en: "Premium budget (× equity)", zh: "权利金预算（× 权益）" }, step: "0.01" },
    { key: "commission_per_contract", label: { en: "Commission $/contract", zh: "佣金 $/合约" }, step: "0.05" },
    { key: "option_slippage_bps", label: { en: "Option slippage (bps)", zh: "期权滑点（bps）" }, step: "10" },
    { key: "spread_width_pct", label: { en: "Spread width (× spot, spread only)", zh: "价差宽度（× 现价，仅价差）" }, step: "0.01" },
  ],
};

// The four instruments AUTO can currently express (spreads/income arrive
// with Phase D of the auto-strategy program).
const AUTO_SELECTABLE: { value: string; en: string; zh: string }[] = [
  { value: "LONG_STOCK", en: "Long stock", zh: "正股做多" },
  { value: "LONG_CALL", en: "Long calls", zh: "买入看涨期权" },
  { value: "LONG_PUT", en: "Long puts", zh: "买入看跌期权" },
  { value: "SHORT_STOCK", en: "Short stock", zh: "做空正股" },
];

const INSTRUMENTS: { value: BacktestInstrument; label: { en: string; zh: string }; desc: { en: string; zh: string } }[] = [
  {
    value: "AUTO",
    label: { en: "AUTO (§8 decides)", zh: "AUTO（§8 自动决策）" },
    desc: {
      en: "the instrument is chosen DAILY by the live §8 matrix — direction × strength tier (your a/b/c/d score bands) × IV regime × the multi-select below. Strong bull + low IV buys calls; moderate buys stock; bear mirrors to puts / short stock. Every decision is stored with its rationale.",
      zh: "每天由实盘 §8 矩阵自动选择工具 — 方向 × 强度档（你的 a/b/c/d 分档）× IV 状态 × 下方多选。强多头+低 IV 买 call，温和买正股，看空镜像为 put / 做空。每个决策连同理由完整存档。",
    },
  },
  {
    value: "LONG_STOCK",
    label: { en: "Long stock", zh: "正股做多" },
    desc: { en: "buy and hold shares (V1 engine)", zh: "买入并持有股票（V1 引擎）" },
  },
  {
    value: "LONG_CALL",
    label: { en: "Long call", zh: "买入看涨期权" },
    desc: {
      en: "same bull signal, expressed via REAL historical call contracts (~Feb 2024+); exits run the live premium-stop / 21-DTE rules.",
      zh: "同一套看多信号，改用真实历史看涨合约表达（约 2024 年 2 月起）；离场执行实盘的权利金止损 / 21 DTE 规则。",
    },
  },
  {
    value: "LONG_PUT",
    label: { en: "Long put", zh: "买入看跌期权" },
    desc: {
      en: "the BEAR-side mirror: enters on STRONG_BEAR/MILD_BEAR regime + BEAR bias + edge <= -threshold, via REAL historical put contracts; exits run the direction-mirrored live rules (trail above the trough).",
      zh: "看空镜像：在强空/温和空市场状态 + 看空 bias + edge ≤ −阈值时入场，用真实历史看跌合约表达；离场执行方向镜像后的实盘规则（追踪止损挂在最低点上方）。",
    },
  },
  {
    value: "BULL_CALL_SPREAD",
    label: { en: "Bull call spread", zh: "牛市看涨价差" },
    desc: {
      en: "long + short call, both REAL historical contracts (same expiry); net debit = MAX LOSS; the live premium-stop / 21-DTE rules run on the NET. Requires the defined-risk-spreads permission (research+backtest scope).",
      zh: "长短两条真实历史看涨合约（同一到期日）；净权利金 = 最大亏损；实盘权利金止损 / 21 DTE 规则作用于两腿的净权利金。需开启限定风险价差权限（研究+回测范围）。",
    },
  },
  {
    value: "BEAR_PUT_SPREAD",
    label: { en: "Bear put spread", zh: "熊市看跌价差" },
    desc: {
      en: "long + short put (short strike BELOW the long, same expiry), both REAL historical contracts; net debit = MAX LOSS. Requires the defined-risk-spreads permission.",
      zh: "长短两条真实历史看跌合约（短腿行权价在长腿下方，同一到期日）；净权利金 = 最大亏损。需开启限定风险价差权限。",
    },
  },
  {
    value: "COVERED_CALL",
    label: { en: "Covered call", zh: "备兑看涨" },
    desc: {
      en: "buy-write over REAL historical contracts: hold shares, sell 30-45 DTE OTM calls against them; managed at 50% profit capture / 2× loss stop / 21 DTE; ITM expiry assigns at the strike. Requires the covered-call permission.",
      zh: "基于真实历史合约的买写策略：持有正股，对其卖出 30-45 DTE 虚值 call；按 50% 利润截获 / 2× 止损 / 21 DTE 管理；实值到期按行权价指派。需开启备兑看涨权限。",
    },
  },
  {
    value: "CASH_SECURED_PUT",
    label: { en: "Cash-secured put", zh: "现金担保看跌" },
    desc: {
      en: "sell 30-45 DTE OTM puts backed by locked cash (strike × 100), REAL historical contracts; same mechanical management; assignment approximated cash-settled (documented). Requires the CSP permission.",
      zh: "卖出由锁定现金担保（行权价 × 100）的 30-45 DTE 虚值 put，使用真实历史合约；同一套机械管理；指派按现金结算近似（已文档明示）。需开启现金担保看跌权限。",
    },
  },
  {
    value: "SHORT_STOCK",
    label: { en: "Short stock", zh: "正股做空" },
    desc: {
      en: "the Phase 3 bear mirror on the STOCK itself: enters on STRONG_BEAR/MILD_BEAR + BEAR bias + edge ≤ −threshold, SELL fills lower, proceeds credited, liability marked daily; exits run the mirrored live rules (hard stop ABOVE entry). Requires short-stock AND margin permissions.",
      zh: "Phase 3 正股看空镜像：在强空/温和空 + 看空 bias + edge ≤ −阈值时入场，卖出成交价向下滑点、所得计入现金、负债每日盯市；离场执行镜像后的实盘规则（硬止损位于开仓价上方）。需同时开启股票空头与保证金权限。",
    },
  },
];

/** zh labels for the metric rows defined in @/lib/backtest-metrics (EN stays r.label). */
const METRIC_LABEL_ZH: Partial<Record<keyof BacktestSegmentMetrics, string>> = {
  total_return_pct: "总收益",
  cagr_pct: "CAGR",
  sharpe: "夏普比率",
  sortino: "索提诺比率",
  max_drawdown_pct: "最大回撤",
  win_rate: "胜率",
  profit_factor: "盈利因子",
  expectancy_pct: "期望值",
  avg_trade_pct: "平均每笔",
  avg_hold_bars: "平均持有",
  num_trades: "交易数",
  exposure_pct: "持仓暴露",
};

/** Metric key → glossary key for the <Term> explainer card (lib/glossary.ts).
 *  Unmapped keys render as plain labels. */
const METRIC_TERM: Partial<Record<keyof BacktestSegmentMetrics, string>> = {
  cagr_pct: "cagr",
  sharpe: "sharpe",
  sortino: "sortino",
  max_drawdown_pct: "max_drawdown",
  win_rate: "win_rate",
  profit_factor: "profit_factor",
  expectancy_pct: "expectancy",
  avg_trade_pct: "expectancy",
  exposure_pct: "exposure",
};

function ResultsPanel({ record }: { record: BacktestRecord }) {
  const t = useT();
  const el = useEnumLabel();
  return (
    <>
      <div className="panel">
        <h2>
          {t("Result", "结果")} — <span className="ticker">{record.ticker}</span> ·{" "}
          {t(`run #${record.id}`, `运行 #${record.id}`)}
        </h2>
        <p className="datasource" style={{ marginBottom: 8 }}>
          {new Date(record.created_at).toLocaleString()} ·{" "}
          <span className={`badge ${record.status === "COMPLETED" ? "green" : "red"}`}>
            {el(record.status)}
          </span>{" "}
          <span className="chip">
            <Term k="fill_model">{el(record.params.fill_model ?? "CONSERVATIVE")}</Term>
          </span>{" "}
          <span className="chip">
            {(() => {
              const ins = INSTRUMENTS.find(
                (x) => x.value === (record.params.instrument ?? "LONG_STOCK"),
              );
              return ins ? t(ins.label.en, ins.label.zh) : record.params.instrument;
            })()}
          </span>
          {" · "}
          <Term k="backtest_v1">{t("shared live engines (§21)", "与实盘共享引擎（§21）")}</Term>
          {t(
            ` · computed from the stored daily bars for ${record.ticker}`,
            ` · 由 ${record.ticker} 已存储的日线计算得出`,
          )}
        </p>
        {record.status === "FAILED" && (
          <p className="error">
            {t(
              `Backtest failed: ${record.error ?? "unknown error"}`,
              `回测失败：${record.error ?? "未知错误"}`,
            )}
          </p>
        )}
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          {t(
            "Deterministic replay of the SAME rules the live system runs — no machine learning, no automatic fitting. You are the optimizer: repeated tuning fits parameters to history, and the only test tuning can never touch is data that arrives after today.",
            "对实盘同一套规则的确定性重放 — 无机器学习、无自动调参。调参的人是你:反复调整就是在把参数拟合到历史,唯一无法被调参染指的检验,是今天之后新产生的行情。",
          )}
        </p>
      </div>

      {record.status === "COMPLETED" && (
        <>
          {/* charts first (user 2026-08-20): the shape of the run before
              the table of numbers */}
          <div className="panel">
            <h2>{t("Equity curve & drawdown", "净值曲线与回撤")}</h2>
            <EquityChart curve={record.equity_curve} />
            <TradeReturnHistogram trades={record.trades} />
          </div>

          <div className="panel">
            <h2>{t("Metrics", "指标")}</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Metric", "指标")}</th>
                    <th className="num">{t("Value", "数值")}</th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_ROWS.map((r) => (
                    <tr key={r.key}>
                      {/* METRIC_TERM keys feed the beginner explainer card;
                          unmapped keys render as plain text (Term passthrough). */}
                      <td>
                        <Term k={METRIC_TERM[r.key] ?? "__none__"}>
                          {t(r.label, METRIC_LABEL_ZH[r.key] ?? r.label)}
                        </Term>
                      </td>
                      <td className="num">{r.fmt(record.metrics[r.key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 10 }}>
              {t(
                "§20.2 — historical mid is never a guaranteed fill.",
                "§20.2 — 历史中间价从不代表确定能成交。",
              )}
            </p>
            {/* pipeline linkage (2026-08-20): validation flows into
                authorization — the next step is one click, in context. */}
            {record.status === "COMPLETED" && (
              <p style={{ fontSize: 13, marginTop: 8 }}>
                {t("Next step:", "下一步:")}{" "}
                <Link href="/trading?tab=pool" style={{ color: "var(--accent)" }}>
                  {t(
                    `authorize ${record.ticker} in the Trading Pool →`,
                    `在交易池授权 ${record.ticker} →`,
                  )}
                </Link>{" "}
                <span style={{ color: "var(--text-dim)" }}>
                  {t(
                    "(authorization is explicit — a completed backtest never trades by itself)",
                    "(授权是显式步骤 — 回测完成本身绝不会触发交易)",
                  )}
                </span>
              </p>
            )}
          </div>


          {record.metrics.auto_decisions && record.metrics.auto_decisions.length > 0 && (
              <div className="panel">
                <h2>
                  {t("AUTO decisions", "AUTO 决策轨迹")} ({record.metrics.auto_decisions.length})
                </h2>
                <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 8 }}>
                  {t(
                    "Every entry decision the §8 matrix made: score band × IV regime → instrument, with its rationale on hover.",
                    "§8 矩阵做出的每个入场决策:分数档 × IV 状态 → 工具,悬停查看完整理由。",
                  )}
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("Date", "日期")}</th>
                        <th>edge</th>
                        <th>{t("Tier", "强度档")}</th>
                        <th>{t("Vol", "波动率")}</th>
                        <th>{t("Instrument", "工具")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.metrics.auto_decisions.map((d, i) => (
                        <tr key={i} title={d.rationale}>
                          <td style={{ whiteSpace: "nowrap" }}>{d.date}</td>
                          <td>{d.edge.toFixed(1)}</td>
                          <td>{d.tier ? el(d.tier) : "—"}</td>
                          <td>{d.vol_regime ? el(d.vol_regime) : t("unknown", "未知")}</td>
                          <td>{el(d.instrument)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          <div className="panel">
            <h2>{t(`Trades (${record.trades.length})`, `交易（${record.trades.length}）`)}</h2>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
              {t(
                "Every trade lists the rule that opened it and the rule that closed it — no black boxes.",
                "每笔交易都列明触发开仓与平仓的规则 — 没有黑箱。",
              )}{" "}
              {t("Exit rules you will see:", "会看到的离场规则:")}{" "}
              <Term k="hard_stop">HARD_STOP</Term> ·{" "}
              <Term k="atr_trail">ATR_TRAIL</Term> ·{" "}
              <Term k="time_stop">TIME_STOP</Term>
            </p>
            {record.trades.length > 0 ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Entry", "入场")}</th>
                      <th className="num">{t("Entry px", "入场价")}</th>
                      <th>{t("Exit", "离场")}</th>
                      <th className="num">{t("Exit px", "离场价")}</th>
                      <th className="num">{t("Bars", "K线数")}</th>
                      <th className="num">{t("Return", "收益")}</th>
                      {record.trades.some((x) => x.contract_symbol) && (
                        <th>{t("Contract", "合约")}</th>
                      )}
                      <th>{t("Entry reason", "入场原因")}</th>
                      <th>{t("Exit reason", "离场原因")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.trades.map((tr, i) => (
                      <tr key={`${tr.entry_date}-${i}`}>
                        <td style={{ whiteSpace: "nowrap" }}>{tr.entry_date}</td>
                        <td className="num">${tr.entry_price.toFixed(2)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {tr.exit_date ?? (
                            <span style={{ color: "var(--amber)" }}>{t("open", "未平")}</span>
                          )}
                        </td>
                        <td className="num">{tr.exit_price == null ? "—" : `$${tr.exit_price.toFixed(2)}`}</td>
                        <td className="num">{tr.bars_held}</td>
                        <td className="num" style={{ color: returnColor(tr.return_pct) }}>
                          {fmtPct(tr.return_pct, true)}
                        </td>
                        {record.trades.some((x) => x.contract_symbol) && (
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, whiteSpace: "nowrap" }}>
                            {tr.contract_symbol
                              ? tr.short_symbol
                                ? `${tr.contract_symbol} / -${tr.short_symbol} ×${tr.contracts ?? "?"}`
                                : `${tr.contract_symbol} ×${tr.contracts ?? "?"}`
                              : "—"}
                          </td>
                        )}
                        <td style={{ color: "var(--text-dim)", fontSize: 12 }}>{tr.entry_reason}</td>
                        <td style={{ color: "var(--text-dim)", fontSize: 12 }}>{tr.exit_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">
                {t("No trades were taken in this run.", "本次运行未产生任何交易。")}
              </p>
            )}
          </div>
        </>
      )}

      <div className="panel">
        <h2>{t("Parameters used", "所用参数")}</h2>
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
  const t = useT();
  const el = useEnumLabel();
  const qc = useQueryClient();
  const sp = useSearchParams();
  const idParam = sp.get("id");
  const tickerParam = sp.get("ticker");

  const [selectedId, setSelectedId] = useState<number | null>(() => parseId(idParam));
  const [ticker, setTicker] = useState<string>((tickerParam ?? "").toUpperCase());
  const [fillModel, setFillModel] = useState<FillModel>(DEFAULT_PARAMS.fill_model);
  const [instrument, setInstrument] = useState<BacktestInstrument>("LONG_STOCK");
  // AUTO runs: the instrument multi-select (restrict-only — the backend
  // 422s any selection the account permissions do not allow).
  const [autoInstruments, setAutoInstruments] = useState<Set<string>>(
    () => new Set(AUTO_SELECTABLE.map((x) => x.value)),
  );
  // Account permissions gate which AUTO instruments are even offerable —
  // the multi-select must never be able to SUBMIT a token the account
  // forbids (verifier catch: unchecking one box used to turn the selection
  // explicit and 422 on a never-touched disabled instrument).
  const platformConfig = useQuery({ queryKey: ["platform-config"], queryFn: api.config.get });
  const perms = platformConfig.data?.account_permissions;
  const allowedAuto = AUTO_SELECTABLE.filter((x) =>
    x.value === "LONG_STOCK" ? (perms?.long_stock ?? true)
    : x.value === "LONG_CALL" ? (perms?.long_call ?? true)
    : x.value === "LONG_PUT" ? (perms?.long_put ?? true)
    : ((perms?.short_stock ?? false) && (perms?.margin ?? false)),
  );
  const effectiveAuto = [...autoInstruments].filter((v) =>
    allowedAuto.some((x) => x.value === v),
  );
  const [paramValues, setParamValues] = useState<Record<NumericParamKey, string>>(() => {
    const init = {} as Record<NumericParamKey, string>;
    (Object.keys(DEFAULT_PARAMS) as (keyof BacktestParams)[]).forEach((k) => {
      if (k === "fill_model" || k === "instrument") return;
      init[k] = String(DEFAULT_PARAMS[k]);
    });
    return init;
  });
  const [formError, setFormError] = useState("");
  // History-panel ticker filter — client-side: the full list is already here.
  const [historyFilter, setHistoryFilter] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // A newly selected run (history click, deep link, or a run just finishing)
  // renders below the fold — bring it into view instead of leaving the page
  // sitting on the config panel.
  useEffect(() => {
    if (selectedId != null) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedId]);

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
  // Config probe: POST /api/backtests 503s when the provider is unset, but the
  // Run button must be disabled BEFORE the user submits. The market overview
  // shares the same provider and the same cache entry as the Dashboard, so this
  // costs no extra request in practice.
  const marketProbe = useQuery({
    queryKey: ["market-overview"],
    queryFn: api.market.overview,
    retry: retryUnlessTerminal,
  });
  const record = useQuery({
    queryKey: ["backtest", selectedId],
    queryFn: () => api.backtests.get(selectedId as number),
    enabled: selectedId != null,
    staleTime: Infinity,
    refetchInterval: false,
  });

  const run = useMutation({
    mutationFn: (params: BacktestParams) =>
      api.backtests.run(
        ticker,
        params,
        params.instrument === "AUTO" && effectiveAuto.length < allowedAuto.length
          ? effectiveAuto
          : undefined,
      ),
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
      setFormError(t("Pick a ticker first.", "请先选择代码。"));
      return;
    }
    const parsed = {} as BacktestParams;
    const numericFields = [
      ...PARAM_GROUPS.flatMap((g) => g.fields),
      ...OPTION_PARAM_GROUP.fields,
      WORST_SLIPPAGE_FIELD,
    ];
    for (const field of numericFields) {
      const raw = paramValues[field.key].trim();
      const num = Number(raw);
      if (raw === "" || !Number.isFinite(num)) {
        setFormError(
          t(`Invalid value for “${field.label.en}”.`, `“${field.label.zh}”的数值无效。`),
        );
        return;
      }
      parsed[field.key] = num;
    }
    if (parsed.worst_slippage_bps < 0) {
      setFormError(
        t("Worst-case slippage (bps) must be >= 0.", "最差滑点（bps）必须 ≥ 0。"),
      );
      return;
    }
    parsed.fill_model = fillModel;
    parsed.instrument = instrument;
    if (instrument === "AUTO" && effectiveAuto.length === 0) {
      setFormError(
        t("Select at least one instrument for AUTO.", "AUTO 至少需要选择一种工具。"),
      );
      return;
    }
    run.mutate(parsed);
  };

  // Unconfigured either way we learned it: the pre-flight probe, or a run that
  // was already submitted and came back 503.
  const marketUnconfigured =
    isMarketDataNotConfigured(marketProbe.error) || isMarketDataNotConfigured(run.error);
  const marketMessage =
    notConfiguredMessage(marketProbe.error) ?? notConfiguredMessage(run.error);

  const tickers = watchlist.data?.map((w) => w.ticker) ?? [];
  const options = ticker && !tickers.includes(ticker) ? [ticker, ...tickers] : tickers;
  const allRuns = history.data
    ? [...history.data].sort((a, b) => b.created_at.localeCompare(a.created_at))
    : [];
  const historyTickers = [...new Set(allRuns.map((r) => r.ticker))];
  const runs =
    historyFilter == null ? allRuns : allRuns.filter((r) => r.ticker === historyFilter);

  return (
    <>
      <h1>{t("Backtests", "回测")}</h1>
      <p className="subtitle">
        {t(
          "Run the directional-edge strategy over stored history with explicit fills and costs — as stock or as real historical call contracts. Backtests never place orders.",
          "在已存储的历史数据上运行方向性 edge 策略，采用明确的成交与成本假设 — 可选正股或真实历史看涨合约。回测绝不会下单。",
        )}
      </p>
      <FlowNav stage="validate" />

      {/* Presentation reorder (user 2026-08-20): single-symbol vs portfolio
          as top-level tabs — one thing at a time, charts before tables. */}
      <HubTabs
        defaultTab="single"
        tabs={[
          {
            id: "single",
            en: "Single symbol",
            zh: "单标的回测",
            render: () => (
              <>

              {marketUnconfigured && (
                <NotConfigured message={marketMessage}>
                  <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
                    {t(
                      "Backtests replay real stored history, so new runs are unavailable until the provider is configured. Runs completed earlier remain readable below.",
                      "回测回放的是真实存储的历史数据，因此在配置数据源之前无法发起新的运行。之前完成的运行仍可在下方查看。",
                    )}
                  </p>
                </NotConfigured>
              )}

              <div className="bt-layout">
                <div className="panel">
                  <h2>{t("Configure run", "配置运行")}</h2>
                  <form onSubmit={submit}>
                    <div className="param-group">
                      <h3>{t("Symbol", "标的")}</h3>
                      {watchlist.isPending ? (
                        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
                          {t("Loading watchlist…", "正在加载自选列表…")}
                        </p>
                      ) : watchlist.isError ? (
                        <p className="error" style={{ marginTop: 0 }}>
                          {t(
                            `Watchlist unavailable: ${watchlist.error.message}`,
                            `无法加载自选列表：${watchlist.error.message}`,
                          )}
                        </p>
                      ) : options.length > 0 ? (
                        <select
                          value={ticker}
                          onChange={(e) => setTicker(e.target.value)}
                          style={{ width: "100%" }}
                          aria-label={t("Ticker", "代码")}
                        >
                          <option value="" disabled>
                            {t("Select ticker…", "选择代码…")}
                          </option>
                          {options.map((tk) => (
                            <option key={tk} value={tk}>
                              {tk}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
                          {t(
                            "Watchlist is empty — backtests run only on Watchlist symbols.",
                            "自选列表为空 — 回测仅可在自选列表标的上运行。",
                          )}{" "}
                          <Link href="/research?tab=watchlist" style={{ color: "var(--accent)" }}>
                            {t("Add one on the Watchlist page", "前往自选页面添加")}
                          </Link>
                          {t(".", "。")}
                        </p>
                      )}
                    </div>

                    <div className="param-group">
                      <h3>{t("Instrument", "交易工具")}</h3>
                      <div className="param-field">
                        <div className="seg-control" role="radiogroup" aria-label={t("Backtest instrument", "回测工具")}>
                          {INSTRUMENTS.map((ins) => (
                            <button
                              key={ins.value}
                              type="button"
                              role="radio"
                              aria-checked={instrument === ins.value}
                              className={instrument === ins.value ? "active" : ""}
                              onClick={() => setInstrument(ins.value)}
                            >
                              {t(ins.label.en, ins.label.zh)}
                            </button>
                          ))}
                        </div>
                        <p className="seg-desc">
                          {(() => {
                            const ins = INSTRUMENTS.find((x) => x.value === instrument);
                            return ins ? t(ins.desc.en, ins.desc.zh) : null;
                          })()}
                        </p>
                      </div>
                    </div>

                    {instrument === "AUTO" && (
                      <div style={{ marginTop: 10 }}>
                        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                          {t(
                            "Allowed instruments for this run (restrict-only — never exceeds account permissions):",
                            "本次运行允许的工具（只收窄 — 绝不超越账户权限）:",
                          )}
                        </span>
                        <div className="row" style={{ flexWrap: "wrap", gap: 12, marginTop: 6 }}>
                          {AUTO_SELECTABLE.map((opt) => {
                            const allowed = allowedAuto.some((x) => x.value === opt.value);
                            return (
                            <label
                              key={opt.value}
                              style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: allowed ? 1 : 0.45 }}
                              title={allowed ? undefined : t(
                                "Disabled in account permissions (Settings)",
                                "账户权限中未开启(见设置)",
                              )}
                            >
                              <input
                                type="checkbox"
                                disabled={!allowed}
                                checked={allowed && autoInstruments.has(opt.value)}
                                onChange={(e) => {
                                  setAutoInstruments((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(opt.value);
                                    else next.delete(opt.value);
                                    return next;
                                  });
                                }}
                              />
                              {t(opt.en, opt.zh)}
                            </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {instrument !== "LONG_STOCK" && instrument !== "SHORT_STOCK" && (
                      <div className="param-group">
                        <h3>{t(OPTION_PARAM_GROUP.title.en, OPTION_PARAM_GROUP.title.zh)}</h3>
                        <div className="param-grid">
                          {OPTION_PARAM_GROUP.fields.map((field) => (
                            <div className="param-field" key={field.key}>
                              <label htmlFor={`param-${field.key}`}>
                                {t(field.label.en, field.label.zh)}
                              </label>
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
                      </div>
                    )}

                    {PARAM_GROUPS.map((group) => (
                      <div className="param-group" key={group.title.en}>
                        <h3>{t(group.title.en, group.title.zh)}</h3>
                        <div className="param-grid">
                          {group.fields.map((field) => (
                            <div className="param-field" key={field.key}>
                              <label htmlFor={`param-${field.key}`}>
                                {t(field.label.en, field.label.zh)}
                              </label>
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

                        {group.title.en === "Fills & Costs" && (
                          <div className="fill-model-block">
                            <div className="param-field">
                              <label id="fill-model-label">{t("Fill model (§20.2)", "成交模型（§20.2）")}</label>
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
                                    {t(m.label.en, m.label.zh)}
                                  </button>
                                ))}
                              </div>
                              <p className="seg-desc">
                                {(() => {
                                  const m = FILL_MODELS.find((fm) => fm.value === fillModel);
                                  return m ? t(m.desc.en, m.desc.zh) : null;
                                })()}
                              </p>
                            </div>
                            <div className={`param-field${fillModel === "WORST" ? "" : " dimmed"}`}>
                              <label htmlFor={`param-${WORST_SLIPPAGE_FIELD.key}`}>
                                {t(WORST_SLIPPAGE_FIELD.label.en, WORST_SLIPPAGE_FIELD.label.zh)}
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
                      disabled={run.isPending || !ticker || marketUnconfigured}
                      style={{ width: "100%" }}
                      title={
                        marketUnconfigured
                          ? t(
                              "Market data is not configured — there is no history to replay.",
                              "行情数据未配置 — 没有可回放的历史数据。",
                            )
                          : undefined
                      }
                    >
                      {run.isPending ? t("Running backtest…", "回测运行中…") : t("Run Backtest", "运行回测")}
                    </button>
                    {marketUnconfigured && (
                      <p style={{ color: "var(--amber)", fontSize: 12, marginTop: 8 }}>
                        {t(
                          "Disabled — market data is not configured, so there is no history to replay. No data is shown rather than estimated or synthetic values.",
                          "已禁用 — 行情数据未配置，因此没有可回放的历史数据。系统宁可不显示数据，也不使用估算或合成值。",
                        )}
                      </p>
                    )}
                    {(formError || (run.isError && !marketUnconfigured)) && (
                      <p className="error">
                        {formError ||
                          // Membership 404 (the one member-only surface, §4.2 amended
                          // 2026-08-20): translate instead of the raw server string.
                          (run.error instanceof ApiError && run.error.status === 404
                            ? t(
                                `${ticker} is not on the Watchlist — backtests are for Watchlist symbols. Add it on its research page first.`,
                                `${ticker} 不在自选列表中 — 回测仅面向自选列表标的。请先在其研究页加入自选。`,
                              )
                            : run.error?.message)}
                      </p>
                    )}
                  </form>
                </div>

                <div className="panel">
                  <h2>{t("History", "历史记录")}</h2>
                  {historyTickers.length > 1 && (
                    <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      <button
                        type="button"
                        className={`chip chip-btn${historyFilter == null ? " chip-active" : ""}`}
                        onClick={() => setHistoryFilter(null)}
                      >
                        {t("All", "全部")}
                      </button>
                      {historyTickers.map((tk) => (
                        <button
                          key={tk}
                          type="button"
                          className={`chip chip-btn${historyFilter === tk ? " chip-active" : ""}`}
                          onClick={() => setHistoryFilter(historyFilter === tk ? null : tk)}
                        >
                          {tk}
                        </button>
                      ))}
                    </div>
                  )}
                  {history.isPending ? (
                    <p className="empty">{t("Loading runs…", "正在加载运行记录…")}</p>
                  ) : history.isError ? (
                    <p className="error">
                      {t(
                        `History unavailable: ${history.error.message}`,
                        `无法加载历史记录：${history.error.message}`,
                      )}
                    </p>
                  ) : runs.length === 0 ? (
                    <p className="empty">
                      {historyFilter != null
                        ? t(
                            `No runs for ${historyFilter} yet.`,
                            `${historyFilter} 暂无运行记录。`,
                          )
                        : t(
                            "No backtests yet. Configure and run one on the left.",
                            "暂无回测。请在左侧配置并运行一个。",
                          )}
                    </p>
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>{t("Ticker", "代码")}</th>
                            <th>{t("When", "时间")}</th>
                            <th>{t("Status", "状态")}</th>
                            <th>{t("Fill", "成交")}</th>
                            <th className="num">{t("Trades", "交易数")}</th>
                            <th className="num">{t("Total return", "总收益")}</th>
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
                                  {el(r.status)}
                                </span>
                              </td>
                              <td>
                                {/* rows that predate the field carry no fill_model — default behavior was CONSERVATIVE */}
                                <span className="chip">{el(r.fill_model ?? "CONSERVATIVE")}</span>
                                {r.instrument === "LONG_CALL" && (
                                  <span className="chip" style={{ marginLeft: 4 }}>{el("CALL")}</span>
                                )}
                                {r.instrument === "LONG_PUT" && (
                                  <span className="chip" style={{ marginLeft: 4 }}>{el("PUT")}</span>
                                )}
                                {(r.instrument === "BULL_CALL_SPREAD" ||
                                  r.instrument === "BEAR_PUT_SPREAD") && (
                                  <span className="chip" style={{ marginLeft: 4 }}>{el("SPREAD")}</span>
                                )}
                                {(r.instrument === "COVERED_CALL" ||
                                  r.instrument === "CASH_SECURED_PUT") && (
                                  <span className="chip" style={{ marginLeft: 4 }}>{el("INCOME")}</span>
                                )}
                                {r.instrument === "SHORT_STOCK" && (
                                  <span className="chip" style={{ marginLeft: 4 }}>{el("SHORT")}</span>
                                )}
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

              <div ref={resultsRef}>
              {selectedId == null ? (
                <div className="panel">
                  <p className="empty">
                    {t(
                      "Select a run from the history — or run a new backtest — to see full results.",
                      "从历史记录中选择一次运行 — 或运行一次新的回测 — 以查看完整结果。",
                    )}
                  </p>
                </div>
              ) : record.isPending ? (
                <div className="panel">
                  <p className="empty">
                    {t(`Loading backtest #${selectedId}…`, `正在加载回测 #${selectedId}…`)}
                  </p>
                </div>
              ) : record.isError ? (
                <div className="panel">
                  <p className="error">
                    {t(
                      `Could not load backtest #${selectedId}: ${record.error.message}`,
                      `无法加载回测 #${selectedId}：${record.error.message}`,
                    )}
                  </p>
                </div>
              ) : (
                <ResultsPanel record={record.data} />
              )}
              </div>

              </>
            ),
          },
          {
            id: "portfolio",
            en: "Portfolio",
            zh: "组合回测",
            render: () => <PortfolioBacktestPanel />,
          },
        ]}
      />
    </>
  );
}

export default function BacktestsPage() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <div className="panel">
          <p className="empty">{t("Loading backtests…", "正在加载回测…")}</p>
        </div>
      }
    >
      <BacktestsView />
    </Suspense>
  );
}
