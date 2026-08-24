"use client";

/**
 * Display helpers for the Phase F Analysis tab (§46-§52, §69-§71).
 *
 * Like news-format, this EXTENDS the earlier tabs rather than restating them:
 * `unavailableText`, `isoStamp` and `safeUrl` are imported and re-exported so
 * the analysis surfaces cannot start wording a missing value, a timestamp or
 * an untrusted link differently from the news ones.
 *
 * Four rules are specific to the analysis tab and live here so the components
 * cannot quietly break them:
 *
 *  1. THE TIER IS THE PAYLOAD'S, NOT THE COMPONENT'S. §49 demands DATA,
 *     QUANT and LLM ANALYSIS be visually separable; `tierOf` reads the tier a
 *     section actually carries and `LLM` is assigned ONLY to the narrative
 *     object. A component that hardcoded "DATA" on a section could relabel
 *     model prose as fact, which is the exact failure §49 exists to prevent.
 *  2. NARRATIVE TEXT IS RENDERED, NEVER PARSED. `narrativeText` trims and
 *     drops empties; it never splits on numbers, never re-derives a
 *     percentage, and never "fixes up" a sentence. The numbers in the prose
 *     are the model's quotations and their audit lives in `numbers_quoted`.
 *  3. A VIOLATION IS SHOWN, NOT SWALLOWED. `hasViolations` is what flips the
 *     tab into its transparency state. INVALID still renders the analysis —
 *     hiding it would hide the evidence that the check works.
 *  4. CONFIDENCE IS NOT A PROBABILITY. `confidenceBadge` maps to the neutral
 *     badge vocabulary only; there is no green "HIGH" anywhere, because a
 *     model's self-reported confidence has no calibrated frequency behind it
 *     (§50).
 */
import type { TFn } from "./event-format";
import { unavailableText } from "./price-format";
import { isoStamp } from "./replay-format";
import { safeUrl } from "./news-format";
import type {
  AnalysisNumberQuote,
  AnalysisScenario,
  EvidenceBundle,
  EvidenceSection,
  EventAnalysisBody,
  EventAnalysisPayload,
  PriorAnalysisSummary,
} from "@/lib/types";

export { isoStamp, safeUrl, unavailableText };

/* --------------------------------------------------------------- §49 tiers */

/** The three §49 tiers plus §70's stored-opinion tier. */
export const TIERS = ["DATA", "QUANT", "LLM", "LLM_PRIOR"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Bilingual tier labels. "LLM ANALYSIS" is spelled out rather than shortened
 * to "AI": §49's whole point is that a reader can see WHICH of the three
 * things they are reading, and a three-letter chip that could mean anything
 * defeats it.
 */
export const TIER_LABEL: Record<Tier, { en: string; zh: string }> = {
  DATA: { en: "DATA", zh: "数据" },
  QUANT: { en: "QUANT", zh: "量化" },
  LLM: { en: "LLM ANALYSIS", zh: "模型分析" },
  LLM_PRIOR: { en: "PRIOR LLM OPINION", zh: "历史模型观点" },
};

/**
 * The class that paints a tier chip.
 *
 * Reuses the EXISTING `.provenance` vocabulary rather than inventing a
 * palette. DATA keeps the blue `data-driven` it has meant "this is measured"
 * with since the first phase, QUANT keeps the grey `quant-derived`, and both
 * model tiers take the amber `llm-generated` that has always marked
 * generated prose. Re-colouring DATA here to match a mock-up would silently
 * change the meaning of every existing chip on every other tab — the point
 * of §49 is that one colour means one thing platform-wide.
 */
export const TIER_CLASS: Record<Tier, string> = {
  DATA: "data-driven",
  QUANT: "quant-derived",
  LLM: "llm-generated",
  LLM_PRIOR: "llm-generated",
};

/**
 * The tier a section actually carries, or null when it carries none.
 *
 * Null is deliberate: an unlabelled section gets NO chip rather than a
 * guessed one. Inventing "DATA" for an unlabelled blob is how model prose
 * would end up wearing a fact badge.
 */
export function tierOf(section: unknown): Tier | null {
  if (typeof section !== "object" || section === null) return null;
  const raw = (section as EvidenceSection).tier;
  if (typeof raw !== "string") return null;
  const upper = raw.toUpperCase();
  return (TIERS as readonly string[]).includes(upper) ? (upper as Tier) : null;
}

/** The bilingual chip text for a tier, falling back to the raw token. */
export function tierText(tier: Tier | null, t: TFn): string | null {
  if (tier == null) return null;
  const label = TIER_LABEL[tier];
  return label == null ? tier : t(label.en, label.zh);
}

/* ------------------------------------------------------------- §46 bundle */

/**
 * Keys the bundle carries that are NOT renderable sections — the envelope.
 *
 * Kept as a deny-list rather than an allow-list of sections: U1 owns the
 * section list and may add macro_context or peer_context later, and an
 * allow-list would silently DROP a new section rather than render it.
 */
const BUNDLE_ENVELOPE_KEYS = new Set([
  "as_of",
  "bundle_digest",
  "digest",
  "prior_analyses",
  "source_metadata",
]);

/** One renderable bundle section: its key, its tier and its body. */
export interface BundleSection {
  key: string;
  tier: Tier | null;
  body: EvidenceSection;
}

/**
 * The bundle's sections in a STABLE display order.
 *
 * The order follows §46's own listing (event → previous event → its results
 * and reaction → fundamentals → price → options → news → macro → peers →
 * consensus → expectations gap), because that is the order the reasoning
 * runs in: what is this, what happened last time, what has changed since.
 * Anything the server sends that is not on the list still renders, appended
 * in payload order — a new section must never vanish because the UI has not
 * heard of it yet.
 */
export const SECTION_ORDER = [
  "event",
  "previous_event",
  "previous_event_results",
  "previous_market_reaction",
  "fundamentals",
  "price_analysis",
  "options_analysis",
  "news",
  "macro_context",
  "peer_context",
  "consensus",
  "expectations_gap",
] as const;

export function bundleSections(
  bundle: EvidenceBundle | null | undefined,
): BundleSection[] {
  if (bundle == null || typeof bundle !== "object") return [];
  const keys = Object.keys(bundle).filter((k) => {
    if (BUNDLE_ENVELOPE_KEYS.has(k)) return false;
    const v = (bundle as Record<string, unknown>)[k];
    return typeof v === "object" && v !== null && !Array.isArray(v);
  });
  const rank = (k: string) => {
    const i = (SECTION_ORDER as readonly string[]).indexOf(k);
    return i === -1 ? SECTION_ORDER.length + keys.indexOf(k) : i;
  };
  return keys
    .sort((a, b) => rank(a) - rank(b))
    .map((key) => {
      const body = (bundle as Record<string, unknown>)[key] as EvidenceSection;
      return { key, tier: tierOf(body), body };
    });
}

/** Bilingual section headings, §46's names. Unknown keys de-underscore. */
const SECTION_LABEL: Record<string, { en: string; zh: string }> = {
  event: { en: "Event", zh: "事件" },
  previous_event: { en: "Previous event", zh: "上次事件" },
  previous_event_results: { en: "Previous results", zh: "上次业绩" },
  previous_market_reaction: { en: "Previous market reaction", zh: "上次市场反应" },
  fundamentals: { en: "Fundamentals", zh: "基本面" },
  price_analysis: { en: "Price analysis", zh: "价格分析" },
  options_analysis: { en: "Options analysis", zh: "期权分析" },
  news: { en: "News", zh: "新闻" },
  macro_context: { en: "Macro context", zh: "宏观背景" },
  peer_context: { en: "Peer context", zh: "同业对比" },
  consensus: { en: "Consensus", zh: "市场一致预期" },
  expectations_gap: { en: "Expectations gap inputs", zh: "预期差输入" },
};

export function sectionLabel(key: string, t: TFn): string {
  const label = SECTION_LABEL[key];
  return label == null ? key.replace(/_/g, " ") : t(label.en, label.zh);
}

/**
 * True when a section says it is not available yet.
 *
 * Two spellings answer this on the wire — `available:false` from the event
 * seams and `status:"NOT_AVAILABLE_YET"` from the Phase F placeholders — and
 * a section that says either is a STATE with a reason, never a blank.
 */
export function sectionUnavailable(body: EvidenceSection | null | undefined): boolean {
  if (body == null) return true;
  if (body.available === false) return true;
  const status = body["status"];
  return typeof status === "string" && status.toUpperCase().includes("NOT_AVAILABLE");
}

/** The verbatim server reason a section is unavailable, when it sent one. */
export function sectionReason(body: EvidenceSection | null | undefined): string | null {
  if (body == null) return null;
  for (const key of ["reason", "status"]) {
    const v = body[key];
    if (typeof v === "string" && v !== "") return v;
  }
  return null;
}

/**
 * §33 — is the consensus block the unavailable marker?
 *
 * Checked as a POSITIVE test for the marker rather than a negative test for
 * numbers: the platform has no estimate provider, so the ONLY correct
 * consensus render is the notice. A block that somehow arrived with numbers
 * would fail this and fall through to the generic section render, where its
 * fields are visible and attributable — never silently promoted to "the
 * Street expects".
 */
export function consensusUnavailable(bundle: EvidenceBundle | null | undefined): boolean {
  const c = bundle?.consensus;
  if (c == null || typeof c !== "object") return false;
  const status = (c as { status?: unknown }).status;
  return typeof status === "string" && status.toUpperCase().includes("UNAVAILABLE");
}

/* ---------------------------------------------------------- §48 narrative */

/**
 * The §48 narrative sections, in the spec's own order.
 *
 * A constant, not `Object.keys(analysis)`: the order IS the argument (what
 * happened → what changed → what it means → what would break it), and a
 * payload whose key order drifted would silently re-order the reasoning.
 */
export const NARRATIVE_KEYS = [
  "executive_summary",
  "what_happened_last_time",
  "what_changed_since",
  "fundamental_developments",
  "price_and_positioning",
  "market_expectations",
  // v2 (Catalyst research upgrade): prediction-market pricing is its own
  // narrative, not a clause inside market_expectations — the reader must be
  // able to see at a glance whether the model spoke about contract pricing
  // at all, and null there is an honest "the bundle carried none".
  "prediction_market_expectations",
  "what_matters_most",
] as const;
export type NarrativeKey = (typeof NARRATIVE_KEYS)[number];

export const NARRATIVE_LABEL: Record<NarrativeKey, { en: string; zh: string }> = {
  executive_summary: { en: "Executive summary", zh: "核心结论" },
  what_happened_last_time: { en: "What happened last time", zh: "上次发生了什么" },
  what_changed_since: { en: "What changed since", zh: "此后有何变化" },
  fundamental_developments: { en: "Fundamental developments", zh: "基本面进展" },
  price_and_positioning: { en: "Price & positioning", zh: "价格与持仓" },
  market_expectations: { en: "Market expectations", zh: "市场预期" },
  prediction_market_expectations: {
    en: "Prediction-market pricing",
    zh: "预测市场定价",
  },
  what_matters_most: { en: "What matters most this event", zh: "本次最关键的问题" },
};

/**
 * A narrative field as text, or null.
 *
 * Whitespace-only is null, not an empty paragraph: an empty section heading
 * with nothing under it reads as "the model had nothing to say", which is a
 * claim the payload did not make.
 */
export function narrativeText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/** A list field as a clean string array; non-strings and blanks are dropped. */
export function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x !== "");
}

/* ----------------------------------------------------------- §51 scenarios */

/** §51: three legs, always in this order, never "bullish/bearish" only. */
export const SCENARIO_KEYS = ["upside", "base", "downside"] as const;
export type ScenarioKey = (typeof SCENARIO_KEYS)[number];

export const SCENARIO_LABEL: Record<ScenarioKey, { en: string; zh: string }> = {
  upside: { en: "UPSIDE", zh: "上行情景" },
  base: { en: "BASE", zh: "基准情景" },
  downside: { en: "DOWNSIDE", zh: "下行情景" },
};

/**
 * The four parts of a scenario, in the order §51 asks them.
 *
 * `conditions` first because a scenario is defined by WHAT WOULD HAVE TO
 * HAPPEN, not by a label. A card that led with "why the market reacts" would
 * be a story with its trigger buried.
 */
export const SCENARIO_FIELDS = [
  "conditions",
  "guidance_conditions",
  "why_market_reacts",
] as const;
export type ScenarioField = (typeof SCENARIO_FIELDS)[number];

export const SCENARIO_FIELD_LABEL: Record<ScenarioField, { en: string; zh: string }> = {
  conditions: { en: "Conditions", zh: "触发条件" },
  guidance_conditions: { en: "Guidance conditions", zh: "指引条件" },
  why_market_reacts: { en: "Why the market reacts", zh: "市场为何反应" },
};

/** True when a scenario leg has nothing renderable — an empty card is not drawn. */
export function scenarioEmpty(s: AnalysisScenario | null | undefined): boolean {
  if (s == null) return true;
  if (SCENARIO_FIELDS.some((f) => narrativeText(s[f]) != null)) return false;
  return stringList(s.evidence_refs).length === 0;
}

/* ------------------------------------------------- §35 regime, §50 confidence */

/**
 * Bilingual labels for the §35 expectations-gap regimes.
 *
 * The regime is a CLASSIFICATION OF THE SETUP, not a direction to trade:
 * "beat priced in" says a good print may not pay, which is the opposite of a
 * buy signal on good news. The wording keeps that meaning explicit and no
 * regime is ever coloured green or red.
 */
export const REGIME_LABEL: Record<string, { en: string; zh: string }> = {
  POSITIVE_ASYMMETRY: { en: "Positive asymmetry", zh: "正向不对称" },
  BEAT_PRICED: { en: "Beat already priced", zh: "超预期已被计价" },
  NEGATIVE_ASYMMETRY: { en: "Negative asymmetry", zh: "负向不对称" },
  BAD_NEWS_PRICED: { en: "Bad news already priced", zh: "利空已被计价" },
  INSUFFICIENT_DATA: { en: "Insufficient data", zh: "数据不足" },
};

export function regimeText(regime: string | null | undefined, t: TFn): string | null {
  if (regime == null || regime === "") return null;
  const label = REGIME_LABEL[regime];
  return label == null ? regime.replace(/_/g, " ") : t(label.en, label.zh);
}

/** §50 confidence labels. Neutral badge only — see `confidenceBadge`. */
export const CONFIDENCE_LABEL: Record<string, { en: string; zh: string }> = {
  HIGH: { en: "High confidence", zh: "高置信度" },
  MODERATE: { en: "Moderate confidence", zh: "中等置信度" },
  LOW: { en: "Low confidence", zh: "低置信度" },
  NOT_MEANINGFUL: { en: "Not meaningful", zh: "不具参考意义" },
};

export function confidenceText(v: string | null | undefined, t: TFn): string | null {
  if (v == null || v === "") return null;
  const label = CONFIDENCE_LABEL[v.toUpperCase()];
  return label == null ? v.replace(/_/g, " ") : t(label.en, label.zh);
}

/**
 * The badge class for a confidence level.
 *
 * ALWAYS `dim`. A green "HIGH confidence" would read as a green signal, and
 * the model's self-report has no frequency behind it to earn one (§50). The
 * function exists so the rule is stated once and cannot drift per component.
 */
export function confidenceBadge(): string {
  return "dim";
}

/* --------------------------------------------------------- §47 violations */

/** Verbatim validator findings; empty when the check passed. */
export function violationList(payload: EventAnalysisPayload | null | undefined): string[] {
  return stringList(payload?.violations);
}

export function hasViolations(payload: EventAnalysisPayload | null | undefined): boolean {
  return violationList(payload).length > 0;
}

/** The `numbers_quoted` audit rows, with unusable entries dropped. */
export function quotedNumbers(
  analysis: EventAnalysisBody | null | undefined,
): AnalysisNumberQuote[] {
  const raw = analysis?.numbers_quoted;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (q): q is AnalysisNumberQuote =>
      typeof q === "object" && q !== null && typeof q.path === "string" && q.path !== "",
  );
}

/** A quoted value as display text. Never reformatted — this is an audit row. */
export function quoteValueText(v: number | string | null | undefined): string {
  if (v == null) return "—";
  return String(v);
}

/* ------------------------------------------------------- §52 evidence refs */

/**
 * An evidence ref resolved to a link, when the bundle holds one.
 *
 * The ref is ALWAYS shown as its own token even when nothing resolves it: an
 * unresolvable citation is a finding (the model cited something that is not
 * in the bundle), and quietly hiding it would hide exactly that.
 */
export interface ResolvedRef {
  ref: string;
  title: string | null;
  url: string | null;
  /** False when nothing in the bundle carries this id — shown, not hidden. */
  resolved: boolean;
}

/**
 * Walk the bundle once, collecting anything that could back an evidence ref.
 *
 * Deliberately structural rather than news-specific: it indexes any object
 * carrying an `evidence_id`/`cluster_id`/`id` alongside a title or url, so an
 * options or macro section added later resolves without a change here.
 */
export function buildRefIndex(
  bundle: EvidenceBundle | null | undefined,
): Map<string, { title: string | null; url: string | null }> {
  const index = new Map<string, { title: string | null; url: string | null }>();
  const seen = new Set<unknown>();

  const visit = (node: unknown, depth: number) => {
    if (depth > 8 || node == null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    const title =
      pickString(obj, ["safe_title", "title", "canonical_title", "headline", "label"]) ??
      pickString(
        (obj["canonical_article"] as Record<string, unknown>) ?? {},
        ["safe_title", "title"],
      );
    const url =
      safeUrl(pickString(obj, ["url", "link"])) ??
      safeUrl(
        pickString((obj["canonical_article"] as Record<string, unknown>) ?? {}, ["url"]),
      );
    for (const idKey of ["evidence_id", "cluster_id", "ref", "id", "source_id"]) {
      const id = obj[idKey];
      if (typeof id === "string" && id !== "" && (title != null || url != null)) {
        if (!index.has(id)) index.set(id, { title, url });
      }
    }
    for (const value of Object.values(obj)) visit(value, depth + 1);
  };

  visit(bundle, 0);
  return index;
}

function pickString(
  obj: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (obj == null || typeof obj !== "object") return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/**
 * Resolve the refs a narrative cites against the bundle's index.
 *
 * A ref that looks like a dotted bundle PATH ("price_analysis.reaction.1d")
 * is legitimate and simply has no link — that is `resolved:true` with a null
 * url, distinct from a ref nothing in the bundle knows about.
 */
export function resolveRefs(
  refs: string[],
  index: Map<string, { title: string | null; url: string | null }>,
  bundle?: EvidenceBundle | null,
): ResolvedRef[] {
  return refs.map((ref) => {
    const hit = index.get(ref);
    if (hit != null) {
      return { ref, title: hit.title, url: hit.url, resolved: true };
    }
    return {
      ref,
      title: null,
      url: null,
      resolved: bundle != null && pathExists(bundle, ref),
    };
  });
}

/** Does a dotted path address something the bundle actually carries? */
export function pathExists(bundle: EvidenceBundle | null | undefined, path: string): boolean {
  if (bundle == null || path === "") return false;
  let node: unknown = bundle;
  for (const part of path.split(".")) {
    if (node == null || typeof node !== "object") return false;
    if (Array.isArray(node)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) return false;
      node = node[idx];
      continue;
    }
    const obj = node as Record<string, unknown>;
    if (!(part in obj)) return false;
    node = obj[part];
  }
  return true;
}

/* ------------------------------------------------------- §69 prior analyses */

/** The stored prior opinions, newest first as the server sent them. */
export function priorAnalyses(
  bundle: EvidenceBundle | null | undefined,
): PriorAnalysisSummary[] {
  const raw = bundle?.prior_analyses;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is PriorAnalysisSummary => typeof p === "object" && p !== null);
}

/* ------------------------------------------------------------ status wording */

/** The badge class per §-status. FAILED and INVALID are amber, never red-only. */
export const STATUS_BADGE_CLASS: Record<string, string> = {
  OK: "dim",
  INVALID: "amber",
  FAILED: "amber",
  BUNDLE_ONLY: "dim",
};

export const STATUS_LABEL: Record<string, { en: string; zh: string }> = {
  OK: { en: "OK", zh: "通过校验" },
  INVALID: { en: "INVALID", zh: "校验未通过" },
  FAILED: { en: "FAILED", zh: "生成失败" },
  BUNDLE_ONLY: { en: "EVIDENCE ONLY", zh: "仅证据" },
};

export function statusText(status: string | null | undefined, t: TFn): string {
  if (status == null || status === "") return t("UNKNOWN", "未知");
  const label = STATUS_LABEL[status];
  return label == null ? status.replace(/_/g, " ") : t(label.en, label.zh);
}

/**
 * A usage block as a compact string, or null.
 *
 * Tokens are a COST record, printed only when the server sent them. A zero
 * that stands in for an absent count would understate what a generation
 * actually spent.
 */
export function usageText(
  usage: { input_tokens?: number; output_tokens?: number } | null | undefined,
): string | null {
  if (usage == null || typeof usage !== "object") return null;
  const parts: string[] = [];
  if (typeof usage.input_tokens === "number") parts.push(`in ${usage.input_tokens}`);
  if (typeof usage.output_tokens === "number") parts.push(`out ${usage.output_tokens}`);
  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * COUNT WHAT A SECTION ACTUALLY CARRIES, for the coverage matrix's detail line.
 *
 * Deliberately narrow: it counts the ONE array a section is chiefly about
 * (matched markets, news items, accepted sources) and otherwise returns null.
 * A generic "count every array in here" would produce numbers whose meaning
 * varies section to section — "12" next to a label the reader would then have
 * to interpret — which is worse than no number at all.
 */
const SECTION_COUNT_KEY: Record<string, string> = {
  prediction_markets: "matched_markets",
  web_research: "accepted",
  news: "items",
  previous_event_results: "results",
  peer_comparison: "peers",
};

export function sectionDetail(
  key: string,
  body: EvidenceSection | null | undefined,
): string | null {
  if (body == null) return null;
  const countKey = SECTION_COUNT_KEY[key];
  if (countKey == null) return null;
  const value = (body as Record<string, unknown>)[countKey];
  if (!Array.isArray(value)) return null;
  return String(value.length);
}

/**
 * Is a section PARTIALLY available?
 *
 * A section that answered, but named something it could not include, is a
 * third state — not "has data" and not "no data". Conflating it with either
 * is what makes a reader either over-trust a gapped section or ignore a
 * mostly-good one. The signals are the platform's own: an `unavailable` list
 * with entries, or a status naming partial discovery.
 */
export function sectionPartial(body: EvidenceSection | null | undefined): boolean {
  if (body == null) return false;
  if (sectionUnavailable(body)) return false;
  const unavailable = (body as Record<string, unknown>)["unavailable"];
  if (Array.isArray(unavailable) && unavailable.length > 0) return true;
  const status = (body as Record<string, unknown>)["status"];
  if (typeof status === "string" && status.toUpperCase().includes("PARTIAL")) return true;
  const reason = (body as Record<string, unknown>)["reason"];
  return typeof reason === "string" && reason.toUpperCase().includes("PARTIAL");
}
