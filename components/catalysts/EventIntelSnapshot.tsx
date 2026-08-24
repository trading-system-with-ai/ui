"use client";

/**
 * The compact "Event Intelligence Snapshot" for the Overview tab (Catalyst
 * research upgrade, plan Phase 9).
 *
 * WHAT IT IS NOT, first, because the brief is explicit about both:
 *
 *  - NOT a giant AI card. It is a few counted facts and at most one
 *    prediction-market line. Every narrative claim lives in the Analysis
 *    tab, where it wears its LLM tier.
 *  - NOT a single "AI score" (Phase 23). Nothing here is averaged into one
 *    opaque number. The counts are counts, and each is defined by the query
 *    that produced it: admitted documents, official sources, matched
 *    markets.
 *
 * FRESHNESS IS PART OF THE FACT. A count with no retrieval time is a claim
 * about now that may be a week old, so the card shows when the research was
 * retrieved and when the pricing was observed, or says plainly that it has
 * never been run.
 */
import { useT } from "@/lib/i18n";
import type {
  PredictionMarketsSection,
  WebResearchSection,
} from "@/lib/types-research";
import {
  pricingText,
  relationHelp,
  relationLabel,
  relationScopeNote,
} from "./PredictionMarketsPanel";

function Row({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="intel-row" data-testid={testId}>
      <span className="muted intel-label">{label}</span>
      <span className="intel-value">{children}</span>
    </div>
  );
}

export default function EventIntelSnapshot({
  research,
  markets,
}: {
  research: WebResearchSection | undefined;
  markets: PredictionMarketsSection | undefined;
}) {
  const t = useT();

  // Nothing researched at all: one honest sentence beats an empty card of
  // zeros, which would read as "we looked and found nothing".
  const researchRun = Boolean(research?.available);
  const marketsRun = Boolean(markets?.available);
  if (!researchRun && !marketsRun) {
    return (
      <section className="panel intel-snapshot" data-testid="intel-snapshot">
        <h3>{t("Event intelligence", "事件情报")}</h3>
        <p className="muted" data-testid="intel-empty">
          {t(
            "No external research has been run for this event yet.",
            "尚未针对本次事件执行外部研究。",
          )}
        </p>
      </section>
    );
  }

  const evidence = research?.important_evidence ?? [];
  const officialCount = evidence.filter(
    (e) => e.source_tier === "OFFICIAL" || e.source_tier === "PRIMARY",
  ).length;

  const accepted = markets?.matched_markets ?? [];
  // The headline market is the most directly related one — a DIRECT contract
  // measures this event; a CONTEXT one merely shares its weather.
  const headline =
    accepted.find((m) => m.relation === "DIRECT") ??
    accepted.find((m) => m.relation === "DERIVED") ??
    accepted[0];

  return (
    <section className="panel intel-snapshot" data-testid="intel-snapshot">
      <h3>{t("Event intelligence", "事件情报")}</h3>

      <Row label={t("Evidence", "证据")} testId="intel-evidence">
        {researchRun
          ? t(
              `${evidence.length} admitted · ${officialCount} official/primary`,
              `采纳 ${evidence.length} 条 · 官方/一手 ${officialCount} 条`,
            )
          : t("not researched", "未研究")}
      </Row>

      <Row label={t("Prediction markets", "预测市场")} testId="intel-markets">
        {marketsRun && headline ? (
          <>
            {/* The SAME humanised label and help text the Evidence panel
                uses — a raw enum here would both bypass i18n and drop the
                explanation on the surface that has the least room for it. */}
            <span className="badge dim" title={relationHelp(headline.relation, t)}>
              {relationLabel(headline.relation, t)}
            </span>{" "}
            {/* Pricing language, never "probability of the outcome" — and a
                SCOPE qualifier, so a DERIVED/CONTEXT contract cannot read as
                this event's own odds. */}
            {t("market-implied", "市场隐含")}{" "}
            {pricingText(headline.market_implied_probability, t)}
            {relationScopeNote(headline.relation, t) ? (
              <span className="muted"> {relationScopeNote(headline.relation, t)}</span>
            ) : null}
          </>
        ) : markets?.reason === "NO_RELEVANT_PREDICTION_MARKET" ? (
          t("No sufficiently relevant market.", "无足够相关的市场。")
        ) : markets?.reason === "MARKET_METADATA_UNAVAILABLE" ? (
          // A DEGRADATION, not an absence of research: markets matched but
          // could not be rendered. Saying "not researched" here would tell
          // the reader the platform never looked.
          t("Market details unavailable.", "市场详情不可用。")
        ) : (
          t("not researched", "未研究")
        )}
      </Row>

      <Row label={t("Research freshness", "研究时效")} testId="intel-freshness">
        {research?.retrieved_at
          ? t(`retrieved ${research.retrieved_at}`, `检索于 ${research.retrieved_at}`)
          : t("never run", "从未运行")}
      </Row>

      {/* matched_at is the instant MATCHING ran — not when pricing was
          observed. Each market carries its own observed_at (shown on the
          Evidence panel); labelling the match clock as an observation time
          would overstate the freshness of every price on the card. */}
      {markets?.matched_at ? (
        <Row label={t("Markets matched", "市场匹配于")} testId="intel-matched">
          {markets.matched_at}
        </Row>
      ) : null}
    </section>
  );
}
