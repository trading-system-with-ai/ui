"use client";

/**
 * Phase F — the "Analysis" tab: the §46 evidence bundle and the §48 LLM
 * narrative written over it, kept visibly apart (§49).
 *
 * The tab exists to answer "what should I be watching at this print, and why"
 * without ever letting the reader lose track of WHO said each thing. Its
 * whole design follows from one asymmetry: the evidence is checkable and the
 * narrative is not, so the narrative may never be presented with the same
 * authority as the numbers underneath it.
 *
 * Five rules are specific to this tab:
 *
 *  A. THE GET NEVER SPENDS A CALL. Opening the tab reads what is stored;
 *     with nothing stored the server answers 404 ANALYSIS_NOT_FOUND, which
 *     is the ORDINARY first visit and renders as a call-to-action with the
 *     Generate button attached — never as a red error. Generating is always
 *     an explicit user action, because it costs money and the user should
 *     know when they spent it.
 *  B. A CACHED ANSWER IS LABELLED. `cached: true` means the evidence bundle
 *     digest was unchanged, so the stored narrative is still an answer about
 *     the same facts. Presenting it as fresh would hide that no model ran;
 *     the Regenerate button is always there for when the user wants one to.
 *  C. VIOLATIONS ARE SHOWN, NOT HIDDEN (§47). The model may not compute
 *     numbers — every number it uses must be quoted from the bundle, and the
 *     backend checks each quote against the bundle's own facts. When a quote
 *     does not reproduce, status is INVALID and the narrative is STILL
 *     rendered, under a banner naming each failure. Hiding a failed analysis
 *     would also hide the fact that the check runs at all.
 *  D. A PROVIDER FAILURE IS NOT AN EMPTY PAGE. status FAILED arrives as a
 *     200 carrying the full evidence bundle. The evidence is the part the
 *     platform actually knows; it stays readable, expanded, with the error
 *     printed verbatim above it.
 *  E. 503 IS A CONFIGURATION STATE, NOT A FAILURE. With no LLM provider
 *     connected the Generate button is disabled and says so, and the
 *     evidence endpoint still fills the tab — an unconfigured model must
 *     never cost the user access to their own data.
 */
import { badgeInfo } from "./eventStatusBadge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/components/shared/Toast";
import {
  api,
  isAnalysisNotFound,
  isLlmNotConfigured,
  notConfiguredMessage,
} from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { EventAnalysisBody, EventAnalysisPayload } from "@/lib/types";
import EvidenceSections, { TierChip } from "./EvidenceSections";
import ScenarioCards from "./ScenarioCards";
import {
  NARRATIVE_KEYS,
  NARRATIVE_LABEL,
  STATUS_BADGE_CLASS,
  buildRefIndex,
  confidenceBadge,
  confidenceText,
  hasViolations,
  isoStamp,
  narrativeText,
  quoteValueText,
  quotedNumbers,
  regimeText,
  resolveRefs,
  safeUrl,
  statusText,
  stringList,
  usageText,
  violationList,
} from "./analysis-format";

/* ---------------------------------------------------------------- header */

/**
 * Provenance strip: as-of, status, provider/model, cached flag, cost.
 *
 * Every field here answers "how much should I trust the prose below". The
 * model NAME is part of that — two models produce different analyses of the
 * same bundle, and an analysis whose author is anonymous cannot be compared
 * with a later one.
 */
function AnalysisHeader({ data }: { data: EventAnalysisPayload }) {
  const t = useT();
  const status = data.status ?? null;
  const badge = STATUS_BADGE_CLASS[status ?? ""] ?? "dim";
  const usage = usageText(data.usage);

  return (
    <div className="an-header" data-testid="analysis-header">
      <div className="an-header-row">
        <span className={`badge ${badge}`} data-testid="analysis-status">
          {statusText(status, t)}
        </span>
        {badgeInfo(data.event_status_badge).show && (
          /* §7 — a DERIVED date may be analysed, but the reader must know the
             event itself is not confirmed before reading a word about it. */
          <span className="badge amber" data-testid="event-status-badge">
            {badgeInfo(data.event_status_badge).text}
          </span>
        )}
        {data.cached === true && (
          <span className="badge dim" data-testid="analysis-cached">
            {t("CACHED", "缓存结果")}
          </span>
        )}
      </div>
      <p className="an-meta">
        <span className="k">{t("as of", "计算时点")}</span>{" "}
        <span className="mono" data-testid="analysis-as-of">
          {isoStamp(data.as_of) ?? "—"}
        </span>
        {" · "}
        <span className="k">{t("model", "模型")}</span>{" "}
        <span className="mono" data-testid="analysis-model">
          {data.provider ?? "—"}
          {data.model != null && data.model !== "" ? `/${data.model}` : ""}
        </span>
        {data.prompt_version != null && data.prompt_version !== "" && (
          <>
            {" · "}
            <span className="mono" data-testid="analysis-prompt-version">
              {data.prompt_version}
            </span>
          </>
        )}
        {usage != null && (
          <>
            {" · "}
            <span className="mono" data-testid="analysis-usage">
              {usage}
            </span>
          </>
        )}
        {typeof data.latency_ms === "number" && (
          <>
            {" · "}
            <span className="mono" data-testid="analysis-latency">
              {data.latency_ms} ms
            </span>
          </>
        )}
      </p>
      {data.cached === true && (
        <p className="an-note" data-testid="cached-note">
          {t(
            "No model ran for this view: the evidence bundle has not changed since this analysis was written, so the stored one still answers the same facts. Regenerate to spend a fresh call.",
            "本次展示未调用模型：自该分析生成以来,证据数据包没有变化,因此已存储的分析依然对应同一批事实。如需重新生成,请点击「重新生成」。",
          )}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- violations */

/**
 * The §47 transparency banner.
 *
 * Deliberately amber and deliberately ABOVE the narrative it describes. The
 * temptation is to refuse to render an INVALID analysis at all; that would
 * be worse, because the reader would never learn that the platform checks
 * every number the model quotes, and the next surface to skip the check
 * would look identical.
 */
function ViolationsBanner({ data }: { data: EventAnalysisPayload }) {
  const t = useT();
  const violations = violationList(data);
  if (violations.length === 0) return null;
  return (
    <div className="capability-banner" role="alert" data-testid="violations-banner">
      <p className="cb-line">
        <span className="badge amber">{t("INVALID", "校验未通过")}</span>{" "}
        {t(
          "The model quoted numbers that are not in the evidence bundle, or quoted them with the wrong value. Every number below is therefore unverified. The analysis is shown for transparency — read the evidence panel, not the prose, for the actual figures.",
          "模型引用了证据数据包中不存在的数字,或引用的数值与证据不符。因此下方所有数字均未通过校验。此处仍展示该分析以保持透明 — 请以「证据」面板为准,而非模型叙述。",
        )}
      </p>
      <ul className="an-violations" data-testid="violation-list">
        {violations.map((v, i) => (
          /* Verbatim validator wording — the exact failure, not a summary. */
          <li key={i} className="mono">
            {v}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------- narrative */

/** A prose section under its heading. Nothing is rendered for a blank field. */
function ProseSection({ label, text }: { label: string; text: string | null }) {
  if (text == null) return null;
  return (
    <div className="an-prose-block">
      <h3 className="an-h3">{label}</h3>
      <p className="an-prose">{text}</p>
    </div>
  );
}

/** A bulleted catalyst list. Rendered only when the model actually sent items. */
function CatalystList({
  label,
  items,
  testId,
}: {
  label: string;
  items: string[];
  testId: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="an-prose-block">
      <h3 className="an-h3">{label}</h3>
      <ul className="an-bullets" data-testid={testId}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * §47's audit table: every number the narrative used, with its bundle path.
 *
 * Collapsed, because most readers want the prose — but present on EVERY
 * analysis, including the ones that validated cleanly. A check that is only
 * visible when it fails teaches the reader nothing about what passing means.
 */
function QuotedNumbers({ analysis }: { analysis: EventAnalysisBody }) {
  const t = useT();
  const quotes = quotedNumbers(analysis);
  if (quotes.length === 0) return null;
  return (
    <details className="an-section" data-testid="numbers-quoted">
      <summary>
        <span className="an-section-name">
          {t(
            `Numbers quoted (${quotes.length})`,
            `引用数字（${quotes.length} 处）`,
          )}
        </span>
      </summary>
      <div className="an-section-body">
        <p className="an-note">
          {t(
            "The model computes nothing. Every number in the prose above had to be quoted from the evidence bundle, and each row below names the exact path it came from — these are what the validator checked.",
            "模型不做任何计算。上文叙述中的每个数字都必须引用自证据数据包,下方每一行都标明了其确切来源路径 — 这些正是校验器所核对的内容。",
          )}
        </p>
        <ul className="an-quote-list">
          {quotes.map((q, i) => (
            <li key={`${q.path}-${i}`}>
              <span className="an-key mono">{q.path}</span>
              <span className="an-val mono">{quoteValueText(q.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/**
 * §52 — the citations, resolved to the bundle where possible.
 *
 * A ref that resolves to a news article becomes a link to the publisher's
 * own page; a ref that is a bundle path renders as the path. A ref NOTHING
 * in the bundle knows about is still listed, flagged — an unresolvable
 * citation is a finding about the analysis, and dropping it would erase the
 * finding.
 */
function EvidenceRefs({
  refs,
  bundle,
}: {
  refs: string[];
  bundle: EventAnalysisPayload["bundle"];
}) {
  const t = useT();
  if (refs.length === 0) return null;
  const index = buildRefIndex(bundle);
  const resolved = resolveRefs(refs, index, bundle);
  return (
    <div className="an-prose-block" data-testid="evidence-refs">
      <h3 className="an-h3">{t("Evidence cited", "引用的证据")}</h3>
      <ul className="an-ref-list">
        {resolved.map((r, i) => {
          const href = safeUrl(r.url);
          return (
            <li key={`${r.ref}-${i}`}>
              <span className="an-ref mono">{r.ref}</span>
              {r.title != null && <span className="an-ref-title">{r.title}</span>}
              {href != null && (
                <>
                  {" "}
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="src-link"
                  >
                    {t("Open source →", "打开来源 →")}
                  </a>
                </>
              )}
              {!r.resolved && (
                <span className="badge amber" data-testid="unresolved-ref">
                  {t("NOT IN BUNDLE", "证据包中不存在")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The §48 narrative panel.
 *
 * One panel, one tier chip, one banner — so that everything inside it is
 * unambiguously the model's writing. The regime and confidence chips sit at
 * the top rather than the bottom because they qualify every sentence below
 * them, and a caveat placed after the argument is a caveat that arrives too
 * late.
 */
function NarrativePanel({ data }: { data: EventAnalysisPayload }) {
  const t = useT();
  const analysis = data.analysis ?? null;
  if (analysis == null) return null;

  const regime = regimeText(analysis.expectations_gap_regime, t);
  const confidence = confidenceText(analysis.confidence, t);
  const invalid = hasViolations(data) || data.status === "INVALID";

  return (
    <div className="panel" data-testid="analysis-narrative">
      <h2>
        {t("Analysis", "分析")} <TierChip tier="LLM" />
      </h2>
      <p className="an-note">
        {t(
          "Everything in this panel was WRITTEN BY A LANGUAGE MODEL from the evidence above. It is an interpretation, not a measurement, and it has not been tested as a trading rule.",
          "本面板中的全部内容均由语言模型依据上方证据「撰写」而成。它是一种解读,而非测量结果,且从未作为交易规则被检验过。",
        )}
      </p>

      <div className="an-header-row" style={{ marginTop: 8 }}>
        {regime != null && (
          /* §35 — a classification of the SETUP, never a direction to trade.
             Deliberately neutral-coloured: "beat priced in" is not bearish. */
          <span className="badge dim" data-testid="regime-badge">
            {regime}
          </span>
        )}
        {confidence != null && (
          <span
            className={`badge ${confidenceBadge()}`}
            data-testid="confidence-badge"
          >
            {confidence}
          </span>
        )}
        {invalid && (
          <span className="badge amber" data-testid="narrative-unverified">
            {t("NUMBERS UNVERIFIED", "数字未通过校验")}
          </span>
        )}
      </div>

      {NARRATIVE_KEYS.map((key) => (
        <ProseSection
          key={key}
          label={t(NARRATIVE_LABEL[key].en, NARRATIVE_LABEL[key].zh)}
          text={narrativeText(analysis[key])}
        />
      ))}

      {/* v2 — DISAGREEMENTS BETWEEN LAYERS, reported rather than averaged
          (Phase 22). An empty list renders nothing: an "everything agrees"
          banner would be a claim the model did not make. */}
      {(analysis.evidence_conflicts ?? []).length > 0 && (
        <div className="an-prose-block" data-testid="evidence-conflicts">
          <h3 className="an-h3">{t("Evidence conflicts", "证据冲突")}</h3>
          <ul className="an-conflicts">
            {(analysis.evidence_conflicts ?? []).map((c, i) => (
              <li key={`${c.layer_a}-${c.layer_b}-${i}`} className="an-conflict">
                <span className="badge dim">{c.layer_a}</span>
                <span className="muted"> vs </span>
                <span className="badge dim">{c.layer_b}</span>
                <p>{c.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CatalystList
        label={t("Key positive catalysts", "关键正面催化因素")}
        items={stringList(analysis.key_positive_catalysts)}
        testId="positive-catalysts"
      />
      <CatalystList
        label={t("Key negative catalysts", "关键负面催化因素")}
        items={stringList(analysis.key_negative_catalysts)}
        testId="negative-catalysts"
      />

      <div className="an-prose-block">
        <h3 className="an-h3">{t("Scenario framework", "情景框架")}</h3>
        <ScenarioCards analysis={analysis} />
      </div>

      <CatalystList
        label={t("Key unknowns", "关键未知项")}
        items={stringList(analysis.key_unknowns)}
        testId="key-unknowns"
      />

      {/* §50 — "what would invalidate this?" is the part of an opinion that
          makes it checkable, so it is a first-class section, never a footnote. */}
      <ProseSection
        label={t("What would invalidate this", "什么会推翻上述判断")}
        text={narrativeText(analysis.invalidation)}
      />

      <EvidenceRefs refs={stringList(analysis.evidence_refs)} bundle={data.bundle} />

      <QuotedNumbers analysis={analysis} />
    </div>
  );
}

/* ----------------------------------------------------------------- states */

/**
 * The first-visit state: no analysis stored, and the reason is simply that
 * nobody asked for one yet.
 *
 * The remedy is attached to the explanation. This is the same rule the news
 * tab follows for an empty window — a state whose cure is a button elsewhere
 * on the page is a dead end.
 */
function NoAnalysisYet({
  onGenerate,
  pending,
  disabled,
  disabledReason,
}: {
  onGenerate: () => void;
  pending: boolean;
  disabled: boolean;
  disabledReason: string | null;
}) {
  const t = useT();
  return (
    <div className="panel" data-testid="analysis-none">
      <h2>
        {t("Analysis", "分析")} <TierChip tier="LLM" />
      </h2>
      <p className="empty">
        {t(
          "No analysis has been generated for this event yet. Opening this tab never calls the model — generating one is an explicit action because it spends a provider call. The evidence below is already complete and was computed without any model.",
          "该事件尚未生成分析。打开本页绝不会调用模型 — 生成分析是一项显式操作,因为它会消耗一次数据源调用。下方证据已完整呈现,且完全由平台计算得出,未使用任何模型。",
        )}
      </p>
      <GenerateButton
        onGenerate={onGenerate}
        pending={pending}
        disabled={disabled}
        disabledReason={disabledReason}
        label={t("Generate analysis", "生成分析")}
      />
    </div>
  );
}

/**
 * The generate/regenerate control plus its unconfigured state.
 *
 * When the LLM is unconfigured the button is DISABLED with the server's own
 * message printed beside it, rather than hidden: a missing button reads as a
 * missing feature, while a disabled one with a reason reads as a setting the
 * user can go change.
 */
function GenerateButton({
  onGenerate,
  pending,
  disabled,
  disabledReason,
  label,
}: {
  onGenerate: () => void;
  pending: boolean;
  disabled: boolean;
  disabledReason: string | null;
  label: string;
}) {
  const t = useT();
  return (
    <>
      <div className="row" style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={onGenerate}
          disabled={pending || disabled}
          data-testid="generate-analysis"
        >
          {pending ? t("Generating…", "正在生成…") : label}
        </button>
      </div>
      {disabled && (
        <p className="an-note" data-testid="llm-not-configured">
          {t(
            "No language-model provider is connected, so nothing can be generated. Connect one in Settings — the platform will not fall back to an ungrounded or canned analysis.",
            "尚未连接任何语言模型服务,因此无法生成分析。请在「设置」中连接 — 平台不会退而使用无依据或预设的分析内容。",
          )}
          {disabledReason != null && disabledReason !== "" && (
            /* Verbatim server message (§26/§36). */
            <>
              {" "}
              <span className="mono">{disabledReason}</span>
            </>
          )}
        </p>
      )}
    </>
  );
}

/**
 * status FAILED — the provider errored, and the bundle survived.
 *
 * Rendered as a state, not an error page, and never as a retry loop: the
 * user chooses whether to spend another call. The error text is printed
 * verbatim because "the model failed" is not actionable and "context length
 * exceeded" is.
 */
function ProviderFailure({ data }: { data: EventAnalysisPayload }) {
  const t = useT();
  return (
    <div className="capability-banner" role="alert" data-testid="analysis-failed">
      <p className="cb-line">
        <span className="badge amber">{t("FAILED", "生成失败")}</span>{" "}
        {t(
          "The language-model call did not complete, so there is no analysis. The evidence below is unaffected — it was computed by the platform and is what the model would have been given.",
          "语言模型调用未能完成,因此没有生成分析。下方证据不受影响 — 它由平台自行计算得出,也正是本应提供给模型的内容。",
        )}
      </p>
      {data.error != null && data.error !== "" && (
        /* Verbatim provider error — never paraphrased into "try again". */
        <p className="an-error mono" data-testid="analysis-error">
          {data.error}
        </p>
      )}
    </div>
  );
}

/**
 * A NEWER run failed and this analysis is the last good one.
 *
 * Shown ABOVE the analysis, not instead of it. The failure mode this replaces
 * was worse in both directions: the tab used to serve whatever row was
 * newest, so one provider timeout swapped a complete piece of research for an
 * error banner — the platform still had the note and told the reader it did
 * not. Simply falling back to the good row silently would be the opposite
 * error: the reader would take a possibly-stale answer for the current one.
 * So both facts are on screen, in that order — here is the analysis, and here
 * is why the refresh you asked for did not land.
 */
function LastAttemptNotice({ data }: { data: EventAnalysisPayload }) {
  const t = useT();
  const attempt = data.last_attempt;
  if (attempt == null) return null;
  const when = attempt.created_at ?? null;
  return (
    <div className="capability-banner" role="status" data-testid="last-attempt-notice">
      <p className="cb-line">
        <span className="badge amber">
          {attempt.status === "INVALID"
            ? t("LAST ATTEMPT INVALID", "最近一次校验未通过")
            : t("LAST ATTEMPT FAILED", "最近一次生成失败")}
        </span>{" "}
        {t(
          "A more recent attempt to regenerate this analysis did not complete, so what you are reading is the last one that did. It may not reflect evidence that arrived since.",
          "最近一次重新生成分析的尝试未能完成,因此您看到的是上一次成功生成的结果。它可能未包含此后新增的证据。",
        )}
        {when != null && when !== "" && (
          <>
            {" "}
            <span className="mono">{when}</span>
          </>
        )}
      </p>
      {attempt.error != null && attempt.error !== "" && (
        /* Verbatim, same reasoning as ProviderFailure: "the model failed" is
           not actionable and "ReadTimeout" is. */
        <p className="an-error mono" data-testid="last-attempt-error">
          {attempt.error}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- tab */

/**
 * The tab body, split from the fetching wrapper so the render contract can be
 * tested against a payload directly, with no query client in the way.
 *
 * `notFound` is threaded in rather than inferred from `data == null`: "the
 * server has no analysis stored" and "the request has not resolved" are
 * different states, and only the first one gets the call-to-action.
 */
export function AnalysisTabContent({
  data,
  notFound = false,
  onGenerate,
  generating = false,
  llmUnconfigured = false,
  llmMessage = null,
}: {
  data: EventAnalysisPayload | null;
  notFound?: boolean;
  onGenerate: (force: boolean) => void;
  generating?: boolean;
  llmUnconfigured?: boolean;
  llmMessage?: string | null;
}) {
  const t = useT();

  if (notFound || data == null) {
    return (
      <>
        <NoAnalysisYet
          onGenerate={() => onGenerate(false)}
          pending={generating}
          disabled={llmUnconfigured}
          disabledReason={llmMessage}
        />
        {/* The evidence is worth reading with no narrative at all — it is
            what the platform actually knows. Expanded by default here. */}
        <EvidenceSections bundle={data?.bundle ?? null} defaultOpen />
      </>
    );
  }

  const status = data.status ?? null;
  const failed = status === "FAILED";
  const bundleOnly = status === "BUNDLE_ONLY" || data.analysis == null;

  return (
    <>
      <div className="panel" data-testid="analysis-panel">
        <h2>
          {t("Event analysis", "事件分析")} <TierChip tier="DATA" />{" "}
          <TierChip tier="QUANT" /> <TierChip tier="LLM" />
        </h2>
        <p className="an-note">
          {t(
            "Three kinds of statement live on this tab and they are never mixed: DATA is what a source reported, QUANT is what the platform computed from it, and LLM ANALYSIS is what a model wrote about both. Each panel below carries its own chip.",
            "本页包含三类内容,且绝不混合呈现：「数据」是数据源报告的事实,「量化」是平台据此计算的结果,「模型分析」则是模型针对两者所撰写的解读。下方每个面板都带有各自的标签。",
          )}
        </p>
        <AnalysisHeader data={data} />
        <GenerateButton
          onGenerate={() => onGenerate(true)}
          pending={generating}
          disabled={llmUnconfigured}
          disabledReason={llmMessage}
          label={t("Regenerate analysis", "重新生成分析")}
        />
      </div>

      {failed && <ProviderFailure data={data} />}
      {/* Above the narrative it qualifies: the reader must know the analysis
          may be stale BEFORE reading it, not after. */}
      <LastAttemptNotice data={data} />
      <ViolationsBanner data={data} />

      {bundleOnly && !failed && (
        <div className="panel" data-testid="analysis-bundle-only">
          <h2>
            {t("Analysis", "分析")} <TierChip tier="LLM" />
          </h2>
          <p className="empty">
            {t(
              "This record holds the evidence bundle only — no model narrative was written for it.",
              "本记录仅包含证据数据包 — 未为其生成任何模型叙述。",
            )}
          </p>
        </div>
      )}

      <NarrativePanel data={data} />

      <EvidenceSections bundle={data.bundle} defaultOpen={failed || bundleOnly} />
    </>
  );
}

/**
 * The fetching wrapper mounted by the event detail page.
 *
 * Two things it does deliberately:
 *
 *  - `asOf` is in the query key. Two as-of instants are two different
 *    bundles (an article or a filing landing between them changes the
 *    evidence), so they must never share a cache entry.
 *  - The 404 does NOT retry and does NOT become an error. `isAnalysisNotFound`
 *    turns it into the first-visit state; everything else is a real failure
 *    and says so.
 */
export default function AnalysisTab({
  eventId,
  asOf,
}: {
  eventId: number;
  asOf?: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [llmError, setLlmError] = useState<unknown>(null);

  const query = useQuery({
    queryKey: ["event-analysis", eventId, asOf ?? null],
    queryFn: () => api.events.analysis(eventId, asOf),
    enabled: Number.isFinite(eventId),
    // A 404 here is "nothing stored yet", which no amount of retrying will
    // change — retrying only delays the call-to-action.
    retry: (failureCount, error) => !isAnalysisNotFound(error) && failureCount < 1,
  });

  /**
   * The evidence fallback.
   *
   * Fetched only when there is no stored analysis, so the ordinary path costs
   * one request. The point is that a user who has never generated anything
   * still sees the full DATA/QUANT evidence — the model is an addition to
   * this tab, not the price of admission to it.
   */
  const notFound = isAnalysisNotFound(query.error);
  const evidence = useQuery({
    queryKey: ["event-evidence", eventId, asOf ?? null],
    queryFn: () => api.events.evidence(eventId, asOf),
    enabled: Number.isFinite(eventId) && notFound,
  });

  const generate = useMutation({
    mutationFn: (force: boolean) =>
      api.events.generateAnalysis(eventId, { asOf, force }),
    onSuccess: (result: EventAnalysisPayload) => {
      setLlmError(null);
      qc.setQueryData(["event-analysis", eventId, asOf ?? null], result);
      qc.invalidateQueries({ queryKey: ["event-analysis", eventId] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      const status = result.status ?? "";
      if (status === "FAILED") {
        // A provider failure arrives as a 200 and must NOT be reported as a
        // success — the toast is the only place a user sees the outcome
        // before scrolling.
        toast(
          "WARNING",
          t(
            `The model call failed: ${result.error ?? "the server gave no reason"}. The evidence bundle was still stored.`,
            `模型调用失败：${result.error ?? "服务端未提供原因"}。证据数据包已正常存储。`,
          ),
        );
      } else if (status === "INVALID") {
        toast(
          "WARNING",
          t(
            "The analysis was generated but failed number validation — it quoted figures that are not in the evidence. It is shown with every violation listed.",
            "分析已生成,但未通过数字校验 — 其引用的数字在证据中不存在。该分析将连同全部问题一并展示。",
          ),
        );
      } else if (result.cached === true) {
        toast(
          "INFO",
          t(
            "The evidence bundle has not changed, so the stored analysis still applies — no model call was spent. Use Regenerate to force a new one.",
            "证据数据包没有变化,已存储的分析依然适用 — 本次未消耗任何模型调用。如需强制重新生成,请点击「重新生成」。",
          ),
        );
      } else {
        toast("SUCCESS", t("Analysis generated.", "分析已生成。"));
      }
    },
    onError: (e: Error) => {
      if (isLlmNotConfigured(e)) {
        // Not a failure of the action — a state of the platform. Recorded so
        // the button can explain itself instead of erroring again.
        setLlmError(e);
        return;
      }
      toast(
        "WARNING",
        t(`Analysis failed: ${e.message}`, `生成分析失败：${e.message}`),
      );
    },
  });

  if (query.isLoading) {
    return (
      <div className="panel">
        <h2>{t("Event analysis", "事件分析")}</h2>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  if (query.error != null && !notFound) {
    return (
      <div className="panel">
        <h2>{t("Event analysis", "事件分析")}</h2>
        <p className="error" data-testid="analysis-load-error">
          {t(
            `Could not load the analysis: ${query.error.message}`,
            `无法加载分析：${query.error.message}`,
          )}
        </p>
      </div>
    );
  }

  const unconfigured = isLlmNotConfigured(llmError);

  return (
    <AnalysisTabContent
      data={notFound ? (evidence.data ?? null) : (query.data ?? null)}
      notFound={notFound}
      onGenerate={(force) => generate.mutate(force)}
      generating={generate.isPending}
      llmUnconfigured={unconfigured}
      llmMessage={unconfigured ? notConfiguredMessage(llmError) : null}
    />
  );
}
