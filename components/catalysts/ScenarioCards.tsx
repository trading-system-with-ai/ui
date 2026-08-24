"use client";

/**
 * Phase F — the §51 scenario framework and the §50 surprise threshold.
 *
 * §51 forbids the two-card "bullish / bearish" split, and the reason is not
 * presentational: two cards force every reader into a direction, while the
 * question that actually decides an earnings trade is what would have to be
 * TRUE for each path. So the cards are UPSIDE / BASE / DOWNSIDE, always all
 * three, always led by their conditions.
 *
 * Rules this component holds:
 *
 *  A. NO PROBABILITIES ANYWHERE. No percentage on a card, no ordering by
 *     likelihood, no green/red. A scenario is a conditional statement; a
 *     number beside it would be a forecast the platform cannot back, and the
 *     §50 confidence chip is explicitly NOT a probability.
 *  B. CONDITIONS COME FIRST. `SCENARIO_FIELDS` fixes the order — what has to
 *     happen, what the guidance would have to say, and only then why the
 *     market would react. Leading with the reaction is storytelling.
 *  C. A MISSING LEG IS SAID, NOT DRAWN. An empty scenario renders as a
 *     labelled gap. A card silently omitted would make a two-sided framework
 *     look one-sided.
 */
import { useT } from "@/lib/i18n";
import type { AnalysisScenario, EventAnalysisBody } from "@/lib/types";
import {
  SCENARIO_FIELDS,
  SCENARIO_FIELD_LABEL,
  SCENARIO_KEYS,
  SCENARIO_LABEL,
  type ScenarioKey,
  confidenceBadge,
  confidenceText,
  narrativeText,
  scenarioEmpty,
  stringList,
} from "./analysis-format";

/**
 * One scenario card.
 *
 * The heading is the leg's name in the platform's neutral vocabulary — no
 * arrow, no colour. `UPSIDE` is a direction of price, not a recommendation,
 * and painting it green is how a conditional becomes a call.
 */
function ScenarioCard({
  scenarioKey,
  scenario,
}: {
  scenarioKey: ScenarioKey;
  scenario: AnalysisScenario | null | undefined;
}) {
  const t = useT();
  const label = SCENARIO_LABEL[scenarioKey];
  const empty = scenarioEmpty(scenario);
  const refs = stringList(scenario?.evidence_refs);

  return (
    <div className="an-scenario" data-testid={`scenario-${scenarioKey}`}>
      <div className="an-scenario-head">
        <span className="an-scenario-name">{t(label.en, label.zh)}</span>
      </div>
      {empty ? (
        <p className="empty" data-testid={`scenario-empty-${scenarioKey}`}>
          {t(
            "The model returned nothing for this scenario. It is listed anyway — a framework missing a side is not a one-sided framework.",
            "模型未针对该情景给出内容。此处仍予以列出 — 缺少一侧的情景框架,并不等于该情景不存在。",
          )}
        </p>
      ) : (
        <>
          {SCENARIO_FIELDS.map((field) => {
            const text = narrativeText(scenario?.[field]);
            if (text == null) return null;
            const fieldLabel = SCENARIO_FIELD_LABEL[field];
            return (
              <div className="an-scenario-field" key={field}>
                <div className="k">{t(fieldLabel.en, fieldLabel.zh)}</div>
                <p className="an-prose">{text}</p>
              </div>
            );
          })}
          {refs.length > 0 && (
            <p className="an-scenario-refs" data-testid={`scenario-refs-${scenarioKey}`}>
              <span className="k">{t("Evidence", "证据")}</span>{" "}
              {refs.map((ref) => (
                <span className="an-ref mono" key={ref}>
                  {ref}
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * §50 — the surprise threshold.
 *
 * "How big a beat would it take to move this?" is the single most useful
 * sentence on an earnings preview and the easiest to mistake for a forecast,
 * so the confidence chip is neutral-coloured and carries the not-a-
 * probability line right beside it rather than in a footnote nobody reads.
 */
export function SurpriseThreshold({
  analysis,
}: {
  analysis: EventAnalysisBody | null | undefined;
}) {
  const t = useT();
  const block = analysis?.surprise_threshold ?? null;
  const narrative = narrativeText(block?.narrative);
  const confidence = confidenceText(block?.confidence, t);
  if (narrative == null && confidence == null) return null;

  return (
    <div className="an-threshold" data-testid="surprise-threshold">
      <div className="an-threshold-head">
        <span className="k">{t("Surprise threshold", "预期差阈值")}</span>
        {confidence != null && (
          <span
            className={`badge ${confidenceBadge()}`}
            data-testid="threshold-confidence"
          >
            {confidence}
          </span>
        )}
      </div>
      {narrative != null && <p className="an-prose">{narrative}</p>}
      <p className="an-note" data-testid="threshold-not-probability">
        {t(
          "Confidence here is the model's own wording, not a probability. Nothing on this tab has a measured hit rate behind it, and no scenario carries odds.",
          "此处的置信度只是模型自身的措辞,并非概率。本页任何内容都没有经过实测的命中率作为支撑,任何情景也都不附带赔率。",
        )}
      </p>
    </div>
  );
}

/**
 * The three-card §51 framework.
 *
 * Always renders all three keys, in the fixed order, even when the analysis
 * object is missing entirely — the absence then reads as "the model produced
 * no scenarios", which is a state, rather than as a section that was never
 * part of the product.
 */
export default function ScenarioCards({
  analysis,
}: {
  analysis: EventAnalysisBody | null | undefined;
}) {
  const t = useT();
  const scenarios = analysis?.scenarios ?? {};

  return (
    <div className="an-scenarios" data-testid="scenario-cards">
      <p className="an-note">
        {t(
          "Three paths, each defined by what would have to be true — not by how likely it is. There are no probabilities here and the order is fixed, so no card reads as the expected one.",
          "三条路径,每条都由「需要发生什么」来定义,而非由发生概率来定义。此处不含任何概率,且卡片顺序固定,因此没有任何一张卡片被暗示为「预期结果」。",
        )}
      </p>
      <div className="an-scenario-grid">
        {SCENARIO_KEYS.map((key) => (
          <ScenarioCard key={key} scenarioKey={key} scenario={scenarios[key]} />
        ))}
      </div>
      <SurpriseThreshold analysis={analysis} />
    </div>
  );
}
