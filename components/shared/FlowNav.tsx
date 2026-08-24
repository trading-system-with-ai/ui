"use client";

/**
 * FlowNav — the "you are here" pipeline strip rendered under every page
 * title. The platform is ONE decision pipeline (connect → research →
 * screen → validate → authorize → execute → risk → audit); each page is a
 * stage of it. The strip makes that explicit: every chip links to its
 * stage's page, the current stage is highlighted, and the trailing link
 * opens the Guide anchored at the current stage's handbook section.
 *
 * Kept deliberately compact (one wrapping row of chips) so it informs
 * without stealing vertical space from the working surface.
 */
import Link from "next/link";
import { useT } from "@/lib/i18n";

export type FlowStageId =
  | "connect"
  | "research"
  | "screen"
  | "validate"
  | "authorize"
  | "execute"
  | "risk"
  | "audit";

export const FLOW_STAGES: {
  id: FlowStageId;
  href: string;
  en: string;
  zh: string;
}[] = [
  { id: "connect", href: "/settings", en: "1 Connect", zh: "1 连接" },
  { id: "research", href: "/research?tab=watchlist", en: "2 Research", zh: "2 研究" },
  { id: "screen", href: "/research?tab=recommendations", en: "3 Screen", zh: "3 筛选" },
  { id: "validate", href: "/backtests", en: "4 Validate", zh: "4 回测" },
  { id: "authorize", href: "/trading?tab=pool", en: "5 Authorize", zh: "5 授权" },
  { id: "execute", href: "/trading?tab=positions", en: "6 Execute", zh: "6 执行" },
  { id: "risk", href: "/oversight?tab=risk", en: "7 Risk", zh: "7 风控" },
  { id: "audit", href: "/oversight?tab=activity", en: "8 Audit", zh: "8 审计" },
];

export default function FlowNav({ stage }: { stage?: FlowStageId }) {
  const t = useT();
  return (
    <nav className="flow-nav" aria-label={t("Platform pipeline", "平台流程")}>
      {FLOW_STAGES.map((s, i) => (
        <span key={s.id} className="flow-item">
          {i > 0 && <span className="flow-arrow" aria-hidden="true">→</span>}
          <Link
            href={s.href}
            className={`flow-chip${stage === s.id ? " current" : ""}`}
            aria-current={stage === s.id ? "step" : undefined}
          >
            {t(s.en, s.zh)}
          </Link>
        </span>
      ))}
      <Link
        href={stage ? `/guide#stage-${stage}` : "/guide"}
        className="flow-guide-link"
      >
        {t("How this works →", "本环节说明 →")}
      </Link>
    </nav>
  );
}
