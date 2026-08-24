"use client";

/**
 * Display vocabulary for the Phase G macro tab.
 *
 * Same contract as `event-format.ts` and `timeline-format.ts`: every table is
 * 1:1 over a closed server enum WITH THE RAW TOKEN as its fallback, and no
 * function here derives a fact. Four rules are specific to this file, and each
 * exists because breaking it produces a number that looks authoritative and is
 * wrong:
 *
 *  A. A NULL IS A NULL. Every formatter returns `null` for an absent value
 *     rather than "—" or "0", so the CALLER decides whether the gap deserves a
 *     row. A macro table full of dashes the formatter invented is a table that
 *     claims the platform looked and found nothing, when in fact it never
 *     looked. Zero is NOT absent: CPI printing 0.0% MoM is a finding, and the
 *     `Number.isFinite` guards exist to keep it on screen.
 *  B. THE UNIT COMES FROM THE PAYLOAD, NEVER FROM THE ROLE NAME. `fmtActual`
 *     reads `transform` and `unit` off the value itself. The role "headline"
 *     carries a percent for CPI and a level in thousands for payrolls, so a
 *     formatter that switched on the role would print "147.0%" for a 147k
 *     payrolls print.
 *  C. NOTHING IS RECOMPUTED (§61). `direction` is the server's word, printed;
 *     this file never re-derives it from `prints`. Two slope rules that
 *     disagree on the same data produce a label nobody can reconcile.
 *  D. CONSENSUS IS PRINTED LOUD OR NOT AT ALL. `consensusText` never softens
 *     the server's marker into "n/a". The string is meant to be conspicuous —
 *     it is the platform admitting it has no estimate, beside the one number a
 *     reader most expects to see compared.
 */
import type { TFn } from "./event-format";
import type {
  EventMacroPayload,
  MacroActual,
  MacroAssetReaction,
  MacroConsensus,
  MacroPrint,
  MacroTrendSeries,
} from "@/lib/types-macro";

/* ------------------------------------------------------------------- roles */

/**
 * The role a reading plays inside a release.
 *
 * Ordered: a reader scanning a CPI print looks for headline first and core
 * second, and rendering them in payload order would let a dict's iteration
 * order decide what the eye lands on.
 */
export const ROLE_ORDER = ["headline", "core", "rate", "wages", "level"] as const;

export const ROLE_LABEL: Record<string, { en: string; zh: string }> = {
  headline: { en: "Headline", zh: "整体" },
  core: { en: "Core", zh: "核心" },
  rate: { en: "Rate", zh: "比率" },
  wages: { en: "Wages", zh: "薪资" },
  level: { en: "Level", zh: "水平" },
};

export function roleLabel(role: string | null | undefined, t: TFn): string {
  if (role == null || role === "") return t("Reading", "读数");
  const label = ROLE_LABEL[role];
  return label == null ? role.replace(/_/g, " ") : t(label.en, label.zh);
}

/**
 * Roles present in an actuals block, in ROLE_ORDER then any unknown ones.
 *
 * An unknown role sorts to the end rather than being dropped: U2 owns the
 * catalogue and may add a role ("shelter", "supercore") before this file knows
 * it, and a reading silently missing from a release table is a hole the reader
 * cannot see.
 */
export function orderedRoles(
  actual: Record<string, MacroActual> | null | undefined,
): string[] {
  if (actual == null || typeof actual !== "object") return [];
  const present = Object.keys(actual).filter((k) => k !== "");
  const known = ROLE_ORDER.filter((r) => present.includes(r));
  const unknown = present
    .filter((r) => !(ROLE_ORDER as readonly string[]).includes(r))
    .sort();
  return [...known, ...unknown];
}

/* -------------------------------------------------------------- transforms */

/** Bilingual name per transform, for the column that says what the number IS. */
export const TRANSFORM_LABEL: Record<string, { en: string; zh: string }> = {
  mom_pct: { en: "MoM %", zh: "环比 %" },
  yoy_pct: { en: "YoY %", zh: "同比 %" },
  level: { en: "Level", zh: "绝对水平" },
  change_k: { en: "Change (k)", zh: "变化（千）" },
};

export function transformLabel(
  transform: string | null | undefined,
  t: TFn,
): string | null {
  if (transform == null || transform === "") return null;
  const label = TRANSFORM_LABEL[transform];
  return label == null ? transform.replace(/_/g, " ") : t(label.en, label.zh);
}

/**
 * How many decimals a transform deserves.
 *
 * A percent change gets one (CPI moves in tenths and printing 0.30 implies a
 * precision BLS does not publish at this transform); a payrolls change in
 * thousands gets none (147.0k is noise dressed as detail).
 */
function digitsFor(transform: string | null | undefined): number {
  if (transform === "change_k") return 0;
  if (transform === "level") return 1;
  return 1;
}

/**
 * A reading, formatted with its OWN unit (rule B).
 *
 * Explicit sign on the change transforms: a CPI print of +0.3% and one of
 * −0.3% are opposite economic events, and an unsigned "0.3" beside a label
 * that only says "MoM" leaves the direction to the reader's assumption. Levels
 * and rates take no forced sign — "+4.1%" for an unemployment RATE would read
 * as a change that did not happen.
 */
export function fmtActual(actual: MacroActual | null | undefined): string | null {
  if (actual == null || typeof actual !== "object") return null;
  const value = actual.value;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const transform = typeof actual.transform === "string" ? actual.transform : null;
  const digits = digitsFor(transform);
  const signed = transform === "mom_pct" || transform === "yoy_pct" || transform === "change_k";
  const body = `${signed && value > 0 ? "+" : ""}${value.toFixed(digits)}`;
  const unit = typeof actual.unit === "string" && actual.unit !== "" ? actual.unit : null;
  return unit == null ? body : `${body}${unit === "%" || unit === "k" ? "" : " "}${unit}`;
}

/** A trend print's value, formatted like an actual of the same series. */
export function fmtPrint(
  print: MacroPrint | null | undefined,
  series: MacroTrendSeries | null | undefined,
): string | null {
  if (print == null) return null;
  return fmtActual({
    value: print.value,
    transform: series?.transform ?? null,
    unit: series?.unit ?? null,
  });
}

/* --------------------------------------------------------------- direction */

/** The server's trend word, with a glyph. Never re-derived (rule C). */
export const DIRECTION_LABEL: Record<string, { en: string; zh: string; glyph: string }> = {
  rising: { en: "rising", zh: "上行", glyph: "▲" },
  falling: { en: "falling", zh: "下行", glyph: "▼" },
  flat: { en: "flat", zh: "走平", glyph: "▬" },
};

export function directionText(
  direction: string | null | undefined,
  t: TFn,
): { text: string; glyph: string } | null {
  if (direction == null || direction === "") return null;
  const label = DIRECTION_LABEL[direction];
  if (label == null) return { text: direction.replace(/_/g, " "), glyph: "·" };
  return { text: t(label.en, label.zh), glyph: label.glyph };
}

/* --------------------------------------------------------------- consensus */

/**
 * The consensus marker, printed LOUD (rule D).
 *
 * The server sends `CONSENSUS_DATA_UNAVAILABLE`; underscores become spaces and
 * nothing else changes. There is deliberately no branch that returns a number:
 * this platform subscribes to no estimate provider, and the type system plus
 * this function are the two places that guarantee a fabricated consensus
 * cannot reach the screen.
 */
export function consensusText(
  consensus: string | MacroConsensus | null | undefined,
  t: TFn,
): string {
  // The wire form is a bare STRING today ("CONSENSUS DATA UNAVAILABLE"); the
  // object form is accepted so a future estimate provider needs no UI change.
  // Reading `.status` off a string returned undefined and printed the
  // fallback — right words, but by accident, and it would have gone on
  // printing them after a real consensus arrived.
  const status = typeof consensus === "string" ? consensus : consensus?.status;
  if (typeof status === "string" && status !== "") return status.replace(/_/g, " ");
  return t("CONSENSUS DATA UNAVAILABLE", "无市场一致预期数据");
}

/** Same rule for the surprise slot: string on the wire, object tolerated. */
export function surpriseText(
  surprise: string | { status?: string | null } | null | undefined,
  t: TFn,
): string {
  const status = typeof surprise === "string" ? surprise : surprise?.status;
  if (typeof status === "string" && status !== "") return status.replace(/_/g, " ");
  return t("UNAVAILABLE", "不可用");
}

/* -------------------------------------------------------------- formatters */

/** ISO instant → "YYYY-MM-DD HH:MM" UTC. Null in, null out (rule A). */
export function stampMinute(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Date only. */
export function stampDay(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * A FRACTION as a signed percent — the unit `previous_reaction.assets` uses.
 *
 * Always signed, because the whole question this table answers is "which way
 * did it go".
 */
export function fmtReturnPct(
  v: number | null | undefined,
  digits = 2,
): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const pct = v * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}

/** A yield change already in BASIS POINTS (server's unit — never rescaled). */
export function fmtBp(v: number | null | undefined, digits = 1): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)} bp`;
}

/**
 * Sign colour for a return or a yield change.
 *
 * Deliberately the platform's own green/red tokens, matching `price-format`'s
 * `signColor`, so a positive move is the same colour on the price tab and this
 * one. This is TEXT colour on a value the reader also sees the sign of — the
 * sign is the encoding and the colour is the reinforcement, never the other
 * way round.
 */
export function signColor(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v) || v === 0) return "var(--text-dim)";
  return v < 0 ? "var(--red)" : "var(--green)";
}

/* ------------------------------------------------------------------ assets */

/**
 * What an asset stands in FOR (§39).
 *
 * Every one of these is a PROXY except the two broad equity ETFs, and
 * `isProxy` drives a badge in the table. A reader who takes IEF's move for the
 * 10-year yield itself has been misled by an omission, not by a wrong number.
 */
export const ASSET_ROLE_LABEL: Record<string, { en: string; zh: string }> = {
  equity: { en: "Equity (S&P 500)", zh: "股票（标普 500）" },
  equity_dow_proxy: { en: "Dow proxy", zh: "道琼斯代理" },
  equity_growth: { en: "Growth equity (Nasdaq 100)", zh: "成长股（纳斯达克 100）" },
  // VIXY holds VIX FUTURES, not the index — roll cost makes it track the
  // direction of fear faithfully and its LEVEL only loosely. The label says
  // "proxy" and the PROXY badge fires off the role suffix, so the distinction
  // reaches the reader in two channels rather than a footnote.
  volatility_proxy: { en: "Volatility proxy (VIX futures)", zh: "波动率代理（VIX 期货）" },
  long_duration_proxy: { en: "Long-duration proxy", zh: "长久期代理" },
  "10y_proxy": { en: "10Y proxy", zh: "10 年期代理" },
  "2y_proxy": { en: "2Y proxy", zh: "2 年期代理" },
  gold_proxy: { en: "Gold proxy", zh: "黄金代理" },
  oil_proxy: { en: "Oil proxy", zh: "原油代理" },
  dxy_proxy: { en: "Dollar proxy", zh: "美元代理" },
};

export function assetRoleLabel(role: string | null | undefined, t: TFn): string | null {
  if (role == null || role === "") return null;
  const label = ASSET_ROLE_LABEL[role];
  return label == null ? role.replace(/_/g, " ") : t(label.en, label.zh);
}

/** True when the role's name says it is standing in for something else. */
export function isProxy(role: string | null | undefined): boolean {
  return typeof role === "string" && role.endsWith("_proxy");
}

/**
 * The reaction table's row order.
 *
 * Fixed, not payload order: equities, then the curve proxies short-to-long,
 * then the commodity and dollar proxies. A macro reader scans this table in
 * risk-asset → rates → real-asset order, and letting a dict decide the
 * sequence makes the same table read differently between two events.
 */
export const ASSET_ORDER = [
  "SPY",
  "QQQ",
  "SHY",
  "IEF",
  "TLT",
  "GLD",
  "USO",
  "UUP",
] as const;

/** Symbols present in a reaction block, in ASSET_ORDER then any unknown ones. */
export function orderedAssets(
  assets: Record<string, MacroAssetReaction> | null | undefined,
): string[] {
  if (assets == null || typeof assets !== "object") return [];
  const present = Object.keys(assets).filter((k) => k !== "");
  const known = ASSET_ORDER.filter((s) => present.includes(s));
  const unknown = present
    .filter((s) => !(ASSET_ORDER as readonly string[]).includes(s))
    .sort();
  return [...known, ...unknown];
}

/** One horizon's return off an asset row. 0 is a value; absent is null. */
export function horizonReturn(
  asset: MacroAssetReaction | null | undefined,
  horizon: string,
): number | null {
  const returns = asset?.returns;
  if (returns == null || typeof returns !== "object") return null;
  const v = returns[horizon];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * The horizons the reaction table shows, in order.
 *
 * These are the SERVER's own keys into `assets[SYM].returns` — uppercase "1D"
 * / "5D", matching `previous_release_reaction.horizons`. They are not display
 * labels and must not be lowercased for looks: an unmatched key reads as a
 * missing measurement, so the table would render "—" for every asset on a
 * payload that in fact measured all of them.
 */
export const REACTION_HORIZONS = ["1D", "5D"] as const;

/* ------------------------------------------------------------------ yields */

/**
 * Tenor keys in curve order, with their labels.
 *
 * The keys are the Treasury CSV's OWN column spellings ("2 Yr", "10 Yr"),
 * carried unchanged through `TENOR_2Y`/`TENOR_10Y` into
 * `previous_release_reaction.yields`. Space and capitalisation included: this
 * is a lookup key, not a label, and the label is the `en`/`zh` field beside it.
 */
export const YIELD_TENORS: { key: string; en: string; zh: string }[] = [
  { key: "2 Yr", en: "2Y yield", zh: "2 年期收益率" },
  { key: "10 Yr", en: "10Y yield", zh: "10 年期收益率" },
];

/* ------------------------------------------------------------------- reads */

/** Trend series ids present, sorted for a stable render. */
export function trendSeriesIds(
  trend: Record<string, MacroTrendSeries> | null | undefined,
): string[] {
  if (trend == null || typeof trend !== "object") return [];
  return Object.keys(trend)
    .filter((k) => k !== "")
    .sort();
}

/** A trend's prints as a real array, oldest-first as the server sends them. */
export function trendPrints(series: MacroTrendSeries | null | undefined): MacroPrint[] {
  const prints = series?.prints;
  return Array.isArray(prints) ? prints : [];
}

/**
 * Coverage notes as a flat list of strings.
 *
 * Accepts the several shapes a coverage block legitimately arrives in (a list
 * of notes, a `reason`, or an object of per-source booleans) because U3 owns
 * that field and it grows. Anything unrecognised is stringified rather than
 * dropped — an unrenderable caveat is still a caveat.
 */
export function coverageNotes(coverage: unknown): string[] {
  if (coverage == null) return [];
  if (typeof coverage === "string") return coverage === "" ? [] : [coverage];
  if (Array.isArray(coverage)) {
    return coverage.map((n) => (typeof n === "string" ? n : JSON.stringify(n)));
  }
  if (typeof coverage !== "object") return [String(coverage)];

  const record = coverage as Record<string, unknown>;
  const out: string[] = [];
  const notes = record.notes;
  if (Array.isArray(notes)) {
    for (const n of notes) out.push(typeof n === "string" ? n : JSON.stringify(n));
  }
  const reason = record.reason;
  if (typeof reason === "string" && reason !== "") out.push(reason);
  return out;
}

/** Whether the payload carries anything worth drawing at all. */
export function hasPacket(data: EventMacroPayload | null | undefined): boolean {
  const packet = data?.packet;
  if (packet == null || typeof packet !== "object") return false;
  return (
    packet.previous_release != null ||
    packet.current_release != null ||
    (packet.recent_trend != null && trendSeriesIds(packet.recent_trend).length > 0)
  );
}
