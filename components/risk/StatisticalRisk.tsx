"use client";

/**
 * Phase B statistical risk layer — SHADOW (spec §6, §7, §10, §39–§41,
 * §45, §48–§50; design doc §6 API contract).
 *
 * Everything in this file is informational: nothing here alters a Tier 0
 * decision or the §10 gate chain. That is stated on screen, not just in a
 * comment, because a risk number that LOOKS authoritative but is not would
 * be worse than no number at all.
 *
 * The rules this file follows, in order of how easy they are to break:
 *  1. §6 — a VaR/ES number is NEVER rendered without its method label.
 *     Every tile and every table row carries the estimator family.
 *  2. Honest nulls — `value_usd: null` renders an em dash plus the model's
 *     own reason string; it never becomes 0, and never borrows another
 *     model's number.
 *  3. Server strings (health reasons, data-quality reasons, model-risk
 *     triggers, exclusion reasons) render VERBATIM (§26/§36).
 *  4. `*_pct` fields are FRACTIONS (0.0076 = 0.76%) — always through fmtPct.
 *  5. Enum tokens go through useEnumLabel (total table, raw token fallback).
 */
import { useState } from "react";
import ModelTierChip from "@/components/shared/ModelTierChip";
import RiskMethodModal, {
  MODEL_HEALTH_BADGE,
  type MethodField,
} from "@/components/shared/RiskMethodModal";
import Term from "@/components/shared/Term";
import { useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import { fmtPct, fmtUsd } from "@/lib/risk-format";
import type {
  DrawdownBlock,
  ModelHealth,
  ModelTier,
  PortfolioGreeks,
  RiskContributionBlock,
  RiskMetricRow,
  StatisticalRisk,
  StatisticalVolatility,
} from "@/lib/types";

/* ---------------------------------------------------------------- helpers */

const DASH = <span style={{ color: "var(--text-dim)" }}>—</span>;

/** Provenance line shown in every methodology card (§50 "Data Source"). */
function dataSourceLine(s: StatisticalRisk): string {
  return `stock_bars_daily, ${s.pnl_method} book P&L`;
}

/**
 * Human method label for a VaR/ES row — the string that must never be
 * separated from the number (§6). Confidence is a FRACTION on the wire.
 */
function methodLabel(
  r: RiskMetricRow,
  kind: "VaR" | "ES",
  el: (v: string | null | undefined) => string,
): string {
  return `${el(r.model)} ${kind} ${(r.confidence * 100).toFixed(0)}% ${r.horizon_days}D`;
}

/** Find one row of the §6-ordered var/es arrays. */
function findRow(
  rows: RiskMetricRow[],
  model: RiskMetricRow["model"],
  confidence: number,
  horizonDays = 1,
): RiskMetricRow | undefined {
  return rows.find(
    (r) =>
      r.model === model &&
      Math.abs(r.confidence - confidence) < 1e-9 &&
      r.horizon_days === horizonDays,
  );
}

/** "n=598, tail 30" / "n=17" — the sample line the spec requires on each tile. */
function sampleLine(sampleSize: number | null, tailSize: number | null): string {
  if (sampleSize == null) return "";
  return tailSize == null ? `n=${sampleSize}` : `n=${sampleSize}, tail ${tailSize}`;
}

/** Diagnostics rows shared by every VaR/ES methodology card. */
function metricDiagnostics(
  r: RiskMetricRow,
  s: StatisticalRisk,
  t: (en: string, zh: string) => string,
): MethodField[] {
  const fields: MethodField[] = [
    { label: t("Tail size (k)", "尾部样本数 (k)"), value: r.tail_size },
    {
      label: t("Scaling", "时间缩放"),
      value: r.scaling ?? t("none (estimated directly at this horizon)", "无（在该期限直接估计）"),
    },
    { label: t("P&L method", "盈亏构造方法"), value: s.pnl_method },
  ];
  if (s.distribution != null) {
    fields.push(
      // An UNSTABLE series (variance ~ 0) has no skew/kurtosis/JB at all —
      // the backend sends null. Show the em dash, never a fabricated 0.
      { label: t("Skew", "偏度"), value: s.distribution.skew?.toFixed(3) ?? null },
      {
        label: t("Excess kurtosis", "超额峰度"),
        value: s.distribution.excess_kurtosis?.toFixed(3) ?? null,
      },
      { label: t("Jarque–Bera p", "Jarque–Bera p 值"), value: s.distribution.jb_p?.toFixed(4) ?? null },
      { label: t("Gaussian trust", "高斯可信度"), value: s.distribution.gaussian_trust },
    );
  }
  if (s.dispersion != null) {
    // ratio/min/max are null when fewer than two comparable views exist
    // (health UNAVAILABLE) — the block's presence never implies a number.
    fields.push({
      label: t("Model dispersion", "模型分歧度"),
      value:
        s.dispersion.ratio == null
          ? (s.dispersion.reason ?? null)
          : `${s.dispersion.ratio.toFixed(2)}× (${s.dispersion.min_model} → ${s.dispersion.max_model})`,
    });
  }
  return fields;
}

/**
 * Phase E (§12–§14, §58) — which conditional-volatility forecaster produced
 * the σ on the tile, or null when the backend does not say.
 *
 * Read in the order the backend is documented to fill: an explicit
 * `forecaster` field first, then a `source`-style key inside `diagnostics`,
 * then the model name itself (a GARCH-backed σ is named "garch11" even on a
 * build that adds no dedicated field). A GARCH forecaster is suffixed
 * "-research" because §63 promotion is a reviewed user action — a research
 * forecaster must never read on screen as an accepted one.
 *
 * Returns null rather than a default: naming a forecaster the server did not
 * report would be exactly the fabricated provenance §13 forbids.
 */
export function activeForecasterLabel(v: StatisticalVolatility): string | null {
  const diag = v.diagnostics ?? null;
  const fromDiag =
    diag != null && typeof diag["forecaster"] === "string"
      ? (diag["forecaster"] as string)
      : diag != null && typeof diag["source"] === "string"
        ? (diag["source"] as string)
        : null;
  const raw = v.forecaster ?? fromDiag ?? null;
  if (raw == null) {
    // No dedicated field: fall back to the model name, but ONLY when it
    // actually identifies a conditional forecaster. "portfolio_volatility"
    // is the plain sample σ and names no forecaster at all.
    const name = (v.model_name ?? "").toLowerCase();
    if (name.includes("garch")) return "GARCH-research";
    if (name.includes("ewma")) return "EWMA";
    return null;
  }
  const norm = raw.trim();
  if (norm === "") return null;
  return norm.toLowerCase().includes("garch") &&
    !norm.toLowerCase().includes("research")
    ? `${norm}-research`
    : norm;
}

/** The one-line SHADOW disclaimer, reused everywhere the layer is shown. */
function useShadowNote(): string {
  const t = useT();
  return t(
    "SHADOW — this does not alter trading decisions yet.",
    "影子模式 — 这些数字目前不会改变任何交易决策。",
  );
}

/* ---------------------------------------------------------------- tiles */

/** What one methodology-labelled tile needs; value/pct may be honestly null. */
interface TileSpec {
  /** Unique id used as the modal key. */
  id: string;
  /** Methodology-bearing label, e.g. "Historical VaR 95% 1D" (§6). */
  label: string;
  /** Optional glossary key rendered around the label. */
  termKey?: string;
  valueUsd: number | null;
  pctNav: number | null;
  /** Rendered instead of the USD value when set (drawdown tiles are pct-first). */
  valueOverride?: string | null;
  subOverride?: string | null;
  health: ModelHealth | null;
  healthReason: string | null;
  sampleSize: number | null;
  tailSize: number | null;
  /**
   * §5 tier of the model behind the tile. Optional — absent on backends that
   * predate the taxonomy, and the chip then renders nothing.
   */
  tier?: ModelTier | null;
  /** Everything the §50 modal needs. */
  modal: {
    model: string;
    modelVersion?: string | null;
    confidence?: number | null;
    horizonDays?: number | null;
    distribution?: string | null;
    formula: string;
    extraFields?: MethodField[];
    diagnostics: MethodField[];
  };
  /**
   * Replaces the shared SHADOW note at the foot of the §50 modal. Used by the
   * Greeks tiles, which are TIER_0 production figures — telling the user they
   * "decide nothing" would be false there; the §23 "local sensitivity, not
   * tail risk" framing is what belongs in that slot instead.
   */
  modalNote?: string;
}

function MethodTile({ spec, onOpen }: { spec: TileSpec; onOpen: () => void }) {
  const t = useT();
  const el = useEnumLabel();
  const sample = sampleLine(spec.sampleSize, spec.tailSize);
  return (
    <div className="stat">
      <div className="label">
        {spec.termKey ? <Term k={spec.termKey}>{spec.label}</Term> : spec.label}
        {/* §5 — the tier of the model behind this number, beside its name.
            Renders nothing when the server sent no tier. */}
        <ModelTierChip tier={spec.tier} compact />
      </div>
      <div className="value">
        {spec.valueOverride != null
          ? spec.valueOverride
          : spec.valueUsd == null
            ? DASH
            : fmtUsd(spec.valueUsd)}
        {spec.valueOverride == null && spec.valueUsd != null && spec.pctNav != null && (
          <span style={{ fontSize: 13, marginLeft: 6 }}>{fmtPct(spec.pctNav, 2)}</span>
        )}
      </div>
      <div className="sub">
        {spec.health != null && (
          <span className={`badge ${MODEL_HEALTH_BADGE[spec.health]}`}>{el(spec.health)}</span>
        )}
        {sample ? <span style={{ marginLeft: 6 }}>{sample}</span> : null}
      </div>
      {/* Honest null: the model's own reason, verbatim, instead of a number. */}
      {spec.valueUsd == null && spec.valueOverride == null && spec.healthReason && (
        <div className="sub" style={{ color: "var(--amber)" }}>
          {spec.healthReason}
        </div>
      )}
      {spec.subOverride && <div className="sub">{spec.subOverride}</div>}
      <button
        type="button"
        className="method-info"
        onClick={onOpen}
        aria-label={t(
          `How is ${spec.label} calculated?`,
          `${spec.label} 如何计算？`,
        )}
      >
        {t("ⓘ How is this calculated?", "ⓘ 该指标如何计算？")}
      </button>
    </div>
  );
}

/**
 * §48 top-bar tiles for the statistical layer, rendered AFTER the existing
 * ones (never reordering them). Each one carries its methodology in the
 * label, a health badge, the sample size, and a §50 explainer.
 */
export function StatisticalStatTiles({
  s,
  drawdown,
  greeks,
}: {
  s: StatisticalRisk;
  drawdown: DrawdownBlock | null | undefined;
  /**
   * §48 — the portfolio Greeks block, so Net Delta and Net Vega appear as
   * TOP-BAR CARDS and not only inside the Greeks panel further down. Optional
   * and nullable: null whenever market data is unconfigured (Greeks need
   * chain data), in which case those two tiles are omitted entirely rather
   * than shown as zeros.
   */
  greeks?: PortfolioGreeks | null;
}) {
  const t = useT();
  const el = useEnumLabel();
  const [open, setOpen] = useState<string | null>(null);
  const shadowNote = useShadowNote();

  const hv95 = findRow(s.var, "HISTORICAL", 0.95);
  const hes95 = findRow(s.es, "HISTORICAL", 0.95);
  const gv95 = findRow(s.var, "GAUSSIAN", 0.95);
  // §48 cards
  const hv99 = findRow(s.var, "HISTORICAL", 0.99);
  const hes99 = findRow(s.es, "HISTORICAL", 0.99);

  const specs: TileSpec[] = [];

  const varTile = (
    r: RiskMetricRow | undefined,
    id: string,
    label: string,
    termKey: string,
    kind: "VaR" | "ES",
    formula: string,
  ): TileSpec | null => {
    if (r == null) return null;
    return {
      id,
      label,
      termKey,
      valueUsd: r.value_usd,
      pctNav: r.pct_nav,
      health: r.health,
      healthReason: r.reason,
      sampleSize: r.sample_size,
      tailSize: r.tail_size,
      // §5 — carried from the row, so the chip appears only when the server
      // classified this estimator.
      tier: r.tier ?? null,
      modal: {
        model: `${el(r.model)} ${kind} (${r.model_name})`,
        modelVersion: r.model_version,
        confidence: r.confidence,
        horizonDays: r.horizon_days,
        distribution: r.distribution,
        formula,
        diagnostics: metricDiagnostics(r, s, t),
      },
    };
  };

  const hv = varTile(
    hv95,
    "hist-var-95-1d",
    t("Historical VaR 95% 1D", "历史 VaR 95% 1日"),
    "var",
    "VaR",
    t(
      "Losses L = −P&L of the current book over the window, sorted descending; k = ceil(n × (1 − confidence)); Historical VaR = the k-th largest loss. Empirical — no distribution is assumed.",
      "取当前持仓组合在窗口内的亏损 L = −盈亏，降序排列；k = ceil(n × (1 − 置信度))；历史 VaR = 第 k 大的亏损。纯经验分布，不作任何分布假设。",
    ),
  );
  if (hv) specs.push(hv);

  const he = varTile(
    hes95,
    "hist-es-95-1d",
    t("Historical ES 95% 1D", "历史 ES 95% 1日"),
    "es",
    "ES",
    t(
      "Historical ES = the mean of the k largest losses (same k as the VaR above). ES ≥ VaR always holds at the same confidence.",
      "历史 ES = 最大的 k 个亏损的平均值（k 与上方 VaR 相同）。相同置信度下恒有 ES ≥ VaR。",
    ),
  );
  if (he) specs.push(he);

  // §48 cards 3 and 4 — VaR 99% and ES 99%. The rows are already on the wire
  // (the §6-ordered arrays carry 95 AND 99); the audit's finding was that they
  // existed only as TABLE ROWS, never as cards. They sit immediately after
  // their 95% counterparts so the two confidences read as one pair, and they
  // are omitted entirely when the server sent no 99% row rather than rendered
  // as a dash that would imply the estimate was attempted and failed.
  const hv99Tile = varTile(
    hv99,
    "hist-var-99-1d",
    t("Historical VaR 99% 1D", "历史 VaR 99% 1日"),
    "var",
    "VaR",
    t(
      "The same empirical estimator as VaR 95%, read further into the tail: k = ceil(n × 0.01), so it indexes far fewer observations. A 99% figure from a ~600-day window rests on roughly six losses — read the tail size beside it before trusting the precision.",
      "与 VaR 95% 相同的经验估计方法，只是读得更深入尾部：k = ceil(n × 0.01)，所用观测数少得多。约 600 个交易日的窗口下，99% 的数值仅由大约 6 个亏损决定 — 采信其精度前请先看旁边的尾部样本数。",
    ),
  );
  if (hv99Tile) specs.push(hv99Tile);

  const hes99Tile = varTile(
    hes99,
    "hist-es-99-1d",
    t("Historical ES 99% 1D", "历史 ES 99% 1日"),
    "es",
    "ES",
    t(
      "The mean of the k largest losses at k = ceil(n × 0.01) — the average of the very worst days rather than the threshold where they begin. It is the most informative tail number the platform computes and the thinnest-sampled one; both are true at once.",
      "取 k = ceil(n × 0.01) 时最大的 k 个亏损的平均值 — 即最糟糕那些交易日的平均亏损，而非坏尾的起点。它是本平台计算出的最具信息量的尾部数字，同时也是样本最稀薄的一个；这两点同时成立。",
    ),
  );
  if (hes99Tile) specs.push(hes99Tile);

  const gv = varTile(
    gv95,
    "gauss-var-95-1d",
    t("Gaussian VaR 95% 1D", "高斯 VaR 95% 1日"),
    "gaussian_var",
    "VaR",
    t(
      "Gaussian VaR = −μ + z × σ, with μ and σ the sample mean and standard deviation (ddof=1) of daily book P&L and z the normal quantile at the confidence level. Assumes normality — read the distribution line before trusting it.",
      "高斯 VaR = −μ + z × σ，其中 μ、σ 为每日组合盈亏的样本均值与标准差（ddof=1），z 为该置信度下的正态分位数。该式假设正态分布 — 采信前请先看分布诊断行。",
    ),
  );
  if (gv) specs.push(gv);

  if (s.volatility != null) {
    const v = s.volatility;
    // Phase E (§13/§58): the FALLBACK HIERARCHY means the forecaster that
    // actually produced this σ is not always the preferred one — a GARCH fit
    // that fails diagnostics degrades to EWMA. So the tile names the one that
    // RAN. The field is optional: on a backend that predates Phase E there is
    // nothing to name and the tile shows the plain label, never a guess.
    const forecaster = activeForecasterLabel(v);
    specs.push({
      id: "portfolio-vol-1d",
      label: t("Conditional Vol σ (1D)", "条件波动率 σ（1日）"),
      valueUsd: v.value_usd,
      pctNav: v.pct_nav,
      health: v.health,
      healthReason: v.reason,
      sampleSize: v.sample_size,
      tailSize: null,
      // The forecaster leads the sub-line: which model produced the number
      // qualifies it more than its annualization does.
      subOverride: [
        forecaster == null
          ? null
          : t(`forecaster ${forecaster}`, `预测模型 ${forecaster}`),
        v.annualized_pct_nav == null
          ? null
          : t(
              `annualized ${fmtPct(v.annualized_pct_nav)} of NAV`,
              `年化为 NAV 的 ${fmtPct(v.annualized_pct_nav)}`,
            ),
      ]
        .filter((x): x is string => x != null)
        .join(" · ") || null,
      modal: {
        model: `${v.model_name}`,
        modelVersion: v.model_version,
        horizonDays: 1,
        distribution: null,
        formula: t(
          "Sample standard deviation (ddof=1) of the daily book P&L series, in USD per day. The annualized figure is σ × √252.",
          "每日组合盈亏序列的样本标准差（ddof=1），单位为美元/日。年化值为 σ × √252。",
        ),
        diagnostics: [
          { label: t("P&L method", "盈亏构造方法"), value: s.pnl_method },
          {
            label: t("Annualized (% NAV)", "年化（占 NAV）"),
            value: v.annualized_pct_nav == null ? null : fmtPct(v.annualized_pct_nav),
          },
          // Null (an em dash) on a pre-Phase-E backend — the modal never
          // invents a forecaster name the server did not send.
          { label: t("Active forecaster", "当前生效的预测模型"), value: forecaster },
        ],
      },
    });
  }

  if (drawdown != null) {
    const ddPct = drawdown.current_pct;
    specs.push({
      id: "current-drawdown",
      label: t("Current Drawdown", "当前回撤"),
      termKey: "max_drawdown",
      valueUsd: null,
      pctNav: null,
      valueOverride: ddPct == null ? "—" : fmtPct(ddPct, 2),
      health: drawdown.health,
      healthReason: drawdown.reason,
      sampleSize: drawdown.nav_series.n,
      tailSize: null,
      subOverride:
        drawdown.peak_nav == null
          ? null
          : t(
              `peak ${fmtUsd(drawdown.peak_nav)}${drawdown.peak_date ? ` on ${drawdown.peak_date}` : ""}`,
              `峰值 ${fmtUsd(drawdown.peak_nav)}${drawdown.peak_date ? `（${drawdown.peak_date}）` : ""}`,
            ),
      modal: {
        model: t("NAV-series drawdown", "NAV 序列回撤"),
        formula: t(
          "drawdown_t = NAV_t ÷ running max(NAV) − 1, over the persisted daily snapshot NAVs. It only accrues from the first scheduled snapshot onward — it is not backfilled.",
          "回撤_t = NAV_t ÷ NAV 的历史峰值 − 1，基于已持久化的每日快照 NAV 计算。它只能从第一个定时快照开始累积 — 不会回填历史。",
        ),
        diagnostics: [
          { label: t("Snapshots (n)", "快照数量 (n)"), value: drawdown.nav_series.n },
          { label: t("Since", "起始"), value: drawdown.nav_series.since },
          { label: t("Series source", "序列来源"), value: drawdown.nav_series.source },
          { label: t("Max drawdown", "最大回撤"), value: drawdown.max_pct == null ? null : fmtPct(drawdown.max_pct, 2) },
          { label: t("Peak date", "峰值日期"), value: drawdown.peak_date },
          { label: t("Trough date", "谷底日期"), value: drawdown.trough_date },
        ],
      },
    });
  }

  // §48 card 5 — Stress Loss (the WORST scenario). The server picks the worst
  // row; it is never a client-side min() over the catalogue. The tile shows
  // `loss_usd` (VaR/ES sign, positive = money lost) so it sits in the same
  // sign convention as the VaR/ES cards beside it — the server sends both
  // signs precisely so the UI never negates one to obtain the other.
  //
  // The whole tile is omitted on a backend that predates Phase D or a book
  // that produced no scenario at all: a stress card reading "—" would imply a
  // catalogue was run and lost nothing.
  const worst = s.stress?.worst ?? null;
  if (worst != null) {
    const coverage = Object.entries(worst.method_coverage ?? {}).filter(
      ([, n]) => typeof n === "number" && n > 0,
    );
    specs.push({
      id: "stress-worst-loss",
      label: t("Stress Loss (worst)", "压力亏损（最差情景）"),
      termKey: "stress_test",
      valueUsd: worst.loss_usd,
      pctNav: worst.loss_pct_nav,
      health: worst.health,
      healthReason: worst.reason,
      // A stress scenario is not estimated from a sample — it is one
      // repricing of one book. n_obs would be a borrowed number, so the tile
      // shows neither a sample nor a tail size.
      sampleSize: null,
      tailSize: null,
      tier: s.stress?.tier ?? null,
      // The scenario NAME is the tile's sub-line: without it the loss is an
      // anonymous figure. Server-worded, verbatim (§26/§36).
      subOverride: worst.name,
      modal: {
        model: t("Scenario revaluation (worst of catalogue)", "情景重估（情景目录中最差者）"),
        modelVersion: s.stress?.model_version ?? null,
        horizonDays: null,
        distribution: null,
        formula: t(
          "Not a probability estimate. Each catalogue scenario fixes a state (spot, IV and time all move together) and reprices the whole book under it; the loss shown is the worst result across the catalogue. Option legs are repriced in full where a usable IV exists, and fall back to DELTA_LINEAR — which understates convexity in exactly the tail being probed — where it does not.",
          "这不是概率估计。情景目录中的每个情景固定一组状态（现价、IV 与剩余期限同时变动），并据此对整个持仓组合重新定价；此处显示的是目录中最差的结果。有可用 IV 的期权腿采用全额重估，没有的则退回 DELTA_LINEAR — 而这种退化恰恰会低估所探测尾部中的凸性。",
        ),
        diagnostics: [
          { label: t("Scenario", "情景"), value: worst.name },
          { label: t("Kind", "类型"), value: worst.kind },
          {
            label: t("Parameterisation", "参数化"),
            value: worst.validated
              ? t("validated against data", "已对照数据验证")
              : t("UNVALIDATED — research default", "未验证 — 研究默认值"),
          },
          {
            label: t("Signed P&L", "带符号盈亏"),
            value: worst.pnl_usd == null ? null : fmtUsd(worst.pnl_usd),
          },
          {
            label: t("Method coverage", "定价方法覆盖"),
            value:
              coverage.length === 0
                ? null
                : coverage.map(([m, n]) => `${n} ${m}`).join(" / "),
          },
          { label: t("Catalogue version", "情景目录版本"), value: s.stress?.catalogue_version },
          { label: t("Stock legs", "股票腿"), value: s.stress?.n_stock_legs ?? null },
          { label: t("Option legs", "期权腿"), value: s.stress?.n_option_legs ?? null },
        ],
      },
    });
  }

  // §48 cards 6 and 7 — Net Delta and Net Vega, lifted from the Greeks block
  // to the top bar. These are §23 LOCAL SENSITIVITIES, not tail measures, and
  // the modal says so in the same words the Greeks panel does: two cards away
  // from a VaR card, that distinction is the one most easily lost.
  //
  // `greeks` is null whenever market data is unconfigured — both tiles are
  // then omitted rather than rendered as a flat book of zeros.
  if (greeks != null) {
    const greekNote = t(
      "Local sensitivity, not tail risk: it says how the book moves for a SMALL change from here, and says nothing about how far things can go. Read it beside Statistical Risk and Stress, never instead of them.",
      "这是局部敏感度，而非尾部风险：它说明持仓组合在当前位置附近发生「微小」变动时如何变化，完全不说明极端情况能走多远。请与统计风险和压力测试并列阅读，而不是用它取代两者。",
    );
    specs.push({
      id: "net-delta",
      label: t("Net Delta", "净 Delta"),
      termKey: "delta_notional",
      // Delta-adjusted NOTIONAL is the dollar figure; equivalent shares are
      // the sub-line. A share count in the USD slot would format as money.
      valueUsd: greeks.delta_adjusted_notional_usd,
      pctNav: greeks.delta_notional_pct_nav,
      health: null,
      healthReason: null,
      sampleSize: null,
      tailSize: null,
      tier: "TIER_0",
      subOverride: t(
        `${greeks.net_delta_shares.toFixed(0)} equivalent shares · limit ${fmtPct(greeks.limits.max_delta_notional_pct_nav)} of NAV`,
        `${greeks.net_delta_shares.toFixed(0)} 等效股数 · 上限为 NAV 的 ${fmtPct(greeks.limits.max_delta_notional_pct_nav)}`,
      ),
      modal: {
        model: t("Aggregated position Greeks", "持仓希腊值聚合"),
        horizonDays: null,
        distribution: null,
        formula: t(
          "Net delta = Σ quantity × multiplier × delta (equivalent shares); delta-adjusted notional = the same sum × spot. Stock is delta 1 per share; option deltas come from the chain.",
          "净 Delta = Σ 数量 × 合约乘数 × delta（等效股数）；Delta 调整名义值 = 同一求和 × 现价。股票每股 delta 为 1；期权 delta 取自期权链。",
        ),
        diagnostics: [
          { label: t("Equivalent shares", "等效股数"), value: greeks.net_delta_shares.toFixed(2) },
          {
            label: t("Limit (% NAV)", "上限（占 NAV）"),
            value: fmtPct(greeks.limits.max_delta_notional_pct_nav),
          },
          { label: t("Positions priced", "已定价持仓数"), value: greeks.per_position.length },
          {
            label: t("Rows without chain data", "无期权链数据的行数"),
            value: greeks.per_position.filter((p) => !p.data_ok).length,
          },
        ],
      },
      // The §23 framing rides with the number, not only in the panel below.
      modalNote: greekNote,
    });
    specs.push({
      id: "net-vega",
      label: t("Net Vega", "净 Vega"),
      // The PORTFOLIO-level entry, not the per-contract `vega` one: the
      // aggregated figure is a different quantity from a single option's
      // greek, and it is the aggregate this tile shows.
      termKey: "net_vega",
      valueUsd: greeks.net_vega_usd,
      // Vega's limit is a fraction of NAV but the VALUE is $ per IV point,
      // not a share of NAV — a pct here would be a different quantity wearing
      // the same suffix, so the tile shows none.
      pctNav: null,
      health: null,
      healthReason: null,
      sampleSize: null,
      tailSize: null,
      tier: "TIER_0",
      subOverride: t(
        `$ per IV point · limit ${fmtPct(greeks.limits.max_net_vega_pct_nav)} of NAV`,
        `每个 IV 点对应的美元 · 上限为 NAV 的 ${fmtPct(greeks.limits.max_net_vega_pct_nav)}`,
      ),
      modal: {
        model: t("Aggregated position Greeks", "持仓希腊值聚合"),
        horizonDays: null,
        distribution: null,
        formula: t(
          "Net vega = Σ quantity × multiplier × vega — the book's P&L for a ONE POINT move in implied volatility, with spot and time held still. Positive means the book gains when IV rises.",
          "净 Vega = Σ 数量 × 合约乘数 × vega — 在现价与剩余期限不变的前提下，隐含波动率变动「一个点」时组合的盈亏。为正表示 IV 上升时组合获利。",
        ),
        diagnostics: [
          {
            label: t("Limit (% NAV)", "上限（占 NAV）"),
            value: fmtPct(greeks.limits.max_net_vega_pct_nav),
          },
          { label: t("Net theta ($/day)", "净 Theta（美元/日）"), value: fmtUsd(greeks.net_theta_usd_per_day, 2) },
          { label: t("Net gamma", "净 Gamma"), value: greeks.net_gamma.toFixed(4) },
          { label: t("Positions priced", "已定价持仓数"), value: greeks.per_position.length },
        ],
      },
      modalNote: greekNote,
    });
  }

  specs.push({
    id: "model-risk",
    label: t("Model Risk", "模型风险"),
    termKey: "model_risk_state",
    valueUsd: null,
    pctNav: null,
    valueOverride: s.model_risk == null ? "—" : el(s.model_risk.state),
    health: null,
    healthReason: null,
    sampleSize: null,
    tailSize: null,
    subOverride:
      s.dispersion?.ratio == null
        ? null
        : t(
            `dispersion ${s.dispersion.ratio.toFixed(2)}×`,
            `分歧度 ${s.dispersion.ratio.toFixed(2)}×`,
          ),
    modal: {
      model: t("Model-risk rule table", "模型风险规则表"),
      formula: t(
        "HIGH when any model FAILED, or when at least two of these hold: dispersion high, Gaussian trust LOW with a Gaussian view active, a core view UNAVAILABLE, a DEGRADED sample. ELEVATED when exactly one holds. LOW otherwise. It rates the models, not the market.",
        "当任一模型 FAILED，或以下情形满足两条及以上时为 HIGH：分歧度偏高、存在高斯视图且高斯可信度为 LOW、核心视图 UNAVAILABLE、样本 DEGRADED。恰好满足一条时为 ELEVATED，否则为 LOW。它评价的是模型，而非市场。",
      ),
      diagnostics: [
        {
          label: t("Dispersion ratio", "分歧比值"),
          value: s.dispersion?.ratio == null ? null : s.dispersion.ratio.toFixed(2),
        },
        {
          label: t("Dispersion flag", "分歧标记"),
          value:
            s.dispersion == null
              ? null
              : s.dispersion.high
                ? "MODEL_DISPERSION_HIGH"
                : t("normal", "正常"),
        },
        {
          label: t("Gaussian trust", "高斯可信度"),
          value: s.distribution?.gaussian_trust ?? null,
        },
        {
          label: t("Distribution", "分布"),
          value: s.distribution?.primary ?? null,
        },
      ],
    },
  });

  const openSpec = specs.find((sp) => sp.id === open);

  return (
    <>
      <div className="statbar">
        {specs.map((sp) => (
          <MethodTile key={sp.id} spec={sp} onOpen={() => setOpen(sp.id)} />
        ))}
      </div>
      {openSpec && (
        <RiskMethodModal
          metric={openSpec.label}
          model={openSpec.modal.model}
          modelVersion={openSpec.modal.modelVersion}
          confidence={openSpec.modal.confidence}
          horizonDays={openSpec.modal.horizonDays}
          sampleSize={openSpec.sampleSize}
          windowStart={s.window_start}
          windowEnd={s.window_end}
          distribution={openSpec.modal.distribution}
          asOf={s.as_of}
          dataSource={dataSourceLine(s)}
          health={openSpec.health}
          healthReason={openSpec.healthReason}
          formula={openSpec.modal.formula}
          extraFields={openSpec.modal.extraFields}
          diagnostics={openSpec.modal.diagnostics}
          /* The Greeks tiles override this: they are TIER_0 production
             figures, so the SHADOW "decides nothing" line would be false on
             them and the §23 framing takes its place. */
          note={openSpec.modalNote ?? shadowNote}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- panel: statistical risk */

/** One VaR/ES table row — the method label travels with the number (§6). */
function MetricRow({
  r,
  kind,
  onOpen,
}: {
  r: RiskMetricRow;
  kind: "VaR" | "ES";
  onOpen: () => void;
}) {
  const t = useT();
  const el = useEnumLabel();
  return (
    <tr>
      <td style={{ whiteSpace: "nowrap" }}>
        {el(r.model)} {kind}
        {/* §5 — the estimator's tier, beside its name. Nothing renders when
            the server sent no tier (older backends). */}
        <ModelTierChip tier={r.tier} compact />
        {r.scaling ? (
          <span className="badge dim" style={{ marginLeft: 6 }} title={r.scaling}>
            {r.scaling}
          </span>
        ) : null}
      </td>
      <td className="num">{(r.confidence * 100).toFixed(0)}%</td>
      <td className="num">{r.horizon_days}D</td>
      <td className="num">{r.value_usd == null ? DASH : fmtUsd(r.value_usd)}</td>
      <td className="num">{r.pct_nav == null ? DASH : fmtPct(r.pct_nav, 2)}</td>
      <td>
        <span className={`badge ${MODEL_HEALTH_BADGE[r.health]}`}>{el(r.health)}</span>
        {/* Verbatim server reason — the only explanation for a missing number. */}
        {r.reason && (
          <span
            style={{
              color: "var(--text-dim)",
              fontSize: 11,
              marginLeft: 6,
              fontFamily: "var(--font-mono)",
            }}
          >
            {r.reason}
          </span>
        )}
      </td>
      <td className="num">{r.sample_size}</td>
      <td className="num">{r.tail_size == null ? DASH : r.tail_size}</td>
      <td>
        <button type="button" className="method-info" onClick={onOpen}>
          {t("ⓘ How is this calculated?", "ⓘ 该指标如何计算？")}
        </button>
      </td>
    </tr>
  );
}

/**
 * §39/§40/§41 — every model view side by side, with disagreement and model
 * health shown rather than averaged away.
 */
export function StatisticalRiskPanel({ s }: { s: StatisticalRisk }) {
  const t = useT();
  const el = useEnumLabel();
  const shadowNote = useShadowNote();
  const [open, setOpen] = useState<{ r: RiskMetricRow; kind: "VaR" | "ES" } | null>(null);

  const rows: { r: RiskMetricRow; kind: "VaR" | "ES" }[] = [
    ...s.var.map((r) => ({ r, kind: "VaR" as const })),
    ...s.es.map((r) => ({ r, kind: "ES" as const })),
  ];

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 style={{ marginBottom: 0 }}>
          {t("Statistical Risk", "统计风险")}{" "}
          {/* The mode comes from the server, not a UI constant: if the layer
              is ever promoted out of SHADOW the badge must change with it. */}
          <Term k="shadow_mode">
            <span className="badge amber">{s.mode}</span>
          </Term>
        </h2>
        <span
          style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}
        >
          {s.stale ? null : (
            <>
              {t(
                `${s.n_obs} obs · ${s.window_start ?? "—"} → ${s.window_end ?? "—"} · ${s.pnl_method}`,
                `${s.n_obs} 个观测 · ${s.window_start ?? "—"} → ${s.window_end ?? "—"} · ${s.pnl_method}`,
              )}
            </>
          )}
        </span>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "8px 0 12px" }}>
        {t(
          "Several independent views of the same book, never averaged into one number — SHADOW: this does not alter trading decisions yet. The hard limits above continue to decide alone.",
          "对同一组合的多个独立视角，绝不平均成一个数字 — 影子模式：这些数字目前不会改变任何交易决策。上方的硬性限制仍独立作出决策。",
        )}
      </p>

      {/* Snapshot-level flags: staleness and data quality come first because
          they qualify every number below them. */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {s.stale && (
          <span className="badge amber" title={t("older than one trading day", "超过一个交易日")}>
            {t("stale snapshot", "快照已过期")}
          </span>
        )}
        <span className={`badge ${s.data_quality.valid ? "green" : "red"}`}>
          {s.data_quality.valid
            ? t("data quality OK", "数据质量正常")
            : t("data quality INVALID", "数据质量无效")}
        </span>
        <span style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
          {t(
            `snapshot ${s.snapshot_id ?? "not persisted"} · ${s.snapshot_version} · as of ${new Date(s.as_of).toLocaleString()}`,
            `快照 ${s.snapshot_id ?? "未持久化"} · ${s.snapshot_version} · 截至 ${new Date(s.as_of).toLocaleString()}`,
          )}
        </span>
      </div>

      {!s.data_quality.valid && (
        <div className="banner breach" style={{ marginBottom: 12 }}>
          <div>
            {t(
              "Snapshot data quality is INVALID — the statistical views below are reported as-is and must not be read as a clean measurement.",
              "快照数据质量无效 — 下方统计视图按原样呈现，不应被视为干净的度量结果。",
            )}
          </div>
          <ul className="why-list" style={{ marginTop: 6 }}>
            {/* Server-generated reasons, verbatim. */}
            {s.data_quality.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {/* The tier chips render inside this column, so the column
                    heading is where their explainer belongs. */}
                <th>
                  <Term k="model_tier">{t("Model", "模型")}</Term>
                </th>
                <th className="num">{t("Conf.", "置信度")}</th>
                <th className="num">{t("Horizon", "期限")}</th>
                <th className="num">{t("Value", "数值")}</th>
                <th className="num">{t("% NAV", "占 NAV")}</th>
                <th>{t("Health", "健康度")}</th>
                <th className="num">n</th>
                <th className="num">{t("Tail k", "尾部 k")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, kind }) => (
                <MetricRow
                  key={`${kind}-${r.model}-${r.confidence}-${r.horizon_days}`}
                  r={r}
                  kind={kind}
                  onOpen={() => setOpen({ r, kind })}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          {t(
            "No VaR or ES views were produced for this snapshot.",
            "该快照未产出任何 VaR 或 ES 视图。",
          )}
        </p>
      )}

      {/* §40 — disagreement is information; it is never averaged away. */}
      <p style={{ marginTop: 12, fontSize: 12, fontFamily: "var(--font-mono)" }}>
        <Term k="model_dispersion">{t("Model disagreement", "模型分歧")}</Term>:{" "}
        {s.dispersion?.ratio == null ? (
          <span style={{ color: "var(--text-dim)" }}>
            {s.dispersion?.reason ??
              t(
                "not comparable — fewer than two models produced a positive value.",
                "无法比较 — 产出正值的模型少于两个。",
              )}
          </span>
        ) : (
          <>
            <span>
              {t(
                `${s.dispersion.max_model} ÷ ${s.dispersion.min_model} = ${s.dispersion.ratio.toFixed(2)}× across ${s.dispersion.n_comparable} views`,
                `${s.dispersion.max_model} ÷ ${s.dispersion.min_model} = ${s.dispersion.ratio.toFixed(2)}×，共 ${s.dispersion.n_comparable} 个视图`,
              )}
            </span>{" "}
            {s.dispersion.high && <span className="badge amber">MODEL_DISPERSION_HIGH</span>}
          </>
        )}
      </p>

      {/* §15 distribution — the reason to trust or distrust the Gaussian rows. */}
      <p style={{ marginTop: 8, fontSize: 12, fontFamily: "var(--font-mono)" }}>
        {t("Distribution", "分布")}:{" "}
        {s.distribution == null ? (
          <span style={{ color: "var(--text-dim)" }}>
            {t("not computed for this snapshot.", "该快照未计算分布诊断。")}
          </span>
        ) : (
          <>
            <span className="badge dim">{s.distribution.primary ?? "—"}</span>{" "}
            {t(
              `skew ${s.distribution.skew?.toFixed(2) ?? "—"} · excess kurtosis ${s.distribution.excess_kurtosis?.toFixed(2) ?? "—"} · JB ${s.distribution.jarque_bera?.toFixed(2) ?? "—"} (p ${s.distribution.jb_p?.toFixed(3) ?? "—"}) · n=${s.distribution.n}`,
              `偏度 ${s.distribution.skew?.toFixed(2) ?? "—"} · 超额峰度 ${s.distribution.excess_kurtosis?.toFixed(2) ?? "—"} · JB ${s.distribution.jarque_bera?.toFixed(2) ?? "—"}（p ${s.distribution.jb_p?.toFixed(3) ?? "—"}）· n=${s.distribution.n}`,
            )}{" "}
            <span
              className={`badge ${
                s.distribution.gaussian_trust === "HIGH"
                  ? "green"
                  : s.distribution.gaussian_trust === "REDUCED"
                    ? "amber"
                    : "red"
              }`}
            >
              {t(
                `Gaussian trust ${s.distribution.gaussian_trust}`,
                `高斯可信度 ${s.distribution.gaussian_trust}`,
              )}
            </span>
          </>
        )}
      </p>

      {/* §39/§59 model-risk state with its real triggers. */}
      <p style={{ marginTop: 8, fontSize: 12, fontFamily: "var(--font-mono)" }}>
        <Term k="model_risk_state">{t("Model risk", "模型风险")}</Term>:{" "}
        {s.model_risk == null ? (
          <span style={{ color: "var(--text-dim)" }}>
            {t("not computed for this snapshot.", "该快照未计算。")}
          </span>
        ) : (
          <span
            className={`badge ${
              s.model_risk.state === "LOW"
                ? "green"
                : s.model_risk.state === "ELEVATED"
                  ? "amber"
                  : "red"
            }`}
          >
            {el(s.model_risk.state)}
          </span>
        )}
      </p>
      {s.model_risk != null && s.model_risk.reasons.length > 0 && (
        <ul className="why-list" style={{ marginTop: 6 }}>
          {/* Verbatim server strings. */}
          {s.model_risk.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}

      {/*
        §34 diversification ratio + §11 single-factor share — one line, both
        RESEARCH/SHADOW. Rendered only when the backend sends the block at
        all (both fields are additive); an unmeasurable number inside a
        present block shows the server's own reason rather than a bare dash,
        because "not measured" and "no diversification" are different facts.
      */}
      {(s.diversification_ratio != null || s.factor != null) && (
        <p style={{ marginTop: 8, fontSize: 12, fontFamily: "var(--font-mono)" }}>
          {s.diversification_ratio != null && (
            <>
              <Term k="diversification_ratio">
                {t("Diversification", "分散化")}
              </Term>
              :{" "}
              {s.diversification_ratio.value == null ? (
                <span style={{ color: "var(--text-dim)" }}>
                  {s.diversification_ratio.reason ??
                    t("not measured.", "未测量。")}
                </span>
              ) : (
                <span>
                  {t(
                    `${s.diversification_ratio.value.toFixed(2)}× (1.00 = none)`,
                    `${s.diversification_ratio.value.toFixed(2)}×（1.00 = 无分散）`,
                  )}
                </span>
              )}
            </>
          )}
          {s.diversification_ratio != null && s.factor != null && " · "}
          {s.factor != null && (
            <>
              <Term k="factor_risk_share">
                {t("Factor", "因子")}
              </Term>
              {` (${s.factor.factor}): `}
              {s.factor.explained_variance_share == null ? (
                <span style={{ color: "var(--text-dim)" }}>
                  {s.factor.reason ?? t("not measured.", "未测量。")}
                </span>
              ) : (
                <span>
                  {t(
                    `${(s.factor.explained_variance_share * 100).toFixed(0)}% of book variance · β ${s.factor.portfolio_beta?.toFixed(2) ?? "—"}`,
                    `占组合方差 ${(s.factor.explained_variance_share * 100).toFixed(0)}% · β ${s.factor.portfolio_beta?.toFixed(2) ?? "—"}`,
                  )}
                </span>
              )}{" "}
              <span className="badge dim">RESEARCH</span>
            </>
          )}
        </p>
      )}

      {/* §41 per-model health, so a silent UNAVAILABLE cannot hide. */}
      {Object.keys(s.model_health).length > 0 && (
        <p style={{ marginTop: 10, fontSize: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(s.model_health).map(([name, health]) => (
            <span key={name} className={`badge ${MODEL_HEALTH_BADGE[health]}`}>
              {name}: {el(health)}
            </span>
          ))}
        </p>
      )}

      {/* Positions the P&L series could not include — an omission the user must see. */}
      {s.positions_excluded.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ fontSize: 13, marginBottom: 6 }}>
            {t("Positions excluded from these numbers", "未纳入上述数字的持仓")}
          </h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Position", "持仓")}</th>
                  <th>{t("Reason", "原因")}</th>
                </tr>
              </thead>
              <tbody>
                {s.positions_excluded.map((p) => (
                  <tr key={p.key}>
                    <td className="ticker">{p.key}</td>
                    {/* Verbatim server reason. */}
                    <td style={{ color: "var(--amber)", fontFamily: "inherit" }}>{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(s.data_quality.tickers_missing.length > 0 ||
        s.data_quality.keys_excluded.length > 0) && (
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--amber)", fontFamily: "var(--font-mono)" }}>
          {s.data_quality.tickers_missing.length > 0 &&
            t(
              `tickers missing history: ${s.data_quality.tickers_missing.join(", ")}`,
              `缺少历史数据的标的：${s.data_quality.tickers_missing.join("、")}`,
            )}
          {s.data_quality.tickers_missing.length > 0 &&
            s.data_quality.keys_excluded.length > 0 &&
            " · "}
          {s.data_quality.keys_excluded.length > 0 &&
            t(
              `positions excluded: ${s.data_quality.keys_excluded.join(", ")}`,
              `被排除的持仓：${s.data_quality.keys_excluded.join("、")}`,
            )}
        </p>
      )}

      <p style={{ marginTop: 12, fontSize: 11, color: "var(--text-dim)" }}>{shadowNote}</p>

      {open && (
        <RiskMethodModal
          metric={methodLabel(open.r, open.kind, el)}
          model={`${el(open.r.model)} ${open.kind} (${open.r.model_name})`}
          modelVersion={open.r.model_version}
          confidence={open.r.confidence}
          horizonDays={open.r.horizon_days}
          sampleSize={open.r.sample_size}
          windowStart={s.window_start}
          windowEnd={s.window_end}
          distribution={open.r.distribution}
          asOf={s.as_of}
          dataSource={dataSourceLine(s)}
          health={open.r.health}
          healthReason={open.r.reason}
          formula={
            open.r.model === "GAUSSIAN"
              ? t(
                  "Gaussian: VaR = −μ + z × σ and ES = −μ + σ × φ(z) ÷ (1 − confidence), with μ, σ the sample mean and standard deviation (ddof=1) of daily book P&L.",
                  "高斯法：VaR = −μ + z × σ，ES = −μ + σ × φ(z) ÷ (1 − 置信度)，其中 μ、σ 为每日组合盈亏的样本均值与标准差（ddof=1）。",
                )
              : open.r.model === "HISTORICAL_VOL_SCALED"
                ? t(
                    "Filtered historical simulation: each past P&L is rescaled by today's EWMA σ over that day's σ, then the plain historical estimator runs on the rescaled series.",
                    "过滤式历史模拟：先把每个历史盈亏按“当前 EWMA σ ÷ 当日 σ”缩放，再对缩放后的序列套用普通历史估计量。",
                  )
                : t(
                    "Historical (empirical): losses sorted descending, k = ceil(n × (1 − confidence)); VaR = the k-th largest loss, ES = the mean of the k largest losses.",
                    "历史法（经验分布）：亏损降序排列，k = ceil(n × (1 − 置信度))；VaR = 第 k 大亏损，ES = 最大的 k 个亏损的平均值。",
                  )
          }
          diagnostics={metricDiagnostics(open.r, s, t)}
          note={shadowNote}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- panel: risk contribution */

/**
 * §10/§49 — capital weight and risk weight are NOT the same thing, so the
 * two are drawn as adjacent bars on every row. CSS-only (no chart library):
 * two stacked `.rc-bar` tracks scaled to the largest weight on screen.
 */
function WeightBars({
  capital,
  risk,
  scale,
  labels,
}: {
  capital: number | null;
  risk: number | null;
  scale: number;
  labels: { capital: string; risk: string };
}) {
  const width = (v: number | null) =>
    v == null || scale <= 0 ? 0 : Math.max(0, Math.min(100, (v / scale) * 100));
  return (
    <div className="rc-bars" aria-hidden="true">
      <div className="rc-bar-row" title={labels.capital}>
        <span className="rc-bar-key">C</span>
        <span className="rc-bar-track">
          <span className="rc-bar-fill capital" style={{ width: `${width(capital)}%` }} />
        </span>
      </div>
      <div className="rc-bar-row" title={labels.risk}>
        <span className="rc-bar-key">R</span>
        <span className="rc-bar-track">
          <span className="rc-bar-fill risk" style={{ width: `${width(risk)}%` }} />
        </span>
      </div>
    </div>
  );
}

export function RiskContributionPanel({ s }: { s: StatisticalRisk }) {
  const t = useT();
  const el = useEnumLabel();
  const shadowNote = useShadowNote();
  const [open, setOpen] = useState(false);
  const es: RiskContributionBlock | null = s.contributions.es;
  const vol: RiskContributionBlock | null = s.contributions.vol;
  // §10 — the SAME Euler decomposition at 99%. Offered as a SECOND COLUMN
  // rather than a toggle: the audit's complaint was that the 99% figures were
  // absent, and hiding them behind a control the user must find would only
  // half-answer it. Absent on backends that predate the block and null when
  // the 99% tail was too thin to decompose, in which case no column appears.
  //
  // It is deliberately NOT allowed to drive the row set: the 95% block stays
  // primary, so a key present only at 99% is still shown (the key union
  // below includes it) but never reorders or replaces the 95% reading.
  const es99: RiskContributionBlock | null = s.contributions.es99 ?? null;
  const showEs99 = es99 != null;

  // ES drives the row set (§7: ES is first-class); vol contribution is looked
  // up per key and shown alongside. A key present only in vol still appears.
  const volByKey = new Map((vol?.rows ?? []).map((r) => [r.key, r]));
  const es99ByKey = new Map((es99?.rows ?? []).map((r) => [r.key, r]));
  const keys = new Set<string>([
    ...(es?.rows ?? []).map((r) => r.key),
    ...(vol?.rows ?? []).map((r) => r.key),
    ...(es99?.rows ?? []).map((r) => r.key),
  ]);
  const rows = Array.from(keys).map((key) => {
    const e = (es?.rows ?? []).find((r) => r.key === key);
    const v = volByKey.get(key);
    const e99 = es99ByKey.get(key);
    const base = e ?? v ?? e99!;
    return {
      key,
      ticker: base.ticker,
      instrument: base.instrument,
      capital_weight: base.capital_weight,
      es_share: e?.share ?? null,
      es_usd: e?.contribution_usd ?? null,
      vol_usd: v?.contribution_usd ?? null,
      es99_share: e99?.share ?? null,
      es99_usd: e99?.contribution_usd ?? null,
    };
  });
  // Largest of the two weights on screen sets the bar scale so the visual
  // comparison is honest (both bars share one axis).
  const scale = rows.reduce(
    (m, r) => Math.max(m, r.capital_weight ?? 0, r.es_share ?? 0),
    0,
  );
  const esTotalRows = rows.reduce((acc, r) => acc + (r.es_usd ?? 0), 0);
  const volTotalRows = rows.reduce((acc, r) => acc + (r.vol_usd ?? 0), 0);
  const es99TotalRows = rows.reduce((acc, r) => acc + (r.es99_usd ?? 0), 0);

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 style={{ marginBottom: 0 }}>
          <Term k="risk_contribution">{t("Risk Contribution", "风险贡献")}</Term>{" "}
          <span className="badge amber">{s.mode}</span>
        </h2>
        {es != null && (
          <span style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
            {t(
              `ES ${((es.confidence ?? 0) * 100).toFixed(0)}% total ${es.total_usd == null ? "—" : fmtUsd(es.total_usd)}`,
              `ES ${((es.confidence ?? 0) * 100).toFixed(0)}% 合计 ${es.total_usd == null ? "—" : fmtUsd(es.total_usd)}`,
            )}
          </span>
        )}
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "8px 0 12px" }}>
        {t(
          "Capital weight (C) is how much money sits in a position; risk weight (R) is how much of the portfolio's downside it accounts for. They are not the same thing — a small, volatile, correlated position can dominate the risk bar while barely showing on the capital bar.",
          "资金权重（C）是投入该持仓的资金占比；风险权重（R）是它占组合下行风险的比例。二者并不相同 — 一个小额但高波动、高相关的持仓，可能在风险条上占据主导，而在资金条上几乎看不见。",
        )}
      </p>

      {rows.length > 0 ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Ticker", "代码")}</th>
                  <th>{t("Instrument", "品种")}</th>
                  <th className="num">{t("Capital weight", "资金权重")}</th>
                  <th className="num">{t("ES-95 risk share", "ES-95 风险占比")}</th>
                  <th style={{ minWidth: 120 }}>{t("Capital vs risk", "资金 vs 风险")}</th>
                  <th className="num">{t("ES contribution", "ES 贡献")}</th>
                  {/* §10 — the 99% column, present only when the server sent
                      the block. Its header carries the noise warning the
                      audit asked for, so the caveat cannot be read apart
                      from the numbers beneath it. */}
                  {showEs99 && (
                    <th
                      className="num"
                      title={t(
                        "The same Euler decomposition at 99%. A 99% tail on this window holds very few observations, so these per-position figures are materially noisier than the 95% column beside them.",
                        "同一套欧拉分解，但置信度为 99%。在当前窗口下，99% 尾部所含观测极少，因此这些逐持仓数值明显比旁边的 95% 一列更嘈杂。",
                      )}
                    >
                      {t("ES-99 contribution", "ES-99 贡献")}{" "}
                      <span className="badge amber">{t("NOISY", "高噪声")}</span>
                    </th>
                  )}
                  <th className="num">{t("Vol contribution", "波动率贡献")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="ticker" title={r.key}>
                      {r.ticker}
                    </td>
                    <td>
                      <span className="badge dim">{r.instrument}</span>
                    </td>
                    <td className="num">
                      {r.capital_weight == null ? DASH : fmtPct(r.capital_weight)}
                    </td>
                    <td className="num">{r.es_share == null ? DASH : fmtPct(r.es_share)}</td>
                    <td>
                      <WeightBars
                        capital={r.capital_weight}
                        risk={r.es_share}
                        scale={scale}
                        labels={{
                          capital: t(
                            `capital weight ${r.capital_weight == null ? "—" : fmtPct(r.capital_weight)}`,
                            `资金权重 ${r.capital_weight == null ? "—" : fmtPct(r.capital_weight)}`,
                          ),
                          risk: t(
                            `ES risk share ${r.es_share == null ? "—" : fmtPct(r.es_share)}`,
                            `ES 风险占比 ${r.es_share == null ? "—" : fmtPct(r.es_share)}`,
                          ),
                        }}
                      />
                    </td>
                    <td className="num">{r.es_usd == null ? DASH : fmtUsd(r.es_usd)}</td>
                    {showEs99 && (
                      <td className="num">
                        {r.es99_usd == null ? DASH : fmtUsd(r.es99_usd)}
                      </td>
                    )}
                    <td className="num">{r.vol_usd == null ? DASH : fmtUsd(r.vol_usd)}</td>
                  </tr>
                ))}
                {/* Totals reconcile to the block totals by construction
                    (Euler ES contributions sum to ES; σ contributions to σ). */}
                <tr>
                  <td style={{ fontWeight: 700 }}>{t("TOTAL", "合计")}</td>
                  <td />
                  <td className="num" style={{ fontWeight: 700 }}>
                    {fmtPct(rows.reduce((acc, r) => acc + (r.capital_weight ?? 0), 0))}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {fmtPct(rows.reduce((acc, r) => acc + (r.es_share ?? 0), 0))}
                  </td>
                  <td />
                  <td className="num" style={{ fontWeight: 700 }}>
                    {es?.total_usd == null ? fmtUsd(esTotalRows) : fmtUsd(es.total_usd)}
                  </td>
                  {showEs99 && (
                    <td className="num" style={{ fontWeight: 700 }}>
                      {es99?.total_usd == null ? fmtUsd(es99TotalRows) : fmtUsd(es99.total_usd)}
                    </td>
                  )}
                  <td className="num" style={{ fontWeight: 700 }}>
                    {vol?.total_usd == null ? fmtUsd(volTotalRows) : fmtUsd(vol.total_usd)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            {t(
              `C = capital weight · R = ES-95 risk share · ES health ${es == null ? "—" : el(es.health)} · vol health ${vol == null ? "—" : el(vol.health)}`,
              `C = 资金权重 · R = ES-95 风险占比 · ES 健康度 ${es == null ? "—" : el(es.health)} · 波动率健康度 ${vol == null ? "—" : el(vol.health)}`,
            )}
          </p>
          {/* §10 — the server's own words on why the 99% column is noisy,
              verbatim, beneath the numbers it qualifies. The audit asked for
              the 99% figures "shown with the health warning" rather than
              absent; the warning is the block's own reason, not a UI guess. */}
          {showEs99 && es99?.reason && (
            <p
              style={{
                marginTop: 6,
                fontSize: 11,
                color: "var(--amber)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {t("ES-99 contributions", "ES-99 贡献")}: {es99.reason}
            </p>
          )}
          <button type="button" className="method-info" onClick={() => setOpen(true)}>
            {t("ⓘ How is this calculated?", "ⓘ 该指标如何计算？")}
          </button>
        </>
      ) : (
        <p className="empty">
          {t(
            "No risk contributions — the snapshot produced no per-position P&L series (no open positions, or no usable price history).",
            "无风险贡献数据 — 该快照未产出任何逐持仓盈亏序列（没有未平仓持仓，或缺少可用的历史价格）。",
          )}
        </p>
      )}

      {open && (
        <RiskMethodModal
          metric={t("Risk contribution", "风险贡献")}
          model={t(
            "Euler ES contribution + covariance volatility contribution",
            "欧拉分解 ES 贡献 + 协方差波动率贡献",
          )}
          confidence={es?.confidence ?? null}
          horizonDays={1}
          sampleSize={s.n_obs}
          windowStart={s.window_start}
          windowEnd={s.window_end}
          distribution="EMPIRICAL"
          asOf={s.as_of}
          dataSource={dataSourceLine(s)}
          health={es?.health ?? vol?.health ?? null}
          healthReason={null}
          formula={t(
            "ES contribution: take the k dates of the k largest PORTFOLIO losses, then average each position's loss over exactly those dates — the parts sum to portfolio ES by construction. Volatility contribution: cov(position P&L, portfolio P&L) ÷ portfolio σ — the parts sum to portfolio σ.",
            "ES 贡献：取组合亏损最大的那 k 个日期，再对每个持仓在这 k 天的亏损取平均 — 按构造，各部分之和恰为组合 ES。波动率贡献：cov(持仓盈亏, 组合盈亏) ÷ 组合 σ — 各部分之和恰为组合 σ。",
          )}
          diagnostics={[
            { label: t("ES total", "ES 合计"), value: es?.total_usd == null ? null : fmtUsd(es.total_usd) },
            { label: t("Vol total", "波动率合计"), value: vol?.total_usd == null ? null : fmtUsd(vol.total_usd) },
            // §10 — null (an em dash) when the 99% block was not served, which
            // is a different fact from a 99% total of zero.
            {
              label: t("ES-99 total", "ES-99 合计"),
              value: es99?.total_usd == null ? null : fmtUsd(es99.total_usd),
            },
            {
              label: t("ES-99 health", "ES-99 健康度"),
              value: es99 == null ? null : el(es99.health),
            },
            { label: t("Rows", "行数"), value: rows.length },
            { label: t("P&L method", "盈亏构造方法"), value: s.pnl_method },
          ]}
          note={shadowNote}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- panel: drawdown */

/**
 * §45 drawdown. Two DIFFERENT things, never blended:
 *  - the live NAV-series drawdown, which can only accrue from the first
 *    scheduled snapshot onward (honest empty state before that);
 *  - the reconstructed-book drawdown, explicitly labelled as today's book
 *    replayed over the window — a what-if, not realized history.
 */
export function DrawdownPanel({
  d,
  asOf,
  dataSource,
  mode = "SHADOW",
}: {
  d: DrawdownBlock;
  asOf: string;
  dataSource: string;
  /** Server-sent statistical mode; the badge follows it rather than a constant. */
  mode?: string;
}) {
  const t = useT();
  const el = useEnumLabel();
  const shadowNote = useShadowNote();
  const [open, setOpen] = useState<"live" | "reconstructed" | null>(null);
  const rec = d.reconstructed;

  return (
    <div className="panel">
      <h2>
        <Term k="max_drawdown">{t("Drawdown", "回撤")}</Term>{" "}
        <span className="badge amber">{mode}</span>
      </h2>

      <h3 style={{ fontSize: 13, margin: "10px 0 6px" }}>
        {t("Live NAV series", "实盘 NAV 序列")}
      </h3>
      {d.nav_series.n < 2 ? (
        <p className="empty">
          {t(
            `No scheduled snapshots yet — drawdown accrues from the first daily snapshot (${d.nav_series.n} recorded so far, source ${d.nav_series.source}).`,
            `尚无定时快照 — 回撤将从第一个每日快照开始累积（目前已记录 ${d.nav_series.n} 个，来源 ${d.nav_series.source}）。`,
          )}
          {/* Verbatim server reason for the unavailable state. */}
          {d.reason ? (
            <span
              style={{ display: "block", marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 11 }}
            >
              {d.reason}
            </span>
          ) : null}
        </p>
      ) : (
        <div className="kv">
          <div>
            <div className="k">{t("Current drawdown", "当前回撤")}</div>
            {/* Red only when there IS a drawdown — a red 0.00% cries wolf. */}
            <div className="v" style={{ color: d.current_pct ? "var(--red)" : "var(--text-dim)" }}>
              {d.current_pct == null ? "—" : fmtPct(d.current_pct, 2)}
            </div>
          </div>
          <div>
            <div className="k">{t("Max drawdown", "最大回撤")}</div>
            <div className="v" style={{ color: d.max_pct ? "var(--red)" : "var(--text-dim)" }}>
              {d.max_pct == null ? "—" : fmtPct(d.max_pct, 2)}
            </div>
          </div>
          <div>
            <div className="k">{t("Peak NAV", "NAV 峰值")}</div>
            <div className="v">{d.peak_nav == null ? "—" : fmtUsd(d.peak_nav)}</div>
          </div>
          <div>
            <div className="k">{t("Peak date", "峰值日期")}</div>
            <div className="v">{d.peak_date ?? "—"}</div>
          </div>
          <div>
            <div className="k">{t("Trough date", "谷底日期")}</div>
            <div className="v">{d.trough_date ?? "—"}</div>
          </div>
          <div>
            <div className="k">{t("Snapshots", "快照数")}</div>
            <div className="v">
              {t(
                `n=${d.nav_series.n} since ${d.nav_series.since ?? "—"}`,
                `n=${d.nav_series.n}，起始 ${d.nav_series.since ?? "—"}`,
              )}
            </div>
          </div>
          <div>
            <div className="k">{t("Health", "健康度")}</div>
            <div className="v">
              <span className={`badge ${MODEL_HEALTH_BADGE[d.health]}`}>{el(d.health)}</span>
            </div>
          </div>
          <div>
            <div className="k">{t("Series source", "序列来源")}</div>
            <div className="v">{d.nav_series.source}</div>
          </div>
        </div>
      )}
      <button type="button" className="method-info" onClick={() => setOpen("live")}>
        {t("ⓘ How is this calculated?", "ⓘ 该指标如何计算？")}
      </button>

      <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>
        <Term k="drawdown_reconstructed">
          {t(
            "Reconstructed (today's book over the window)",
            "重构回撤（今日持仓在该窗口内的表现）",
          )}
        </Term>
      </h3>
      {rec == null ? (
        <p className="empty">
          {t(
            "No reconstructed drawdown — the snapshot produced no book P&L series over the window.",
            "无重构回撤 — 该快照未在窗口内产出组合盈亏序列。",
          )}
        </p>
      ) : (
        <>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 8 }}>
            {t(
              "A what-if, NOT realized history: today's exact positions replayed over the return window. These positions were not actually held then.",
              "这是假设推演，并非已实现的历史：把今天的持仓原样放回收益率窗口重放。当时并未实际持有这些仓位。",
            )}
          </p>
          <div className="kv">
            <div>
              <div className="k">{t("Label", "标签")}</div>
              {/* Server label, verbatim — it is the honesty guarantee. */}
              <div className="v">{rec.label}</div>
            </div>
            <div>
              <div className="k">{t("Current drawdown", "当前回撤")}</div>
              <div className="v">{rec.current_pct == null ? "—" : fmtPct(rec.current_pct, 2)}</div>
            </div>
            <div>
              <div className="k">{t("Max drawdown", "最大回撤")}</div>
              <div className="v">{rec.max_pct == null ? "—" : fmtPct(rec.max_pct, 2)}</div>
            </div>
            <div>
              <div className="k">{t("Observations", "观测数")}</div>
              <div className="v">n={rec.n_obs}</div>
            </div>
            <div>
              <div className="k">{t("Health", "健康度")}</div>
              <div className="v">
                <span className={`badge ${MODEL_HEALTH_BADGE[rec.health]}`}>{el(rec.health)}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="method-info"
            onClick={() => setOpen("reconstructed")}
          >
            {t("ⓘ How is this calculated?", "ⓘ 该指标如何计算？")}
          </button>
        </>
      )}

      <p style={{ marginTop: 12, fontSize: 11, color: "var(--text-dim)" }}>{shadowNote}</p>

      {open === "live" && (
        <RiskMethodModal
          metric={t("Current Drawdown (live NAV series)", "当前回撤（实盘 NAV 序列）")}
          model={t("NAV-series drawdown", "NAV 序列回撤")}
          sampleSize={d.nav_series.n}
          asOf={asOf}
          dataSource={d.nav_series.source}
          health={d.health}
          healthReason={d.reason}
          formula={t(
            "drawdown_t = NAV_t ÷ running max(NAV) − 1 (≤ 0), over one persisted NAV per calendar day. It is never backfilled: with fewer than two snapshots the value is UNAVAILABLE, not zero.",
            "回撤_t = NAV_t ÷ NAV 历史峰值 − 1（≤ 0），每个日历日取一条已持久化的 NAV。它从不回填：快照少于两个时结果为 UNAVAILABLE，而不是 0。",
          )}
          diagnostics={[
            { label: t("Snapshots (n)", "快照数量 (n)"), value: d.nav_series.n },
            { label: t("Since", "起始"), value: d.nav_series.since },
            { label: t("Peak NAV", "NAV 峰值"), value: d.peak_nav == null ? null : fmtUsd(d.peak_nav) },
            { label: t("Peak date", "峰值日期"), value: d.peak_date },
            { label: t("Trough date", "谷底日期"), value: d.trough_date },
            { label: t("Max drawdown", "最大回撤"), value: d.max_pct == null ? null : fmtPct(d.max_pct, 2) },
          ]}
          note={shadowNote}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "reconstructed" && rec != null && (
        <RiskMethodModal
          metric={t("Reconstructed drawdown", "重构回撤")}
          model={rec.label}
          sampleSize={rec.n_obs}
          asOf={asOf}
          dataSource={dataSource}
          health={rec.health}
          healthReason={null}
          formula={t(
            "Cumulative P&L of TODAY'S book over the return window, then the same running-max drawdown formula. It is a reconstruction, not a NAV history — the positions were not held over that period.",
            "先计算“今日持仓”在收益率窗口内的累计盈亏，再套用同样的历史峰值回撤公式。它是一次重构，而不是 NAV 历史 — 这些仓位在该期间并未实际持有。",
          )}
          diagnostics={[
            { label: t("Label", "标签"), value: rec.label },
            { label: t("Observations", "观测数"), value: rec.n_obs },
            { label: t("Max drawdown", "最大回撤"), value: rec.max_pct == null ? null : fmtPct(rec.max_pct, 2) },
          ]}
          note={shadowNote}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
