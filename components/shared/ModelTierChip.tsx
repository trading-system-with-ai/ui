"use client";

/**
 * §5 model-tier chip — the CLASSIFICATION artefact the compliance audit found
 * missing ("today a reader cannot ask a model what tier it is").
 *
 * What it is NOT: a trust badge. Tier says what KIND of model produced a
 * number; §41 health says whether that model is working, and §70 mode says
 * whether it decides anything. All three are shown together precisely so
 * none of them is read as the others — a TIER_1 model in SHADOW with ACTIVE
 * health still changes no trading decision.
 *
 * House rules honored here:
 *  - The chip renders NOTHING when the server sent no tier (older backends).
 *    An unknown tier is not guessed at and not defaulted to TIER_1.
 *  - An UNRECOGNISED token still renders, verbatim, in the neutral tone: a
 *    tier the backend adds later must stay legible rather than vanish.
 *  - The label is the token (TIER_0 … TIER_3), which reads identically in
 *    both languages; only the explanatory tooltip is translated.
 */
import { useT } from "@/lib/i18n";
import type { ModelTier } from "@/lib/types";

/**
 * Tone per tier, ordered by DISTANCE FROM DECIDING rather than by risk.
 * TIER_0 is the accent because it is the only tier that vetoes a trade
 * today; the statistical tiers are progressively dimmer as they move further
 * into research. The colours rank provenance, never quality.
 */
const TIER_BADGE: Record<ModelTier, string> = {
  TIER_0: "accent",
  TIER_1: "green",
  TIER_2: "amber",
  TIER_3: "dim",
};

/** Bilingual "what this tier means" text, shown as the chip's title. */
function useTierTitle(): (tier: string) => string {
  const t = useT();
  return (tier: string) => {
    switch (tier) {
      case "TIER_0":
        return t(
          "Tier 0 — hard limits. The only tier that vetoes a trade today.",
          "第 0 层 — 硬性限额。目前唯一能否决交易的层级。",
        );
      case "TIER_1":
        return t(
          "Tier 1 — core statistical models (VaR/ES, volatility, risk contribution, drawdown, stress). SHADOW: computed and displayed, decides nothing.",
          "第 1 层 — 核心统计模型（VaR/ES、波动率、风险贡献、回撤、压力测试）。影子模式：仅计算与展示，不参与决策。",
        );
      case "TIER_2":
        return t(
          "Tier 2 — conditional and advanced models (GARCH, volatility-scaled views). SHADOW/RESEARCH: decides nothing.",
          "第 2 层 — 条件与进阶模型（GARCH、波动率调整视角）。影子模式／研究：不参与决策。",
        );
      case "TIER_3":
        return t(
          "Tier 3 — documented-deferred research models (EVT, copulas). Not built; each deferral carries a recorded re-visit trigger.",
          "第 3 层 — 已记录并延后的研究模型（EVT、Copula）。尚未构建；每项延后都附有可触发的复审条件。",
        );
      default:
        // A tier the backend added after this build: shown, not interpreted.
        return t(
          `Model tier ${tier} — reported by the server.`,
          `模型层级 ${tier} — 由服务端提供。`,
        );
    }
  };
}

/**
 * Renders the tier chip, or nothing at all when `tier` is null/undefined.
 *
 * `compact` drops the "TIER_" prefix to "T0".."T3" for dense contexts (table
 * cells beside a model name); the title still carries the full sentence.
 */
export default function ModelTierChip({
  tier,
  compact = false,
}: {
  tier?: ModelTier | string | null;
  compact?: boolean;
}) {
  const title = useTierTitle();
  // Honest absence: no tier on the wire → no chip. Never a default.
  if (tier == null || tier === "") return null;
  const tone = TIER_BADGE[tier as ModelTier] ?? "dim";
  // "TIER_2" → "T2"; an unrecognised token keeps its full text either way.
  const label =
    compact && /^TIER_\d+$/.test(tier) ? `T${tier.slice("TIER_".length)}` : tier;
  return (
    <span
      className={`badge ${tone}`}
      style={{ marginLeft: 6 }}
      title={title(tier)}
      data-tier={tier}
    >
      {label}
    </span>
  );
}
