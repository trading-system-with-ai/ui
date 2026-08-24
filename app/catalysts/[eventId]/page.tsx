"use client";

/**
 * Event detail (§55 tabs, §56 hero).
 *
 * Phase B lands the hero, the provenance block and the §15 previous
 * comparable event. The remaining §55 tabs are rendered as DISABLED chips
 * naming the phase that fills them, rather than omitted: a tab that is
 * visibly not-yet-built tells the user the surface exists and is honest
 * about its state, while a hidden one silently shrinks the product.
 *
 * The hero shows BOTH timestamps (§10). The local one is the event's own
 * wall clock — what a trader reasons about and what stays fixed across DST;
 * the UTC one is the instant the platform compares on. Showing only one of
 * them is how a before-market release quietly becomes an after-market one.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import AnalysisTab from "@/components/catalysts/AnalysisTab";
import ConfirmDateDialog from "@/components/catalysts/ConfirmDateDialog";
import EventHero from "@/components/catalysts/EventHero";
import EventHistoryTable from "@/components/catalysts/EventHistoryTable";
import EvidenceTab from "@/components/catalysts/EvidenceTab";
import EventIntelSnapshot from "@/components/catalysts/EventIntelSnapshot";
import FundamentalsTab from "@/components/catalysts/FundamentalsTab";
import ImportanceBreakdown from "@/components/catalysts/ImportanceBreakdown";
import NewsTab from "@/components/catalysts/NewsTab";
import OptionsTab from "@/components/catalysts/OptionsTab";
import PriceTab from "@/components/catalysts/PriceTab";
import ReplayTab from "@/components/catalysts/ReplayTab";
import RiskTab from "@/components/catalysts/RiskTab";
import MacroContextCard from "@/components/catalysts/MacroContextCard";
import MacroTab from "@/components/catalysts/MacroTab";
import FedTab from "@/components/catalysts/FedTab";
import ScenariosTab from "@/components/catalysts/ScenariosTab";
import TimelineTab from "@/components/catalysts/TimelineTab";
import {
  RELEVANCE_LABEL,
  SESSION_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  fmtMoney,
  formatLocalDateTime,
  formatUtc,
  zoneAbbrev,
} from "@/components/catalysts/event-format";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import Term from "@/components/shared/Term";
import { useToast } from "@/components/shared/Toast";
import { api } from "@/lib/api";
import type {
  PredictionMarketsSection,
  WebResearchSection,
} from "@/lib/types-research";
import { useLang, useT } from "@/lib/i18n";
import type { EventConfirmRequest, EventRow } from "@/lib/types";
import { isMacroEventType, type MacroContextSection } from "@/lib/types-macro";
import { isFedEventType } from "@/lib/types-fed";

/** §55's tab set. Overview/Previous (Phase B, deepened into the §20 replay
 *  by Phase C), Price (Phase E1), Fundamentals (Phase E2), History (Phase
 *  C, §60), News (Phase D, §21-§27), Analysis (Phase F, §46-§52 — the
 *  evidence bundle plus the LLM narrative over it) and, from Phase J, the
 *  §57 Timeline, the §46 Evidence surface and the §51 Scenarios are built.
 *  Risk still names the phase that will fill it — a tab that is visibly
 *  not-yet-built tells the user the surface exists and is honest about its
 *  state, while a hidden one silently shrinks the product. */
const TABS: {
  id: string;
  en: string;
  zh: string;
  phase?: string;
  /** Phase G: rendered only for the event types that HAVE a release packet. */
  macroOnly?: boolean;
  /** Phase H: rendered only for FOMC / Fed event types. Same rationale as
   *  `macroOnly` — a Fed tab on an earnings event would promise a policy
   *  packet that can never fill. */
  fedOnly?: boolean;
}[] = [
  { id: "overview", en: "Overview", zh: "总览" },
  /* Phase G §38-§41. Deliberately NOT a disabled chip on an earnings event
     the way "Risk" is: an absent Risk tab is a feature not yet built, while a
     Macro tab on AAPL would be a surface that can never fill, and offering it
     would promise a BLS release packet behind a company print. Its place in
     the strip is second because on a macro event the release IS the event —
     everything below it is context for the packet. */
  { id: "macro", en: "Macro", zh: "宏观", macroOnly: true },
  /* Phase H §42-§45. Beside Macro and for the same reason: on an FOMC event
     the policy statement IS the event, and everything below it is context for
     the packet. Not a disabled chip on a non-Fed event — a Fed tab on AAPL
     would offer a surface that can never fill. */
  { id: "fed", en: "Fed", zh: "美联储", fedOnly: true },
  { id: "previous", en: "Previous Event", zh: "上次事件" },
  { id: "history", en: "History", zh: "历史" },
  /* Phase J §57. The id stays "since" — it is the tab the spec names "since
     last event" and renaming the key would break nothing visible while
     silently invalidating any bookmark or test that used it. */
  { id: "since", en: "Timeline / Since Last Event", zh: "时间线 / 自上次事件以来" },
  { id: "fundamentals", en: "Fundamentals", zh: "基本面" },
  { id: "price", en: "Price", zh: "价格" },
  { id: "options", en: "Options", zh: "期权" },
  { id: "news", en: "News", zh: "新闻" },
  { id: "analysis", en: "Analysis", zh: "分析" },
  /* Phase J §51. Phase F kept the scenario framework inside the Analysis tab
     so a conditional could not be read apart from its evidence; this tab does
     not undo that (the framework still renders there too) — it gives the
     T-1 reader the "what would have to be true" list without six narrative
     sections above it, and links back to the evidence from its own footer. */
  { id: "scenarios", en: "Scenarios", zh: "情景" },
  /* Phase J §46. The evidence GET answers whether or not a model ever ran,
     so the measured half of the analysis gets a surface that does not depend
     on the guessed half being present. */
  { id: "evidence", en: "Evidence", zh: "证据" },
  /* Phase K §62-§67. The chip stops naming a phase because the surface now
     exists: event risk is a deterministic state over the expected move, the
     time to the event and the position's share of NAV, and it runs in SHADOW
     — the tab says so above every figure it shows. */
  { id: "risk", en: "Risk", zh: "风控" },
];

export default function EventDetailPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = Number(params.eventId);
  const t = useT();
  const { lang } = useLang();
  const qc = useQueryClient();
  const toast = useToast();

  const [tab, setTab] = useState("overview");
  // Deep links (e.g. an event card's "Open Analysis") may land on a tab.
  // Read post-mount: keeps SSR HTML and hydration identical, no Suspense needed.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested) setTab(requested);
  }, []);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const detail = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => api.events.get(eventId),
    enabled: Number.isFinite(eventId),
  });

  /**
   * Phase I options, loaded ONCE at the page level and shared three ways: the
   * §56 hero's implied-move chip, the §60 history table's implied/actual
   * columns, and the Options tab itself.
   *
   * Deliberately the SAME query key OptionsTab uses, so this is one request
   * for the page rather than one per consumer, and the tab's own backfill
   * invalidation refreshes the hero and the history columns with it. The GET
   * reads stored option bars and never fetches from a provider — that is what
   * makes it safe to issue on page load at all; if it fetched, this line would
   * be spending two provider calls on every event a user opens.
   *
   * A failure here is NOT a page failure. The hero simply renders no implied
   * move and the history table renders no options columns — the event's own
   * data does not depend on the option chain having been backfilled.
   */
  const options = useQuery({
    queryKey: ["event-options", eventId, null],
    queryFn: () => api.events.optionsContext(eventId),
    enabled: Number.isFinite(eventId),
    retry: false,
  });

  /**
   * Phase G §46 — the evidence bundle, read at page level for ONE field:
   * `macro_context`, the scheduled macro releases sitting inside this event's
   * window. It answers a question the Overview tab cannot answer from the
   * event row alone, and the reader of an earnings print has no reason to go
   * looking for a CPI event to discover it lands the morning before.
   *
   * Deliberately the SAME query key EvidenceTab uses, so opening that tab
   * afterwards costs no request and this line adds none when it is already
   * open. Like the options query above, the GET computes from stored rows and
   * never fetches or calls a model, which is what makes it safe on page load.
   *
   * A failure here is NOT a page failure — `MacroContextCard` renders nothing
   * for an absent section, exactly as it does for an empty one.
   */
  const evidence = useQuery({
    queryKey: ["event-evidence", eventId, null],
    queryFn: () => api.events.evidence(eventId),
    enabled: Number.isFinite(eventId),
    retry: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["event", eventId] });
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
    qc.invalidateQueries({ queryKey: ["alerts"] });
  };

  const confirm = useMutation({
    mutationFn: (body: EventConfirmRequest) => api.events.confirm(eventId, body),
    onSuccess: (result) => {
      setConfirming(false);
      setConfirmError(null);
      toast(
        "SUCCESS",
        t(
          `Date confirmed — status ${result.status} (${result.change}).`,
          `日期已确认 — 状态 ${result.status}（${result.change}）。`,
        ),
      );
      invalidate();
    },
    onError: (e: Error) => setConfirmError(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => api.events.cancel(eventId),
    onSuccess: (result) => {
      setCancelling(false);
      toast(
        "INFO",
        t(
          `Event canceled — status ${result.status}.`,
          `事件已取消 — 状态 ${result.status}。`,
        ),
      );
      invalidate();
    },
    onError: (e: Error) => {
      setCancelling(false);
      toast(
        "WARNING",
        t(`Cancel failed: ${e.message}`, `取消失败：${e.message}`),
      );
    },
  });

  if (!Number.isFinite(eventId)) {
    return (
      <>
        <h1>{t("Event", "事件")}</h1>
        <p className="error">{t("Invalid event id.", "无效的事件 ID。")}</p>
      </>
    );
  }

  if (detail.isLoading) {
    return (
      <>
        <h1>{t("Event", "事件")}</h1>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </>
    );
  }

  if (detail.error != null || detail.data == null) {
    return (
      <>
        <h1>{t("Event", "事件")}</h1>
        <p className="error">
          {t(
            `Could not load this event: ${detail.error?.message ?? "not found"}`,
            `无法加载该事件：${detail.error?.message ?? "未找到"}`,
          )}
        </p>
        <Link href="/research?tab=catalysts" className="btn">
          {t("Back to Catalysts", "返回催化剂")}
        </Link>
      </>
    );
  }

  const event = detail.data;
  // The title/status/relevance/countdown vocabulary moved into EventHero with
  // Phase J; what stays here is what the panels below the hero still render.
  const sessionLabel = SESSION_LABEL[event.session];
  const relevanceLabel = RELEVANCE_LABEL[event.relevance_tier];
  /* Phase G — a CLOSED list of release types (types-macro), never "has no
     ticker": FOMC and MARKET_HOLIDAY are tickerless too, and neither has a
     BLS/BEA release packet behind it. */
  const isMacro = isMacroEventType(event.event_type);
  /* Phase H — the FOMC/Fed types, which have a policy document set behind
     them. Disjoint from `isMacro` by construction: a CPI print has a BLS
     release packet and no statement, an FOMC decision the reverse. */
  const isFed = isFedEventType(event.event_type);

  return (
    <>
      <p className="crumb">
        <Link href="/research?tab=catalysts">{t("← Catalysts", "← 催化剂")}</Link>
      </p>

      {/* §56 — the hero. It renders the detail payload this page already has
          plus whatever options payload was already loaded; it never fetches of
          its own, so the most-rendered element on the page is not also the
          most expensive one. */}
      <EventHero event={event} options={options.data} onOpenTab={setTab} />

      {event.is_estimated && (
        <div className="capability-banner" role="status">
          <p className="cb-line">
            <span className="badge amber">{t("ESTIMATED", "估算")}</span>{" "}
            {t(
              "This date was derived from the company's past filing cadence. No source has confirmed it, and it can move — confirm it from the company's IR page to pin it.",
              "该日期依据公司过往申报节奏推算所得,尚未获任何来源确认,实际日期可能变动 — 可从公司投资者关系页面确认后将其固定。",
            )}
          </p>
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.filter(
          (tabDef) =>
            (tabDef.macroOnly !== true || isMacro) &&
            (tabDef.fedOnly !== true || isFed),
        ).map((tabDef) => (
          <button
            key={tabDef.id}
            type="button"
            role="tab"
            aria-selected={tab === tabDef.id}
            className={tab === tabDef.id ? "active" : ""}
            disabled={tabDef.phase != null}
            onClick={() => setTab(tabDef.id)}
          >
            {t(tabDef.en, tabDef.zh)}
            {tabDef.phase != null && (
              <span className="phase">
                {t(`${tabDef.phase}`, `${tabDef.phase}`)}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="panel">
            <h2>
              {t("Scheduled", "预定时间")}{" "}
              <span className="provenance data-driven">{t("DATA", "数据")}</span>
            </h2>
            <div className="kv">
              <div>
                <div className="k">
                  {t("Local", "当地时间")} ({zoneAbbrev(event.event_timezone)})
                </div>
                <div className="v">
                  {formatLocalDateTime(event.scheduled_at_local, lang, {
                    withYear: true,
                  })}
                </div>
              </div>
              <div>
                <div className="k">{t("UTC", "UTC")}</div>
                <div className="v">{formatUtc(event.scheduled_at_utc, lang)}</div>
              </div>
              <div>
                <div className="k">{t("Session", "交易时段")}</div>
                <div className="v">
                  <Term k="event_session_timing">
                    <span>
                      {sessionLabel == null
                        ? event.session.replace(/_/g, " ")
                        : t(sessionLabel.en, sessionLabel.zh)}
                    </span>
                  </Term>
                </div>
              </div>
              <div>
                <div className="k">{t("Timezone", "时区")}</div>
                <div className="v">{event.event_timezone}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h2>{t("Provenance", "数据来源")}</h2>
            <div className="kv">
              <div>
                <div className="k">{t("Source", "来源")}</div>
                {/* Verbatim server tokens — the audit record of where the
                    date came from, never paraphrased. */}
                <div className="v">
                  {event.source_name} ({event.source})
                </div>
              </div>
              <div>
                <div className="k">{t("Last verified", "最后核验")}</div>
                <div className="v">
                  {formatUtc(event.last_verified_at, lang)}
                  {event.last_verified_at != null && " UTC"}
                </div>
              </div>
              <div>
                <div className="k">{t("Event key", "事件标识")}</div>
                <div className="v">{event.event_key}</div>
              </div>
              <div>
                <div className="k">{t("Source link", "来源链接")}</div>
                <div className="v">
                  {event.source_url != null && event.source_url !== "" ? (
                    <a
                      href={event.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="src-link"
                    >
                      {t("Open source →", "打开来源 →")}
                    </a>
                  ) : (
                    <span style={{ color: "var(--text-dim)" }}>—</span>
                  )}
                </div>
              </div>
            </div>
            {event.revision_history.length > 0 && (
              <div className="revision-history">
                <div className="k">{t("Revisions", "变更记录")}</div>
                <ul>
                  {event.revision_history.map((revision, i) => (
                    <li key={i}>
                      <span className="mono">
                        {formatUtc(revision.scheduled_at ?? null, lang)}
                      </span>{" "}
                      {revision.status} · {revision.source_name}
                      {revision.at != null && (
                        <span className="rh-at">
                          {" "}
                          ({formatUtc(revision.at, lang)} UTC)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="panel">
            <h2>
              {t("Importance & relevance", "重要度与相关性")}{" "}
              <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
            </h2>
            <ImportanceBreakdown event={event} />
            <div className="kv" style={{ marginTop: 12 }}>
              <div>
                <div className="k">{t("Relevance", "相关性")}</div>
                <div className="v">
                  <Term k="event_relevance_tier">
                    <span>
                      {relevanceLabel == null
                        ? event.relevance_tier.replace(/_/g, " ")
                        : t(relevanceLabel.en, relevanceLabel.zh)}
                    </span>
                  </Term>
                </div>
              </div>
              <div>
                <div className="k">{t("Exposure", "敞口")}</div>
                <div className="v">
                  {event.exposure != null ? (
                    <>
                      {fmtMoney(event.exposure.position_market_value)}{" "}
                      <span className="ec-basis">
                        {t(
                          `${event.exposure.basis} basis · ${event.exposure.position_qty} qty`,
                          `${event.exposure.basis} 成本基准 · ${event.exposure.position_qty} 数量`,
                        )}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "var(--text-dim)" }}>
                      {t("No open position", "无未平仓头寸")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Phase G §46 — the macro releases scheduled inside this event's
              window. Renders NOTHING when there are none, so the Overview tab
              gains a panel only on the weeks the fact exists; a permanent
              "no macro events" card is a fixture the eye learns to skip. */}
          <MacroContextCard
            section={
              (evidence.data?.bundle?.macro_context ?? null) as MacroContextSection | null
            }
          />

          {/* Catalyst research upgrade — the compact intelligence snapshot.
              Reads the SAME bundle the macro card above does, so it costs no
              extra request and can never trigger a search: the paid refresh
              lives behind an explicit button on the Evidence tab. */}
          <EventIntelSnapshot
            research={evidence.data?.bundle?.web_research as WebResearchSection | undefined}
            markets={
              evidence.data?.bundle?.prediction_markets as
                | PredictionMarketsSection
                | undefined
            }
          />

          <div className="panel">
            <h2>{t("Analysis", "分析")}</h2>
            <p className="empty">
              {t(
                "The event analysis — the evidence bundle, the scenario framework and the model's reading of both — lives on the Analysis tab. Nothing is generated on this page, and opening that tab never calls a model either.",
                "事件分析 — 包括证据数据包、情景框架,以及模型对二者的解读 — 位于「分析」标签页。本页不生成任何内容,打开该标签页同样不会调用模型。",
              )}
            </p>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setTab("analysis")}>
                {t("Open the Analysis tab", "打开「分析」标签页")}
              </button>
            </div>
          </div>

          <div className="panel">
            <h2>{t("Actions", "操作")}</h2>
            <div className="row">
              <button type="button" onClick={() => setConfirming(true)}>
                {event.is_estimated
                  ? t("Confirm date…", "确认日期…")
                  : t("Correct date…", "修正日期…")}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => setCancelling(true)}
                disabled={event.status === "CANCELED"}
              >
                {t("Mark canceled…", "标记为已取消…")}
              </button>
            </div>
            <p className="action-note">
              {t(
                "A user-confirmed date outranks every automated source and is recorded in the audit trail. Cancellation is never inferred from a provider going quiet — it only ever arrives explicitly.",
                "用户确认的日期优先级高于任何自动来源,并会记入审计日志。取消状态绝不会由数据源停止推送而被推断 — 只能显式设置。",
              )}
            </p>
          </div>
        </>
      )}

      {tab === "previous" && (
        <div className="panel">
          <h2>{t("Previous comparable event", "上一次可比事件")}</h2>
          {event.previous_event == null ? (
            <p className="empty">
              {t(
                "No comparable earlier event is stored. The registry only compares within the same event type, and never across types — an absent comparison is reported rather than approximated.",
                "尚无可比的历史事件记录。事件登记表仅在同类型事件之间比较,绝不跨类型比较 — 缺少可比对象时如实说明,而非近似替代。",
              )}
            </p>
          ) : (
            <>
              <p className="cg-meaning">
                {t("Compared because: ", "比较依据：")}
                {/* Verbatim server reason ("prior quarterly earnings", "prior
                    speech by the same speaker (low confidence)") — the weight
                    of the comparison lives in this exact wording. */}
                <span className="mono">{event.comparison_reason ?? "—"}</span>
              </p>
              <PreviousEventCard previous={event.previous_event} />
            </>
          )}
        </div>
      )}

      {/* Phase C §20 — the replay of the LINKED PREVIOUS event, not of this
          one. The upcoming event has not happened, so replaying it would
          answer a question nobody asked; the trader's question is what the
          last comparable print actually did, minute by minute. */}
      {tab === "previous" && event.previous_event != null && (
        <ReplayTab eventId={event.previous_event.event_id} />
      )}

      {/* Phase C §60 — the last 4/8/12 comparable events for this ticker,
          keyed on THIS event (the server resolves the ticker/type series). */}
      {/* U3 adds the `optionsHistory` prop (implied / actual / ratio columns
          and the §36 implied-vs-actual chart). The page passes the already
          loaded payload rather than letting the table fetch again: two
          components asking the same endpoint for the same rows is how one
          page load becomes two. `undefined` while the query is in flight or
          failed, which the table treats as "no options columns". */}
      {tab === "history" && (
        <EventHistoryTable
          eventId={eventId}
          optionsHistory={options.data?.history ?? undefined}
        />
      )}

      {/* Phase G §38-§41 — the government release behind this event. Guarded
          on `isMacro` as well as on the tab id: the chip is already filtered
          out for a non-macro event, but a stale `tab` state (a reader who
          opened Macro on CPI and navigated to an earnings event) must not
          mount a release packet for a company print. */}
      {tab === "macro" && isMacro && <MacroTab eventId={eventId} />}

      {/* Phase H §42-§45 — the policy packet behind this Fed event. Guarded on
          `isFed` as well as on the tab id for the same reason the macro mount
          is: a stale `tab` state (a reader who opened Fed on an FOMC event and
          navigated to an earnings one) must not mount a statement diff for a
          company print. */}
      {tab === "fed" && isFed && <FedTab eventId={eventId} />}

      {/* Phase J §57 — everything between the previous comparable event and
          the as-of instant: material news, filings, other registry events for
          this ticker, and the analyses stored along the way. Mounted only
          while selected, like every other read-only tab. */}
      {tab === "since" && <TimelineTab eventId={eventId} />}

      {tab === "fundamentals" && <FundamentalsTab eventId={eventId} />}

      {tab === "price" && <PriceTab eventId={eventId} />}

      {/* Phase I §18/§36-§37 — what the option market PRICED for this event,
          beside what comparable events actually delivered. Mounted only while
          selected: the GET reads stored option bars and never fetches, but an
          unmounted tab cannot even be the reason a request was made. */}
      {tab === "options" && <OptionsTab eventId={eventId} />}

      {/* Phase D §21-§27 — the news window behind THIS event, scoped from
          the previous comparable event up to the as-of instant. */}
      {tab === "news" && <NewsTab eventId={eventId} />}

      {/* Phase F §46-§52 — the evidence bundle and the model's reading of it,
          kept visibly apart (§49). Mounting it only while selected matters
          here: the GET reads a stored analysis and never calls the model, but
          an unmounted tab cannot even be the reason a request was made. */}
      {tab === "analysis" && <AnalysisTab eventId={eventId} />}

      {/* Phase J §51 — the scenario framework on its own surface. It shares
          the Analysis tab's query cache (same endpoint, same args), so opening
          it after that one costs no request, and it owns no Generate button:
          the one place that spends a model call stays the Analysis tab. */}
      {tab === "scenarios" && (
        <ScenariosTab eventId={eventId} onOpenAnalysis={() => setTab("analysis")} />
      )}

      {/* Phase J §46 — the measured half of the analysis, on a surface that
          does not depend on a model having run. */}
      {tab === "evidence" && <EvidenceTab eventId={eventId} />}

      {/* Phase K §62-§67 — the event's own risk state, in SHADOW. Mounted only
          while selected like every other tab: the GET reads stored metrics and
          calls no provider, but an unmounted tab cannot even be the reason a
          request was made. */}
      {tab === "risk" && <RiskTab eventId={eventId} />}

      {confirming && (
        <ConfirmDateDialog
          event={event}
          pending={confirm.isPending}
          error={confirmError}
          onClose={() => {
            setConfirming(false);
            setConfirmError(null);
          }}
          onSubmit={(body) => confirm.mutate(body)}
        />
      )}

      {cancelling && (
        <ConfirmDialog
          title={t("Mark this event canceled?", "将该事件标记为已取消？")}
          confirmLabel={t("Mark canceled", "标记为已取消")}
          cancelLabel={t("Keep", "保留")}
          destructive
          loading={cancel.isPending}
          onConfirm={() => cancel.mutate()}
          onCancel={() => setCancelling(false)}
        >
          <p>
            {t(
              `${event.title} will be recorded as CANCELED by you, with an audit entry. It stops appearing in the default calendar and never triggers a T-minus alert.`,
              `${event.title} 将由你记录为「已取消」,并写入审计日志。该事件将不再出现在默认日历中,也不会触发倒计时提醒。`,
            )}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

/** The §15 previous event, rendered read-only beside the current one. */
function PreviousEventCard({ previous }: { previous: EventRow }) {
  const t = useT();
  const { lang } = useLang();
  const statusLabel = STATUS_LABEL[previous.status];
  const sessionLabel = SESSION_LABEL[previous.session];
  return (
    <div className="prev-event">
      <div className="pe-head">
        <Link href={`/catalysts/${previous.event_id}`} className="ec-chip">
          {previous.ticker ?? previous.event_type.replace(/_/g, " ")}
        </Link>
        <span className={`badge ${STATUS_BADGE[previous.status] ?? "dim"}`}>
          {statusLabel == null
            ? previous.status
            : t(statusLabel.en, statusLabel.zh)}
        </span>
      </div>
      <p className="ec-title">{previous.title}</p>
      <div className="kv">
        <div>
          <div className="k">{t("Local", "当地时间")}</div>
          <div className="v">
            {formatLocalDateTime(previous.scheduled_at_local, lang, {
              withYear: true,
            })}
          </div>
        </div>
        <div>
          <div className="k">{t("Session", "交易时段")}</div>
          <div className="v">
            {sessionLabel == null
              ? previous.session.replace(/_/g, " ")
              : t(sessionLabel.en, sessionLabel.zh)}
          </div>
        </div>
        <div>
          <div className="k">{t("Source", "来源")}</div>
          <div className="v">{previous.source_name}</div>
        </div>
      </div>
    </div>
  );
}
