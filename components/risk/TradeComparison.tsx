"use client";

/**
 * Phase C pre-trade portfolio risk — SHADOW (spec §8, §9, §11, §14, §19,
 * §37, §38, §46, §47, §70; design doc §7.6).
 *
 * "CURRENT vs AFTER TRADE" (§46): what this one trade does to the WHOLE
 * portfolio, plus the §47 explanation of which constraints bound the size.
 *
 * The one thing this file must never do is let the statistical layer LOOK
 * like it decided something. In Phase C it decided nothing:
 *   - the Tier 0 approved quantity is the number that will be traded;
 *   - the hypothetical statistical quantity sits BESIDE it, badged SHADOW;
 *   - binding constraints are grouped by layer, HARD_LIMIT first, and the
 *     statistical/concentration group carries the "changed nothing" wording.
 *
 * The rules it follows, in order of how easy they are to break:
 *  1. Every field is optional/nullable — the backend omits the whole block
 *     on plans that predate Phase C. Nothing here may crash on a missing
 *     field, and an absent block renders NOTHING rather than an empty table.
 *  2. Honest nulls — a null before/after/delta renders an em dash plus the
 *     row's own server reason, never 0 and never a borrowed number.
 *  3. `unit` chooses the formatter (never the label): "usd" → fmtUsd,
 *     "pct_nav"/"pct" → fmtPct of a FRACTION.
 *  4. Server strings (labels, reasons, cap sentences, notes) render VERBATIM
 *     (§26/§36) — they are the audited wording.
 *  5. Enum tokens go through useEnumLabel; UI chrome through useT.
 */
import Term from "@/components/shared/Term";
import { MODEL_HEALTH_BADGE } from "@/components/shared/RiskMethodModal";
import { useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import { fmtPct, fmtUsd } from "@/lib/risk-format";
import type {
  BindingConstraint,
  ComparisonUnit,
  ConstraintLayer,
  ModelHealth,
  OrderPreviewRisk,
  RiskComparisonBlock,
  RiskComparisonRow,
  ShadowSizingV2,
  StatisticalCap,
} from "@/lib/types";

/* ---------------------------------------------------------------- helpers */

const DASH = <span style={{ color: "var(--text-dim)" }}>—</span>;

/**
 * Format one comparison cell by its declared UNIT. `pct_nav` and `pct` are
 * both FRACTIONS on the wire but mean different things (share of NAV vs
 * share of the ES total), so they are kept as distinct units even though
 * they format identically — the label says which.
 */
function fmtCell(v: number | null | undefined, unit: ComparisonUnit): string {
  if (v == null) return "—";
  if (unit === "usd") return fmtUsd(v);
  return fmtPct(v, 2);
}

/** Same as fmtCell but with an explicit sign — a delta of 0 reads "+$0". */
function fmtDelta(v: number | null | undefined, unit: ComparisonUnit): string {
  if (v == null) return "—";
  const body = fmtCell(Math.abs(v), unit);
  return v < 0 ? `−${body}` : `+${body}`;
}

/**
 * Colour of a delta. MORE risk after the trade is amber, LESS is green — but
 * only for rows where "up" really means "worse". Cash is the exception the
 * other way round (less cash after a buy is the normal, expected direction),
 * so it stays neutral rather than claiming a judgement the engine did not
 * make. Zero is neutral.
 */
function deltaColor(row: RiskComparisonRow): string {
  if (row.delta == null || row.delta === 0) return "var(--text-dim)";
  if (row.metric === "cash" || row.metric === "cash_pct") return "var(--text-dim)";
  // §46 net vega joins cash as a SIGNED EXPOSURE rather than a loss measure:
  // more vega is long-vol, less is short-vol, and neither direction is "worse"
  // without knowing the book's intent. Colouring it would assert a judgement
  // the engine never made — the same reason cash stays neutral above.
  if (row.metric === "net_vega") return "var(--text-dim)";
  return row.delta > 0 ? "var(--amber)" : "var(--green)";
}

/** HARD_LIMIT first — the layer that actually decided is never buried.
 *  STRESS (Phase D, §8.5) is SHADOW like STATISTICAL/CONCENTRATION and is
 *  listed here so it groups under its OWN name; without the entry a real
 *  STRESS cap fell into the unknown-layer bucket and was badged "OTHER". */
const LAYER_ORDER: ConstraintLayer[] = [
  "HARD_LIMIT",
  "STATISTICAL",
  "CONCENTRATION",
  "STRESS",
];

function layerRank(layer: string): number {
  const i = LAYER_ORDER.indexOf(layer as ConstraintLayer);
  return i === -1 ? LAYER_ORDER.length : i;
}

/* ------------------------------------------------- payload normalisation */

/**
 * Bilingual labels for the metric slugs the gateway sends. The gateway emits
 * `metric` but NO `label`, so the label vocabulary lives here. A slug with no
 * entry falls back to the raw slug — a new server row renders (readably, as
 * its slug) instead of vanishing.
 */
const METRIC_LABELS: Record<string, [string, string]> = {
  var_hist_95: ["VaR 95% (1D)", "VaR 95%（1日）"],
  es_hist_95: ["ES 95% (1D)", "ES 95%（1日）"],
  var_hist_99: ["VaR 99% (1D)", "VaR 99%（1日）"],
  es_hist_99: ["ES 99% (1D)", "ES 99%（1日）"],
  gaussian_es_95: ["Gaussian ES 95%", "正态 ES 95%"],
  volatility: ["Volatility (1D)", "波动率（1日）"],
  portfolio_heat_pct: ["Portfolio heat", "组合风险敞口"],
  cash_pct: ["Cash", "现金"],
  // Phase D (§27/§8.5). The gateway sends this row in the SAME
  // before_usd/after_usd/delta_usd shape as every statistical row, so it
  // needs no special case here — only its label. Sign: it is a LOSS
  // (positive = money lost), like the VaR/ES rows above it, so a POSITIVE
  // delta means the trade would DEEPEN the worst case.
  worst_stress_loss: ["Worst stress loss", "最差压力情景亏损"],
  // §46 — the two rows the compliance audit found missing from this table.
  // Both arrive in the SAME before_usd/after_usd/delta_usd shape as every
  // statistical row above, so they need no special case here, only a label.
  //
  // `net_vega` is $ per one IV POINT, in the Greeks panel's sign convention
  // (positive = the book gains when IV rises), which means a positive delta
  // reads as "this trade adds long-vol exposure" — NOT as "more risk". That
  // is why it is deliberately left out of the amber/green delta colouring
  // below: up is not worse for vega the way it is for a tail measure.
  net_vega: ["Net vega ($/IV pt)", "净 Vega（每 IV 点美元）"],
  // `incremental_var_95` is a LOSS like the VaR/ES rows: positive = the trade
  // deepens the 95% tail, so the shared colouring reads correctly on it.
  incremental_var_95: ["Incremental VaR 95% (this trade)", "增量 VaR 95%（本笔）"],
};

/**
 * Adapt ONE statistical row of the gateway payload
 * (`before_usd` / `after_usd` / `delta_usd` / `before_health`) to the shape
 * this table renders. The gateway also sends `*_pct_nav` for every row; the
 * USD figure is the one displayed because the §46 table compares dollar
 * tails, and `pct_nav` is the same number against a different denominator.
 *
 * Rows are rendered in the order the server sent them.
 */
function normaliseRow(raw: Record<string, unknown>, t: (en: string, zh: string) => string): RiskComparisonRow {
  const metric = String(raw.metric ?? "");
  const pair = METRIC_LABELS[metric];
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  // A row is only as healthy as its worse side.
  const bh = raw.before_health as ModelHealth | null | undefined;
  const ah = raw.after_health as ModelHealth | null | undefined;
  const health = bh != null && bh !== "ACTIVE" ? bh : (ah ?? null);
  // The Phase D stress row NAMES the scenario each side was measured in
  // (`before_scenario` / `after_scenario`). Without them "Worst stress loss
  // $4,210" is an anonymous figure, so they are folded into the row's note —
  // server strings, verbatim, appended to (never replacing) a real reason.
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const beforeScenario = str(raw.before_scenario);
  const afterScenario = str(raw.after_scenario);
  const scenarioNote =
    beforeScenario == null && afterScenario == null
      ? null
      : beforeScenario === afterScenario
        ? beforeScenario
        : `${beforeScenario ?? "—"} → ${afterScenario ?? "—"}`;
  const serverReason = (raw.reason as string | null | undefined) ?? null;
  return {
    metric,
    label: pair ? t(pair[0], pair[1]) : metric,
    before: num(raw.before_usd),
    after: num(raw.after_usd),
    delta: num(raw.delta_usd),
    unit: "usd",
    health,
    reason: serverReason,
    scenario: scenarioNote,
  };
}

/**
 * Adapt one TIER 0 row (`before_pct` / `after_pct`, already a fraction).
 * These are the ENGINE's own numbers — the hard limits that actually decided
 * — so they are shown in the same table above the statistical rows.
 */
function normaliseTier0Row(raw: Record<string, unknown>, t: (en: string, zh: string) => string): RiskComparisonRow {
  const metric = String(raw.metric ?? "");
  const pair = METRIC_LABELS[metric];
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  const before = num(raw.before_pct);
  const after = num(raw.after_pct);
  return {
    metric,
    label: pair ? t(pair[0], pair[1]) : metric,
    before,
    after,
    // Tier 0 rows carry no server-side delta; both endpoints are present and
    // exact, so the difference is arithmetic on the SAME measurement, not a
    // second model output.
    delta: before == null || after == null ? null : after - before,
    unit: "pct_nav",
    health: null,
    reason: null,
  };
}

/* ---------------------------------------------------------------- rows */

/**
 * The §46 rows the gateway exposes as block-level SCALARS rather than table
 * rows (incremental ES, the candidate's ES share, single-name and bucket
 * risk concentration, net delta notional). Synthesised here so the table
 * shows "does this trade improve or damage diversification?" next to the
 * VaR/ES rows. Every field is nullable; a null side renders as "—" with the
 * block-level reason (spec §46 "Tech Risk Contr. / Single-name RC").
 */
function concentrationRows(
  comparison: RiskComparisonBlock | null | undefined,
  t: (en: string, zh: string) => string,
  /**
   * Metric slugs the gateway already sent as WIRE ROWS. A slug listed here is
   * skipped below, so a backend that promotes one of these scalars to a
   * first-class row does not produce the same metric twice — the server's own
   * row wins, carrying its health and reason, and this synthesis is only the
   * fallback for the block-level form.
   */
  wireMetrics: ReadonlySet<string> = new Set(),
): RiskComparisonRow[] {
  if (comparison == null) return [];
  const c = comparison;
  const reason = c.reason ?? null;
  const health = c.health ?? null;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const out: RiskComparisonRow[] = [];
  const incUsd = num(c.incremental_es_95_usd);
  if (incUsd != null || c.incremental_es_95_usd === null) {
    out.push({
      metric: "incremental_es_95",
      label: t("Incremental ES 95% (this trade)", "增量 ES 95%（本笔）"),
      before: 0,
      after: incUsd,
      delta: incUsd,
      unit: "usd",
      health,
      reason,
    });
  }
  const shareAfter = num(c.candidate_es_share_after);
  if (shareAfter != null || c.candidate_es_share_after === null) {
    out.push({
      metric: "candidate_es_share_after",
      label: t("This position's share of ES 95%", "本仓位占 ES 95% 的比例"),
      before: 0,
      after: shareAfter,
      delta: shareAfter,
      unit: "pct",
      health,
      reason,
    });
  }
  const sb = num(c.max_single_es_share_before);
  const sa = num(c.max_single_es_share_after);
  if (sb != null || sa != null || c.max_single_es_share_after === null) {
    out.push({
      metric: "max_single_es_share",
      label: t("Largest single-name ES share", "最大单一标的 ES 占比"),
      before: sb,
      after: sa,
      delta: sb != null && sa != null ? sa - sb : null,
      unit: "pct",
      health,
      reason,
    });
  }
  const buckets = c.bucket_es_share_after ?? null;
  if (buckets && typeof buckets === "object") {
    for (const [name, share] of Object.entries(buckets)) {
      out.push({
        metric: `bucket_es_share:${name}`,
        label: t(`${name} bucket ES share`, `${name} 相关性桶 ES 占比`),
        before: null,
        after: num(share),
        delta: null,
        unit: "pct",
        health,
        reason,
      });
    }
  }
  const db = num(c.net_delta_notional_before);
  const da = num(c.net_delta_notional_after);
  if (db != null || da != null) {
    out.push({
      metric: "net_delta_notional",
      label: t("Net delta notional", "净 Delta 名义敞口"),
      before: db,
      after: da,
      delta: db != null && da != null ? da - db : null,
      unit: "usd",
      health: null,
      reason: null,
    });
  }
  // §46 net vega before/after — the row the audit found absent on both sides,
  // synthesised here from the block scalars exactly as net delta notional is
  // above. Skipped entirely when the server sent neither side: a vega row of
  // two dashes on a stock-only candidate would imply a measurement failed
  // where in truth there was nothing to measure.
  const vb = num(c.net_vega_before);
  const va = num(c.net_vega_after);
  if (!wireMetrics.has("net_vega") && (vb != null || va != null)) {
    out.push({
      metric: "net_vega",
      label: t("Net vega ($/IV pt)", "净 Vega（每 IV 点美元）"),
      before: vb,
      after: va,
      delta: vb != null && va != null ? va - vb : null,
      unit: "usd",
      health: null,
      reason: null,
      // The uncoloured delta above needs an explanation the table itself has
      // no room for: more vega is a different exposure, not more risk.
      termKey: "net_vega",
    });
  }
  // §8 incremental VaR 95% — first-class rather than only reachable as the
  // delta of the VaR row above. It is the SAME arithmetic the server does
  // (VaR after − VaR before), which is why it is READ from the block instead
  // of being differenced here: one definition, computed once, server-side.
  const incVar = num(c.incremental_var_95_usd);
  if (
    !wireMetrics.has("incremental_var_95") &&
    (incVar != null || c.incremental_var_95_usd === null)
  ) {
    out.push({
      metric: "incremental_var_95",
      label: t("Incremental VaR 95% (this trade)", "增量 VaR 95%（本笔）"),
      before: 0,
      after: incVar,
      delta: incVar,
      unit: "usd",
      health,
      reason,
      termKey: "incremental_var",
    });
  }
  return out;
}


function ComparisonRow({ row }: { row: RiskComparisonRow }) {
  const el = useEnumLabel();
  // A row is "empty" when neither side could be estimated: show the reason
  // instead of three dashes with no explanation.
  const bothNull = row.before == null && row.after == null;
  return (
    <tr>
      <td style={{ whiteSpace: "nowrap" }}>
        {/* Server-worded label, verbatim (§26/§36). A glossary key is
            attached only by the rows this file synthesises; an unknown key
            renders the label unchanged, so this can never hide one. */}
        {row.termKey ? <Term k={row.termKey}>{row.label}</Term> : row.label}
        {row.health != null && row.health !== "ACTIVE" && (
          <span className={`badge ${MODEL_HEALTH_BADGE[row.health]}`} style={{ marginLeft: 6 }}>
            {el(row.health)}
          </span>
        )}
      </td>
      <td className="num">{row.before == null ? DASH : fmtCell(row.before, row.unit)}</td>
      <td className="num">{row.after == null ? DASH : fmtCell(row.after, row.unit)}</td>
      <td className="num" style={{ color: deltaColor(row) }}>
        {row.delta == null ? DASH : fmtDelta(row.delta, row.unit)}
      </td>
      <td style={{ color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
        {/* The scenario a stress row was measured in (Phase D) — shown
            whether or not the row is null, because it NAMES the number. */}
        {row.scenario ? <div>{row.scenario}</div> : null}
        {/* The model's own reason, verbatim — the ONLY explanation for a "—". */}
        {(bothNull || row.delta == null) && row.reason ? row.reason : null}
      </td>
    </tr>
  );
}

/* ------------------------------------------------- binding constraints */

function BindingConstraints({
  constraints,
  caps,
}: {
  constraints: BindingConstraint[];
  caps: StatisticalCap[];
}) {
  const t = useT();
  if (constraints.length === 0) return null;
  // Cap sentences are keyed by code so a STATISTICAL/CONCENTRATION constraint
  // can carry its §47 sentence with the real numbers when one exists.
  const sentenceByCode = new Map(caps.map((c) => [c.code, c.sentence]));
  const groups = LAYER_ORDER.map((layer) => ({
    layer,
    items: constraints.filter((c) => c.layer === layer),
  }))
    .concat(
      // Any layer the backend invents later still renders, after the known
      // ones, rather than silently disappearing.
      [
        {
          layer: "OTHER" as ConstraintLayer,
          items: constraints.filter((c) => layerRank(c.layer) === LAYER_ORDER.length),
        },
      ],
    )
    .filter((g) => g.items.length > 0);

  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ fontSize: 13, marginBottom: 6 }}>
        <Term k="binding_constraint">{t("Binding constraints", "生效的约束")}</Term>
      </h3>
      {groups.map((g) => (
        <div key={g.layer} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span className={`badge ${g.layer === "HARD_LIMIT" ? "red" : "amber"}`}>
              {g.layer}
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
              {g.layer === "HARD_LIMIT"
                ? t(
                    "these decided the approved quantity",
                    "以下约束决定了批准数量",
                  )
                : t(
                    "SHADOW — computed and logged; these changed nothing",
                    "影子模式 — 仅计算与记录；未改变任何结果",
                  )}
            </span>
          </div>
          <ul className="why-list" style={{ marginTop: 4 }}>
            {g.items.map((c) => (
              <li key={`${c.layer}-${c.code}`}>
                <span style={{ fontFamily: "var(--font-mono)" }}>{c.code}</span>
                {sentenceByCode.get(c.code) && (
                  <span style={{ color: "var(--text-dim)" }}>
                    {" — "}
                    {/* §47 sentence, server-worded, verbatim. */}
                    {sentenceByCode.get(c.code)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- panel */

/**
 * §46/§47 panel. Renders nothing at all when the backend sent none of the
 * Phase C fields — an older plan must not grow an empty "AFTER TRADE" table
 * that implies a measurement was taken.
 */
export default function TradeComparison({
  risk,
  quantityRequested,
  unitSuffix = "",
}: {
  risk: OrderPreviewRisk;
  /** proposed.quantity_requested — null means the engine sized it (auto). */
  quantityRequested: number | null;
  /** " SHARES" / " CONTRACTS" — the caller already knows the instrument. */
  unitSuffix?: string;
}) {
  const t = useT();
  const el = useEnumLabel();

  // Every list is defaulted: the block is additive, so a backend mid-rollout
  // can send `comparison` without `rows`, or `shadow_statistical` without
  // `caps`. A missing list is "nothing to show", never a crash.
  const comparison = risk.comparison ?? null;
  const constraints = risk.binding_constraints ?? [];
  const shadow = risk.shadow_statistical ?? null;
  // The gateway sends `caps` as {health, reason, rows}, not as a bare array.
  // Accept BOTH so a mid-rollout payload of either shape renders.
  const rawCaps = shadow?.caps as
    | StatisticalCap[]
    | { health?: ModelHealth | null; reason?: string | null; rows?: StatisticalCap[] }
    | null
    | undefined;
  const caps: StatisticalCap[] = Array.isArray(rawCaps) ? rawCaps : (rawCaps?.rows ?? []);
  const capsHealth = Array.isArray(rawCaps) ? null : (rawCaps?.health ?? null);
  const capsReason = Array.isArray(rawCaps) ? null : (rawCaps?.reason ?? null);
  // The gateway sends rows as {metric, before_usd, after_usd, delta_usd,
  // before_health, ...} with NO `label`/`unit`, plus a separate `tier0_rows`
  // list keyed on `before_pct`/`after_pct`. Normalise both into the single
  // row vocabulary this table renders, Tier 0 FIRST — the hard limits that
  // actually made the decision are never buried under the shadow rows.
  const rawRows = (comparison?.rows ?? []) as unknown as Record<string, unknown>[];
  const rawTier0 = ((comparison as unknown as { tier0_rows?: Record<string, unknown>[] } | null)
    ?.tier0_rows ?? []) as Record<string, unknown>[];
  // Slugs the server already sent as rows — the synthesised block-level rows
  // below defer to them so no metric is rendered twice when a scalar is
  // promoted to a first-class row on a later backend.
  const wireMetrics = new Set(rawRows.map((r) => String(r.metric ?? "")));
  const rows: RiskComparisonRow[] = [
    ...rawTier0.map((r) => normaliseTier0Row(r, t)),
    ...rawRows.map((r) => normaliseRow(r, t)),
    ...concentrationRows(comparison, t, wireMetrics),
  ];

  // Absent block AND no constraints AND no shadow verdict = a pre-Phase-C
  // payload. Render nothing rather than a shell.
  if (comparison == null && constraints.length === 0 && shadow == null) return null;

  // The gateway does not put `mode` on the comparison block; the statistical
  // limits carry it. Fall back through both before the SHADOW default so a
  // future PRODUCTION promotion changes the badge on its own.
  const mode =
    comparison?.mode ??
    (shadow?.limits as { mode?: string } | null | undefined)?.mode ??
    "SHADOW";
  const hypothetical = shadow?.hypothetical ?? null;
  // The comparison is evaluated at ONE quantity — the Tier 0 approved one.
  const evaluatedAt = comparison?.quantity ?? risk.approved_quantity ?? null;

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 style={{ marginBottom: 0 }}>
          {t("Current vs after trade", "交易前 vs 交易后")}{" "}
          {/* Server-sent mode, not a UI constant (§70). */}
          <Term k="shadow_mode">
            <span className="badge amber">{mode}</span>
          </Term>
        </h2>
        <span style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
          {evaluatedAt == null
            ? null
            : t(
                `evaluated at ${evaluatedAt.toLocaleString()}${unitSuffix}`,
                `按 ${evaluatedAt.toLocaleString()}${unitSuffix} 计算`,
              )}
        </span>
      </div>

      {/* §47 — requested vs approved vs the hypothetical statistical size,
          side by side so the SHADOW number can never be mistaken for the
          one that will be traded. */}
      <div className="kv" style={{ margin: "12px 0" }}>
        <div>
          <div className="k">{t("Requested", "请求数量")}</div>
          <div className="v">
            {quantityRequested == null
              ? t("auto", "自动")
              : `${quantityRequested.toLocaleString()}${unitSuffix}`}
          </div>
        </div>
        <div>
          <div className="k">{t("Approved (Tier 0)", "批准数量（Tier 0）")}</div>
          <div className="v">
            {risk.approved_quantity == null ? (
              DASH
            ) : (
              <>
                {risk.approved_quantity.toLocaleString()}
                {unitSuffix}
              </>
            )}
          </div>
        </div>
        <div>
          <div className="k">
            {t("Hypothetical (statistical)", "假设数量（统计层）")}{" "}
            <span className="badge amber">{mode}</span>
          </div>
          <div className="v">
            {hypothetical == null ? (
              DASH
            ) : (
              <>
                {hypothetical.quantity.toLocaleString()}
                {unitSuffix}{" "}
                <span className="badge dim">{el(hypothetical.decision)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Metric", "指标")}</th>
                <th className="num">{t("Current", "当前")}</th>
                <th className="num">{t("After trade", "交易后")}</th>
                <th className="num">{t("Δ", "变化")}</th>
                <th>{t("Note", "说明")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ComparisonRow key={row.metric} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty" style={{ padding: 12 }}>
          {/* Comparison-level honest null: the server's own reason, verbatim. */}
          {comparison?.reason ??
            t(
              "No before/after comparison was produced for this trade.",
              "本次交易未生成交易前后对比。",
            )}
        </p>
      )}

      {/* Comparison-level health sits BELOW the table it qualifies. */}
      {comparison?.health != null && comparison.health !== "ACTIVE" && (
        <p style={{ marginTop: 8, fontSize: 12 }}>
          <span className={`badge ${MODEL_HEALTH_BADGE[comparison.health]}`}>
            {el(comparison.health)}
          </span>{" "}
          {comparison.reason && (
            <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {comparison.reason}
            </span>
          )}
        </p>
      )}

      <BindingConstraints constraints={constraints} caps={caps} />

      {/* Caps that did NOT bind are still shown: a limit measured and passed
          is information, and hiding it would make the layer look inactive. */}
      {caps.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <h3 style={{ fontSize: 13, marginBottom: 6 }}>
            {t("Hypothetical statistical caps", "假设的统计层上限")}{" "}
            <span className="badge amber">{mode}</span>
          </h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Code", "代码")}</th>
                  <th>{t("Layer", "层级")}</th>
                  <th className="num">{t("Cap qty", "上限数量")}</th>
                  <th>{t("Why", "原因")}</th>
                </tr>
              </thead>
              <tbody>
                {caps.map((c) => (
                  <tr key={c.code}>
                    <td style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                      {c.code}
                    </td>
                    <td>
                      <span className="badge amber">{c.layer}</span>
                    </td>
                    <td className="num">{c.cap_qty.toLocaleString()}</td>
                    {/* §47 sentence with the real numbers, verbatim. */}
                    <td style={{ fontSize: 12 }}>{c.sentence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/*
        §36/§37/§59 sizing-v2 — SHADOW. The three modifiers the PRODUCTION
        budget does not compose, and the budget they WOULD have produced.
        Rendered only when the backend sends the block (additive); every
        field is nullable and a missing one shows an em dash, because a
        modifier that could not be computed is held at 1.0 internally and
        printing "1.00" here would read as "this input said everything is
        fine" — the one thing an absent input must never claim.
      */}
      {shadow?.sizing_v2 && <SizingV2Shadow s={shadow.sizing_v2} />}

      {/* Shadow-layer raise: reported, never swallowed. */}
      {shadow?.note && (
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--amber)" }}>{shadow.note}</p>
      )}

      <p style={{ marginTop: 12, fontSize: 11, color: "var(--text-dim)" }}>
        {t(
          "SHADOW: statistical layer does not alter decisions yet.",
          "影子模式：统计层目前不会改变任何决策。",
        )}
      </p>
    </div>
  );
}

/** A modifier is a plain multiplier in (0, 1] — 2 decimals, dash when absent. */
function fmtMod(v: number | null | undefined): string {
  return v == null ? "—" : `${v.toFixed(2)}×`;
}

/** A budget/floor is a FRACTION of NAV — shown as a percentage. */
function fmtPctNav(v: number | null | undefined): string {
  return v == null ? "—" : `${(v * 100).toFixed(2)}%`;
}

/**
 * §36/§37/§59 sizing-v2 SHADOW block.
 *
 * The compliance audit calls the missing model-risk budget effect "the most
 * consequential gap in the programme": the 20-day shadow window was logging
 * a hypothetical quantity that model risk provably could not move. This
 * block is that effect made visible — and it is badged SHADOW precisely
 * because it still moves nothing.
 */
function SizingV2Shadow({ s }: { s: ShadowSizingV2 }) {
  const t = useT();
  const notes = s.notes ?? [];
  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 12px",
      }}
    >
      <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>
          {t("Sizing v2 (hypothetical)", "仓位模型 v2（假设）")}
        </strong>
        <span className="badge amber">SHADOW</span>
      </div>

      <p style={{ marginTop: 6, fontSize: 12, fontFamily: "var(--font-mono)" }}>
        {t(
          `ES ${fmtMod(s.es_modifier)} · correlation ${fmtMod(s.correlation_modifier)} · model health ${fmtMod(s.model_health_modifier)}`,
          `ES ${fmtMod(s.es_modifier)} · 相关性 ${fmtMod(s.correlation_modifier)} · 模型健康度 ${fmtMod(s.model_health_modifier)}`,
        )}
      </p>

      <p style={{ marginTop: 4, fontSize: 12, fontFamily: "var(--font-mono)" }}>
        {t(
          `budget used ${fmtPctNav(s.budget_pct_used)} → candidate ${fmtPctNav(s.candidate_budget_pct)}`,
          `实际预算 ${fmtPctNav(s.budget_pct_used)} → 假设预算 ${fmtPctNav(s.candidate_budget_pct)}`,
        )}
        {s.budget_delta_pct != null && (
          <span style={{ color: s.budget_delta_pct < 0 ? "var(--amber)" : "var(--text-dim)" }}>
            {` (${s.budget_delta_pct > 0 ? "+" : "−"}${Math.abs(s.budget_delta_pct * 100).toFixed(2)}pp)`}
          </span>
        )}
      </p>

      <p style={{ marginTop: 4, fontSize: 12, fontFamily: "var(--font-mono)" }}>
        {t(
          `cash floor ${fmtPctNav(s.regime_floor_pct)} → ${fmtPctNav(s.risk_linked_cash_floor_pct)}`,
          `现金下限 ${fmtPctNav(s.regime_floor_pct)} → ${fmtPctNav(s.risk_linked_cash_floor_pct)}`,
        )}
        {s.risk_linked_cash_floor_binds === true && (
          <span className="badge amber" style={{ marginLeft: 6 }}>
            {t("would bind", "将触发")}
          </span>
        )}
      </p>

      {/* Honest nulls, loud: the server's own strings, verbatim. */}
      {s.reason && (
        <p style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)" }}>{s.reason}</p>
      )}
      {notes.length > 0 && (
        <ul className="why-list" style={{ marginTop: 6 }}>
          {notes.map((n, i) => (
            <li key={i} style={{ fontSize: 11 }}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
