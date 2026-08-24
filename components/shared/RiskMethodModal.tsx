"use client";

/**
 * §50 "ⓘ How is this calculated?" — the methodology card behind every risk
 * metric. Generalized from the watchlist ScoreExplainerModal so VaR, ES,
 * volatility, drawdown and any later model share one shape.
 *
 * Contract (spec §6 / §50): a risk number is never shown without its method
 * label, and this card carries the rest of the provenance — Model,
 * Confidence, Horizon, Lookback / n_obs, Distribution, Last updated (as_of),
 * Data source, Model health + reason, model_version — plus an "Advanced"
 * section for estimator diagnostics (tail size, scaling, skew, kurtosis,
 * dispersion).
 *
 * House rules honored here:
 *  - Server-generated strings (health reasons, notes) render VERBATIM; only
 *    UI chrome is translated (§26/§36).
 *  - Honest nulls: an absent field renders an em dash, never a substitute
 *    number.
 *  - No native dialogs — it composes the in-app <Modal> (§47).
 */
import Modal from "@/components/shared/Modal";
import { useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import type { ModelHealth } from "@/lib/types";

/** Badge class per §41 model health. */
export const MODEL_HEALTH_BADGE: Record<ModelHealth, "green" | "amber" | "dim" | "red"> = {
  ACTIVE: "green",
  DEGRADED: "amber",
  UNAVAILABLE: "dim",
  FAILED: "red",
};

/** One "label: value" line. A null/undefined value renders an em dash. */
export interface MethodField {
  label: string;
  value: string | number | null | undefined;
  /** Render in the mono "advanced diagnostics" grid instead of the main list. */
  mono?: boolean;
}

export interface RiskMethodModalProps {
  /** Metric name shown in the dialog title, e.g. "Historical VaR 95% 1D". */
  metric: string;
  /** Estimator family label — never omitted (§6: no VaR without its method). */
  model: string;
  modelVersion?: string | null;
  /** FRACTION (0.95), rendered as "95%"; null for metrics without one. */
  confidence?: number | null;
  horizonDays?: number | null;
  /** Observations actually used. */
  sampleSize?: number | null;
  /** Window bounds, when the block reports them. */
  windowStart?: string | null;
  windowEnd?: string | null;
  distribution?: string | null;
  /** ISO timestamp of the snapshot this number came from. */
  asOf?: string | null;
  /** Provenance line, e.g. "stock_bars_daily, DELTA_LINEAR book P&L". */
  dataSource: string;
  health?: ModelHealth | null;
  /** Server string, verbatim — why health is not ACTIVE. */
  healthReason?: string | null;
  /** Plain-language description of the estimator (UI copy, translated). */
  formula?: string | null;
  /** Extra provenance rows for this specific metric. */
  extraFields?: MethodField[];
  /** "Advanced" diagnostics: tail_size, scaling, skew, kurtosis, dispersion… */
  diagnostics?: MethodField[];
  /** Closing note, e.g. the SHADOW disclaimer. */
  note?: string | null;
  onClose: () => void;
}

const DASH = "—";

function fieldText(v: string | number | null | undefined): string {
  if (v == null || v === "") return DASH;
  return typeof v === "number" ? String(v) : v;
}

function FieldRow({ f }: { f: MethodField }) {
  return (
    <div>
      <div className="k">{f.label}</div>
      <div className="v">{fieldText(f.value)}</div>
    </div>
  );
}

export default function RiskMethodModal({
  metric,
  model,
  modelVersion,
  confidence,
  horizonDays,
  sampleSize,
  windowStart,
  windowEnd,
  distribution,
  asOf,
  dataSource,
  health,
  healthReason,
  formula,
  extraFields = [],
  diagnostics = [],
  note,
  onClose,
}: RiskMethodModalProps) {
  const t = useT();
  const el = useEnumLabel();

  // Lookback reads as "598 obs · 2024-03-21 → 2026-08-14" when the window is
  // known, and degrades to just the count (or a dash) when it is not.
  const lookback =
    sampleSize == null
      ? null
      : windowStart && windowEnd
        ? t(
            `${sampleSize} obs · ${windowStart} → ${windowEnd}`,
            `${sampleSize} 个观测 · ${windowStart} → ${windowEnd}`,
          )
        : t(`${sampleSize} obs`, `${sampleSize} 个观测`);

  const fields: MethodField[] = [
    { label: t("Model", "模型"), value: model },
    {
      label: t("Confidence", "置信度"),
      value: confidence == null ? null : `${(confidence * 100).toFixed(0)}%`,
    },
    {
      label: t("Horizon", "持有期"),
      value:
        horizonDays == null
          ? null
          : t(`${horizonDays} trading day${horizonDays === 1 ? "" : "s"}`, `${horizonDays} 个交易日`),
    },
    { label: t("Lookback / n_obs", "回看窗口 / 样本量"), value: lookback },
    { label: t("Distribution", "分布"), value: distribution },
    {
      label: t("Last updated (as_of)", "最后更新 (as_of)"),
      value: asOf == null ? null : new Date(asOf).toLocaleString(),
    },
    { label: t("Data source", "数据来源"), value: dataSource },
    { label: t("Model version", "模型版本"), value: modelVersion },
    ...extraFields,
  ];

  return (
    <Modal
      title={t(`How is this calculated? — ${metric}`, `该指标如何计算？— ${metric}`)}
      onClose={onClose}
      maxWidth={720}
    >
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
        <span className="provenance data-driven">{t("DATA-DRIVEN", "数据驱动")}</span>{" "}
        {t(
          "Deterministic statistical calculation from stored daily bars — no LLM is involved in this number.",
          "由已存储的日线数据进行的确定性统计计算 — 该数字不涉及任何 LLM。",
        )}
      </p>

      {health != null && (
        <p style={{ fontSize: 12, marginBottom: 10 }}>
          <span className={`badge ${MODEL_HEALTH_BADGE[health]}`}>{el(health)}</span>{" "}
          {/* Server-generated reason string: verbatim, never paraphrased. */}
          {healthReason ? (
            <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {healthReason}
            </span>
          ) : (
            <span style={{ color: "var(--text-dim)" }}>
              {t("no degradation reason reported", "未报告降级原因")}
            </span>
          )}
        </p>
      )}

      {formula && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <h2>{t("Method", "方法")}</h2>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7 }}>
            {formula}
          </p>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 12 }}>
        <h2>{t("Provenance", "来源与参数")}</h2>
        <div className="kv">
          {fields.map((f) => (
            <FieldRow key={f.label} f={f} />
          ))}
        </div>
      </div>

      {diagnostics.length > 0 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <h2>{t("Advanced", "高级")}</h2>
          <div className="kv">
            {diagnostics.map((f) => (
              <FieldRow key={f.label} f={f} />
            ))}
          </div>
        </div>
      )}

      {note && (
        <p style={{ fontSize: 11, color: "var(--text-dim)" }}>{note}</p>
      )}
    </Modal>
  );
}
