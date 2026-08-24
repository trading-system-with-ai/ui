"use client";

/**
 * Phase D — the "News" tab: the §21-§27 news evidence behind one event.
 *
 * The tab answers one question — "what has actually happened since this
 * company last reported, and how much of it matters" — and it answers it in
 * the order §26/§59 lay out:
 *
 *   1. The COUNTS FUNNEL (§26): raw → unique → clusters → material → themes.
 *      Not an article total. The gap between raw and clusters is the whole
 *      point: six outlets syndicating one story is one development, and a
 *      bare "42 articles" would read as forty-two things happening.
 *   2. KEY THEMES (§59), each expandable into its clusters, each cluster
 *      expandable into the source articles that make it up. Nothing is
 *      summarised away — the path from a theme label down to a publisher's
 *      own headline and link is always open.
 *   3. The ranked EVIDENCE, with every score's five factors reachable.
 *
 * Four honesty rules are specific to this tab:
 *
 *  A. A SCORE IS A RANKING, NOT A DIRECTION. There is no sentiment anywhere
 *     in the pipeline and none is invented here: no green/red on a score, no
 *     up/down arrow, no "positive news" wording. The ⓘ card shows the five
 *     factors AND their product, so an unexplainable score is visible rather
 *     than trusted (§13's rule, applied to news).
 *  B. AN EMPTY WINDOW IS THE ORDINARY FIRST VISIT, NOT AN ERROR. The GET
 *     never fetches — it reads stored articles — so a window with nothing in
 *     it renders as a state with its remedy (the fetch button) attached.
 *  C. ARTICLE TEXT IS UNTRUSTED INPUT (§81). Headlines render as text (React
 *     escapes them), links are accepted only when they are http(s), and an
 *     article the sanitizer flagged as instruction-shaped is shown WITH a
 *     warning badge — the flag protects the model and warns the reader; it
 *     never censors the news.
 *  D. THE AS-OF GATE IS VISIBLE. Articles published after `as_of` are
 *     excluded from the analysis, and the count of what the gate removed is
 *     printed rather than silently dropped.
 *
 * Everything else follows Phase C/E: server reasons render verbatim
 * (§26/§36), a null is never a zero, and provenance comes from the payload's
 * own block.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Term from "@/components/shared/Term";
import { useToast } from "@/components/shared/Toast";
import { api } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type {
  EventNewsBackfillResult,
  EventNewsPayload,
  NewsArticleRef,
  NewsCluster,
  NewsCounts,
  NewsEvidence,
  NewsScoreComponents,
  NewsTheme,
} from "@/lib/types";
import type { TFn } from "./event-format";
import {
  COMPONENT_KEYS,
  COMPONENT_TERM,
  COUNT_KEYS,
  backfillStoredNothing,
  clusterMembers,
  clustersByIds,
  componentProduct,
  componentValue,
  countValue,
  displayTitle,
  evidenceForCluster,
  fmtScore,
  freshnessLine,
  isoStamp,
  publishedLocal,
  safeUrl,
  unavailableText,
} from "./news-format";

/** Bilingual label per §26 count. The order lives in COUNT_KEYS. */
const COUNT_LABEL: Record<string, { en: string; zh: string }> = {
  raw: { en: "raw", zh: "原始" },
  unique: { en: "unique", zh: "去重" },
  clusters: { en: "clusters", zh: "聚合" },
  material: { en: "material", zh: "重要" },
  themes: { en: "themes", zh: "主题" },
};

/** Bilingual label per §25 factor, for the ⓘ card's rows. */
const COMPONENT_LABEL: Record<string, { en: string; zh: string }> = {
  relevance: { en: "Relevance", zh: "相关性" },
  materiality: { en: "Materiality", zh: "重要度" },
  novelty: { en: "Novelty", zh: "新颖度" },
  source_quality: { en: "Source quality", zh: "来源质量" },
  decay: { en: "Time decay", zh: "时间衰减" },
};

/**
 * Bilingual label per §24 materiality category.
 *
 * A translation TABLE, 1:1 and total over CATEGORY_ORDER, with the raw token
 * as fallback — the display can never name a category the server did not
 * send, and an unknown token surfaces as itself rather than as "OTHER".
 */
const CATEGORY_LABEL: Record<string, { en: string; zh: string }> = {
  EARNINGS: { en: "EARNINGS", zh: "财报" },
  GUIDANCE: { en: "GUIDANCE", zh: "业绩指引" },
  PRODUCT: { en: "PRODUCT", zh: "产品" },
  CUSTOMER: { en: "CUSTOMER", zh: "客户" },
  CONTRACT: { en: "CONTRACT", zh: "合同" },
  REGULATION: { en: "REGULATION", zh: "监管" },
  LEGAL: { en: "LEGAL", zh: "法律诉讼" },
  MANAGEMENT: { en: "MANAGEMENT", zh: "管理层" },
  "M&A": { en: "M&A", zh: "并购" },
  CAPITAL_ALLOCATION: { en: "CAPITAL ALLOCATION", zh: "资本配置" },
  SUPPLY_CHAIN: { en: "SUPPLY CHAIN", zh: "供应链" },
  COMPETITION: { en: "COMPETITION", zh: "竞争" },
  ANALYST_REVISION: { en: "ANALYST REVISION", zh: "分析师调整" },
  MACRO_EXPOSURE: { en: "MACRO EXPOSURE", zh: "宏观敞口" },
  INDUSTRY: { en: "INDUSTRY", zh: "行业" },
  OTHER: { en: "OTHER", zh: "其他" },
};

function categoryText(category: string | null | undefined, t: TFn): string {
  if (category == null || category === "") return t("uncategorised", "未分类");
  const label = CATEGORY_LABEL[category];
  return label == null ? category.replace(/_/g, " ") : t(label.en, label.zh);
}

/* ------------------------------------------------------------- primitives */

/** The §24 category badge. Neutral by design — a category is not a verdict. */
function CategoryBadge({ category }: { category: string | null | undefined }) {
  const t = useT();
  return (
    <Term k="news_materiality">
      <span className="badge dim nt-category" data-testid="category-badge">
        {categoryText(category, t)}
      </span>
    </Term>
  );
}

/**
 * The score chip and its ⓘ card.
 *
 * The card shows all five factors AND the product it recomputes from them,
 * beside the server's own score. When the two disagree the card SAYS so
 * rather than hiding it: §13 forbids a score whose arithmetic cannot be
 * followed, and a silent mismatch is the same failure wearing a number.
 *
 * `<details>` rather than a hover tooltip: the card is keyboard reachable and
 * works on touch, which a title attribute does not.
 */
function ScoreChip({
  score,
  components,
  matchedTerms,
  testId,
}: {
  score: number | null | undefined;
  components: NewsScoreComponents | null | undefined;
  matchedTerms?: string[];
  testId?: string;
}) {
  const t = useT();
  const text = fmtScore(score);
  const product = componentProduct(components);
  const productText = fmtScore(product);
  // Only a REAL disagreement counts: an absent score or an incomplete
  // component block is "not checkable", which is a different statement.
  const mismatch =
    product != null && score != null && Number.isFinite(score)
      ? Math.abs(product - score) > 1e-6
      : false;

  return (
    <details className="nt-score" data-testid={testId}>
      <summary>
        <span className="nt-score-val" data-testid="score-value">
          {text ?? t("no score", "无评分")}
        </span>
        <span className="nt-score-info" aria-hidden="true">
          ⓘ
        </span>
      </summary>
      <div className="nt-score-card" data-testid="score-components">
        <p className="nt-score-formula">
          <Term k="news_evidence_score">
            <span>
              {t(
                "relevance × materiality × novelty × source × decay",
                "相关性 × 重要度 × 新颖度 × 来源 × 衰减",
              )}
            </span>
          </Term>
        </p>
        <ul className="nt-score-list">
          {COMPONENT_KEYS.map((key) => {
            const value = componentValue(components, key);
            const valueText = fmtScore(value);
            const label = COMPONENT_LABEL[key];
            return (
              <li key={key} data-testid={`component-${key}`}>
                <Term k={COMPONENT_TERM[key]}>
                  <span className="nt-score-key">
                    {label == null ? key : t(label.en, label.zh)}
                  </span>
                </Term>
                <span className="nt-score-num">
                  {valueText ?? (
                    <span className="nt-unavailable">
                      {t("not sent", "服务端未提供")}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="nt-score-product" data-testid="score-product">
          {productText == null
            ? t(
                "Product not checkable — the server did not send all five factors.",
                "无法核验乘积 — 服务端未提供全部五个因子。",
              )
            : t(`= ${productText}`, `= ${productText}`)}
          {mismatch && (
            <span className="nt-mismatch" data-testid="score-mismatch">
              {" "}
              {t(
                `— does NOT match the reported score ${text}. Report this: a score that cannot be reproduced from its own factors is a defect, not a judgement.`,
                `— 与所报告的评分 ${text} 不一致。请反馈该问题:无法由自身因子还原的评分属于缺陷,而非判断结果。`,
              )}
            </span>
          )}
        </p>
        {matchedTerms != null && matchedTerms.length > 0 && (
          <p className="nt-matched" data-testid="matched-terms">
            {t("Matched terms: ", "命中词条：")}
            {/* Verbatim lexicon hits — the evidence FOR the category. */}
            <span className="mono">{matchedTerms.join(", ")}</span>
          </p>
        )}
        <p className="nt-score-note">
          {t(
            "A ranking of attention, not a direction — nothing here says whether the news is good or bad for the stock.",
            "这是注意力排序,而非方向判断 — 其中任何内容都不表示该消息对股价是利好还是利空。",
          )}
        </p>
      </div>
    </details>
  );
}

/**
 * One source article: headline, publisher, local publication time, link.
 *
 * `title` is rendered as TEXT (React escapes it) and `url` passes through
 * `safeUrl`, so a `javascript:` href in a provider field is dropped rather
 * than made clickable. A ref that carries only a `source_id` — the id-only
 * fallback for a member the seam did not expand — says exactly that instead
 * of showing a blank row.
 */
function ArticleRow({ article }: { article: NewsArticleRef }) {
  const t = useT();
  const { lang } = useLang();
  const title = displayTitle(article);
  const href = safeUrl(article.url);
  const when = publishedLocal(article.published_at, lang as Lang);
  return (
    <li className="nt-article" data-testid="article-row">
      <div className="nt-article-title">
        {title == null ? (
          <span className="nt-unavailable">
            {t(
              `Article ${article.source_id} — no title stored for it.`,
              `文章 ${article.source_id} — 未存储标题。`,
            )}
          </span>
        ) : (
          title
        )}
        {article.suspicious_instruction === true && (
          <>
            {" "}
            <Term k="news_untrusted_text">
              <span className="badge amber" data-testid="suspicious-badge">
                {t("INSTRUCTION-LIKE TEXT", "含疑似指令文本")}
              </span>
            </Term>
          </>
        )}
      </div>
      <div className="nt-article-meta">
        {/* Verbatim publisher token — who asserted it. */}
        <span className="nt-publisher">{article.publisher ?? t("unknown publisher", "发布方未知")}</span>
        {when != null && (
          <>
            {" · "}
            <span data-testid="article-time">{when}</span>
          </>
        )}
        {href != null && (
          <>
            {" · "}
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="src-link"
            >
              {t("Open article →", "打开原文 →")}
            </a>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * One cluster: the canonical headline, its score chip, and — expanded — every
 * source article that made it up.
 *
 * `article_count` is printed even at 1, because "one outlet reported this"
 * and "six did" are different facts about a development and the count is the
 * only place either is stated.
 */
function ClusterBlock({
  cluster,
  evidence,
}: {
  cluster: NewsCluster;
  evidence: NewsEvidence[];
}) {
  const t = useT();
  const row = evidenceForCluster(evidence, cluster.cluster_id)[0] ?? null;
  const members = clusterMembers(cluster);
  const canonicalTitle = displayTitle(cluster.canonical_article);
  const count = cluster.article_count ?? members.length;
  const duplicates = Object.keys(cluster.duplicate_of ?? {}).length;

  return (
    <details className="nt-cluster" data-testid="cluster-block">
      <summary>
        <span className="nt-cluster-title">
          {canonicalTitle ??
            t(
              `Story ${cluster.cluster_id} — no canonical headline stored.`,
              `事件 ${cluster.cluster_id} — 未存储代表标题。`,
            )}
        </span>
        <span className="nt-cluster-meta">
          <Term k="news_cluster">
            <span data-testid="cluster-count">
              {t(
                `${count} article${count === 1 ? "" : "s"}`,
                `${count} 篇文章`,
              )}
            </span>
          </Term>
          {duplicates > 0 && (
            <span data-testid="cluster-duplicates">
              {" · "}
              {t(
                `${duplicates} duplicate${duplicates === 1 ? "" : "s"} folded in`,
                `已折叠 ${duplicates} 篇重复报道`,
              )}
            </span>
          )}
        </span>
      </summary>
      <div className="nt-cluster-body">
        <div className="nt-cluster-scoreline">
          <CategoryBadge category={row?.category} />
          <ScoreChip
            score={row?.score}
            components={row?.components}
            matchedTerms={row?.matched_terms}
            testId={`score-${cluster.cluster_id}`}
          />
        </div>
        <ul className="nt-article-list">
          {members.map((member) => (
            <ArticleRow key={member.source_id} article={member} />
          ))}
        </ul>
      </div>
    </details>
  );
}

/**
 * (2) KEY THEMES (§59) — material clusters grouped by category.
 *
 * A theme's `n_developments` counts CLUSTERS, not articles, and the wording
 * says "developments" for exactly that reason: "4 articles" and "4 distinct
 * developments" are different claims and the second is the one the number
 * supports.
 */
function ThemesBlock({
  themes,
  clusters,
  evidence,
}: {
  themes: NewsTheme[];
  clusters: NewsCluster[];
  evidence: NewsEvidence[];
}) {
  const t = useT();
  return (
    <div className="panel">
      <h2>
        <Term k="news_theme">
          <span>{t("Key themes", "关键主题")}</span>
        </Term>{" "}
        <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
      </h2>
      {themes.length === 0 ? (
        <p className="empty" data-testid="no-themes">
          {t(
            "No material developments in this window. That is a finding, not a gap: articles were analysed and none scored at or above the materiality cut.",
            "该窗口内没有重要进展。这是一项结论,而非数据缺失:文章已被分析,但没有一条达到重要度门槛。",
          )}
        </p>
      ) : (
        <ul className="nt-theme-list" data-testid="theme-list">
          {themes.map((theme) => {
            const themeClusters = clustersByIds(clusters, theme.cluster_ids);
            const n = theme.n_developments ?? themeClusters.length;
            return (
              <li key={theme.label} className="nt-theme" data-testid="theme-row">
                <details>
                  <summary>
                    <CategoryBadge category={theme.category} />
                    {/* Verbatim server label — category plus its salient terms. */}
                    <span className="nt-theme-label">{theme.label}</span>
                    <span className="nt-theme-count" data-testid="theme-count">
                      {t(
                        `${n} development${n === 1 ? "" : "s"}`,
                        `${n} 项进展`,
                      )}
                    </span>
                  </summary>
                  <div className="nt-theme-body">
                    {themeClusters.length === 0 ? (
                      <p className="nt-unavailable" data-testid="theme-no-clusters">
                        {t(
                          "The clusters this theme names are not in this payload — the server capped the cluster list before them.",
                          "该主题所指向的聚合组不在本次返回数据中 — 服务端在其之前已截断聚合列表。",
                        )}
                      </p>
                    ) : (
                      themeClusters.map((cluster) => (
                        <ClusterBlock
                          key={cluster.cluster_id}
                          cluster={cluster}
                          evidence={evidence}
                        />
                      ))
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * (1) The §26 counts funnel.
 *
 * A count of 0 is printed as 0. Only a count the server never sent renders
 * as a dash — "no material developments" is a finding and must not be
 * indistinguishable from "this number is missing".
 */
function CountsStrip({ counts }: { counts: NewsCounts | null | undefined }) {
  const t = useT();
  return (
    <p className="nt-counts" data-testid="counts-strip">
      <Term k="news_counts">
        <span className="nt-counts-inner">
          {COUNT_KEYS.map((key, i) => {
            const value = countValue(counts, key);
            const label = COUNT_LABEL[key];
            return (
              <span key={key} data-testid={`count-${key}`}>
                {i > 0 && <span className="nt-sep"> · </span>}
                <span className="nt-count-num">{value ?? "—"}</span>{" "}
                <span className="nt-count-key">
                  {label == null ? key : t(label.en, label.zh)}
                </span>
              </span>
            );
          })}
        </span>
      </Term>
    </p>
  );
}

/**
 * (3) The ranked evidence list (§25/§27).
 *
 * Deliberately flat and deliberately after the themes: the themes answer
 * "what is going on", this answers "in what order should I read it". Every
 * row carries its own five factors, so the ranking is auditable row by row
 * rather than only in aggregate.
 */
function EvidenceList({
  evidence,
  total,
}: {
  evidence: NewsEvidence[];
  /** Rows BEFORE the transport cut, so a capped list cannot read as complete. */
  total?: number;
}) {
  const t = useT();
  const { lang } = useLang();
  if (evidence.length === 0) return null;
  const truncated = total != null && total > evidence.length;
  return (
    <div className="panel">
      <h2>
        <Term k="news_evidence_score">
          <span>{t("Ranked evidence", "证据排序")}</span>
        </Term>{" "}
        <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
      </h2>
      <p className="cg-meaning">
        {t(
          "Ranked by evidence score, highest first. The score orders attention and carries no direction — it never says whether a development is good or bad for the stock, and no sentiment is computed anywhere in this pipeline.",
          "按证据评分从高到低排序。该评分只决定关注顺序,不含方向判断 — 它不表示某项进展对股价是利好还是利空,本流程中也不计算任何情绪指标。",
        )}
      </p>
      {truncated && (
        <p className="nt-note" data-testid="evidence-truncated">
          {t(
            `Showing the top ${evidence.length} of ${total} ranked rows — the server caps the list for transport. The counts above are computed over ALL of them, so the §26 headline does not change with this cut.`,
            `仅显示排序后前 ${evidence.length} 条(共 ${total} 条) — 服务端为控制传输量对列表做了截断。上方计数基于「全部」条目计算,因此该截断不会改变 §26 的计数结果。`,
          )}
        </p>
      )}
      <ul className="nt-evidence-list" data-testid="evidence-list">
        {evidence.map((row) => {
          const article = row.article ?? null;
          const title = displayTitle(article);
          const href = safeUrl(article?.url);
          const when = publishedLocal(article?.published_at, lang as Lang);
          return (
            <li key={row.evidence_id} className="nt-evidence" data-testid="evidence-row">
              <div className="nt-evidence-head">
                <CategoryBadge category={row.category} />
                <ScoreChip
                  score={row.score}
                  components={row.components}
                  matchedTerms={row.matched_terms}
                  testId={`evidence-score-${row.evidence_id}`}
                />
              </div>
              <div className="nt-evidence-title">
                {title ??
                  t(
                    `${row.evidence_id} — no headline stored.`,
                    `${row.evidence_id} — 未存储标题。`,
                  )}
                {article?.suspicious_instruction === true && (
                  <>
                    {" "}
                    <Term k="news_untrusted_text">
                      <span className="badge amber">
                        {t("INSTRUCTION-LIKE TEXT", "含疑似指令文本")}
                      </span>
                    </Term>
                  </>
                )}
              </div>
              <div className="nt-article-meta">
                <span className="nt-publisher">
                  {article?.publisher ?? t("unknown publisher", "发布方未知")}
                </span>
                {when != null && (
                  <>
                    {" · "}
                    {when}
                  </>
                )}
                {row.article_count != null && row.article_count > 1 && (
                  <>
                    {" · "}
                    {t(
                      `${row.article_count} articles in this story`,
                      `该事件共 ${row.article_count} 篇报道`,
                    )}
                  </>
                )}
                {href != null && (
                  <>
                    {" · "}
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="src-link"
                    >
                      {t("Open article →", "打开原文 →")}
                    </a>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------- tab */

/**
 * The tab body, split from the fetching wrapper so the render contract can be
 * tested against a payload directly, with no query client in the way.
 */
export function NewsTabContent({
  data,
  onBackfill,
  backfilling = false,
}: {
  data: EventNewsPayload;
  onBackfill: () => void;
  backfilling?: boolean;
}) {
  const t = useT();
  const { lang } = useLang();

  const backfillButton = (
    <div className="row" style={{ marginTop: 12 }}>
      <Term k="news_backfill">
        <span className="k">{t("News window", "新闻窗口")}</span>
      </Term>
      <button
        type="button"
        onClick={onBackfill}
        disabled={backfilling}
        data-testid="fetch-news"
      >
        {backfilling
          ? t("Fetching news…", "正在抓取新闻…")
          : t("Fetch news for this window", "抓取该窗口的新闻")}
      </button>
    </div>
  );

  // `available:false` covers TWO different situations on this seam, and
  // collapsing them is how the ordinary first visit becomes a dead end:
  //
  //  - A STRUCTURAL absence (a macro event with no ticker) carries a top-level
  //    `reason` and there is nothing the user can do about it.
  //  - An EMPTY WINDOW carries no `reason` at all — the seam sets
  //    `available: bool(rows)`, so a ticker whose window simply has not been
  //    fetched yet lands here too. That one has a remedy, and hiding the
  //    fetch button behind a bare "unavailable" would strand the user on the
  //    exact screen the button exists for.
  //
  // The presence of a top-level reason is what tells them apart.
  if (data.available === false && data.reason != null && data.reason !== "") {
    return (
      <div className="panel">
        <h2>{t("News evidence", "新闻证据")}</h2>
        <p className="empty" data-testid="news-unavailable">
          {unavailableText(data.reason, t)}
        </p>
      </div>
    );
  }

  const counts = data.counts ?? null;
  const themes = data.themes ?? [];
  const clusters = data.clusters ?? [];
  const evidence = data.evidence ?? [];
  const unavailable = data.unavailable ?? [];
  const excluded = data.excluded ?? {};
  const afterAsOf = excluded["after_as_of"] ?? 0;
  const policy = data.untrusted_text_policy ?? null;
  const articleProvenance = data.provenance?.articles ?? "DATA";
  const scoreProvenance = data.provenance?.scores ?? "QUANT";
  const rawCount = countValue(counts, "raw");
  const emptyWindow =
    data.available === false ||
    rawCount === 0 ||
    (rawCount == null && clusters.length === 0);

  return (
    <>
      <div className="panel">
        <h2>
          {t("News evidence", "新闻证据")}{" "}
          <span className="provenance data-driven">
            {t(articleProvenance, articleProvenance === "DATA" ? "数据" : articleProvenance)}
          </span>{" "}
          <span className="provenance quant-derived">
            {t(scoreProvenance, scoreProvenance === "QUANT" ? "量化" : scoreProvenance)}
          </span>
        </h2>

        <CountsStrip counts={counts} />

        <p className="nt-freshness" data-testid="news-window">
          <Term k="news_window">
            <span>{t("Window", "窗口")}</span>
          </Term>{" "}
          <span className="mono">{isoStamp(data.window?.start) ?? "—"}</span>
          {" → "}
          <span className="mono">{isoStamp(data.window?.end) ?? "—"}</span>
          {" · "}
          {/* Verbatim server token — WHICH rule set the window's start. */}
          <span className="mono">{data.window?.basis ?? "—"}</span>
          {" · "}
          <Term k="news_as_of">
            <span>{t("as of", "计算时点")}</span>
          </Term>{" "}
          <span className="mono" data-testid="news-as-of">
            {data.as_of ?? "—"}
          </span>
        </p>

        <p className="nt-freshness" data-testid="news-freshness">
          {freshnessLine(data.freshness, t, lang as Lang)}
        </p>

        {afterAsOf > 0 && (
          <p className="nt-note" data-testid="excluded-after-as-of">
            {t(
              `${afterAsOf} stored article${afterAsOf === 1 ? " was" : "s were"} published after the as-of instant and ${afterAsOf === 1 ? "is" : "are"} EXCLUDED from every count and score above — this view reproduces what was knowable then, not what is known now.`,
              `另有 ${afterAsOf} 篇已存储文章的发布时间晚于计算时点,已从上述全部计数与评分中「排除」 — 本视图还原的是当时可知的信息,而非当下已知的信息。`,
            )}
          </p>
        )}

        {emptyWindow && (
          <p className="empty" data-testid="news-empty-window">
            {t(
              "No articles are stored for this window yet. Opening this tab never fetches news — it reads what is already stored, so scrolling through events costs no provider calls. Press the button to fetch this window.",
              "该窗口尚未存储任何文章。打开本页绝不会抓取新闻 — 它只读取已存储的内容,因此浏览事件不消耗任何数据源调用。点击按钮即可抓取该窗口。",
            )}
          </p>
        )}

        {backfillButton}
      </div>

      <ThemesBlock themes={themes} clusters={clusters} evidence={evidence} />

      <EvidenceList evidence={evidence} total={data.evidence_total} />

      <div className="panel">
        <h2>{t("How to read this tab", "如何理解本页")}</h2>
        <p className="nt-note" data-testid="news-policy">
          <Term k="news_untrusted_text">
            <span>{t("Untrusted text", "不可信文本")}</span>
          </Term>
          {" — "}
          {policy?.rule != null && policy.rule !== "" ? (
            /* Verbatim server policy wording (§26/§36). */
            <span className="mono">{policy.rule}</span>
          ) : (
            t(
              "the server sent no text policy for this window.",
              "服务端未提供该窗口的文本处理策略说明。",
            )
          )}
          {policy?.suspicious_articles != null && policy.suspicious_articles > 0 && (
            <span data-testid="suspicious-count">
              {" "}
              {t(
                `${policy.suspicious_articles} article${policy.suspicious_articles === 1 ? "" : "s"} in this window contain instruction-shaped lines. They are shown to you in full and flagged; no model is allowed to act on them.`,
                `该窗口内有 ${policy.suspicious_articles} 篇文章包含形如指令的语句。它们会完整展示并加以标记;任何模型都不得据其行动。`,
              )}
            </span>
          )}
        </p>
        {unavailable.length > 0 && (
          <ul className="nt-unavailable-list" data-testid="news-unavailable-list">
            {unavailable.map((u) => (
              <li key={u.field}>
                <span className="mono">{u.field}</span> —{" "}
                {/* Verbatim server reason (§26/§36). */}
                <span className="nt-unavailable">{u.reason}</span>
              </li>
            ))}
          </ul>
        )}
        {/* Stated UNCONDITIONALLY. The seam sends no `not_backtestable` list
            for news, and a caveat that appears only when a server key happens
            to be present is a caveat that silently disappears. */}
        <p className="nt-note" data-testid="news-not-backtestable">
          {data.not_backtestable != null && data.not_backtestable.length > 0 && (
            <>
              {t("Not backtested: ", "未经回测：")}
              <span className="mono">{data.not_backtestable.join(", ")}</span>
              {". "}
            </>
          )}
          {t(
            "Clustering and scoring are similarity rules, not an understanding of the news, and nothing here has been tested as a trading rule. The score ranks attention; it asserts no direction and no sentiment.",
            "聚合与评分均为相似度规则,而非对新闻内容的真正理解;本页任何内容都未作为交易规则被检验过。评分只用于决定关注顺序,不表示任何方向或情绪判断。",
          )}
        </p>
      </div>
    </>
  );
}

/**
 * The fetching wrapper mounted by the event detail page.
 *
 * `asOf` is threaded into the query key: two as-of instants are two different
 * answers (an article published between them changes the counts, the clusters
 * and every novelty factor downstream of them), so they must never share a
 * cache entry.
 */
export default function NewsTab({
  eventId,
  asOf,
}: {
  eventId: number;
  asOf?: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [, setNonce] = useState(0);

  const query = useQuery({
    queryKey: ["event-news", eventId, asOf ?? null],
    queryFn: () => api.events.news(eventId, asOf),
    enabled: Number.isFinite(eventId),
  });

  const backfill = useMutation({
    mutationFn: () => api.events.newsBackfill(eventId),
    onSuccess: (result: EventNewsBackfillResult) => {
      const stored = result.stored ?? 0;
      // A backfill that stored nothing is a RESULT with a reason, not a
      // success — reporting "done" here would imply articles that do not
      // exist. Throttled, provider-unconfigured and 403 all land here.
      if (backfillStoredNothing(result)) {
        const seen = result.articles ?? 0;
        if (seen > 0) {
          // The providers DID answer — every article was already on file.
          // Reporting this as "nothing arrived" would say the opposite of
          // what happened, so the fetched count is what sets the wording.
          toast(
            "INFO",
            t(
              `Nothing new — the providers returned ${seen} article${seen === 1 ? "" : "s"} and all of them were already stored.`,
              `无新增 — 数据源返回 ${seen} 篇文章,且均已存储。`,
            ),
          );
        } else {
          toast(
            "INFO",
            t(
              `No articles were stored: ${result.reason ?? "the server gave no reason"}`,
              `未存储任何文章：${result.reason ?? "服务端未提供原因"}`,
            ),
          );
        }
      } else {
        toast(
          "SUCCESS",
          t(
            `Stored ${stored} article${stored === 1 ? "" : "s"} — the counts and scores below are recomputed from them.`,
            `已存储 ${stored} 篇文章 — 下方计数与评分已据此重新计算。`,
          ),
        );
      }
      qc.invalidateQueries({ queryKey: ["event-news", eventId] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      setNonce((n) => n + 1);
    },
    onError: (e: Error) =>
      toast(
        "WARNING",
        t(`News fetch failed: ${e.message}`, `新闻抓取失败：${e.message}`),
      ),
  });

  if (query.isLoading) {
    return (
      <div className="panel">
        <h2>{t("News evidence", "新闻证据")}</h2>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  if (query.error != null || query.data == null) {
    return (
      <div className="panel">
        <h2>{t("News evidence", "新闻证据")}</h2>
        <p className="error" data-testid="news-error">
          {t(
            `Could not load the news evidence: ${query.error?.message ?? "no response"}`,
            `无法加载新闻证据：${query.error?.message ?? "无响应"}`,
          )}
        </p>
      </div>
    );
  }

  return (
    <NewsTabContent
      data={query.data}
      onBackfill={() => backfill.mutate()}
      backfilling={backfill.isPending}
    />
  );
}
