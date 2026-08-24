"use client";

/**
 * One calendar card (§54). Deliberately NOT overloaded: identity, when,
 * status, urgency, relevance, importance, exposure — and nothing narrative.
 *
 * The honesty rules that shape it:
 * - ESTIMATED wears an amber badge AND a one-line explanation, because a
 *   derived date rendered like a scheduled one is the exact failure §11
 *   forbids. It also gets the "Confirm date…" action, which is the only way
 *   a date becomes a fact here.
 * - Both the local wall clock and the UTC instant are reachable — the local
 *   one on the face (it is what a trader reasons about), the UTC one in the
 *   title attribute.
 * - `exposure.position_market_value` is labelled COST BASIS, never "market
 *   value": the events API reads stored rows only and never marks to market.
 * - The Analysis line says "not yet available" rather than being omitted —
 *   an absent capability that is stated is information; a hidden one is not.
 *
 * Phase J adds the §54 research digest — historical move, implied move,
 * analysis freshness — under one rule that is the whole reason it is a
 * separate block: THE BLOCK APPEARS ONLY WHEN `event.summary` DOES. An absent
 * summary means the feed was never asked for one, and rendering "—" there
 * would claim the platform looked and found nothing. A PRESENT summary with a
 * null metric does render "—", because that absence is a real finding. Capped
 * at three lines plus the research link: a card that grows a paragraph stops
 * being scannable, which is the only job §54 gives it.
 */
import Link from "next/link";
import Term from "@/components/shared/Term";
import { useLang, useT } from "@/lib/i18n";
import type { EventCardSummary, EventRow } from "@/lib/types";
import { basisBadge, disclaimerText, fmtBand, fmtRatioPct } from "./options-format";
import {
  EVENT_TYPE_LABEL,
  RELEVANCE_BADGE,
  RELEVANCE_LABEL,
  SESSION_SHORT,
  STATUS_BADGE,
  STATUS_LABEL,
  eventChip,
  fmtMoney,
  formatLocalDateTime,
  formatTMinus,
  formatUtc,
  zoneAbbrev,
} from "./event-format";
import ImportanceBreakdown from "./ImportanceBreakdown";

/** The analysis-freshness verdict, as the SERVER decided it. */
const ANALYSIS_STATUS: Record<
  string,
  { en: string; zh: string; badge: string }
> = {
  READY: { en: "READY", zh: "可用", badge: "ok" },
  STALE: { en: "STALE", zh: "已过期", badge: "warn" },
  NONE: { en: "NONE", zh: "无", badge: "dim" },
};

/**
 * The §54 research digest: three lines and a link, or nothing at all.
 *
 * Every line here is a number the CARD did not compute. That is deliberate
 * and it is the §61 rule: the backend owns the median, the sample size and
 * the freshness verdict, and a card that re-derived any of them would drift
 * from the research page showing the same event.
 *
 * The implied-move line always carries its basis badge and the not-a-forecast
 * sentence in its tooltip. A ± band is used rather than a bare percent for
 * the same reason the Options tab uses one: a straddle prices MAGNITUDE, and
 * "6.2%" on a calendar card reads as an expected gain.
 */
function SummaryLines({ summary }: { summary: EventCardSummary }) {
  const t = useT();

  const implied = fmtBand(summary.implied_move_pct);
  const median = fmtRatioPct(summary.historical_move_median_abs, 1, false);
  const n = summary.historical_move_n;
  const prev = fmtRatioPct(summary.previous_event_actual_move_pct, 1);
  const statusMeta = ANALYSIS_STATUS[summary.analysis_status];
  const basis = basisBadge(summary.implied_move_basis, t);

  return (
    <div className="ec-summary" data-testid="ec-summary">
      <p className="ec-sline" data-testid="ec-hist-move">
        <Term k="event_history_stats">
          <span className="ec-slabel">
            {t("Historical event move", "历史事件波幅")}
          </span>
        </Term>{" "}
        {median == null ? (
          <span className="ec-sval pt-na">—</span>
        ) : (
          <>
            <span className="ec-sval">
              {t(`median |move| ${median}`, `中位 |波幅| ${median}`)}
            </span>{" "}
            {/* §64: the sample size travels with the statistic, never after
                it in a tooltip — a median over 2 events and one over 12 are
                different objects and must not look alike. */}
            <span className="ec-ssample">
              {n == null ? t("(n unknown)", "(样本数未知)") : `(n=${n})`}
            </span>
          </>
        )}
        {prev != null && (
          <span className="ec-sprev" data-testid="ec-prev-move">
            {t(` · last: ${prev}`, ` · 上次：${prev}`)}
          </span>
        )}
      </p>

      <p
        className="ec-sline"
        data-testid="ec-implied-move"
        title={disclaimerText(null, t)}
      >
        <Term k="event_implied_vs_actual">
          <span className="ec-slabel">{t("Implied move", "隐含波幅")}</span>
        </Term>{" "}
        {implied == null ? (
          <span className="ec-sval pt-na">—</span>
        ) : (
          <>
            <span className="ec-sval">{implied}</span>{" "}
            <span
              className={`badge ${basis.badge}`}
              data-testid="ec-implied-basis"
              title={basis.note ?? undefined}
            >
              {basis.text}
            </span>
          </>
        )}
        {/* Present on the FACE, not only in the tooltip: a caveat reachable
            only by hovering is a caveat most readers never see. */}
        <span className="ec-snote">
          {t(
            "— option-market pricing, not a forecast",
            "— 期权市场定价,并非预测",
          )}
        </span>
      </p>

      <p className="ec-sline" data-testid="ec-analysis-status">
        <span className="ec-slabel">{t("Analysis", "分析")}</span>{" "}
        <span className={`badge ${statusMeta?.badge ?? "dim"}`}>
          {statusMeta == null
            ? summary.analysis_status
            : t(statusMeta.en, statusMeta.zh)}
        </span>
        {summary.analysis_as_of != null && (
          <span className="ec-ssample" data-testid="ec-analysis-as-of">
            {t(` as of ${summary.analysis_as_of}`, ` 计算时点 ${summary.analysis_as_of}`)}
          </span>
        )}
      </p>
    </div>
  );
}

export default function EventCard({
  event,
  onConfirm,
}: {
  event: EventRow;
  /** Opens the confirm-date dialog. Offered only for ESTIMATED dates. */
  onConfirm: (event: EventRow) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const typeLabel = EVENT_TYPE_LABEL[event.event_type];
  const statusLabel = STATUS_LABEL[event.status];
  const sessionLabel = SESSION_SHORT[event.session];
  const relevanceLabel = RELEVANCE_LABEL[event.relevance_tier];

  return (
    <article className={`event-card${event.is_estimated ? " estimated" : ""}`}>
      <header className="ec-head">
        <Link href={`/catalysts/${event.event_id}`} className="ec-chip">
          {eventChip(event, lang)}
        </Link>
        <span className="ec-type">
          {typeLabel == null
            ? event.event_type.replace(/_/g, " ")
            : t(typeLabel.en, typeLabel.zh)}
        </span>
        <span className={`badge ${STATUS_BADGE[event.status] ?? "dim"}`}>
          {statusLabel == null ? event.status : t(statusLabel.en, statusLabel.zh)}
        </span>
        <span className="ec-tminus">{formatTMinus(event.days_to_event, t)}</span>
      </header>

      <p className="ec-title">{event.title}</p>

      <div className="ec-when" title={`UTC ${formatUtc(event.scheduled_at_utc, lang)}`}>
        <span className="provenance data-driven">{t("DATA", "数据")}</span>
        <span className="ec-datetime">
          {formatLocalDateTime(event.scheduled_at_local, lang)}
        </span>
        <span className="ec-zone">{zoneAbbrev(event.event_timezone)}</span>
        <Term k="event_session_timing">
          <span className="chip">
            {sessionLabel == null
              ? event.session.replace(/_/g, " ")
              : t(sessionLabel.en, sessionLabel.zh)}
          </span>
        </Term>
      </div>

      {event.is_estimated && (
        <p className="ec-estimated-note">
          <Term k="event_status_estimated">
            <strong>{t("Estimated date", "估算日期")}</strong>
          </Term>{" "}
          {t(
            "— derived from this company's past filing cadence, not confirmed by any source. It can move.",
            "— 依据该公司过往申报节奏推算,尚未获任何来源确认,实际日期可能变动。",
          )}
        </p>
      )}

      <div className="ec-meta">
        <span className={`badge ${RELEVANCE_BADGE[event.relevance_tier] ?? "dim"}`}>
          {relevanceLabel == null
            ? event.relevance_tier.replace(/_/g, " ")
            : t(relevanceLabel.en, relevanceLabel.zh)}
        </span>
        {event.exposure != null && (
          <span className="ec-exposure">
            {t("Exposure", "敞口")}{" "}
            <strong>{fmtMoney(event.exposure.position_market_value)}</strong>{" "}
            <span className="ec-basis">
              {t(
                `${event.exposure.basis} basis · ${event.exposure.position_qty} qty`,
                `${event.exposure.basis} 成本基准 · ${event.exposure.position_qty} 数量`,
              )}
            </span>
          </span>
        )}
      </div>

      <ImportanceBreakdown event={event} />

      {/* Absent summary → nothing at all. See SummaryLines' contract. */}
      {event.summary != null && <SummaryLines summary={event.summary} />}

      <footer className="ec-foot">
        {event.summary == null ? (
          <span className="ec-analysis">
            {t("Analysis: not yet available", "分析:尚未提供")}
            <span className="ec-phase">{t("(Phase F)", "(F 阶段)")}</span>
          </span>
        ) : (
          <Link
            href={`/catalysts/${event.event_id}?tab=analysis`}
            className="ec-research"
          >
            {t("Open Analysis", "查看分析")}
          </Link>
        )}
        <span className="ec-actions">
          {event.is_estimated && (
            <button type="button" onClick={() => onConfirm(event)}>
              {t("Confirm date…", "确认日期…")}
            </button>
          )}
          <Link href={`/catalysts/${event.event_id}`} className="btn">
            {t("Open event", "查看事件")}
          </Link>
        </span>
      </footer>
    </article>
  );
}
