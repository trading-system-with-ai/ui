"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import NotConfigured, { NotConfiguredNote } from "@/components/shared/NotConfigured";
import Term from "@/components/shared/Term";
import { api, isBrokerNotConfigured, notConfiguredMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import {
  DECISION_BADGE,
  HEAT_BADGE,
  INSTRUMENT_BADGE,
  fmtPct,
  fmtUsd,
  utilizationSeverity,
} from "@/lib/risk-format";
/* §52 — the stock-vs-option display rule and the two projections it asks for,
   kept pure in lib/ so they are pinned by tests directly. */
import { underlyingExposureUsd, volSensitivityUsd } from "@/lib/risk-greeks-52";
import type {
  AuditEvent,
  BrokerReconcile,
  CorrelationState,
  PortfolioRisk,
  RiskDecision,
  RiskLimits,
  StrategyHealth,
  StrategyHealthStatus,
  VolTargeting,
} from "@/lib/types";
import FlowNav from "@/components/shared/FlowNav";
import {
  DrawdownPanel,
  RiskContributionPanel,
  StatisticalRiskPanel,
  StatisticalStatTiles,
} from "@/components/risk/StatisticalRisk";
import StressScenarios from "@/components/risk/StressScenarios";
import ModelValidation from "@/components/risk/ModelValidation";

/* ---------------------------------------------------------------- limits copy */

const LIMIT_ROWS: {
  key: keyof RiskLimits;
  label: { en: string; zh: string };
  meaning: { en: string; zh: string };
}[] = [
  {
    key: "single_name_risk_pct",
    label: { en: "Single-name risk", zh: "单一标的风险" },
    meaning: {
      en: "Max risk (stop distance × size) in any one name, as % of NAV.",
      zh: "任一标的的最大风险（止损距离 × 仓位），占 NAV 百分比。",
    },
  },
  {
    key: "single_name_capital_pct",
    label: { en: "Single-name capital", zh: "单一标的资金" },
    meaning: {
      en: "Max capital deployed into any one name, as % of NAV.",
      zh: "投入任一标的的最大资金，占 NAV 百分比。",
    },
  },
  {
    key: "bucket_risk_pct",
    label: { en: "Bucket risk cap", zh: "分组风险上限" },
    meaning: {
      en: "Max combined open risk inside any correlation bucket, as % of NAV.",
      zh: "任一相关性分组内的最大合计未平仓风险，占 NAV 百分比。",
    },
  },
  {
    key: "heat_elevated_pct",
    label: { en: "Heat: ELEVATED", zh: "热度：偏高" },
    meaning: {
      en: "Portfolio Heat at or above this is ELEVATED — new trades are sized down.",
      zh: "组合热度达到或超过此值即为偏高（ELEVATED）— 新交易将被缩量。",
    },
  },
  {
    key: "heat_high_pct",
    label: { en: "Heat: HIGH", zh: "热度：高" },
    meaning: {
      en: "Portfolio Heat at or above this is HIGH — only the strongest signals get sized.",
      zh: "组合热度达到或超过此值即为高（HIGH）— 仅最强信号可获得仓位。",
    },
  },
  {
    key: "heat_reject_pct",
    label: { en: "Heat: reject", zh: "热度：拒绝" },
    meaning: {
      en: "Portfolio Heat at or above this BLOCKS all new risk.",
      zh: "组合热度达到或超过此值将阻止一切新增风险。",
    },
  },
  {
    key: "abs_max_trade_risk_pct",
    label: { en: "Abs max trade risk", zh: "单笔风险绝对上限" },
    meaning: {
      en: "Absolute ceiling on any single trade's risk, as % of NAV — never exceeded.",
      zh: "任何单笔交易风险的绝对上限，占 NAV 百分比 — 永不突破。",
    },
  },
];

/* ---------------------------------------------------------------- helpers */

/** The only stand-in for an absent market figure — never a placeholder number. */
const DASH = <span style={{ color: "var(--text-dim)" }}>—</span>;

/**
 * GET /api/portfolio/risk never 503s — NAV, cash and positions are real DB
 * rows. It reports the market-data state inline instead, and nulls every
 * market-derived field. A backend that predates the block is treated as
 * configured (it had no way to say otherwise).
 */
function marketDataOf(d: PortfolioRisk): { configured: boolean; message: string | null } {
  const md = d.market_data;
  if (md == null) return { configured: true, message: null };
  return { configured: md.configured === true, message: md.message ?? null };
}

/** Shares / share-equivalents — options make these fractional, keep 1 decimal max. */
function fmtShares(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Small unitless Greek (gamma) — up to 2 decimals, no trailing zeros. */
function fmtGreek(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Annualized vol fraction → "12%" / "18.2%" (whole percents drop the ".0" so the
 * line reads "target 12%", not "target 12.0%").
 */
function fmtVol(v: number): string {
  const pct = v * 100;
  const digits = Math.abs(pct - Math.round(pct)) < 1e-9 ? 0 : 1;
  return `${pct.toFixed(digits)}%`;
}

/** "0.66×" / "1.0×" — at least one decimal so the multiplier never reads as a count. */
function fmtMultiplier(v: number): string {
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}×`;
}

/** Badge class for a per-position instrument label (unknown labels render dim). */
function instrumentBadge(instrument: string): string {
  return (INSTRUMENT_BADGE as Record<string, string | undefined>)[instrument] ?? "dim";
}

function decisionFromDetails(details: Record<string, unknown>): {
  decision: RiskDecision | null;
  reasons: string;
} {
  const d = details.decision;
  const decision =
    d === "APPROVE" || d === "APPROVE_WITH_RESIZE" || d === "REJECT" ? d : null;
  const rc = details.reason_codes;
  const reasons = Array.isArray(rc)
    ? rc.filter((r): r is string => typeof r === "string").join(", ")
    : "";
  return { decision, reasons };
}

/**
 * PortfolioRisk once an account exists: the backend nulls ALL account numbers
 * together (no venue -> no account), so a single nav check narrows the rest.
 */
type AccountRisk = PortfolioRisk & {
  nav: number;
  cash: number;
  cash_pct: number;
  cash_floor_pct: number;
  portfolio_heat_pct: number;
  heat_state: NonNullable<PortfolioRisk["heat_state"]>;
  max_new_risk_usd: number;
  max_new_risk_pct: number;
};

/* ---------------------------------------------------------------- panels */

function StatTiles({ d }: { d: AccountRisk }) {
  const t = useT();
  const el = useEnumLabel();
  // Cash severity: red below the floor, amber within 5 points of it.
  // cash_pct / cash_floor_pct are FRACTIONS (0.20 = 20%), so 5 points = 0.05.
  const cashSeverity =
    d.cash_pct < d.cash_floor_pct
      ? "var(--red)"
      : d.cash_pct < d.cash_floor_pct + 0.05
        ? "var(--amber)"
        : undefined;

  return (
    <div className="statbar">
      <div className="stat">
        <div className="label">{t("Portfolio NAV", "组合 NAV")}</div>
        <div className="value">{fmtUsd(d.nav)}</div>
      </div>
      <div className="stat">
        <div className="label">{t("Cash", "现金")}</div>
        <div className="value" style={cashSeverity ? { color: cashSeverity } : undefined}>
          {fmtUsd(d.cash)}
          <span style={{ fontSize: 13, marginLeft: 6 }}>{fmtPct(d.cash_pct)}</span>
        </div>
        <div className="sub" style={cashSeverity ? { color: cashSeverity } : undefined}>
          {t(
            `floor ${fmtPct(d.cash_floor_pct)} of NAV`,
            `下限为 NAV 的 ${fmtPct(d.cash_floor_pct)}`,
          )}
          {d.cash_pct < d.cash_floor_pct
            ? t(" — BELOW FLOOR", " — 低于下限")
            : d.cash_pct < d.cash_floor_pct + 0.05
              ? t(" — near floor", " — 接近下限")
              : ""}
        </div>
      </div>
      <div className="stat">
        <div className="label">
          <Term k="portfolio_heat">{t("Portfolio Heat", "组合热度")}</Term>
        </div>
        <div className="value">
          {fmtPct(d.portfolio_heat_pct)}{" "}
          <span className={`badge ${HEAT_BADGE[d.heat_state]}`}>{el(d.heat_state)}</span>
        </div>
        <div className="sub">
          {t("total open risk if every stop is hit", "所有止损全部触发时的总未平仓风险")}
        </div>
      </div>
      <div className="stat">
        <div className="label">{t("Max New Risk", "最大新增风险")}</div>
        <div className="value">{fmtUsd(d.max_new_risk_usd)}</div>
        <div className="sub">
          {t(
            `${fmtPct(d.max_new_risk_pct)} of NAV available`,
            `可用 NAV 的 ${fmtPct(d.max_new_risk_pct)}`,
          )}
        </div>
      </div>
      <div className="stat">
        <div className="label">
          <Term k="market_regime">{t("Market Regime", "市场状态")}</Term>
        </div>
        {/* Classified from market data — null (not a default regime) when unset. */}
        <div className="value" style={{ fontSize: 15 }}>{el(d.market_regime)}</div>
        {d.market_regime == null && (
          <div className="sub">{t("market data not configured", "行情数据未配置")}</div>
        )}
      </div>
      <div className="stat">
        <div className="label">{t("Trading", "交易")}</div>
        <div className="value">
          <span className={`badge ${d.trading_enabled ? "green" : "amber"}`}>
            {d.trading_enabled ? t("ENABLED", "已启用") : t("PAUSED", "已暂停")}
          </span>
        </div>
        <div className="sub">
          <Link href="/" style={{ color: "var(--accent)" }}>
            {t("Dashboard controls →", "仪表盘控制 →")}
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * §14 vol targeting — how much NEW risk budgets are scaled by forecast vs
 * target vol. Amber when the multiplier is scaling risk down (< 1×).
 */
function VolTargetingLine({ v }: { v: VolTargeting }) {
  const t = useT();
  const scalingDown = v.multiplier < 1;
  // The EWMA side exists only when the backend sent EITHER field: a payload
  // that predates Phase C must not sprout an empty "EWMA forecast —" line.
  const ewmaShown =
    v.ewma_sigma_p_annualized_pct_nav !== undefined || v.multiplier_ewma !== undefined;
  return (
    <p
      style={{
        color: scalingDown ? "var(--amber)" : "var(--text-dim)",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        margin: "-4px 0 16px",
      }}
      title={v.note}
    >
      {v.forecast_vol == null
        ? t(
            `Vol targeting: no open positions — multiplier ${fmtMultiplier(v.multiplier)}`,
            `波动率目标：无未平仓持仓 — 乘数 ${fmtMultiplier(v.multiplier)}`,
          )
        : t(
            `Vol targeting: forecast ${fmtVol(v.forecast_vol)} vs target ${fmtVol(v.target_vol)} → multiplier ${fmtMultiplier(v.multiplier)}`,
            `波动率目标：预测 ${fmtVol(v.forecast_vol)} vs 目标 ${fmtVol(v.target_vol)} → 乘数 ${fmtMultiplier(v.multiplier)}`,
          )}
      <span style={{ color: "var(--text-dim)" }}>
        {" "}
        {t(
          `· max ${fmtMultiplier(v.max_multiplier)} · hard risk caps always apply`,
          `· 上限 ${fmtMultiplier(v.max_multiplier)} · 硬性风险上限始终生效`,
        )}
      </span>
      {/* Phase C (SHADOW) §14 — the EWMA forecast is shown BESIDE the crude v0
          proxy, never instead of it. The multiplier on the line above is the
          one actually applied; this one changed nothing. Absent on backends
          that predate the field, and honestly null when EWMA needs more
          history than the book has. */}
      {ewmaShown && (
        <span
          style={{ display: "block", color: "var(--text-dim)", marginTop: 2 }}
          /* Server-worded note for the EWMA side, verbatim (§26/§36). */
          title={v.ewma_note ?? undefined}
        >
          {t("EWMA forecast", "EWMA 预测")}{" "}
          <span className="badge amber">SHADOW</span>{" "}
          {v.ewma_sigma_p_annualized_pct_nav == null
            ? t("— (not enough history)", "— （历史数据不足）")
            : t(
                `${fmtVol(v.ewma_sigma_p_annualized_pct_nav)} → multiplier ${
                  v.multiplier_ewma == null ? "—" : fmtMultiplier(v.multiplier_ewma)
                } · side by side only, the applied multiplier is unchanged`,
                `${fmtVol(v.ewma_sigma_p_annualized_pct_nav)} → 乘数 ${
                  v.multiplier_ewma == null ? "—" : fmtMultiplier(v.multiplier_ewma)
                } · 仅并列展示，实际生效的乘数不变`,
              )}
        </span>
      )}
    </p>
  );
}

/** §16 / §36 — portfolio-level Net Delta / Gamma / Theta / Vega, always shown. */
function GreeksPanel({ d }: { d: AccountRisk }) {
  const t = useT();
  const g = d.greeks;
  const md = marketDataOf(d);
  if (g == null) {
    // Greeks need live chain data. Unconfigured provider → say so; anything
    // else (an older backend that never sent the §16 block) → render nothing
    // rather than a panel of zeros.
    if (!md.configured) {
      return (
        <div className="panel">
          <h2>{t("Portfolio Greeks", "组合希腊值")}</h2>
          <NotConfigured message={md.message}>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
              {t(
                "Net delta, gamma, theta and vega are computed from option-chain data. Positions and their configured max loss are unaffected — see the tables below.",
                "净 Delta、Gamma、Theta 与 Vega 由期权链数据计算得出。持仓及其配置的最大亏损不受影响 — 见下方表格。",
              )}
            </p>
          </NotConfigured>
        </div>
      );
    }
    return null;
  }
  // Theta limit is a fraction of NAV; flag decay once it burns past HALF the cap.
  const thetaLimitUsd = g.limits.max_net_theta_pct_nav * d.nav;
  const thetaRed =
    g.net_theta_usd_per_day < 0 &&
    Math.abs(g.net_theta_usd_per_day) > thetaLimitUsd / 2;
  const deltaBreached =
    Math.abs(g.delta_notional_pct_nav) > g.limits.max_delta_notional_pct_nav;
  return (
    <div className="panel">
      <h2>{t("Portfolio Greeks", "组合希腊值")}</h2>
      {/* §23 — the framing the compliance audit found missing. Greeks are
          LOCAL sensitivities: they describe how the book moves for a small
          step from here and are silent about how far it can go. Read two
          panels above a VaR tile, that is the distinction most easily lost,
          so it is stated inline rather than left to the adjacent glossary
          entries. The Greek limits themselves ARE Tier 0 and do reject — this
          line qualifies what the numbers MEAN, not their authority. */}
      <p
        style={{
          color: "var(--text-dim)",
          fontSize: 12,
          margin: "-4px 0 12px",
        }}
      >
        {t(
          "Local sensitivity, not tail risk — see Statistical Risk / Stress below.",
          "局部敏感度，而非尾部风险 — 请参见下方的统计风险 / 压力情景。",
        )}
      </p>
      {g.breaches.map((b, i) => (
        <div className="banner breach" key={i} style={{ marginBottom: 8 }}>
          {b}
        </div>
      ))}
      <div className="statbar" style={{ marginBottom: 12 }}>
        <div className="stat">
          <div className="label">{t("Net Delta", "净 Delta")}</div>
          <div className="value">{fmtShares(g.net_delta_shares)}</div>
          <div className="sub">{t("equivalent shares", "等效股数")}</div>
        </div>
        <div className="stat">
          <div className="label">
            <Term k="delta_notional">{t("Delta-Adj Notional", "Delta 调整名义值")}</Term>
          </div>
          <div
            className="value"
            style={deltaBreached ? { color: "var(--red)" } : undefined}
          >
            {fmtUsd(g.delta_adjusted_notional_usd)}
          </div>
          <div className="sub" style={deltaBreached ? { color: "var(--red)" } : undefined}>
            {t(
              `${fmtPct(g.delta_notional_pct_nav)} of NAV · limit ${fmtPct(g.limits.max_delta_notional_pct_nav)}`,
              `占 NAV ${fmtPct(g.delta_notional_pct_nav)} · 上限 ${fmtPct(g.limits.max_delta_notional_pct_nav)}`,
            )}
            {deltaBreached ? t(" — BREACH", " — 超限") : ""}
          </div>
        </div>
        <div className="stat">
          <div className="label">{t("Net Gamma", "净 Gamma")}</div>
          <div className="value">{fmtGreek(g.net_gamma)}</div>
          <div className="sub">
            {t("Δ shares per $1 spot move", "现价每变动 $1 的 Δ 股数")}
          </div>
        </div>
        <div className="stat">
          <div className="label">
            <Term k="theta">{t("Net Theta", "净 Theta")}</Term>
          </div>
          <div className="value" style={thetaRed ? { color: "var(--red)" } : undefined}>
            {fmtUsd(g.net_theta_usd_per_day, 2)}
          </div>
          <div className="sub" style={thetaRed ? { color: "var(--red)" } : undefined}>
            {t(
              `$/day decay · limit ${fmtPct(g.limits.max_net_theta_pct_nav)} of NAV`,
              `每日衰减（$/天）· 上限为 NAV 的 ${fmtPct(g.limits.max_net_theta_pct_nav)}`,
            )}
            {thetaRed ? t(" — past half the limit", " — 已超过上限的一半") : ""}
          </div>
        </div>
        <div className="stat">
          <div className="label">
            <Term k="vega">{t("Net Vega", "净 Vega")}</Term>
          </div>
          <div className="value">{fmtUsd(g.net_vega_usd, 2)}</div>
          <div className="sub">
            {t(
              `$ per IV pt · limit ${fmtPct(g.limits.max_net_vega_pct_nav)} of NAV`,
              `每 IV 点 $ · 上限为 NAV 的 ${fmtPct(g.limits.max_net_vega_pct_nav)}`,
            )}
          </div>
        </div>
      </div>
      {g.per_position.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Ticker", "代码")}</th>
                <th>{t("Instrument", "品种")}</th>
                <th className="num">{t("Equiv. shares", "等效股数")}</th>
                <th className="num">{t("Delta notional", "Delta 名义值")}</th>
                <th className="num">Gamma</th>
                <th className="num">{t("Theta/day", "Theta/日")}</th>
                <th className="num">Vega</th>
                {/* §52 — the two ADDITIVE columns the audit named. Both are
                    restatements of columns already present, in the units the
                    spec asks for: "underlying exposure" is delta × spot × qty
                    × mult (identically `delta_notional_usd`, which the server
                    computes as delta_shares × spot), and "vol sensitivity" is
                    vega in dollars per IV POINT. They are labelled as what
                    §52 calls them so an option row answers the spec's
                    question directly, and marked as the same measurement
                    rather than presented as two independent readings. */}
                <th className="num">
                  {t("Underlying exposure", "标的敞口")}
                </th>
                <th className="num">
                  {t("Vol sensitivity", "波动率敏感度")}
                </th>
                <th>{t("Data", "数据")}</th>
              </tr>
            </thead>
            <tbody>
              {g.per_position.map((p) => (
                <tr
                  key={`${p.ticker}-${p.instrument}`}
                  style={p.data_ok ? undefined : { opacity: 0.55 }}
                >
                  <td className="ticker">{p.ticker}</td>
                  <td>
                    <span className={`badge ${instrumentBadge(p.instrument)}`}>
                      {p.instrument}
                    </span>
                  </td>
                  <td className="num">{fmtShares(p.equivalent_shares)}</td>
                  <td className="num">{fmtUsd(p.delta_notional_usd)}</td>
                  <td className="num">{fmtGreek(p.gamma)}</td>
                  <td className="num">{fmtUsd(p.theta_usd_per_day, 2)}</td>
                  <td className="num">{fmtUsd(p.vega_usd, 2)}</td>
                  {/* §52 underlying exposure — delta × spot × qty × mult, in
                      dollars of stock this row behaves like RIGHT NOW. On a
                      stock row that is just the position value, which the
                      Positions table already states; the column is therefore
                      option-only, so the two instruments are not presented as
                      identical (§52 cuts both ways). It is the SAME
                      measurement as "Delta notional" to its left, restated in
                      §52's vocabulary rather than recomputed — the note under
                      the table says so, so no reader adds them together. */}
                  <td className="num">
                    {underlyingExposureUsd(p) == null
                      ? DASH
                      : fmtUsd(underlyingExposureUsd(p) as number)}
                  </td>
                  {/* §52 vol sensitivity — the dollar P&L for a ONE POINT
                      move in implied vol. Structurally zero on a share (stock
                      has no vega at all), so a 0 here would read as "measured
                      and flat" when the truth is "does not apply". */}
                  <td className="num">
                    {volSensitivityUsd(p) == null
                      ? DASH
                      : fmtUsd(volSensitivityUsd(p) as number, 2)}
                  </td>
                  <td>
                    {p.data_ok ? (
                      ""
                    ) : (
                      <span
                        style={{
                          color: "var(--text-dim)",
                          fontStyle: "italic",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t("no chain data", "无期权链数据")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          {t("No open positions — portfolio Greeks are flat.", "无未平仓持仓 — 组合希腊值为零。")}
        </p>
      )}
      {/* §52 — the two right-hand columns RESTATE columns already in the
          table; saying so is what stops a reader adding delta notional and
          underlying exposure together as if they were separate exposures.
          Both are option-only: a share's underlying exposure is simply its
          market value, and a share has no vega at all. */}
      {g.per_position.length > 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 8, marginBottom: 0 }}>
          {t(
            "Underlying exposure = delta × spot × contracts × multiplier — the same figure as Delta notional, named as §52 names it, not a second exposure to add to it. Vol sensitivity = vega in $ per 1 IV point. Both are shown for option rows only: a share's underlying exposure is just its market value, and a share has no vega.",
            "标的敞口 = delta × 现价 × 合约数 × 合约乘数 — 与 Delta 名义值是同一个数字，只是按 §52 的叫法命名，并非可与之相加的第二个敞口。波动率敏感度 = vega，单位为「每 1 个 IV 点对应的美元」。两列仅对期权行显示：股票的标的敞口就是其市值，而股票没有 vega。",
          )}
        </p>
      )}
    </div>
  );
}

/** Badge tone per §19 correlation regime — CONVERGING is the loud one. */
const CORRELATION_STATE_BADGE: Record<string, string> = {
  NORMAL: "green",
  ELEVATED: "amber",
  CONVERGING: "red",
  UNAVAILABLE: "dim",
};

/** ρ is a plain correlation in [-1, 1], not a fraction of NAV — 2 decimals. */
function fmtRho(v: number | null): string {
  return v == null ? "—" : v.toFixed(2);
}

/**
 * §19 correlation regime pill — SHADOW. Diversification deteriorates in
 * stressed markets, so the buckets above are read differently when current
 * correlation has run away from its normal level. This states the three
 * averages, the delta, and the worst pairs behind them; it gates nothing.
 */
function CorrelationStatePill({ c }: { c: CorrelationState }) {
  const t = useT();
  const el = useEnumLabel();
  const tone = CORRELATION_STATE_BADGE[c.state] ?? "dim";
  // Defensive: the block is additive, so a backend mid-rollout can send a
  // correlation_state without worst_pairs. An absent list is "no pairs to
  // show", never a crash.
  const worstPairs = c.worst_pairs ?? [];
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 12,
      }}
    >
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <Term k="correlation_regime">
          <span className={`badge ${tone}`}>{el(c.state)}</span>
        </Term>
        <span className="badge amber">SHADOW</span>
        <span
          style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}
        >
          {t(
            `normal ${fmtRho(c.normal_avg)} · current ${fmtRho(c.current_avg)} · stress ${fmtRho(c.stress_avg)}`,
            `常态 ${fmtRho(c.normal_avg)} · 当前 ${fmtRho(c.current_avg)} · 压力 ${fmtRho(c.stress_avg)}`,
          )}
          {c.delta != null && (
            <span style={{ color: c.delta > 0 ? "var(--amber)" : "var(--text-dim)" }}>
              {" "}
              {t(
                `· Δ ${c.delta > 0 ? "+" : "−"}${Math.abs(c.delta).toFixed(2)}`,
                `· Δ ${c.delta > 0 ? "+" : "−"}${Math.abs(c.delta).toFixed(2)}`,
              )}
            </span>
          )}
          {t(` · ${c.n_pairs} pairs`, ` · ${c.n_pairs} 个配对`)}
          {/*
            §18 rank correlation beside its Pearson twin. Rendered ONLY when
            the backend sends it (the field is additive), and only when it is
            a real number — a dash here would be indistinguishable from "the
            estimator says nothing", so absence is silence rather than "—".
            A wide Spearman/Pearson gap means outliers drive the linear
            number; that comparison is the whole reason to show both.
          */}
          {c.current_avg_spearman != null && (
            <span>
              {t(
                ` · Spearman ${fmtRho(c.current_avg_spearman)}`,
                ` · 斯皮尔曼 ${fmtRho(c.current_avg_spearman)}`,
              )}
            </span>
          )}
        </span>
      </div>
      {/* Honest null: the server's own reason, verbatim (§26/§36). */}
      {c.reason && (
        <div
          style={{
            color: "var(--text-dim)",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            marginTop: 4,
          }}
        >
          {c.reason}
        </div>
      )}
      {worstPairs.length > 0 && (
        <div
          style={{
            color: "var(--text-dim)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            marginTop: 4,
          }}
        >
          {t("worst pairs:", "相关性最高的配对：")}{" "}
          {worstPairs.map(([a, b, rho], i) => (
            <span key={`${a}-${b}`}>
              {i > 0 && " · "}
              {a}/{b} {rho.toFixed(2)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BucketsPanel({ d }: { d: AccountRisk }) {
  const t = useT();
  return (
    <div className="panel">
      <h2>
        <Term k="correlation_bucket">{t("Correlation buckets", "相关性分组")}</Term>
      </h2>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
        {t(
          "STATIC buckets are configured groups; DYNAMIC buckets are connected components of rolling 60-day correlation > 0.70 among open-position tickers, computed from stored bars (§12.4).",
          "STATIC 分组为人工配置的分组；DYNAMIC 分组是未平仓标的间滚动 60 日相关性 > 0.70 的连通分量，由已存储K线计算得出（§12.4）。",
        )}
      </p>
      {/* Phase C (SHADOW) §19 — the regime the buckets above must be read
          in. Absent on backends that predate the block; null when it could
          not be computed at all. */}
      {d.statistical?.correlation_state != null && (
        <CorrelationStatePill c={d.statistical.correlation_state} />
      )}
      {d.buckets.length > 0 ? (
        d.buckets.map((b) => {
          // utilization_pct is a FRACTION of the cap (1.0 = cap fully used).
          const utilPct = b.utilization_pct * 100;
          const sev = utilizationSeverity(utilPct);
          const width = Math.max(0, Math.min(100, utilPct));
          return (
            <div className="bucket" key={b.name}>
              <div className="bucket-head">
                <span className="name">
                  {b.name}{" "}
                  <span
                    className={`badge ${(b.kind ?? "STATIC") === "DYNAMIC" ? "accent" : "dim"}`}
                    title={
                      (b.kind ?? "STATIC") === "DYNAMIC"
                        ? t(
                            "Computed from rolling 60d correlation > 0.70 among open positions (§12.4)",
                            "由未平仓持仓间滚动 60 日相关性 > 0.70 计算得出（§12.4）",
                          )
                        : t("Configured bucket", "人工配置的分组")
                    }
                  >
                    {b.kind ?? "STATIC"}
                  </span>
                </span>
                <span className="figures">
                  {t(
                    `risk ${fmtUsd(b.risk_usd)} · ${fmtPct(b.risk_pct)} of NAV · cap ${fmtPct(b.cap_pct)} · ${fmtPct(b.utilization_pct, 0)} used`,
                    `风险 ${fmtUsd(b.risk_usd)} · 占 NAV ${fmtPct(b.risk_pct)} · 上限 ${fmtPct(b.cap_pct)} · 已用 ${fmtPct(b.utilization_pct, 0)}`,
                  )}
                </span>
              </div>
              <div
                className={`meter-track ${sev}`}
                role="meter"
                aria-valuenow={utilPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t(
                  `${b.name} bucket: ${fmtPct(b.risk_pct)} of NAV risk against a ${fmtPct(b.cap_pct)} cap`,
                  `${b.name} 分组：风险占 NAV ${fmtPct(b.risk_pct)}，上限 ${fmtPct(b.cap_pct)}`,
                )}
              >
                <div className={`meter-fill ${sev}`} style={{ width: `${width}%` }} />
              </div>
              <div className="bucket-members">
                {b.tickers.length > 0
                  ? b.tickers.map((tk, i) => (
                      <span key={tk}>
                        {i > 0 && " · "}
                        <Link
                          href={`/watchlist/${encodeURIComponent(tk)}`}
                          style={{ color: "inherit", textDecoration: "underline dotted" }}
                        >
                          {tk}
                        </Link>
                      </span>
                    ))
                  : t("no members", "无成员")}
              </div>
            </div>
          );
        })
      ) : (
        <p className="empty">
          {t("No correlation buckets configured.", "未配置相关性分组。")}
        </p>
      )}
    </div>
  );
}

function PositionsPanel({ d }: { d: AccountRisk }) {
  const t = useT();
  const md = marketDataOf(d);
  return (
    <div className="panel">
      <h2>{t("Open positions", "未平仓持仓")}</h2>
      {d.positions.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Ticker", "代码")}</th>
                <th className="num">{t("Qty", "数量")}</th>
                <th className="num">{t("Avg price", "均价")}</th>
                <th className="num">{t("Market price", "市价")}</th>
                <th className="num">{t("Market value", "市值")}</th>
                <th className="num">{t("Max loss", "最大亏损")}</th>
                <th>{t("Opened", "开仓时间")}</th>
              </tr>
            </thead>
            <tbody>
              {d.positions.map((p) => (
                <tr key={p.ticker}>
                  <td className="ticker">{p.ticker}</td>
                  <td className="num">{p.quantity.toLocaleString()}</td>
                  <td className="num">{fmtUsd(p.avg_price, 2)}</td>
                  {/* Market price / value are null — never estimated from the
                      entry price — when the provider cannot supply a quote. */}
                  <td className="num">
                    {p.market_price == null ? DASH : fmtUsd(p.market_price, 2)}
                  </td>
                  <td className="num">
                    {p.market_value == null ? DASH : fmtUsd(p.market_value)}
                  </td>
                  <td className="num" style={{ color: "var(--red)" }}>
                    {fmtUsd(p.max_loss)}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(p.opened_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!md.configured && <NotConfiguredNote message={md.message} />}
        </div>
      ) : (
        <p className="empty">{t("No open positions.", "无未平仓持仓。")}</p>
      )}
    </div>
  );
}

function LimitsPanel({ d }: { d: AccountRisk }) {
  const t = useT();
  return (
    <div className="panel">
      <h2>{t("Hard limits", "硬性限制")}</h2>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
        {t(
          "Configured caps enforced by the risk engine — read-only here; every veto they cause is audited.",
          "由风险引擎强制执行的已配置上限 — 此处只读；其导致的每次否决均会被审计记录。",
        )}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Limit", "限制")}</th>
              <th className="num">{t("Value", "数值")}</th>
              <th>{t("Meaning", "含义")}</th>
            </tr>
          </thead>
          <tbody>
            {LIMIT_ROWS.map((r) => (
              <tr key={r.key}>
                <td style={{ whiteSpace: "nowrap" }}>{t(r.label.en, r.label.zh)}</td>
                <td className="num">{fmtPct(d.limits[r.key])}</td>
                <td style={{ color: "var(--text-dim)", fontFamily: "inherit" }}>
                  {t(r.meaning.en, r.meaning.zh)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- strategy health */

const HEALTH_BADGE: Record<StrategyHealthStatus, "dim" | "green" | "amber" | "red"> = {
  INSUFFICIENT_DATA: "dim",
  HEALTHY: "green",
  WARNING: "amber",
  PAUSE_RECOMMENDED: "red",
};

/** Displayed status text — EN keeps the underscores-to-spaces convention. */
const HEALTH_LABEL: Record<StrategyHealthStatus, { en: string; zh: string }> = {
  INSUFFICIENT_DATA: { en: "INSUFFICIENT DATA", zh: "数据不足" },
  HEALTHY: { en: "HEALTHY", zh: "健康" },
  WARNING: { en: "WARNING", zh: "警告" },
  PAUSE_RECOMMENDED: { en: "PAUSE RECOMMENDED", zh: "建议暂停" },
};

/** Displayed decision text — EN keeps the raw token exactly as before. */
const DECISION_LABEL: Record<RiskDecision, { en: string; zh: string }> = {
  APPROVE: { en: "APPROVE", zh: "批准" },
  APPROVE_WITH_RESIZE: { en: "APPROVE_WITH_RESIZE", zh: "缩量批准" },
  REJECT: { en: "REJECT", zh: "拒绝" },
};

/** null → em dash, otherwise fmtUsd (the API sends null where a stat is undefined). */
function usdOrDash(v: number | null): string {
  return v == null ? "—" : fmtUsd(v);
}

function pnlColor(v: number): string | undefined {
  if (v > 0) return "var(--green)";
  if (v < 0) return "var(--red)";
  return undefined;
}

function StrategyHealthPanel({
  health,
  errorMessage,
}: {
  health: StrategyHealth | undefined;
  errorMessage?: string;
}) {
  const t = useT();
  return (
    <div className="panel">
      <h2>{t("Strategy Health", "策略健康度")}</h2>
      {errorMessage !== undefined ? (
        <p className="error">
          {t(
            `Strategy health unavailable: ${errorMessage}`,
            `无法加载策略健康度：${errorMessage}`,
          )}
        </p>
      ) : health === undefined ? (
        <p className="empty">{t("Loading strategy health…", "正在加载策略健康度…")}</p>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            <span className={`badge ${HEALTH_BADGE[health.status]}`}>
              {t(HEALTH_LABEL[health.status].en, HEALTH_LABEL[health.status].zh)}
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
              {t(
                `${health.trade_count} closed trade${health.trade_count === 1 ? "" : "s"} of ${health.min_trades_for_judgement} needed for judgement · as of ${new Date(health.as_of).toLocaleString()}`,
                `已平仓交易 ${health.trade_count} 笔（判定需 ${health.min_trades_for_judgement} 笔）· 截至 ${new Date(health.as_of).toLocaleString()}`,
              )}
            </span>
          </div>
          <div className="kv" style={{ marginBottom: 12 }}>
            <div>
              <div className="k">{t("Win rate", "胜率")}</div>
              {/* win_rate is a FRACTION of closed trades (0.55 = 55%). */}
              <div className="v">{health.win_rate == null ? "—" : fmtPct(health.win_rate)}</div>
            </div>
            <div>
              <div className="k">{t("Profit factor", "盈利因子")}</div>
              <div className="v">
                {health.profit_factor == null ? "—" : health.profit_factor.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="k">{t("Expectancy / trade", "单笔期望")}</div>
              <div className="v">{usdOrDash(health.expectancy_usd)}</div>
            </div>
            <div>
              <div className="k">{t("Avg win", "平均盈利")}</div>
              <div className="v">{usdOrDash(health.avg_win_usd)}</div>
            </div>
            <div>
              <div className="k">{t("Avg loss", "平均亏损")}</div>
              <div className="v">{usdOrDash(health.avg_loss_usd)}</div>
            </div>
            <div>
              <div className="k">{t("Gross profit", "毛利润")}</div>
              {/* Color only nonzero values — a green/red $0 is noise. */}
              <div className="v" style={{ color: health.gross_profit_usd ? "var(--green)" : "var(--text-dim)" }}>
                {fmtUsd(health.gross_profit_usd)}
              </div>
            </div>
            <div>
              <div className="k">{t("Gross loss", "毛亏损")}</div>
              <div className="v" style={{ color: health.gross_loss_usd ? "var(--red)" : "var(--text-dim)" }}>
                {fmtUsd(health.gross_loss_usd)}
              </div>
            </div>
            <div>
              <div className="k">{t("Cumulative P&L", "累计 P&L")}</div>
              <div className="v" style={{ color: pnlColor(health.cumulative_pnl_usd) }}>
                {fmtUsd(health.cumulative_pnl_usd)}
              </div>
            </div>
            <div>
              <div className="k">{t("Max drawdown", "最大回撤")}</div>
              <div className="v">{fmtUsd(health.max_drawdown_usd)}</div>
            </div>
            <div>
              <div className="k">{t("Current drawdown", "当前回撤")}</div>
              <div className="v">{fmtUsd(health.current_drawdown_usd)}</div>
            </div>
          </div>
          {health.explanations.length > 0 && (
            <ul className="why-list" style={{ marginBottom: 12 }}>
              {health.explanations.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
            {t(
              "Rolling stats over closed paper trades — pause automation arrives in a later phase.",
              "基于已平仓模拟交易的滚动统计 — 自动暂停功能将在后续阶段推出。",
            )}
          </p>
        </>
      )}
    </div>
  );
}

function RiskDecisionsPanel({
  events,
  errorMessage,
}: {
  events: AuditEvent[] | undefined;
  errorMessage?: string;
}) {
  const t = useT();
  const decisions = (events ?? []).filter((e) => e.action === "RISK_DECISION");
  return (
    <div className="panel">
      <h2>{t("Recent risk decisions", "近期风险决策")}</h2>
      {errorMessage !== undefined ? (
        <p className="error">
          {t(
            `Audit trail unavailable: ${errorMessage}`,
            `无法加载审计记录：${errorMessage}`,
          )}
        </p>
      ) : events === undefined ? (
        <p className="empty">{t("Loading audit events…", "正在加载审计事件…")}</p>
      ) : decisions.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Time", "时间")}</th>
                <th>{t("Ticker", "代码")}</th>
                <th>{t("Decision", "决策")}</th>
                <th>{t("Reasons", "原因")}</th>
              </tr>
            </thead>
            <tbody>
              {decisions.slice(0, 20).map((e) => {
                const { decision, reasons } = decisionFromDetails(e.details);
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleString()}</td>
                    <td className="ticker">{e.entity_id}</td>
                    <td>
                      {decision ? (
                        <span className={`badge ${DECISION_BADGE[decision]}`}>
                          {t(DECISION_LABEL[decision].en, DECISION_LABEL[decision].zh)}
                        </span>
                      ) : (
                        <span className="badge dim">{t("UNKNOWN", "未知")}</span>
                      )}
                    </td>
                    <td style={{ color: "var(--text-dim)" }}>
                      {reasons ||
                        (Object.keys(e.details).length > 0 ? JSON.stringify(e.details) : "")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          {t(
            "No risk decisions yet — generate a Trade Plan on a symbol page to see one.",
            "暂无风险决策 — 在个股页面生成交易计划后即可看到。",
          )}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- reconciliation (§18) */

/** A broker/local cell — rendered verbatim; an absent side is a dash, never a zero. */
function ReconcileCell({ v }: { v: string | number | null }) {
  if (v == null) return DASH;
  return <>{typeof v === "number" ? v.toLocaleString() : v}</>;
}

/**
 * §18 broker reconciliation. The broker is authoritative about what actually
 * exists; the local DB is a mirror. Any disagreement means the system's picture
 * of its own risk is wrong, so trading pauses automatically rather than acting
 * on a stale view.
 *
 * On demand, not on an interval: a reconcile hits the broker, and this page
 * should not poll it in the background.
 */
function ReconciliationPanel() {
  const t = useT();
  const reconcile = useMutation<BrokerReconcile, Error, void>({
    mutationFn: () => api.broker.reconcile(),
  });

  const unconfigured =
    isBrokerNotConfigured(reconcile.error) ||
    (reconcile.data != null && !reconcile.data.configured);
  const data = reconcile.data;

  return (
    <div className="panel">
      <div
        className="row"
        style={{ justifyContent: "space-between", flexWrap: "wrap", marginBottom: 4 }}
      >
        <h2 style={{ marginBottom: 0 }}>{t("Broker reconciliation", "券商对账")}</h2>
        <button onClick={() => reconcile.mutate()} disabled={reconcile.isPending}>
          {reconcile.isPending
            ? t("Checking…", "检查中…")
            : t("Check broker reconciliation", "执行券商对账")}
        </button>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
        {t(
          "Compares the broker's positions and cash against the local database. A mismatch pauses trading automatically (§18) — the broker is authoritative about what actually exists, so the system stops rather than trading against a stale local view.",
          "将券商的持仓与现金同本地数据库进行比对。任何不一致都会自动暂停交易（§18）— 券商是实际持仓状态的权威来源，系统宁可停下，也不基于过期的本地视图交易。",
        )}
      </p>

      {unconfigured ? (
        <NotConfigured variant="broker" message={notConfiguredMessage(reconcile.error)}>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
            {t(
              "With no broker there is no external position to reconcile against — the local rows below stand alone, and nothing can be traded.",
              "没有券商就没有可供对账的外部持仓 — 下方的本地记录独立存在，且无法进行任何交易。",
            )}
          </p>
        </NotConfigured>
      ) : reconcile.isError ? (
        <p className="error">
          {t(
            `Reconciliation unavailable: ${reconcile.error.message}`,
            `无法完成对账：${reconcile.error.message}`,
          )}
        </p>
      ) : data == null ? (
        <p className="empty">
          {t(
            "Not checked yet — run a reconciliation to compare broker state against the local database.",
            "尚未检查 — 运行一次对账以比较券商状态与本地数据库。",
          )}
        </p>
      ) : data.in_sync ? (
        <>
          <div className="banner active">
            {t(
              "IN SYNC — the broker and the local database agree on every position and on cash.",
              "已同步 — 券商与本地数据库在每笔持仓及现金上完全一致。",
            )}
          </div>
          <p className="datasource" style={{ marginTop: 8, marginBottom: 0 }}>
            {t(
              `as of ${new Date(data.as_of).toLocaleString()}`,
              `截至 ${new Date(data.as_of).toLocaleString()}`,
            )}
          </p>
        </>
      ) : (
        <>
          <div className="banner breach">
            {t(
              `${data.mismatches.length} mismatch${data.mismatches.length === 1 ? "" : "es"} — trading is paused automatically until the broker and the local database agree (§18).`,
              `${data.mismatches.length} 处不一致 — 交易已自动暂停，直至券商与本地数据库一致（§18）。`,
            )}
          </div>
          <div className="table-scroll" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>{t("Kind", "类型")}</th>
                  <th>{t("Symbol", "代码")}</th>
                  <th className="num">{t("Broker", "券商")}</th>
                  <th className="num">{t("Local", "本地")}</th>
                  <th>{t("Detail", "详情")}</th>
                </tr>
              </thead>
              <tbody>
                {data.mismatches.map((m, i) => (
                  <tr key={`${m.kind}-${m.symbol}-${i}`} style={{ color: "var(--red)" }}>
                    <td style={{ whiteSpace: "nowrap" }}>{m.kind}</td>
                    <td className="ticker">{m.symbol || DASH}</td>
                    <td className="num">
                      <ReconcileCell v={m.broker} />
                    </td>
                    <td className="num">
                      <ReconcileCell v={m.local} />
                    </td>
                    <td style={{ fontFamily: "inherit", fontSize: 12 }}>{m.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="datasource" style={{ marginTop: 12, marginBottom: 0 }}>
            {t(
              `as of ${new Date(data.as_of).toLocaleString()}`,
              `截至 ${new Date(data.as_of).toLocaleString()}`,
            )}
          </p>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- page */

export default function RiskPage() {
  const t = useT();
  const risk = useQuery({ queryKey: ["portfolio-risk"], queryFn: api.portfolio.risk });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.audit.list() });
  const health = useQuery({ queryKey: ["strategy-health"], queryFn: api.health.strategy });

  return (
    <>
      <h1>{t("Risk", "风险")}</h1>
      <p className="subtitle">
        {t(
          "NAV, cash floor, Portfolio Heat, portfolio Greeks, and correlation buckets — the page that decides whether new risk is allowed. The statistical layer below it (VaR, ES, risk contribution, drawdown, stress scenarios) runs in SHADOW and decides nothing yet.",
          "NAV、现金下限、组合热度、组合希腊值与相关性分组 — 决定是否允许新增风险的页面。下方的统计层（VaR、ES、风险贡献、回撤、压力情景）运行于影子模式，目前不参与任何决策。",
        )}
      </p>
      <FlowNav stage="risk" />

      {risk.isPending ? (
        <div className="panel">
          <p className="empty">{t("Loading portfolio risk…", "正在加载组合风险…")}</p>
        </div>
      ) : risk.isError ? (
        <div className="panel">
          <p className="error">
            {t(
              `Portfolio risk unavailable: ${risk.error.message}`,
              `无法加载组合风险：${risk.error.message}`,
            )}
          </p>
        </div>
      ) : (
        <RiskView d={risk.data} />
      )}

      <ReconciliationPanel />

      <StrategyHealthPanel
        health={health.data}
        errorMessage={health.isError ? health.error.message : undefined}
      />

      <RiskDecisionsPanel
        events={audit.data}
        errorMessage={audit.isError ? audit.error.message : undefined}
      />
    </>
  );
}

/** The loaded portfolio-risk body, split out so the market-data state is read once. */
function RiskView({ d: raw }: { d: PortfolioRisk }) {
  const t = useT();
  const md = marketDataOf(raw);
  // No execution venue -> no account -> nothing honest to show but the reason
  // (the platform never fabricates a default-cash portfolio for display).
  if (raw.nav == null || raw.cash == null || raw.heat_state == null) {
    return (
      <NotConfigured
        message={
          raw.venue?.message ??
          t(
            "No broker is connected — there is no account to report. Connect Alpaca Paper in Settings → Connections.",
            "未连接券商 — 没有可报告的账户。请在 设置 → 连接 中连接 Alpaca Paper。",
          )
        }
      >
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
          {t(
            "NAV, cash, heat and every account figure come from the connected broker account. Risk LIMITS are configuration and stay in force the moment trading is possible again.",
            "NAV、现金、热度及所有账户数据均来自已连接的券商账户。风险限制属于配置项，在恢复可交易的那一刻依然生效。",
          )}
        </p>
      </NotConfigured>
    );
  }
  const d = raw as AccountRisk;

  const shadowHealths = d.statistical ? Object.values(d.statistical.model_health) : [];
  const shadowAllDown =
    d.statistical != null &&
    shadowHealths.length > 0 &&
    !shadowHealths.includes("ACTIVE");
  const shadowPanels = (
    <>
      {d.statistical != null && (
        <>
          <StatisticalRiskPanel s={d.statistical} />
          <RiskContributionPanel s={d.statistical} />
        </>
      )}
      {/* §51 Phase D — the stress catalogue sits with the other SHADOW
          panels, below the hard limits it deliberately does not touch. The
          block is ABSENT on backends that predate Phase D and null when no
          run could be attempted; either way nothing renders rather than an
          empty table implying a measurement was taken. */}
      {d.statistical?.stress != null && (
        <StressScenarios
          stress={d.statistical.stress}
          /* The stress block carries no as_of of its own — it is built inside
             the statistical snapshot, so that snapshot's timestamp is the
             honest one for the §50 card. */
          asOf={d.statistical.as_of}
        />
      )}
      {/* §42/§43 Phase E — the models' own out-of-sample record, below the
          models it grades. `validation` is ABSENT on backends that predate
          Phase E (nothing renders at all); when the key IS present but null
          the panel renders its own "no backtest yet" empty state, because a
          book awaiting its first scheduled run is a different fact from a
          backend that cannot backtest. */}
      {d.statistical != null && d.statistical.validation !== undefined && (
        <ModelValidation v={d.statistical.validation} />
      )}
      {d.drawdown != null && (
        <DrawdownPanel
          d={d.drawdown}
          asOf={d.statistical?.as_of ?? d.as_of}
          dataSource={
            d.statistical == null
              ? "stock_bars_daily"
              : `stock_bars_daily, ${d.statistical.pnl_method} book P&L`
          }
          mode={d.statistical?.mode ?? "SHADOW"}
        />
      )}
    </>
  );

  return (
    <>
      <p className="datasource">
        {t(
          `as of ${new Date(d.as_of).toLocaleString()}`,
          `截至 ${new Date(d.as_of).toLocaleString()}`,
        )}
      </p>
      {/* NAV, cash, heat, buckets and limits below are real DB rows and
          configured values — they stay. Only the market-derived figures become
          the explicit not-configured state. */}
      {!md.configured && (
        <NotConfigured message={md.message}>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
            {t(
              "NAV, cash, portfolio heat, correlation buckets and hard limits below come from the database and configuration, so they remain accurate. Market regime, Greeks, vol targeting and per-position market values are omitted.",
              "下方的 NAV、现金、组合热度、相关性分组与硬性限制来自数据库和配置，因此依然准确。市场状态、希腊值、波动率目标及各持仓市值将不予显示。",
            )}
          </p>
        </NotConfigured>
      )}
      <StatTiles d={d} />
      {/* §48 — the Phase B statistical tiles come AFTER the existing ones and
          never reorder them. Each carries its methodology in the label (§6);
          the block is absent on backends that predate the contract, and null
          when there is no account. */}
      {/* All-UNAVAILABLE tiles fold with the rest of the SHADOW layer — the
          fold's summary line already states the shared reason once. */}
      {d.statistical != null && !shadowAllDown && (
        <StatisticalStatTiles
          s={d.statistical}
          drawdown={d.drawdown ?? null}
          /* §48 — Net Delta / Net Vega become top-bar CARDS. Null when market
             data is unconfigured (Greeks need chain data), and the two tiles
             are then omitted rather than shown as a flat book of zeros. */
          greeks={d.greeks}
        />
      )}
      {d.vol_targeting != null ? (
        <VolTargetingLine v={d.vol_targeting} />
      ) : !md.configured ? (
        // The multiplier is a function of forecast vol — with no bars there is
        // no forecast, and printing "1.0×" would imply one had been computed.
        <p
          style={{
            color: "var(--amber)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            margin: "-4px 0 16px",
          }}
        >
          {t(
            "Vol targeting: unavailable — market data is not configured, so no vol forecast exists. Hard risk caps always apply regardless.",
            "波动率目标：不可用 — 行情数据未配置，因此不存在波动率预测。硬性风险上限始终生效。",
          )}
        </p>
      ) : null}
      <GreeksPanel d={d} />
      <BucketsPanel d={d} />
      <PositionsPanel d={d} />
      <LimitsPanel d={d} />
      {/* SHADOW layer, below the hard limits it deliberately does not touch.
          When EVERY statistical model reports the same fact — not enough
          snapshots yet — repeating UNAVAILABLE dozens of times buries the
          live numbers above; the whole cluster folds to one honest line. */}
      {shadowAllDown ? (
        <details className="shadow-fold">
          <summary>
            <span className="badge amber">{d.statistical!.mode}</span>{" "}
            {t(
              `Statistical layer: all ${shadowHealths.length} models UNAVAILABLE — ${d.statistical!.n_obs} daily snapshots recorded so far, more history is needed. Hard limits above stay in force. Expand for per-model detail.`,
              `统计层：全部 ${shadowHealths.length} 个模型不可用 — 目前已记录 ${d.statistical!.n_obs} 个每日快照，需累积更多历史。上方硬性限制不受影响。展开查看各模型明细。`,
            )}
          </summary>
          {shadowPanels}
        </details>
      ) : (
        shadowPanels
      )}
    </>
  );
}
