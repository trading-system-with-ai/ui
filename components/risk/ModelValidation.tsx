"use client";

/**
 * Phase E VaR/ES model validation — SHADOW/RESEARCH (spec §42, §43, §57,
 * §59, §63, §68; design doc §9.4/§9.5).
 *
 * Every other risk panel on this page shows what a model SAYS. This one
 * shows whether the model has been RIGHT — the walk-forward exceedance
 * record of each VaR view against what the book actually did. §57 is the
 * reason it is a separate panel: model output and model validation must not
 * be produced by the same code claiming its own health.
 *
 * The rules this file follows, in order of how easy they are to break:
 *  1. Nothing here is recomputed. The rows are READ from the newest
 *     persisted backtest (design §9.4) — the panel never derives a verdict,
 *     a rate or a preference client-side, because a number computed two
 *     different ways in two places stops being one number.
 *  2. §43 walk-forward is a claim about PROVENANCE, so it is stated on
 *     screen: the window each forecast used is a column, not a footnote.
 *  3. Honest nulls — a row with too few forecasts renders an em dash plus
 *     its own server `reason`, never a 0 and never a borrowed p-value.
 *     `n_forecasts` / `exceedances` are counts and stay visible even then:
 *     "17 forecasts, 1 exceedance" is exactly why the p-value is missing.
 *  4. A GARCH row is RESEARCH on top of the panel's SHADOW — badged per row,
 *     because §63 promotion is a reviewed user action and a research row
 *     must never read as an accepted one.
 *  5. Server strings (reasons, the §63 criterion sentence) render VERBATIM
 *     (§26/§36); enum tokens go through useEnumLabel.
 *  6. No native dialogs (§47) — "Run now" reports failure inline.
 */
import { useState } from "react";
import ModelTierChip from "@/components/shared/ModelTierChip";
import RiskMethodModal, {
  MODEL_HEALTH_BADGE,
  type MethodField,
} from "@/components/shared/RiskMethodModal";
import Term from "@/components/shared/Term";
import { api } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import type { BacktestVerdict, ValidationBlock, ValidationRow } from "@/lib/types";

/* ---------------------------------------------------------------- helpers */

const DASH = <span style={{ color: "var(--text-dim)" }}>—</span>;

/**
 * Badge per §42 verdict. These colours are the VERDICT's, not a threshold
 * this file owns: the server reads them off the documented Kupiec
 * parameters (0.05 / 0.01) and sends the word.
 */
const VERDICT_BADGE: Record<BacktestVerdict, "green" | "amber" | "red"> = {
  GREEN: "green",
  YELLOW: "amber",
  RED: "red",
};

/**
 * Verdict tokens are NOT in the shared enum table: "GREEN"/"RED" are colour
 * words there, while here they are Basel-style calibration verdicts. One
 * token cannot carry two meanings in a total 1:1 table, so this panel keeps
 * its own vocabulary (the same argument StressScenarios makes for KINDs).
 */
const VERDICT_ZH: Record<BacktestVerdict, string> = {
  GREEN: "通过",
  YELLOW: "存疑",
  RED: "拒绝",
};

/**
 * A row is GARCH research when the server says so — matched on the model
 * name or its distribution label, both of which the backend controls. A
 * substring test (rather than an equality list) keeps a later variant
 * ("garch11_t") badged instead of silently passing as accepted.
 */
export function isResearchRow(r: ValidationRow): boolean {
  const name = (r.model_name ?? "").toLowerCase();
  const dist = (r.distribution ?? "").toLowerCase();
  return name.includes("garch") || dist.includes("garch");
}

/**
 * `comparison.preferred` arrives as the server's MODEL-NAME key
 * ("conditional_var" / "garch_var"), not as a display word — rendering it raw
 * would put "conditional_var" in front of the user where the panel's own
 * heading says "EWMA vs GARCH". Map the two keys the §63 comparison can name;
 * anything else is shown verbatim rather than guessed at, so a new view the
 * server starts preferring is still legible instead of silently blank.
 */
export function preferredLabel(preferred: string | null | undefined): string | null {
  if (preferred == null) return null;
  if (preferred === "conditional_var") return "EWMA";
  if (preferred === "garch_var") return "GARCH";
  return preferred;
}

/** p-values are read at 2–3 decimals; a null one is an em dash, never 0.000. */
function fmtP(p: number | null): React.ReactNode {
  if (p == null) return DASH;
  return p.toFixed(4);
}

/** Rates are FRACTIONS on the wire and read as percents with two decimals. */
function fmtRate(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(2)}%`;
}

/**
 * A p-value is coloured only where the DOCUMENTED parameters say something:
 * below 0.01 the hypothesis is rejected (red), below 0.05 it is doubtful
 * (amber). These mirror the server's verdict thresholds — the panel does not
 * invent a third opinion, and it never recolours the verdict badge itself.
 */
const P_REJECT = 0.01;
const P_DOUBT = 0.05;

function pColor(p: number | null): string | undefined {
  if (p == null) return undefined;
  if (p < P_REJECT) return "var(--red)";
  if (p < P_DOUBT) return "var(--amber)";
  return undefined;
}

/**
 * ES severity is a RATIO, not a p-value: > 1 means the realized losses on
 * exceedance days were bigger than the ES that was forecast for them — the
 * model was not merely breached, it was breached harder than it said.
 */
function severityColor(ratio: number | null): string | undefined {
  if (ratio == null) return undefined;
  return ratio > 1 ? "var(--amber)" : undefined;
}

/** The one-line SHADOW disclaimer for the whole panel. */
function useShadowNote(): string {
  const t = useT();
  return t(
    "SHADOW — backtest verdicts are computed, persisted and displayed; they alter no trading decision. A RED verdict is a signal to review a model, not an automatic change to any limit.",
    "影子模式 — 回测结论会被计算、持久化并展示；它们不会改变任何交易决策。RED 结论只是提示需要复核该模型，并不会自动改动任何风险限制。",
  );
}

/* ---------------------------------------------------------------- rows */

/**
 * One model's out-of-sample record. Reads left to right as an argument:
 * WHAT was tested (model + confidence + window), HOW MUCH evidence there is
 * (forecast days), WHAT HAPPENED (exceedances vs expected), and only then
 * the two tests that turn that count into a verdict.
 */
function BacktestRow({ r }: { r: ValidationRow }) {
  const t = useT();
  const el = useEnumLabel();
  const { lang } = useLang();
  const research = isResearchRow(r);
  // The expected COUNT is what makes "3 exceedances" legible — the server
  // sends the rate, and n × rate is presentation arithmetic on two numbers
  // from the same row, not a re-derivation of the statistic.
  const expectedCount =
    r.expected_rate == null ? null : r.expected_rate * r.n_forecasts;
  return (
    <tr>
      <td style={{ minWidth: 190 }}>
        {/* Model name — the server's token, verbatim (§6: the method label
            never leaves the number). */}
        <span style={{ fontFamily: "var(--font-mono)" }}>{r.model_name}</span>
        {/* §5 tier — WHAT KIND of model this is. Orthogonal to the RESEARCH
            badge beside it, which says how far from acceptance it sits: a
            TIER_2 model can be RESEARCH, and the chip never replaces the
            badge. Renders nothing when the server sent no tier. */}
        <ModelTierChip tier={r.tier} compact />
        {research && (
          <span className="badge amber" style={{ marginLeft: 6 }}>
            {t("RESEARCH", "研究")}
          </span>
        )}
        <div style={{ color: "var(--text-dim)", fontSize: 11 }}>
          {/* Distribution + version: two models can share a name across a
              version bump, and the record belongs to the exact one. */}
          {r.distribution} · v{r.model_version}
        </div>
      </td>
      <td className="num">{(r.confidence * 100).toFixed(0)}%</td>
      <td className="num">{r.horizon_days}D</td>
      <td className="num" title={t("Rolling estimation window per forecast", "每次预测所用的滚动估计窗口")}>
        {r.window}
      </td>
      <td className="num">{r.n_forecasts}</td>
      <td className="num">
        {/* Exceedances vs expected — the whole point of the panel. Shown as
            counts (what happened) with the rates below (what it means). */}
        <span style={{ fontWeight: 600 }}>{r.exceedances}</span>
        <span style={{ color: "var(--text-dim)" }}>
          {expectedCount == null ? "" : ` / ${expectedCount.toFixed(1)}`}
        </span>
        <div style={{ color: "var(--text-dim)", fontSize: 11 }}>
          {fmtRate(r.rate)} {t("vs", "对比")} {fmtRate(r.expected_rate)}
        </div>
      </td>
      <td className="num" style={{ color: pColor(r.kupiec_p) }}>
        {fmtP(r.kupiec_p)}
      </td>
      <td className="num" style={{ color: pColor(r.christoffersen_p) }}>
        {fmtP(r.christoffersen_p)}
      </td>
      <td className="num" style={{ color: severityColor(r.es_severity_ratio) }}>
        {r.es_severity_ratio == null ? DASH : `${r.es_severity_ratio.toFixed(2)}×`}
      </td>
      <td>
        {r.verdict == null ? (
          DASH
        ) : (
          <span className={`badge ${VERDICT_BADGE[r.verdict] ?? "dim"}`}>
            {lang === "zh" ? (VERDICT_ZH[r.verdict] ?? r.verdict) : r.verdict}
          </span>
        )}
      </td>
      <td>
        <span className={`badge ${MODEL_HEALTH_BADGE[r.health]}`}>{el(r.health)}</span>
        {/* The row's own reason, verbatim — for an UNAVAILABLE row it carries
            the real forecast count, which is the ONLY explanation for the
            em dashes to its left. */}
        {r.reason && (
          <div
            style={{
              color: "var(--text-dim)",
              fontSize: 11,
              marginTop: 2,
              fontFamily: "var(--font-mono)",
            }}
          >
            {r.reason}
          </div>
        )}
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------- comparison */

/**
 * §63 — the required model comparison, stated as a comparison and not as a
 * decision. The criterion sentence is the SERVER's and renders verbatim:
 * it is the documented rule under which GARCH could leave RESEARCH, and
 * paraphrasing a promotion rule in the UI would make two versions of it.
 */
function ComparisonLine({ c }: { c: NonNullable<ValidationBlock["comparison"]> }) {
  const t = useT();
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: 6,
      }}
    >
      <h3 style={{ fontSize: 13, marginBottom: 6 }}>
        <Term k="garch">{t("EWMA vs GARCH", "EWMA 与 GARCH 对比")}</Term>{" "}
        <span className="badge amber">{t("RESEARCH", "研究")}</span>
      </h3>
      <div style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
        <Term k="kupiec_test">{t("Kupiec p", "Kupiec p 值")}</Term>{" "}
        {t("EWMA", "EWMA")} {c.ewma_kupiec_p == null ? "—" : c.ewma_kupiec_p.toFixed(4)}
        {" · "}
        {t("GARCH", "GARCH")}{" "}
        {c.garch_kupiec_p == null ? "—" : c.garch_kupiec_p.toFixed(4)}
        {" · "}
        {t("preferred", "较优")}:{" "}
        <span style={{ fontWeight: 700 }}>
          {/* Null preference is a real answer: neither model has earned one. */}
          {preferredLabel(c.preferred) ??
            t("neither (criterion not met)", "均不满足（未达标准）")}
        </span>
      </div>
      {/* Verbatim server criterion (§26/§36) — the promotion rule itself. */}
      <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "6px 0 0" }}>
        {c.criterion}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- panel */

/**
 * §42/§43 "Model validation (VaR backtests)". Renders the newest persisted
 * backtest in the server's row order and offers an on-demand re-run.
 *
 * `v` is null on a book that has never been backtested (and absent entirely
 * on a pre-Phase-E backend, which the caller handles) — the empty state says
 * so plainly instead of showing an empty table that would imply a run
 * happened and found nothing.
 */
export default function ModelValidation({ v }: { v: ValidationBlock | null }) {
  const t = useT();
  const shadowNote = useShadowNote();
  // Rows from a run triggered on this page REPLACE the persisted ones for
  // this render: both come from the same server code over the same book, and
  // showing two generations of the same model side by side would read as a
  // disagreement between models rather than between timestamps.
  const [fresh, setFresh] = useState<ValidationBlock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // §50 — the methodology card this panel was missing. It documents the
  // BACKTEST, not the models being backtested: the estimators have their own
  // ⓘ cards on the Statistical Risk panel, and conflating the two would make
  // this card claim a lineage it does not have.
  const [openMethod, setOpenMethod] = useState(false);

  const shown = fresh ?? v;
  const rows = shown?.rows ?? [];

  // Provenance rows read off the shown block. Counts are honest even when
  // every p-value is null — "17 forecasts, 1 exceedance" is exactly why a
  // verdict is missing, so the counts are the most informative field here.
  const scored = rows.filter((r) => r.verdict != null);
  const methodFields: MethodField[] = [
    { label: t("Model views tested", "受测模型视角数"), value: rows.length },
    { label: t("Views with a verdict", "已给出结论的视角数"), value: scored.length },
    {
      label: t("Forecast days (max across views)", "预测天数（各视角最大值）"),
      value: rows.length === 0 ? null : Math.max(...rows.map((r) => r.n_forecasts)),
    },
    {
      label: t("Rolling window (trading days)", "滚动窗口（交易日）"),
      value:
        rows.length === 0
          ? null
          : Array.from(new Set(rows.map((r) => r.window))).join(", "),
    },
    {
      label: t("Confidences tested", "受测置信度"),
      value:
        rows.length === 0
          ? null
          : Array.from(new Set(rows.map((r) => `${(r.confidence * 100).toFixed(0)}%`))).join(
              ", ",
            ),
    },
    {
      label: t("RESEARCH views (GARCH)", "研究视角（GARCH）"),
      value: rows.filter(isResearchRow).length,
    },
  ];
  const verdictCount = (verdict: BacktestVerdict) =>
    rows.filter((r) => r.verdict === verdict).length;
  const methodDiagnostics: MethodField[] = [
    { label: t("GREEN verdicts", "GREEN（通过）结论数"), value: verdictCount("GREEN") },
    { label: t("YELLOW verdicts", "YELLOW（存疑）结论数"), value: verdictCount("YELLOW") },
    { label: t("RED verdicts", "RED（拒绝）结论数"), value: verdictCount("RED") },
    {
      label: t("Views with no verdict", "无结论的视角数"),
      value: rows.length - scored.length,
    },
    {
      label: t("Kupiec thresholds", "Kupiec 判定阈值"),
      value: `p < ${P_REJECT} → RED · p < ${P_DOUBT} → YELLOW`,
    },
    {
      label: t("§63 comparison preferred", "§63 对比中较优者"),
      value: preferredLabel(shown?.comparison?.preferred) ?? null,
    },
  ];

  async function runNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.risk.validationRun();
      // The endpoint returns rows only; the comparison is computed with the
      // persisted set, so it is carried over rather than invented here.
      setFresh({ as_of: res.as_of, rows: res.rows, comparison: v?.comparison ?? null });
    } catch (err) {
      // §47: no native dialog — the server's own message renders inline.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 style={{ marginBottom: 0 }}>
          <Term k="var_backtest">
            {t("Model validation (VaR backtests)", "模型验证（VaR 回测）")}
          </Term>{" "}
          <Term k="shadow_mode">
            <span className="badge amber">SHADOW</span>
          </Term>
        </h2>
        {shown != null && (
          <span
            style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}
          >
            {t(`as of ${shown.as_of}`, `截至 ${shown.as_of}`)}
          </span>
        )}
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "8px 0 12px" }}>
        {t(
          "Not what the models predict — whether they have been right. Each forecast was made WALK-FORWARD (only data available before that day), then compared with the loss the book actually took. Too many exceedances means the model understates risk; too few means it wastes capital; exceedances that cluster mean it ignores volatility regimes.",
          "这里衡量的不是模型的预测值，而是它们过去对不对。每个预测都以前向滚动方式生成（只使用该交易日之前已有的数据），再与组合当天真实发生的亏损比较。突破次数过多说明模型低估风险；过少说明白白占用资金；突破集中出现则说明模型忽视了波动率状态的变化。",
        )}
      </p>

      {rows.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {/* The §5 tier chips render inside this column. */}
                <th>
                  <Term k="model_tier">{t("Model", "模型")}</Term>
                </th>
                <th className="num">{t("Conf.", "置信度")}</th>
                <th className="num">{t("Horizon", "期限")}</th>
                <th className="num">{t("Window", "窗口")}</th>
                <th className="num">{t("Forecasts", "预测天数")}</th>
                <th className="num">{t("Exceed. / expected", "突破 / 预期")}</th>
                <th className="num">
                  <Term k="kupiec_test">{t("Kupiec p", "Kupiec p")}</Term>
                </th>
                <th className="num">
                  <Term k="christoffersen_test">{t("Christoffersen p", "Christoffersen p")}</Term>
                </th>
                <th className="num">
                  <Term k="es">{t("ES severity", "ES 严重度")}</Term>
                </th>
                <th>{t("Verdict", "结论")}</th>
                <th>{t("Health", "健康度")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <BacktestRow key={`${r.model_name}-${r.confidence}-${r.horizon_days}-${i}`} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          {t(
            "No backtest yet — runs daily with the scheduled snapshot.",
            "尚无回测结果 — 每日随定时快照自动运行。",
          )}
        </p>
      )}

      {shown?.comparison != null && <ComparisonLine c={shown.comparison} />}

      {/* On-demand re-run. It PERSISTS (the track record accrues) but writes
          no audit event — the platform's read views never do. */}
      <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" className="primary" onClick={runNow} disabled={busy}>
          {busy ? t("Running…", "运行中…") : t("Run now", "立即运行")}
        </button>
        <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
          {t(
            "Re-runs the walk-forward backtests over the current book and persists the result.",
            "对当前持仓组合重新执行前向滚动回测，并持久化结果。",
          )}
        </span>
        {/* §50 — the same ⓘ affordance every other risk number carries. */}
        <button type="button" className="method-info" onClick={() => setOpenMethod(true)}>
          {t("ⓘ How is this calculated?", "ⓘ 该指标如何计算？")}
        </button>
      </div>

      {/* §47 — inline error, never a native dialog. Server text verbatim. */}
      {error && (
        <ul className="why-list" style={{ marginTop: 8, color: "var(--red)" }}>
          <li>{error}</li>
        </ul>
      )}

      <p style={{ marginTop: 12, fontSize: 11, color: "var(--text-dim)" }}>{shadowNote}</p>

      {openMethod && (
        <RiskMethodModal
          metric={t("VaR backtests (walk-forward)", "VaR 回测（前向滚动）")}
          model={t("Kupiec POF + Christoffersen independence", "Kupiec POF + Christoffersen 独立性检验")}
          /* The block spans SEVERAL model views at several confidences, so a
             single confidence/horizon here would name one of them and hide
             the rest. The per-view values are columns in the table; nulls
             render as em dashes rather than picking a representative row. */
          confidence={null}
          horizonDays={null}
          sampleSize={null}
          distribution={null}
          asOf={shown?.as_of ?? null}
          dataSource={t(
            "risk_model_backtests (persisted walk-forward run) over the book P&L series",
            "risk_model_backtests（已持久化的前向滚动回测）基于组合盈亏序列",
          )}
          /* The block has no health of its own — health is per row, and the
             table shows it there. Claiming one here would average four
             independent verdicts into a fifth number nobody computed. */
          health={null}
          formula={t(
            "For each day t, the model was fitted on pnl[t−window:t] ONLY (§43 forbids hindsight) and forecast VaR for day t; an EXCEEDANCE is a realized loss worse than that forecast. Kupiec's proportion-of-failures test asks whether the exceedance COUNT matches the confidence level; Christoffersen's test asks whether exceedances arrive independently or CLUSTER. ES severity is the mean realized loss on exceedance days ÷ the mean forecast ES — above 1× the model was not merely breached but breached harder than it said.",
            "对每个交易日 t，模型「仅」使用 pnl[t−window:t] 拟合（§43 禁止使用未来信息），并预测 t 日的 VaR；当实际亏损超过该预测值时记为一次「突破」。Kupiec 失败比例检验考察突破「次数」是否与置信水平相符；Christoffersen 检验考察突破是独立发生还是「聚集」出现。ES 严重度 = 突破日实际亏损均值 ÷ 预测 ES 均值 — 大于 1× 说明模型不仅被突破，且突破幅度超出其自身声明。",
          )}
          extraFields={methodFields}
          diagnostics={methodDiagnostics}
          note={shadowNote}
          onClose={() => setOpenMethod(false)}
        />
      )}
    </div>
  );
}
