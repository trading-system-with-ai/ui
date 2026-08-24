"use client";

/**
 * Phase D stress engine — SHADOW (spec §21–§27, §51; design doc §8.6).
 *
 * §51's scenario table: what the CURRENT book would lose if a specific,
 * NAMED shock happened right now. Unlike VaR this asks nothing about
 * probability — it fixes a state (equity −10 %, IV × 1.40, five days on) and
 * reprices the whole book under it.
 *
 * Nothing here decides. Spec §27 gives the stress test veto authority in
 * PRODUCTION; in Phase D the STRESS cap is hypothetical, so the panel says
 * SHADOW on screen rather than only in a comment.
 *
 * The rules this file follows, in order of how easy they are to break:
 *  1. Signs are the SERVER's. `pnl_usd` is gain-positive (a loss is
 *     NEGATIVE); `loss_usd` restates the same number in the VaR/ES sign
 *     (positive = money lost). The server sends BOTH — this file never
 *     negates one to obtain the other.
 *  2. Honest nulls — an UNAVAILABLE row shows an em dash plus its own server
 *     `reason` (which carries the real window dates), never a 0.
 *  3. `validated: false` ALWAYS carries the UNVALIDATED badge: the whole
 *     hypothetical grid is a research parameterisation (§11 — no silent
 *     production thresholds), and so is every user scenario.
 *  4. Method coverage travels with the number: "3 FULL_REVAL / 1
 *     DELTA_LINEAR" says how much of the P&L is a real reprice and how much
 *     is the convexity-blind fallback (§22).
 *  5. Server strings render VERBATIM (§26/§36); enum tokens go through
 *     useEnumLabel; `*_pct` fields are FRACTIONS.
 *  6. No native dialogs (§47) — the user-scenario form reports every error
 *     inline, including the server's own 422 text.
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
import { fmtPct, fmtUsd } from "@/lib/risk-format";
import type { StressBlock, StressKind, StressRow } from "@/lib/types";

/* ---------------------------------------------------------------- helpers */

const DASH = <span style={{ color: "var(--text-dim)" }}>—</span>;

/**
 * Badge class per scenario kind. HISTORICAL is accent (it happened);
 * HYPOTHETICAL / IV_GRID are amber (a parameterisation, not an observation);
 * USER is dim (the user's own hypothesis, not the platform's).
 */
const KIND_BADGE: Record<StressKind, "accent" | "amber" | "dim"> = {
  HISTORICAL: "accent",
  HYPOTHETICAL: "amber",
  IV_GRID: "amber",
  USER: "dim",
};

/**
 * Scenario KINDS get their own vocabulary instead of the shared enum table:
 * "HISTORICAL" already means the VaR estimator family there ("历史法"), and
 * one token cannot mean two things in a total 1:1 table — lib/i18n-labels.ts
 * says exactly that at the point it omits these.
 */
const KIND_ZH: Record<StressKind, string> = {
  HISTORICAL: "历史情景",
  HYPOTHETICAL: "假设情景",
  IV_GRID: "波动率网格",
  USER: "用户自定义",
};

/**
 * The client-side mirror of the server's documented ranges (design §8.5).
 * Mirroring them warns the user BEFORE the round trip; it never replaces the
 * server check, which still answers 422 and whose text is shown verbatim.
 * Equity and IV are FRACTIONS on the wire — the form takes percent.
 */
export const STRESS_RANGES = {
  equity_shock: { min: -0.9, max: 2 },
  iv_shock: { min: -0.9, max: 5 },
  days_forward: { min: 0, max: 365 },
} as const;

/**
 * Colour a P&L by SIGN, not magnitude: a loss is red, a gain green, exactly
 * zero neutral. A scenario with no number is neutral too — an em dash must
 * never be coloured as though it were a result.
 */
function pnlColor(pnl: number | null | undefined): string {
  if (pnl == null || pnl === 0) return "var(--text-dim)";
  return pnl < 0 ? "var(--red)" : "var(--green)";
}

/**
 * "3 FULL_REVAL / 1 DELTA_LINEAR" — every method the row used, keyed as the
 * server keyed it, so a method added later still renders. Zero counts are
 * dropped ("0 DELTA_LINEAR" is noise) and an empty map (a stock-only book
 * has no option leg to price) yields no entries at all.
 */
function coverageEntries(
  coverage: StressRow["method_coverage"] | null | undefined,
): [string, number][] {
  if (coverage == null) return [];
  return Object.entries(coverage).filter(
    ([, n]) => typeof n === "number" && n > 0,
  );
}

/** The one-line SHADOW disclaimer, shared by the panel and the form. */
function useShadowNote(): string {
  const t = useT();
  return t(
    "SHADOW — stress results are computed, persisted and displayed; they alter no trading decision yet.",
    "影子模式 — 压力测试结果会被计算、持久化并展示；目前不会改变任何交易决策。",
  );
}

/* ---------------------------------------------------------------- rows */

function MethodCoverage({ row }: { row: StressRow }) {
  const el = useEnumLabel();
  const entries = coverageEntries(row.method_coverage);
  if (entries.length === 0) return DASH;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {entries.map(([method, n], i) => (
        <span key={method}>
          {i > 0 ? " / " : ""}
          {n} <span className="badge dim">{el(method)}</span>
        </span>
      ))}
    </span>
  );
}

function ScenarioRow({
  row,
  isWorst,
}: {
  row: StressRow;
  /** The SERVER picked the worst row; it is never recomputed here. */
  isWorst: boolean;
}) {
  const t = useT();
  const el = useEnumLabel();
  const { lang } = useLang();
  return (
    <tr
      // The worst row is highlighted, never reordered: the catalogue order
      // (named windows, AUTO windows, then the research grid) is the
      // server's and stays readable.
      style={
        isWorst
          ? { background: "rgba(248, 81, 73, 0.08)", fontWeight: 600 }
          : undefined
      }
      data-worst={isWorst ? "true" : undefined}
    >
      <td style={{ minWidth: 200 }}>
        {/* Scenario name — server-worded, verbatim (§26/§36). */}
        {row.name}
        {isWorst && (
          <span className="badge red" style={{ marginLeft: 6 }}>
            {t("WORST", "最差情景")}
          </span>
        )}
      </td>
      <td>
        <span className={`badge ${KIND_BADGE[row.kind] ?? "dim"}`}>
          {lang === "zh" ? (KIND_ZH[row.kind] ?? row.kind) : row.kind}
        </span>
        {/* §11 — a research parameterisation never passes as a measured one. */}
        {!row.validated && (
          <span className="badge amber" style={{ marginLeft: 6 }}>
            {t("UNVALIDATED", "未验证")}
          </span>
        )}
      </td>
      <td className="num" style={{ color: pnlColor(row.pnl_usd) }}>
        {row.pnl_usd == null ? DASH : fmtUsd(row.pnl_usd)}
      </td>
      <td className="num" style={{ color: pnlColor(row.pnl_usd) }}>
        {row.pnl_pct_nav == null ? DASH : fmtPct(row.pnl_pct_nav, 2)}
      </td>
      <td>
        <MethodCoverage row={row} />
      </td>
      <td>
        <span className={`badge ${MODEL_HEALTH_BADGE[row.health]}`}>
          {el(row.health)}
        </span>
        {/* The row's own reason, verbatim — for an UNAVAILABLE window it
            carries the real dates, which is the ONLY explanation for the
            em dash to its left. */}
        {row.reason && (
          <span
            style={{
              color: "var(--text-dim)",
              fontSize: 11,
              marginLeft: 6,
              fontFamily: "var(--font-mono)",
            }}
          >
            {row.reason}
          </span>
        )}
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------- form */

/**
 * §26/§51 — the user-defined hypothetical. Equity and IV are entered in
 * PERCENT and converted to the fractions the API takes; IV is RELATIVE and
 * multiplicative (+40 % ⇒ iv1 = iv0 × 1.40, NOT "+40 vol points"), which the
 * field says out loud because the two readings differ by an order of
 * magnitude on a 20-vol option.
 */
function UserScenarioForm({
  onRan,
}: {
  /** Called with the fresh row so the panel can show it without a refetch. */
  onRan: (row: StressRow) => void;
}) {
  const t = useT();
  const shadowNote = useShadowNote();
  const [equityPct, setEquityPct] = useState("-10");
  const [ivPct, setIvPct] = useState("40");
  const [days, setDays] = useState("0");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /**
   * §26 per-ticker shock OVERRIDES. Held as an ordered list of draft pairs
   * rather than an object so a half-typed row (a ticker with no percent yet)
   * is a legal editing state instead of an invalid request — the list is
   * folded into the wire map only at submit, and only from complete rows.
   *
   * `id` exists purely as a stable React key: two rows can legitimately hold
   * the same ticker while the user is retyping one of them, and keying on the
   * ticker would make them collide mid-edit.
   */
  const [shockRows, setShockRows] = useState<
    { id: number; ticker: string; pct: string }[]
  >([]);
  const [nextRowId, setNextRowId] = useState(1);

  /** Client mirror of the server ranges — a warning BEFORE the round trip,
   *  never instead of it (the server still validates and its 422 text wins). */
  function validate(): {
    equity: number;
    iv: number;
    d: number;
    byTicker: Record<string, number>;
  } | null {
    const found: string[] = [];
    const equityRaw = Number(equityPct);
    const ivRaw = Number(ivPct);
    const dRaw = Number(days);
    if (!Number.isFinite(equityRaw)) {
      found.push(t("Equity shock must be a number.", "股价冲击必须是数字。"));
    }
    if (!Number.isFinite(ivRaw)) {
      found.push(t("IV shock must be a number.", "IV 冲击必须是数字。"));
    }
    if (!Number.isInteger(dRaw)) {
      found.push(t("Days forward must be a whole number.", "时间推进天数必须是整数。"));
    }
    const equity = equityRaw / 100;
    const iv = ivRaw / 100;
    if (
      Number.isFinite(equityRaw) &&
      (equity < STRESS_RANGES.equity_shock.min || equity > STRESS_RANGES.equity_shock.max)
    ) {
      found.push(
        t(
          `Equity shock must be between ${STRESS_RANGES.equity_shock.min * 100}% and ${STRESS_RANGES.equity_shock.max * 100}%.`,
          `股价冲击必须介于 ${STRESS_RANGES.equity_shock.min * 100}% 与 ${STRESS_RANGES.equity_shock.max * 100}% 之间。`,
        ),
      );
    }
    if (
      Number.isFinite(ivRaw) &&
      (iv < STRESS_RANGES.iv_shock.min || iv > STRESS_RANGES.iv_shock.max)
    ) {
      found.push(
        t(
          `IV shock must be between ${STRESS_RANGES.iv_shock.min * 100}% and ${STRESS_RANGES.iv_shock.max * 100}%.`,
          `IV 冲击必须介于 ${STRESS_RANGES.iv_shock.min * 100}% 与 ${STRESS_RANGES.iv_shock.max * 100}% 之间。`,
        ),
      );
    }
    if (
      Number.isInteger(dRaw) &&
      (dRaw < STRESS_RANGES.days_forward.min || dRaw > STRESS_RANGES.days_forward.max)
    ) {
      found.push(
        t(
          `Days forward must be between ${STRESS_RANGES.days_forward.min} and ${STRESS_RANGES.days_forward.max}.`,
          `时间推进天数必须介于 ${STRESS_RANGES.days_forward.min} 与 ${STRESS_RANGES.days_forward.max} 之间。`,
        ),
      );
    }
    // §26 per-ticker overrides. Mirrors the SERVER's rules exactly — the same
    // range as the uniform shock, one entry per ticker — so the user is told
    // before a round trip, never instead of one. A row left entirely blank is
    // an editing artefact and is dropped silently; a row with ONE half filled
    // in is an error, because dropping it would silently discard a shock the
    // user meant to apply.
    const byTicker: Record<string, number> = {};
    const seen = new Set<string>();
    for (const row of shockRows) {
      const ticker = row.ticker.trim().toUpperCase();
      const pctText = row.pct.trim();
      if (ticker === "" && pctText === "") continue;
      if (ticker === "") {
        found.push(
          t(
            `Per-ticker shock of ${pctText}% has no ticker.`,
            `${pctText}% 的个股冲击未填写代码。`,
          ),
        );
        continue;
      }
      if (pctText === "") {
        found.push(
          t(`Per-ticker shock for ${ticker} has no percent.`, `${ticker} 的个股冲击未填写百分比。`),
        );
        continue;
      }
      if (seen.has(ticker)) {
        found.push(
          t(
            `${ticker} is listed twice — one shock per ticker.`,
            `${ticker} 重复出现 — 每个代码只能设置一个冲击。`,
          ),
        );
        continue;
      }
      const raw = Number(pctText);
      if (!Number.isFinite(raw)) {
        found.push(
          t(`Shock for ${ticker} must be a number.`, `${ticker} 的冲击必须是数字。`),
        );
        continue;
      }
      const frac = raw / 100;
      if (
        frac < STRESS_RANGES.equity_shock.min ||
        frac > STRESS_RANGES.equity_shock.max
      ) {
        found.push(
          t(
            `Shock for ${ticker} must be between ${STRESS_RANGES.equity_shock.min * 100}% and ${STRESS_RANGES.equity_shock.max * 100}%.`,
            `${ticker} 的冲击必须介于 ${STRESS_RANGES.equity_shock.min * 100}% 与 ${STRESS_RANGES.equity_shock.max * 100}% 之间。`,
          ),
        );
        continue;
      }
      seen.add(ticker);
      byTicker[ticker] = frac;
    }

    setErrors(found);
    if (found.length > 0) return null;
    return { equity, iv, d: dRaw, byTicker };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = validate();
    if (ok == null) return;
    setBusy(true);
    try {
      const res = await api.risk.stressRun({
        equity_shock: ok.equity,
        iv_shock: ok.iv,
        days_forward: ok.d,
        ...(name.trim() ? { name: name.trim() } : {}),
        // §26 — the key is OMITTED, not sent as {}, when the user added no
        // overrides: an empty map and an absent key mean the same scenario,
        // and a backend that predates the field would reject the former while
        // happily running the latter.
        ...(Object.keys(ok.byTicker).length > 0
          ? { spot_shock_by_ticker: ok.byTicker }
          : {}),
      });
      // The endpoint wraps the row in the book context that produced it —
      // the P&L lives under `scenario`, never on the response itself.
      onRan(res.scenario);
      setErrors([]);
    } catch (err) {
      // §47: no native dialog. The server's own message (a 422 names the
      // field) renders verbatim inside the form.
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = { width: 110, fontSize: 13, padding: "6px 8px" } as const;

  return (
    <form onSubmit={submit} style={{ marginTop: 14 }}>
      <h3 style={{ fontSize: 13, marginBottom: 6 }}>
        {t("Run your own scenario", "运行自定义情景")}{" "}
        <span className="badge amber">SHADOW</span>
      </h3>
      <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "0 0 8px" }}>
        {t(
          "A read of the current book under a hypothesis you supply: it places nothing and decides nothing. The equity move is applied UNIFORMLY to every underlying (a beta = 1 assumption, stated on the result row). The IV move is RELATIVE — +40% means IV × 1.40, not +40 vol points.",
          "这是按你给定的假设对当前持仓做一次读取：不下单、不决策。股价冲击对每个标的均匀施加（beta = 1 假设，会在结果行中标明）。IV 冲击是相对变动 — +40% 表示 IV × 1.40，而不是 +40 个波动率点。",
        )}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span>{t("Equity shock (%)", "股价冲击 (%)")}</span>
          <input
            type="number"
            step="0.1"
            value={equityPct}
            aria-label={t("Equity shock in percent", "股价冲击（百分比）")}
            onChange={(e) => setEquityPct(e.target.value)}
            style={fieldStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span>{t("IV shock (% relative)", "IV 冲击（相对 %）")}</span>
          <input
            type="number"
            step="1"
            value={ivPct}
            aria-label={t("IV shock in relative percent", "IV 冲击（相对百分比）")}
            onChange={(e) => setIvPct(e.target.value)}
            style={fieldStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span>{t("Days forward", "时间推进（天）")}</span>
          <input
            type="number"
            step="1"
            value={days}
            aria-label={t("Days forward", "时间推进天数")}
            onChange={(e) => setDays(e.target.value)}
            style={fieldStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span>{t("Name (optional)", "名称（可选）")}</span>
          <input
            type="text"
            value={name}
            aria-label={t("Scenario name", "情景名称")}
            onChange={(e) => setName(e.target.value)}
            // The global ticker-style uppercase transform must not mangle a
            // free-text label.
            style={{ ...fieldStyle, width: 200, textTransform: "none" }}
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? t("Running…", "运行中…") : t("Run scenario", "运行情景")}
        </button>
      </div>

      {/* §26 — per-ticker overrides, so "SPY −5% / QQQ −8%" is expressible
          instead of one uniform β = 1 move. Optional by construction: with no
          rows added the request is byte-identical to the uniform one it was
          before, which is what keeps this additive on an older backend. */}
      <div style={{ marginTop: 12 }}>
        <h4 style={{ fontSize: 12, margin: "0 0 4px", fontWeight: 600 }}>
          {t("Per-ticker shocks (optional)", "个股冲击（可选）")}
        </h4>
        <p style={{ color: "var(--text-dim)", fontSize: 11, margin: "0 0 8px" }}>
          {t(
            "A ticker listed here uses its own equity shock; every other underlying keeps the uniform one above. This relaxes the beta = 1 assumption for the names you name — it does not replace the uniform move, which still applies to the rest of the book.",
            "在此列出的代码会使用它自己的股价冲击；其余标的仍沿用上方的统一冲击。这只是针对你指定的标的放宽 beta = 1 的假设 — 它不会取代统一冲击，后者依旧适用于持仓中的其他标的。",
          )}
        </p>
        {shockRows.map((row) => (
          <div
            key={row.id}
            style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}
          >
            <input
              type="text"
              value={row.ticker}
              aria-label={t("Ticker for per-ticker shock", "个股冲击的标的代码")}
              placeholder={t("Ticker", "代码")}
              onChange={(e) =>
                setShockRows((prev) =>
                  prev.map((r) =>
                    // Uppercased on entry so the client-side duplicate check
                    // and the server see the same key the user sees.
                    r.id === row.id ? { ...r, ticker: e.target.value.toUpperCase() } : r,
                  ),
                )
              }
              style={{ ...fieldStyle, width: 100 }}
            />
            <input
              type="number"
              step="0.1"
              value={row.pct}
              aria-label={t("Shock percent for this ticker", "该标的的冲击百分比")}
              placeholder="%"
              onChange={(e) =>
                setShockRows((prev) =>
                  prev.map((r) => (r.id === row.id ? { ...r, pct: e.target.value } : r)),
                )
              }
              style={{ ...fieldStyle, width: 90 }}
            />
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>%</span>
            <button
              type="button"
              onClick={() => setShockRows((prev) => prev.filter((r) => r.id !== row.id))}
              aria-label={t(
                `Remove per-ticker shock ${row.ticker || "row"}`,
                `移除个股冲击 ${row.ticker || "行"}`,
              )}
            >
              {t("Remove", "移除")}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setShockRows((prev) => [...prev, { id: nextRowId, ticker: "", pct: "" }]);
            setNextRowId((n) => n + 1);
          }}
        >
          {t("+ Add ticker shock", "+ 添加个股冲击")}
        </button>
      </div>

      {/* §47 — errors are shown inline, never through a native dialog. The
          server's 422 text is one of these strings and renders verbatim. */}
      {errors.length > 0 && (
        <ul className="why-list" style={{ marginTop: 8, color: "var(--red)" }}>
          {errors.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>{shadowNote}</p>
    </form>
  );
}

/* ---------------------------------------------------------------- panel */

/**
 * §51 "Stress Scenarios". Renders the server's catalogue in the server's
 * order, highlights the server's worst row, and appends any scenario the
 * user runs on this page below the catalogue (clearly separated — a USER
 * hypothesis is not part of the platform's catalogue).
 */
export default function StressScenarios({
  stress,
  asOf,
}: {
  stress: StressBlock;
  /**
   * §50 — the snapshot timestamp for the methodology card's "Last updated"
   * field. The stress block carries no `as_of` of its own (it is built inside
   * the statistical snapshot), so the caller passes the snapshot's. Optional:
   * an absent value renders an em dash rather than today's date, which would
   * claim a freshness the panel cannot verify.
   */
  asOf?: string | null;
}) {
  const t = useT();
  const el = useEnumLabel();
  const shadowNote = useShadowNote();
  // Rows the user ran in THIS session. They are appended, never merged into
  // the catalogue: the catalogue is versioned and comparable across builds,
  // a user hypothesis is neither.
  const [userRows, setUserRows] = useState<StressRow[]>([]);
  // §50 — the methodology card this panel was missing. Its provenance is the
  // block's own (catalogue version, model version, leg counts, health), not a
  // borrowed statistical window: a stress result is one repricing of one
  // book, and quoting the VaR sample here would be a fabricated lineage.
  const [openMethod, setOpenMethod] = useState(false);

  const worstName = stress.worst?.name ?? null;
  const mode = stress.mode ?? "SHADOW";
  const rows = stress.rows ?? [];
  const excluded = stress.positions_excluded ?? [];

  // §50 provenance rows specific to a stress run. Every value comes off the
  // block; a field the server did not send stays null and renders as an em
  // dash — the modal never substitutes a plausible number.
  const methodFields: MethodField[] = [
    { label: t("Catalogue version", "情景目录版本"), value: stress.catalogue_version },
    { label: t("Scenarios in catalogue", "目录中的情景数"), value: rows.length },
    {
      label: t("Scenarios priced", "已定价情景数"),
      value: rows.filter((r) => r.pnl_usd != null).length,
    },
    { label: t("Stock legs", "股票腿"), value: stress.n_stock_legs ?? null },
    { label: t("Option legs", "期权腿"), value: stress.n_option_legs ?? null },
    {
      label: t("Positions with no stress leg", "无压力测试腿的持仓数"),
      value: excluded.length,
    },
    { label: t("Worst scenario", "最差情景"), value: stress.worst?.name ?? null },
  ];

  // The WORST row's pricing quality — the headline number's own provenance.
  // "3 FULL_REVAL / 1 DELTA_LINEAR" says how much of that loss is a real
  // reprice and how much is the convexity-blind fallback (§22).
  const worstCoverage = coverageEntries(
    stress.method_coverage ?? stress.worst?.method_coverage,
  );
  const coverageDiagnostics: MethodField[] = [
    {
      label: t("Worst-row method coverage", "最差情景的定价方法覆盖"),
      value:
        worstCoverage.length === 0
          ? null
          : worstCoverage.map(([m, n]) => `${n} ${m}`).join(" / "),
    },
    {
      label: t("Worst-row parameterisation", "最差情景的参数化"),
      value:
        stress.worst == null
          ? null
          : stress.worst.validated
            ? t("validated against data", "已对照数据验证")
            : t("UNVALIDATED — research default", "未验证 — 研究默认值"),
    },
    {
      label: t("Unvalidated rows", "未验证的情景行数"),
      value: rows.filter((r) => !r.validated).length,
    },
    {
      label: t("Rows the catalogue could not run", "无法运行的情景行数"),
      value: rows.filter((r) => r.pnl_usd == null).length,
    },
  ];

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 style={{ marginBottom: 0 }}>
          <Term k="stress_test">{t("Stress Scenarios", "压力情景")}</Term>{" "}
          {/* Server-sent mode, not a UI constant (§70). */}
          <Term k="shadow_mode">
            <span className="badge amber">{mode}</span>
          </Term>
          {/* §5 — nothing renders when the server sent no tier. */}
          <ModelTierChip tier={stress.tier} compact />
        </h2>
        <span style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
          {t(
            `catalogue ${stress.catalogue_version}${stress.model_version ? ` · model ${stress.model_version}` : ""} · ${stress.n_stock_legs ?? 0} stock / ${stress.n_option_legs ?? 0} option legs`,
            `情景目录 ${stress.catalogue_version}${stress.model_version ? ` · 模型 ${stress.model_version}` : ""} · ${stress.n_stock_legs ?? 0} 条股票腿 / ${stress.n_option_legs ?? 0} 条期权腿`,
          )}
        </span>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "8px 0 12px" }}>
        {t(
          "What this exact book would be worth if a named shock happened right now — no probability is claimed. Option legs are repriced in full (spot, IV and time all move); a leg with no usable IV falls back to DELTA_LINEAR and the row says so, because that fallback understates convexity in exactly the tail being probed.",
          "如果某个具名冲击此刻发生，这套持仓会值多少 — 这里不对概率作任何声明。期权腿采用全额重估（现价、IV 与剩余期限同时变动）；没有可用 IV 的腿会退回 DELTA_LINEAR 并在该行标明，因为这种退化恰恰会低估所探测尾部中的凸性。",
        )}
      </p>

      {/* Run-level health first — it qualifies every row below it. Note the
          server's rule: this is the worst health among rows that PRICED, so
          an out-of-history window is one UNAVAILABLE row, not a failed run. */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span className={`badge ${MODEL_HEALTH_BADGE[stress.health]}`}>{el(stress.health)}</span>
        {stress.reason && (
          <span
            style={{ color: "var(--amber)", fontSize: 12, fontFamily: "var(--font-mono)" }}
          >
            {/* Verbatim server reason. */}
            {stress.reason}
          </span>
        )}
      </div>

      {rows.length > 0 || userRows.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Scenario", "情景")}</th>
                <th>{t("Kind", "类型")}</th>
                <th className="num">{t("P&L", "盈亏")}</th>
                <th className="num">{t("% NAV", "占 NAV")}</th>
                <th>
                  <Term k="full_revaluation">{t("Method coverage", "定价方法覆盖")}</Term>
                </th>
                <th>{t("Health", "健康度")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <ScenarioRow
                  key={`catalogue-${row.name}-${i}`}
                  row={row}
                  // Match by NAME against the server's own worst row: the
                  // comparison is never a client-side min() over pnl_usd.
                  isWorst={worstName != null && row.name === worstName}
                />
              ))}
              {userRows.length > 0 && (
                <tr>
                  <td colSpan={6} style={{ color: "var(--text-dim)", fontSize: 11 }}>
                    {t(
                      "Scenarios you ran on this page (persisted for history; not part of the versioned catalogue)",
                      "你在本页运行的情景（会持久化以保留历史；不属于带版本的情景目录）",
                    )}
                  </td>
                </tr>
              )}
              {userRows.map((row, i) => (
                <ScenarioRow key={`user-${i}-${row.name}`} row={row} isWorst={false} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          {/* Honest empty state: the server's own reason when it sent one. */}
          {stress.reason ??
            t(
              "No stress scenarios were produced for this book.",
              "该持仓组合未产出任何压力情景。",
            )}
        </p>
      )}

      {/* The headline number's own pricing quality, lifted from the worst row. */}
      {stress.worst != null && (
        <p style={{ marginTop: 10, fontSize: 12, fontFamily: "var(--font-mono)" }}>
          {t("Worst scenario", "最差情景")}:{" "}
          {/* Server-worded name, verbatim. */}
          <span style={{ fontWeight: 700 }}>{stress.worst.name}</span>{" "}
          <span style={{ color: pnlColor(stress.worst.pnl_usd) }}>
            {stress.worst.pnl_usd == null ? "—" : fmtUsd(stress.worst.pnl_usd)}
            {stress.worst.pnl_pct_nav == null
              ? ""
              : ` (${fmtPct(stress.worst.pnl_pct_nav, 2)})`}
          </span>{" "}
          <span style={{ color: "var(--text-dim)" }}>
            {t(
              `loss ${stress.worst.loss_usd == null ? "—" : fmtUsd(stress.worst.loss_usd)} in the VaR/ES sign`,
              `按 VaR/ES 符号表示的亏损 ${stress.worst.loss_usd == null ? "—" : fmtUsd(stress.worst.loss_usd)}`,
            )}
          </span>
        </p>
      )}

      {/* The STRESS view's OWN gap list — never merged with the statistical
          block's, because a position can be in one view and out of the other. */}
      {excluded.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ fontSize: 13, marginBottom: 6 }}>
            {t("Positions with no stress leg", "无压力测试腿的持仓")}
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
                {excluded.map((p) => (
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

      {/* §50 — the same "ⓘ How is this calculated?" affordance every other
          risk number carries. It sits above the form so the methodology is
          readable BEFORE the user parameterises a scenario of their own. */}
      <button type="button" className="method-info" onClick={() => setOpenMethod(true)}>
        {t("ⓘ How is this calculated?", "ⓘ 该指标如何计算？")}
      </button>

      <UserScenarioForm onRan={(row) => setUserRows((prev) => [...prev, row])} />

      <p style={{ marginTop: 12, fontSize: 11, color: "var(--text-dim)" }}>{shadowNote}</p>

      {openMethod && (
        <RiskMethodModal
          metric={t("Stress scenarios", "压力情景")}
          model={t("Scenario revaluation catalogue", "情景重估目录")}
          modelVersion={stress.model_version}
          /* A stress result carries NO confidence and NO horizon: it fixes a
             state instead of estimating a distribution. Nulls here are the
             honest answer, and the modal renders them as em dashes. */
          confidence={null}
          horizonDays={null}
          sampleSize={null}
          distribution={null}
          asOf={asOf ?? null}
          dataSource={t(
            "stock_bars_daily closes + option chain (spot, IV, expiry) at the snapshot",
            "快照时点的 stock_bars_daily 收盘价 + 期权链（现价、IV、到期日）",
          )}
          health={stress.health}
          healthReason={stress.reason ?? null}
          formula={t(
            "Each scenario fixes a state — spot S₀→S₁, implied vol IV₀→IV₁ and time t₀→t₁ all move together — and reprices the whole book under it. P&L = Price₁ − Price₀ per leg, summed. No probability is claimed: this asks what a NAMED shock costs, not how likely it is. HISTORICAL rows take their shocks from a real stored window; the hypothetical grid is a research parameterisation and every row carries UNVALIDATED.",
            "每个情景固定一组状态 — 现价 S₀→S₁、隐含波动率 IV₀→IV₁、时间 t₀→t₁ 同时变动 — 并据此对整个持仓组合重新定价。逐腿计算 盈亏 = 价格₁ − 价格₀ 后求和。这里不作任何概率声明：它回答的是「某个具名冲击代价多大」，而不是「它有多可能发生」。历史情景的冲击取自真实的历史窗口；假设情景网格属于研究参数化，每一行都标注 UNVALIDATED（未验证）。",
          )}
          extraFields={methodFields}
          diagnostics={coverageDiagnostics}
          note={shadowNote}
          onClose={() => setOpenMethod(false)}
        />
      )}
    </div>
  );
}
