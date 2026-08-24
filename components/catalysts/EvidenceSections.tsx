"use client";

/**
 * Phase F — the DATA/QUANT half of the Analysis tab (§46, §49).
 *
 * This file renders the EVIDENCE BUNDLE: everything the platform computed
 * itself, before any model saw it. It is deliberately a separate component
 * from the narrative, because §49's rule ("never mix them invisibly") is
 * much easier to break by accident than on purpose — a single shared
 * renderer that took a `tier` prop would eventually be called with the wrong
 * one, and model prose would inherit a fact badge.
 *
 * Three rules live here:
 *
 *  A. THE TIER COMES FROM THE PAYLOAD. Each section wears the chip its own
 *     `tier` key declares. A section with no tier gets NO chip rather than a
 *     guessed one, so an unlabelled blob can never be mistaken for measured
 *     data.
 *  B. CONSENSUS IS THE LOUD ABSENCE (§33). The platform subscribes to no
 *     estimate provider, so "the Street expects $1.42" is the single most
 *     expected number on an earnings screen and the one nobody may invent.
 *     It renders as an explicit notice with the server's own reason — never
 *     as a blank row, which reads as "no surprise expected".
 *  C. A SECTION IS SHOWN AS IT ARRIVED. Values render through a generic
 *     JSON view rather than a hand-written table per section: the bundle is
 *     an audit record, and a curated view would decide for the reader which
 *     of the model's inputs are worth seeing.
 */
import { useState } from "react";
import { useT } from "@/lib/i18n";
import EvidenceCoverageMap from "./EvidenceCoverageMap";
import type { EvidenceBundle, EvidenceSection, PriorAnalysisSummary } from "@/lib/types";
import {
  type BundleSection,
  type Tier,
  TIER_CLASS,
  bundleSections,
  consensusUnavailable,
  isoStamp,
  priorAnalyses,
  regimeText,
  sectionLabel,
  sectionDetail,
  sectionPartial,
  sectionReason,
  sectionUnavailable,
  tierText,
  unavailableText,
} from "./analysis-format";

/* ----------------------------------------------------------------- chips */

/**
 * The §49 tier chip.
 *
 * Exported because the narrative component needs the identical chip for its
 * LLM tier — two chip implementations would eventually drift, and a tier
 * vocabulary that means different things in two places is worse than none.
 */
export function TierChip({ tier }: { tier: Tier | null }) {
  const t = useT();
  if (tier == null) return null;
  const text = tierText(tier, t);
  return (
    <span
      className={`provenance ${TIER_CLASS[tier]}`}
      data-testid={`tier-chip-${tier}`}
      data-tier={tier}
    >
      {text}
    </span>
  );
}

/* ------------------------------------------------------------ value views */

/**
 * A scalar as text.
 *
 * `false` and `0` print as themselves. A boolean false rendered as a dash
 * (or worse, as nothing) is how "options data available: false" quietly
 * becomes "we didn't check", and a numeric zero is a measurement.
 */
function scalarText(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  if (typeof v === "string") return v === "" ? "—" : v;
  return String(v);
}

function isScalar(v: unknown): boolean {
  return v == null || ["boolean", "number", "string"].includes(typeof v);
}

/**
 * A bundle value rendered structurally.
 *
 * Nested objects become nested key/value lists and arrays become numbered
 * rows, to a bounded depth. Beyond the bound the raw JSON is printed rather
 * than truncated with an ellipsis: a reader auditing a number needs the
 * value, and "…" is not one.
 */
function ValueView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (isScalar(value)) {
    return <span className="an-val mono">{scalarText(value)}</span>;
  }
  if (depth >= 4) {
    return <pre className="an-json">{safeJson(value)}</pre>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="an-val mono">[]</span>;
    }
    return (
      <ol className="an-array">
        {value.map((item, i) => (
          <li key={i}>
            <ValueView value={item} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([k]) => k !== "tier",
  );
  if (entries.length === 0) {
    return <span className="an-val mono">{"{}"}</span>;
  }
  return (
    <ul className="an-kv-list">
      {entries.map(([k, v]) => (
        <li key={k}>
          <span className="an-key">{k}</span>
          <ValueView value={v} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

/** JSON.stringify that cannot throw on a cycle — an audit view must render. */
function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? "—";
  } catch {
    return "—";
  }
}

/* --------------------------------------------------------------- sections */

/**
 * One bundle section, collapsed by default.
 *
 * `<details>` rather than a modal or a hover: every number the model was
 * given must stay reachable by keyboard and on touch, and a bundle rendered
 * fully expanded would bury the narrative under a wall of JSON on first
 * paint. The heading always carries the tier chip and the coverage line, so
 * what a section could NOT see is visible WITHOUT expanding it.
 */
function SectionBlock({ section }: { section: BundleSection }) {
  const t = useT();
  const body = section.body ?? ({} as EvidenceSection);
  const unavailable = sectionUnavailable(body);
  const reason = sectionReason(body);
  const coverage = body.coverage;

  return (
    <details className="an-section" data-testid={`evidence-section-${section.key}`}>
      <summary>
        <span className="an-section-name">{sectionLabel(section.key, t)}</span>
        <TierChip tier={section.tier} />
        {unavailable && (
          <span className="badge dim" data-testid={`section-unavailable-${section.key}`}>
            {t("NOT AVAILABLE", "暂无数据")}
          </span>
        )}
      </summary>
      <div className="an-section-body">
        {unavailable && (
          /* Verbatim server reason (§26/§36) — the UI never paraphrases why
             a section is empty, because the wording is the audit record. */
          <p className="empty">{unavailableText(reason, t)}</p>
        )}
        {coverage != null && (
          <div className="an-coverage" data-testid={`section-coverage-${section.key}`}>
            <span className="k">{t("Coverage", "覆盖范围")}</span>
            <ValueView value={coverage} depth={1} />
          </div>
        )}
        <ValueView value={body} />
      </div>
    </details>
  );
}

/**
 * §33 — the consensus notice.
 *
 * Rendered as a first-class panel row rather than one collapsed section
 * among many. On an earnings screen the absence of consensus is a headline
 * fact about what this analysis can and cannot claim: every "beat" and
 * "miss" downstream would need it, so a reader must meet it before the
 * narrative, not after.
 */
export function ConsensusNotice({ bundle }: { bundle: EvidenceBundle | null | undefined }) {
  const t = useT();
  const consensus = bundle?.consensus ?? null;
  if (consensus == null) return null;
  const unavailable = consensusUnavailable(bundle);
  if (!unavailable) {
    return (
      <div className="an-consensus" data-testid="consensus-block">
        <span className="k">{t("Consensus", "市场一致预期")}</span>
        <ValueView value={consensus} depth={1} />
      </div>
    );
  }
  return (
    <div className="an-consensus" data-testid="consensus-unavailable" role="note">
      <p>
        <span className="badge dim">{t("NO CONSENSUS", "无一致预期")}</span>{" "}
        {t(
          "No analyst estimate or consensus number is available: this platform subscribes to no estimate provider, so nothing here can say whether a result would be a beat or a miss.",
          "本平台未订阅任何分析师预期数据源,因此没有一致预期数字可用 — 本页任何内容都无法判断某个结果算「超预期」还是「不及预期」。",
        )}
      </p>
      {/* Verbatim server token + reason. Printed, not paraphrased: this is
          the string the backend guarantees, and downstream audits match it. */}
      <p className="an-consensus-reason mono" data-testid="consensus-reason">
        {String((consensus as { status?: unknown }).status ?? "")}
        {(consensus as { reason?: unknown }).reason != null &&
          ` — ${String((consensus as { reason?: unknown }).reason)}`}
      </p>
    </div>
  );
}

/**
 * §69/§70 — earlier analyses of this ticker, collapsed.
 *
 * Collapsed BY DESIGN and labelled PRIOR LLM OPINION. §70 is explicit that a
 * stored analysis is an opinion the model once held, not evidence; showing
 * it expanded beside the bundle would let last quarter's narrative read as
 * an input to this one. It is here so a reader can check whether the model
 * keeps telling the same story — that is the value, and it requires the
 * opinion be labelled as one.
 */
export function PriorAnalyses({ bundle }: { bundle: EvidenceBundle | null | undefined }) {
  const t = useT();
  const priors = priorAnalyses(bundle);
  if (priors.length === 0) return null;
  return (
    <details className="an-section" data-testid="prior-analyses">
      <summary>
        <span className="an-section-name">
          {t(
            `Prior analyses (${priors.length})`,
            `历史分析（${priors.length} 条）`,
          )}
        </span>
        <TierChip tier="LLM_PRIOR" />
      </summary>
      <div className="an-section-body">
        <p className="an-note">
          {t(
            "These are opinions this model wrote at earlier events — not evidence. They are shown so you can see whether its story has changed, and nothing below was computed from them.",
            "以下是模型在过往事件中给出的观点,并非证据。展示它们是为了让你看出模型的说法是否发生变化;本页任何计算都未使用这些内容。",
          )}
        </p>
        <ul className="an-prior-list">
          {priors.map((prior, i) => (
            <PriorRow key={prior.id ?? i} prior={prior} />
          ))}
        </ul>
      </div>
    </details>
  );
}

function PriorRow({ prior }: { prior: PriorAnalysisSummary }) {
  const t = useT();
  const summary =
    typeof prior.executive_summary === "string" ? prior.executive_summary.trim() : "";
  return (
    <li className="an-prior">
      <div className="an-prior-head">
        <span className="mono">{prior.event_key ?? "—"}</span>
        <span className="mono an-prior-asof">{isoStamp(prior.as_of) ?? "—"}</span>
        {prior.regime != null && prior.regime !== "" && (
          <span className="badge dim">{regimeText(prior.regime, t)}</span>
        )}
      </div>
      {summary !== "" && <p className="an-prior-summary">{summary}</p>}
    </li>
  );
}

/* ------------------------------------------------------------------ block */

/**
 * The whole evidence half: consensus notice, every section, and the source
 * metadata that says where each one came from and when.
 *
 * `defaultOpen` exists for the BUNDLE_ONLY and FAILED states — with no
 * narrative to read, the evidence IS the page, and making the user expand it
 * first would present a failure as an empty screen.
 */
export default function EvidenceSections({
  bundle,
  defaultOpen = false,
}: {
  bundle: EvidenceBundle | null | undefined;
  defaultOpen?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const sections = bundleSections(bundle);

  if (bundle == null) {
    return (
      <div className="panel">
        <h2>
          {t("Evidence", "证据")} <TierChip tier="DATA" />
        </h2>
        <p className="empty" data-testid="evidence-missing">
          {t(
            "No evidence bundle was returned with this response.",
            "本次响应未附带证据数据包。",
          )}
        </p>
      </div>
    );
  }

  const sourceMeta = Array.isArray(bundle.source_metadata) ? bundle.source_metadata : [];

  return (
    <div className="panel" data-testid="evidence-panel">
      <h2>
        {t("Evidence", "证据")} <TierChip tier="DATA" /> <TierChip tier="QUANT" />
      </h2>
      <p className="an-note">
        {t(
          "Everything in this panel was computed by the platform from stored data before any model was called. It is what the model was given — nothing here is generated text.",
          "本面板中的全部内容,均由平台在调用任何模型之前依据已存储数据计算得出。这些正是提供给模型的输入 — 其中没有任何生成内容。",
        )}
      </p>

      <ConsensusNotice bundle={bundle} />

      {/* WHAT THIS EVENT HAS, before what it says. The sections below are a
          faithful audit record and an unreadable summary; this answers the
          reader's first question without expanding sixteen of them. Clicking
          a cell opens the tree at that section. */}
      <EvidenceCoverageMap
        cells={sections.map((section) => ({
          key: section.key,
          label: sectionLabel(section.key, t),
          state: sectionUnavailable(section.body)
            ? "absent"
            : sectionPartial(section.body)
              ? "partial"
              : "present",
          reason: unavailableText(sectionReason(section.body), t),
          detail: sectionDetail(section.key, section.body),
        }))}
        onSelect={(key) => {
          setOpen(true);
          // The tree mounts on the same tick the state flushes, so the scroll
          // waits a frame for the target to exist.
          requestAnimationFrame(() => {
            const el = document.querySelector(`[data-testid="evidence-section-${key}"]`);
            if (el instanceof HTMLDetailsElement) {
              el.open = true;
              el.scrollIntoView({ block: "center", behavior: "smooth" });
            }
          });
        }}
      />

      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" onClick={() => setOpen((v) => !v)} data-testid="toggle-evidence">
          {open
            ? t("Hide the evidence bundle", "收起证据数据包")
            : t(
                `Show the evidence bundle (${sections.length} sections)`,
                `展开证据数据包（${sections.length} 个部分）`,
              )}
        </button>
      </div>

      {open && (
        <div className="an-sections" data-testid="evidence-sections">
          {sections.length === 0 ? (
            <p className="empty">
              {t(
                "The bundle carried no sections.",
                "该数据包未包含任何内容部分。",
              )}
            </p>
          ) : (
            sections.map((section) => (
              <SectionBlock key={section.key} section={section} />
            ))
          )}

          {sourceMeta.length > 0 && (
            <details className="an-section" data-testid="source-metadata">
              <summary>
                <span className="an-section-name">{t("Sources", "数据来源")}</span>
                <TierChip tier="DATA" />
              </summary>
              <div className="an-section-body">
                <ValueView value={sourceMeta} depth={1} />
              </div>
            </details>
          )}
        </div>
      )}

      <PriorAnalyses bundle={bundle} />
    </div>
  );
}
