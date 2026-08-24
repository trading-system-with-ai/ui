"use client";

/**
 * Deterministic bilingual labels for CLOSED enum sets the backend emits
 * (regime, tradeability, classification, …). This is a translation TABLE,
 * not paraphrasing: every mapping is 1:1 and total, with the raw token as
 * fallback, so the display never invents a state the server didn't send.
 *
 * Free-text server strings (fail reasons, audit records, gate details) are
 * NOT translated here — they render verbatim (§26/§36).
 */
import { useCallback } from "react";
import { useLang, type Lang } from "@/lib/i18n";

const ENUM_ZH: Record<string, string> = {
  // market / symbol regime
  STRONG_BULL: "强多头",
  MILD_BULL: "温和多头",
  MILD_BEAR: "温和空头",
  BULL: "多头",
  NEUTRAL_RANGE: "区间震荡",
  NEUTRAL: "中性",
  BEAR: "空头",
  STRONG_BEAR: "强空头",
  TRANSITION: "过渡期",
  // tradeability
  TRADEABLE: "可交易",
  CONDITIONAL: "有条件",
  BLOCKED: "禁止开仓",
  // directional-edge classification
  MODERATE_BULL: "中度多头",
  WEAK_BULL: "弱多头",
  WEAK_BEAR: "弱空头",
  MODERATE_BEAR: "中度空头",
  // LLM sentiment
  BULLISH: "看多",
  BEARISH: "看空",
  // volatility states
  UNKNOWN: "未知",
  DEGRADED: "降级",
  EXTREME: "极端",
  NORMAL: "正常",
  LOW: "低",
  HIGH: "高",
  ELEVATED: "偏高",
  // §41 risk model health (DEGRADED is shared with the volatility states above)
  ACTIVE: "运行中",
  UNAVAILABLE: "不可用",
  FAILED: "失败",
  // §6/§12 risk estimator families — the method label that must travel with
  // every VaR/ES number, so it needs a real Chinese rendering, not the token.
  HISTORICAL: "历史法",
  GAUSSIAN: "高斯法",
  HISTORICAL_VOL_SCALED: "历史法(波动率调整)",
  // §19 correlation regime state (NORMAL / ELEVATED / UNAVAILABLE are shared
  // with the volatility and model-health states above)
  CONVERGING: "趋于同向",
  // §21-§27 stress revaluation methods (Phase D) — shown on the
  // method-coverage line of every stress row.
  //
  // Scenario KINDS are deliberately NOT here: "HISTORICAL" already maps to
  // the estimator family "历史法" above, and one token cannot mean two
  // things in a total table. StressScenarios owns its own kind vocabulary.
  FULL_REVAL: "全额重估",
  DELTA_LINEAR: "Delta 线性",
  // Provenance of the baseline IV a full revaluation used (§12 data-source
  // rule: an internally solved IV is never presented as a vendor number).
  PROVIDER: "行情商",
  INTERNALLY_CALCULATED: "平台内部计算",
  STRESS: "压力测试层",
  // §70 model mode
  SHADOW: "影子模式",
  RESEARCH: "研究",
  PRODUCTION: "生产",
  // §8 instrument decisions (AUTO decision tables, 2026-08-20) — the FULL
  // closed InstrumentType set (the table's contract is total coverage)
  LONG_STOCK: "正股做多",
  LONG_CALL: "买入看涨",
  LONG_PUT: "买入看跌",
  SHORT_STOCK: "正股做空",
  BULL_CALL_SPREAD: "牛市看涨价差",
  BEAR_PUT_SPREAD: "熊市看跌价差",
  COVERED_CALL: "备兑看涨",
  CASH_SECURED_PUT: "现金担保看跌",
  NO_TRADE: "不交易",
  // §12.2 strength tiers (closed set from risk/engine.py strength_tier)
  VERY_STRONG: "极强",
  STRONG: "强",
  MODERATE: "中等",
  WEAK: "弱",
  // portfolio advice severity + codes (closed server enums, 2026-08-20)
  WARNING: "警告",
  SUGGESTION: "建议",
  INFO: "提示",
  TAIL_RISK: "尾部风险",
  DRAWDOWN: "回撤",
  CONCENTRATION: "集中度",
  CORRELATION: "相关性",
  CASH_DRAG: "现金拖累",
  INSUFFICIENT_DATA: "数据不足",
  // watchlist opportunity status (completes the closed set)
  WATCH: "观察中",
  SETUP_FORMING: "形态形成中",
  ENTRY_READY: "可入场",
  DATA_ISSUE: "数据异常",
  BACKTEST_FAILED: "回测失败",
  // selector / misc
  AUTO: "自动",
  NO_SIGNAL: "无信号",
  // catalyst horizons (LLM enum field)
  IMMEDIATE: "即时",
  NEAR_TERM: "近期",
  "WEEKS-TO-MONTHS": "数周至数月",
  "MONTHS-TO-YEARS": "数月至数年",
  // backtest run lifecycle (FAILED is shared with model health above)
  COMPLETED: "已完成",
  RUNNING: "运行中",
  PENDING: "待处理",
  CANCELLED: "已取消",
  // §20.2 fill models
  OPTIMISTIC: "乐观",
  CONSERVATIVE: "保守",
  WORST: "最差",
  // instrument chips (backtest history / positions)
  CALL: "看涨",
  PUT: "看跌",
  SPREAD: "价差",
  STOCK: "正股",
  INCOME: "收入策略",
  SHORT: "做空",
};

/** EN: underscores → spaces (existing display convention). ZH: table lookup,
 *  raw token if unmapped — never a guess. */
export function enumLabel(value: string | null | undefined, lang: Lang): string {
  if (value == null || value === "") return "—";
  if (lang !== "zh") return value.replace(/_/g, " ");
  const key = value.toUpperCase().replace(/ /g, "_");
  return ENUM_ZH[key] ?? value.replace(/_/g, " ");
}

/** Hook form: `const el = useEnumLabel(); … el(regime.classification)`. */
export function useEnumLabel() {
  const { lang } = useLang();
  return useCallback(
    (value: string | null | undefined) => enumLabel(value, lang),
    [lang],
  );
}
