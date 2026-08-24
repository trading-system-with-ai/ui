"use client";

/**
 * §13 importance, shown as ARITHMETIC rather than as a number.
 *
 * The spec's rule is "do not create a mysterious LLM-generated importance
 * score — quantitative components must be identifiable". So the score is
 * never rendered alone: every addend the backend sent is listed with its
 * value, and when the raw sum exceeded 100 the pre-clamp total is shown too
 * ("90 + 30 = 120 → 100"). A component the UI has no label for still
 * renders, under its raw key — dropping it would hide part of the sum.
 *
 * The trigger reuses the platform's <Term> explainer for the CONCEPT; this
 * panel carries the per-event numbers, which are data, not glossary.
 */
import { useState } from "react";
import Term from "@/components/shared/Term";
import { useLang, useT } from "@/lib/i18n";
import type { EventRow } from "@/lib/types";
import { importanceComponentLabel } from "./event-format";

export default function ImportanceBreakdown({ event }: { event: EventRow }) {
  const t = useT();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const entries = Object.entries(event.importance_components);

  return (
    <div className="importance-block">
      <div className="importance-head">
        <Term k="event_importance">
          <span className="k">{t("Importance", "重要度")}</span>
        </Term>
        <span className="importance-score">{event.importance}</span>
        <span className="importance-scale">/ 100</span>
        <button
          type="button"
          className="importance-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open
            ? t("Hide breakdown", "收起明细")
            : t("Show breakdown", "查看明细")}
        </button>
      </div>
      {open && (
        <div className="importance-detail">
          {entries.length === 0 ? (
            <p className="importance-note">
              {t(
                "No components were recorded for this score.",
                "该分数未记录任何组成项。",
              )}
            </p>
          ) : (
            <ul className="importance-list">
              {entries.map(([key, value]) => (
                <li key={key}>
                  <span className="ic-name">
                    {importanceComponentLabel(key, lang)}
                  </span>
                  <span className="ic-value">
                    {value >= 0 ? `+${value}` : String(value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="importance-sum">
            {event.importance_was_clamped
              ? t(
                  `Raw total ${event.importance_raw_total} → clamped to ${event.importance}.`,
                  `原始加总 ${event.importance_raw_total} → 封顶为 ${event.importance}。`,
                )
              : t(
                  `Total ${event.importance_raw_total}.`,
                  `合计 ${event.importance_raw_total}。`,
                )}
          </p>
          <p className="importance-note">
            {t(
              `Model ${event.importance_model_version}. This ranks attention only — it says nothing about the direction or the size of any move.`,
              `模型版本 ${event.importance_model_version}。该分数仅用于排定关注优先级 — 不预示价格变动的方向或幅度。`,
            )}
          </p>
          {event.importance_stored != null &&
            event.importance_stored !== event.importance && (
              <p className="importance-note stale">
                {t(
                  `Last stored score was ${event.importance_stored}; the figure above is recomputed now.`,
                  `上次存储的分数为 ${event.importance_stored};上方数值为当前重新计算的结果。`,
                )}
              </p>
            )}
        </div>
      )}
    </div>
  );
}
