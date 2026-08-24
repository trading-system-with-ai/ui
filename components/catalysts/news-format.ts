"use client";

/**
 * Display helpers for the Phase D News tab (§21-§27, §59).
 *
 * Like replay-format, this EXTENDS the earlier tabs rather than restating
 * them: `unavailableText` and `isoStamp` are imported and re-exported so the
 * news surfaces cannot start wording a missing value differently from the
 * price ones.
 *
 * Three rules are specific to news and live here so the component cannot
 * quietly break them:
 *
 *  1. A SCORE IS A UNIT INTERVAL, NOT A PERCENT-CHANGE. `fmtScore` prints
 *     0.42, never "+42.0%": the evidence score has no sign and no direction,
 *     and borrowing the return formatter would paint it with the red/green
 *     vocabulary of a move (`signColor` is deliberately NOT re-exported).
 *  2. THE PRODUCT MUST BE CHECKABLE. `componentProduct` recomputes the five
 *     factors' product so the ⓘ card can show whether the server's own score
 *     reproduces from its own components — an unexplainable score is a bug
 *     (§13's rule, applied to news).
 *  3. A COUNT OF ZERO IS A FACT. `countValue` returns 0 for a present zero
 *     and null only for a genuinely absent key, because "no material
 *     developments" and "the server did not send this count" are different
 *     statements.
 */
import type { TFn } from "./event-format";
import { unavailableText } from "./price-format";
import { isoStamp } from "./replay-format";
import type {
  NewsArticleRef,
  NewsCluster,
  NewsCounts,
  NewsEvidence,
  NewsScoreComponents,
} from "@/lib/types";

export { isoStamp, unavailableText };

/**
 * The §26 counts strip, in the order the spec prints them:
 * "N raw · N unique · N clusters · N material · N themes".
 *
 * The funnel order is the meaning — raw shrinking to clusters is what tells
 * a reader that coverage was syndicated rather than plentiful — so it is a
 * constant here rather than `Object.keys` of whatever the payload happened
 * to serialise.
 */
export const COUNT_KEYS = [
  "raw",
  "unique",
  "clusters",
  "material",
  "themes",
] as const;
export type CountKey = (typeof COUNT_KEYS)[number];

/** The five §25 factors, in the order the ⓘ card multiplies them. */
export const COMPONENT_KEYS = [
  "relevance",
  "materiality",
  "novelty",
  "source_quality",
  "decay",
] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

/** Glossary key per factor, so each row of the ⓘ card is explainable. */
export const COMPONENT_TERM: Record<ComponentKey, string> = {
  relevance: "news_relevance",
  materiality: "news_materiality",
  novelty: "news_novelty",
  source_quality: "news_source_quality",
  decay: "news_decay",
};

/**
 * Read one §26 count.
 *
 * Returns 0 for a present zero and null ONLY for an absent key: "0 material
 * developments" is a finding, and rendering it as a dash would erase it.
 */
export function countValue(
  counts: NewsCounts | null | undefined,
  key: CountKey,
): number | null {
  if (counts == null) return null;
  const v = counts[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Format a 0-1 score or factor. Two decimals, no sign, no percent.
 *
 * Null in, null out — the caller pairs it with a reason, exactly as the
 * price formatters do. Never rendered as "0.00" for a missing value: a
 * factor the server did not send is not a factor that scored zero.
 */
export function fmtScore(v: number | null | undefined, digits = 2): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v.toFixed(digits);
}

/**
 * Read one factor out of a components block. Same null contract as
 * `fmtScore`, and the same reason for it.
 */
export function componentValue(
  components: NewsScoreComponents | null | undefined,
  key: ComponentKey,
): number | null {
  if (components == null) return null;
  const v = components[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * The product of the five factors, recomputed client-side.
 *
 * Returns null when ANY factor is missing rather than multiplying the ones
 * that happen to be present — a product of four factors is a different
 * number from a product of five, and showing it beside the server's score
 * would manufacture a disagreement that does not exist.
 */
export function componentProduct(
  components: NewsScoreComponents | null | undefined,
): number | null {
  if (components == null) return null;
  let product = 1;
  for (const key of COMPONENT_KEYS) {
    const v = componentValue(components, key);
    if (v == null) return null;
    product *= v;
  }
  return product;
}

/**
 * Whether the server's score reproduces from its own components (§13's
 * explainability rule, applied to news).
 *
 * Tolerant to float noise (1e-6), and `false` ONLY when both numbers exist
 * and genuinely differ — an absent score or an incomplete component block is
 * "not checkable", which is reported as such rather than as a mismatch.
 */
export function productMatches(
  score: number | null | undefined,
  components: NewsScoreComponents | null | undefined,
  tolerance = 1e-6,
): boolean | null {
  const product = componentProduct(components);
  if (product == null || score == null || !Number.isFinite(score)) return null;
  return Math.abs(product - score) <= tolerance;
}

/**
 * Publication time, rendered in the reader's LOCAL zone.
 *
 * This is the one place in the catalyst surfaces that deliberately reparses
 * through `Date`, and it is the opposite call from `replay-format.isoStamp`.
 * A release timestamp is an EXCHANGE fact whose ET spelling must survive
 * verbatim; a publication time is answering "how long ago was this, for me",
 * which is a local-clock question. Falls back to the verbatim server string
 * when the value will not parse, so an odd stamp is shown rather than
 * swallowed.
 */
export function publishedLocal(
  v: string | null | undefined,
  lang: "en" | "zh",
): string | null {
  if (v == null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return isoStamp(v);
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * The display title of an article.
 *
 * The DISPLAY string is `title` — React escapes it on the way out, so the
 * reader sees the publisher's own headline. `safe_title` is the §81
 * LLM-facing copy and is deliberately NOT preferred here: it has had URLs
 * stripped and is truncated, which would silently alter a headline the user
 * is asked to judge a source by. Returns null when there is no title at all.
 */
export function displayTitle(article: NewsArticleRef | null | undefined): string | null {
  if (article == null) return null;
  const title = article.title;
  if (typeof title === "string" && title.trim() !== "") return title;
  const safe = article.safe_title;
  return typeof safe === "string" && safe.trim() !== "" ? safe : null;
}

/**
 * An http(s) article link, or null.
 *
 * Anything that is not http/https is REJECTED rather than rendered: a news
 * feed is third-party text (§81), and a `javascript:` or `data:` href in a
 * provider field is exactly the payload that turns an untrusted string into
 * executable code when a component drops it into an `<a href>`.
 */
export function safeUrl(v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const trimmed = v.trim();
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return null;
  return trimmed;
}

/**
 * The members of a cluster, as article refs.
 *
 * Prefers the expanded `members` when the seam sends them and falls back to
 * `member_source_ids`, turning each bare id into a ref carrying ONLY that id
 * — never a fabricated title or publisher. The canonical article is always
 * first, and never listed twice even though it appears in both fields.
 */
export function clusterMembers(cluster: NewsCluster | null | undefined): NewsArticleRef[] {
  if (cluster == null) return [];
  const canonical = cluster.canonical_article ?? null;
  const out: NewsArticleRef[] = [];
  const seen = new Set<string>();
  if (canonical != null) {
    out.push(canonical);
    seen.add(canonical.source_id);
  }
  for (const member of cluster.members ?? []) {
    if (member == null || seen.has(member.source_id)) continue;
    seen.add(member.source_id);
    out.push(member);
  }
  for (const id of cluster.member_source_ids ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ source_id: id });
  }
  return out;
}

/** Evidence rows belonging to one cluster, in the payload's ranked order. */
export function evidenceForCluster(
  evidence: NewsEvidence[] | null | undefined,
  clusterId: string,
): NewsEvidence[] {
  return (evidence ?? []).filter((e) => e.cluster_id === clusterId);
}

/** Clusters named by a theme, resolved against the payload's cluster list. */
export function clustersByIds(
  clusters: NewsCluster[] | null | undefined,
  ids: string[] | null | undefined,
): NewsCluster[] {
  if (clusters == null || ids == null) return [];
  const byId = new Map(clusters.map((c) => [c.cluster_id, c]));
  return ids
    .map((id) => byId.get(id))
    .filter((c): c is NewsCluster => c != null);
}

/**
 * The one-line freshness sentence.
 *
 * Both halves are separate facts and each is reported as absent on its own:
 * "the newest article we hold is from Tuesday" and "we last asked the
 * provider on Monday" answer different questions, and a window with no
 * articles still has a fetch time worth showing (it says the fetch happened
 * and returned nothing).
 */
export function freshnessLine(
  freshness:
    | {
        newest_article_at?: string | null;
        last_fetch_at?: string | null;
        articles_stored?: number;
      }
    | null
    | undefined,
  t: TFn,
  lang: "en" | "zh",
): string {
  const newest = publishedLocal(freshness?.newest_article_at, lang);
  const fetched = publishedLocal(freshness?.last_fetch_at, lang);
  const stored = freshness?.articles_stored;
  const newestPart =
    newest == null
      ? t("no articles stored", "未存储任何文章")
      : t(`newest article ${newest}`, `最新文章 ${newest}`);
  const fetchedPart =
    fetched == null
      ? t("never fetched", "从未抓取")
      : t(`last fetched ${fetched}`, `最近抓取 ${fetched}`);
  const parts = [newestPart, fetchedPart];
  // The denominator behind both stamps. Counted over the STORED window rows,
  // which is deliberately not the `raw` count: an article the relevance rule
  // excluded is still evidence the mirror is warm, and omitting it would let
  // a window full of off-topic coverage read as never fetched.
  if (typeof stored === "number" && Number.isFinite(stored)) {
    parts.push(
      t(`${stored} article${stored === 1 ? "" : "s"} stored`, `已存储 ${stored} 篇文章`),
    );
  }
  return parts.join(" · ");
}

/**
 * Whether a backfill WROTE nothing — the signal that decides the toast's tone.
 *
 * True only when no row was stored. That is deliberately not the same as "the
 * fetch failed": the seam's normal second-press answer is
 * `{fetched: true, articles: 12, stored: 0, reason: "all fetched articles
 * were already stored"}`, which is a successful fetch of an already-warm
 * window, and the caller distinguishes the two by `articles`.
 *
 * `fetched` is read as a NUMBER as well as a boolean because the two backfill
 * seams spell it differently (the bars one flags a boolean, and a count is a
 * plausible future spelling here); a numeric `0` that read as truthy would
 * report a provider call that never happened.
 */
export function backfillStoredNothing(result: {
  fetched?: number | boolean;
  stored?: number;
}): boolean {
  // `stored` is the AUTHORITY when the server sent it: it counts rows
  // written, which is the only question this predicate asks. `fetched:true,
  // stored:0` is a real fetch of an already-warm window and must answer true
  // here, so the boolean must not short-circuit ahead of the count.
  const stored = result.stored;
  if (typeof stored === "number" && Number.isFinite(stored)) return stored <= 0;
  // No count sent — fall back to whether a call ran at all.
  const fetched = result.fetched;
  if (typeof fetched === "number") return fetched <= 0;
  return fetched !== true;
}
