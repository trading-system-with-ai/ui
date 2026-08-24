"use client";

/**
 * Recommendation card + its display helpers — extracted verbatim from
 * app/recommendations/page.tsx (2026-08-20) so the ticker-page preview for
 * non-watchlist symbols renders the SAME card (§30: the only actions are
 * View Evidence, Dismiss, Add to Watchlist — never "Trade Now").
 */
import Link from "next/link";
import { useState } from "react";
import Term from "@/components/shared/Term";
import { useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import type { Recommendation, RecommendationStatus } from "@/lib/types";

/* ---------------------------------------------------------------- badges */

// Sentiment direction thresholds: > +0.15 reads BULLISH, < -0.15 reads BEARISH,
// anything in between is NEUTRAL (dim).
const BULLISH_ABOVE = 0.15;
const BEARISH_BELOW = -0.15;

export function sentimentBadge(sentiment: number): { label: string; cls: string } {
  if (sentiment > BULLISH_ABOVE) return { label: "BULLISH", cls: "bull" };
  if (sentiment < BEARISH_BELOW) return { label: "BEARISH", cls: "bear" };
  return { label: "NEUTRAL", cls: "neutral" };
}

export const STATUS_BADGE: Record<RecommendationStatus, string> = {
  PENDING: "amber",
  DISMISSED: "dim",
  PROMOTED: "green",
  EXPIRED: "dim",
};

// Chinese display labels for the status tokens; the raw tokens above keep
// driving the CSS badge-class lookups and are shown verbatim in English.
export const STATUS_ZH: Record<RecommendationStatus, string> = {
  PENDING: "待处理",
  DISMISSED: "已忽略",
  PROMOTED: "已加入自选",
  EXPIRED: "已过期",
};


/* ---------------------------------------------------------------- score meters */

function ScoreMeter({
  label,
  value,
  termKey,
}: {
  label: string;
  value: number;
  termKey?: string;
}) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="score-row">
      <span className="score-label">
        {termKey ? <Term k={termKey}>{label}</Term> : label}
      </span>
      <div
        className="score-track"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${pct.toFixed(0)}%`}
      >
        <div className="score-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="score-val">{pct.toFixed(0)}%</span>
    </div>
  );
}

/* ---------------------------------------------------------------- evidence citations */

/**
 * A citation's source is linkable only when it actually is a web URL. Non-http
 * sources (e.g. stub:// articles during dev) render as plain code text — a
 * link that cannot resolve would be a fabricated affordance.
 */
function isHttpUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

function EvidenceSource({ source }: { source: string }) {
  if (isHttpUrl(source)) {
    return (
      <a
        className="ev-source"
        href={source}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--accent)", wordBreak: "break-all" }}
      >
        {source}
      </a>
    );
  }
  return (
    <code className="ev-source" style={{ wordBreak: "break-all" }}>
      {source}
    </code>
  );
}

/* ---------------------------------------------------------------- card */

export function RecCard({
  rec,
  onDismiss,
  onPromote,
  busy,
}: {
  rec: Recommendation;
  onDismiss: (id: number) => void;
  onPromote: (rec: Recommendation) => void;
  busy: boolean;
}) {
  const t = useT();
  const el = useEnumLabel();
  const [showEvidence, setShowEvidence] = useState(false);
  const dir = sentimentBadge(rec.sentiment);
  // Catalyst trades die of old age: a pending card older than 48h says so
  // instead of posing as fresh.
  const ageDays = Math.floor((Date.now() - new Date(rec.ts).getTime()) / 86400000);
  const isStale = rec.status === "PENDING" && ageDays >= 2;

  return (
    <div className={`rec-card${isStale ? " rec-stale" : ""}`}>
      <div className="rec-head">
        <Link
          href={`/watchlist/${rec.ticker}`}
          className="rec-ticker ticker-link"
          title={t(
            `Open ${rec.ticker} research — no need to add it to the Watchlist first`,
            `打开 ${rec.ticker} 研究页 — 无需先加入自选列表`,
          )}
        >
          {rec.ticker}
        </Link>
        <span className="rec-company">{rec.company ?? "—"}</span>
        <span className={`badge ${dir.cls}`}>{el(dir.label)}</span>
        {rec.status !== "PENDING" && (
          <span className={`badge ${STATUS_BADGE[rec.status]}`}>
            {t(rec.status, STATUS_ZH[rec.status])}
          </span>
        )}
      </div>

      <div className="rec-meta">
        <span className="chip">{rec.catalyst_type}</span>
        <span className="chip">{el(rec.horizon)}</span>
        <span className="rec-ts">{new Date(rec.ts).toLocaleString()}</span>
        {isStale && (
          <span className="badge stale">
            {t(`STALE — generated ${ageDays}d ago`, `已陈旧 — ${ageDays} 天前生成`)}
          </span>
        )}
      </div>

      <p className="rec-summary">{rec.summary}</p>

      {rec.reason_codes.length > 0 && (
        <div className="rec-codes">
          {rec.reason_codes.map((code) => (
            <span className="chip" key={code}>
              {code}
            </span>
          ))}
        </div>
      )}

      <div>
        <ScoreMeter label={t("Impact", "影响力")} value={rec.impact} termKey="impact" />
        <ScoreMeter label={t("Novelty", "新颖度")} value={rec.novelty} termKey="novelty" />
        <ScoreMeter
          label={t("Reliability", "可靠性")}
          value={rec.source_reliability}
          termKey="source_reliability"
        />
      </div>

      {showEvidence && (
        <div className="rec-evidence">
          <p className="ev-note">
            {t(
              "Real citations: each item references a stored news article (server-validated), and every timestamp predates the recommendation — no hindsight sourcing (§20.3).",
              "真实引用：每条证据均对应一篇已存储的新闻文章（经服务器校验），且所有时间戳均早于该推荐生成时间 — 不存在事后取材（§20.3）。",
            )}
          </p>
          {rec.evidence.length > 0 ? (
            rec.evidence.map((ev, i) => (
              <div className="ev-item" key={i}>
                <EvidenceSource source={ev.source} />
                <span className="ev-ts">{new Date(ev.published_at).toLocaleString()}</span>
                <p className="ev-snippet">{ev.snippet}</p>
              </div>
            ))
          ) : (
            <p className="ev-note">{t("No evidence entries attached.", "未附带任何证据条目。")}</p>
          )}
        </div>
      )}

      {/* Deliberately NO "Trade Now" here — the only actions on a recommendation
          are View Evidence, Dismiss, and Add to Watchlist (§30). */}
      <div className="rec-actions">
        <button onClick={() => setShowEvidence((v) => !v)}>
          {showEvidence
            ? t("Hide Evidence", "收起证据")
            : t(`View Evidence (${rec.evidence.length})`, `查看证据（${rec.evidence.length}）`)}
        </button>
        {rec.status === "PENDING" ? (
          <span className="row spacer">
            <button onClick={() => onDismiss(rec.id)} disabled={busy}>
              {t("Dismiss", "忽略")}
            </button>
            <button className="primary" onClick={() => onPromote(rec)} disabled={busy}>
              {t("Add to Watchlist", "加入自选列表")}
            </button>
          </span>
        ) : (
          <span className={`badge ${STATUS_BADGE[rec.status]} spacer`}>
            {t(rec.status, STATUS_ZH[rec.status])}
          </span>
        )}
      </div>
    </div>
  );
}

