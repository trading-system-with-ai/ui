"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import type {
  Recommendation,
  RecommendationRefreshResult,
  RecommendationStatus,
} from "@/lib/types";

/* ---------------------------------------------------------------- badges */

// Sentiment direction thresholds: > +0.15 reads BULLISH, < -0.15 reads BEARISH,
// anything in between is NEUTRAL (dim).
const BULLISH_ABOVE = 0.15;
const BEARISH_BELOW = -0.15;

function sentimentBadge(sentiment: number): { label: string; cls: string } {
  if (sentiment > BULLISH_ABOVE) return { label: "BULLISH", cls: "bull" };
  if (sentiment < BEARISH_BELOW) return { label: "BEARISH", cls: "bear" };
  return { label: "NEUTRAL", cls: "neutral" };
}

const STATUS_BADGE: Record<RecommendationStatus, string> = {
  PENDING: "amber",
  DISMISSED: "dim",
  PROMOTED: "green",
};

type Tab = RecommendationStatus | "ALL";

const TABS: { key: Tab; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "DISMISSED", label: "Dismissed" },
  { key: "PROMOTED", label: "Promoted" },
  { key: "ALL", label: "All" },
];

/* ---------------------------------------------------------------- score meters */

function ScoreMeter({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="score-row">
      <span className="score-label">{label}</span>
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

/* ---------------------------------------------------------------- card */

function RecCard({
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
  const [showEvidence, setShowEvidence] = useState(false);
  const dir = sentimentBadge(rec.sentiment);

  return (
    <div className="rec-card">
      <div className="rec-head">
        <span className="rec-ticker">{rec.ticker}</span>
        <span className="rec-company">{rec.company ?? "—"}</span>
        <span className={`badge ${dir.cls}`}>{dir.label}</span>
        {rec.status !== "PENDING" && (
          <span className={`badge ${STATUS_BADGE[rec.status]}`}>{rec.status}</span>
        )}
      </div>

      <div className="rec-meta">
        <span className="chip">{rec.catalyst_type}</span>
        <span className="chip">{rec.horizon}</span>
        <span className="rec-ts">{new Date(rec.ts).toLocaleString()}</span>
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
        <ScoreMeter label="Impact" value={rec.impact} />
        <ScoreMeter label="Novelty" value={rec.novelty} />
        <ScoreMeter label="Reliability" value={rec.source_reliability} />
      </div>

      {showEvidence && (
        <div className="rec-evidence">
          <p className="ev-note">
            Each evidence timestamp predates the recommendation — no hindsight
            sourcing (§20.3).
          </p>
          {rec.evidence.length > 0 ? (
            rec.evidence.map((ev, i) => (
              <div className="ev-item" key={i}>
                <span className="ev-source">{ev.source}</span>
                <span className="ev-ts">{new Date(ev.published_at).toLocaleString()}</span>
                <p className="ev-snippet">{ev.snippet}</p>
              </div>
            ))
          ) : (
            <p className="ev-note">No evidence entries attached.</p>
          )}
        </div>
      )}

      {/* Deliberately NO "Trade Now" here — the only actions on a recommendation
          are View Evidence, Dismiss, and Add to Watchlist (§30). */}
      <div className="rec-actions">
        <button onClick={() => setShowEvidence((v) => !v)}>
          {showEvidence ? "Hide Evidence" : `View Evidence (${rec.evidence.length})`}
        </button>
        {rec.status === "PENDING" ? (
          <span className="row spacer">
            <button onClick={() => onDismiss(rec.id)} disabled={busy}>
              Dismiss
            </button>
            <button className="primary" onClick={() => onPromote(rec)} disabled={busy}>
              Add to Watchlist
            </button>
          </span>
        ) : (
          <span className={`badge ${STATUS_BADGE[rec.status]} spacer`}>{rec.status}</span>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- page */

export default function RecommendationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("PENDING");
  const [error, setError] = useState("");
  const [refreshResult, setRefreshResult] = useState<RecommendationRefreshResult | null>(null);
  const [promotedTicker, setPromotedTicker] = useState("");

  const recs = useQuery({
    queryKey: ["recommendations", tab],
    queryFn: () => api.recommendations.list(tab),
  });

  const invalidateRecs = () => {
    qc.invalidateQueries({ queryKey: ["recommendations"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const refresh = useMutation({
    mutationFn: api.recommendations.refresh,
    onSuccess: (result) => {
      setError("");
      setRefreshResult(result);
      invalidateRecs();
    },
    onError: (e: Error) => setError(e.message),
  });

  const dismiss = useMutation({
    mutationFn: (id: number) => api.recommendations.dismiss(id),
    onSuccess: () => {
      setError("");
      invalidateRecs();
    },
    onError: (e: Error) => setError(e.message),
  });

  const promote = useMutation({
    mutationFn: (id: number) => api.recommendations.promote(id),
    onSuccess: (result) => {
      setError("");
      setPromotedTicker(result.watchlist_ticker);
      invalidateRecs();
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.invalidateQueries({ queryKey: ["watchlist-overview"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const onPromote = (rec: Recommendation) => {
    // The confirm IS the governance step: promotion is the only path from a
    // recommendation to the Watchlist, and it requires this explicit approval.
    if (
      confirm(
        `Add ${rec.ticker} to the Watchlist?\n\nThis is your explicit approval step: the LLM only proposed this candidate. Nothing enters the Watchlist — and nothing ever trades — without this confirmation.`,
      )
    ) {
      promote.mutate(rec.id);
    }
  };

  const busy = dismiss.isPending || promote.isPending;

  return (
    <>
      <h1>Recommendations</h1>
      <p className="subtitle">
        The LLM proposes — you decide. Recommendations never enter the Watchlist or trade
        automatically.
      </p>

      <p className="datasource">source: LLM provider (stub until news ingestion)</p>

      <div className="row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <button
          className="primary"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          {refresh.isPending ? "Generating…" : "Generate recommendations"}
        </button>
      </div>

      {refreshResult && (
        <div className="preview-note">
          <strong>{refreshResult.created.length} created</strong>,{" "}
          {refreshResult.skipped.length} skipped
          {refreshResult.skipped.length > 0 && (
            <details className="skip-details">
              <summary>skip reasons</summary>
              <ul>
                {refreshResult.skipped.map((s) => (
                  <li key={s.ticker}>
                    <span className="ticker">{s.ticker}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {promotedTicker && (
        <div className="banner active">
          <span className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>
              {promotedTicker} added to the Watchlist — research starts there, trading never
              starts here.
            </span>
            <Link href="/watchlist" className="btn">
              Open Watchlist →
            </Link>
          </span>
        </div>
      )}

      {error && (
        <div className="panel">
          <p className="error" style={{ marginTop: 0 }}>{error}</p>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {recs.isPending ? (
        <div className="panel">
          <p className="empty">Loading recommendations…</p>
        </div>
      ) : recs.isError ? (
        <div className="panel">
          <p className="error">Recommendations unavailable: {recs.error.message}</p>
        </div>
      ) : recs.data.length > 0 ? (
        <div className="rec-grid">
          {recs.data.map((rec) => (
            <RecCard
              key={rec.id}
              rec={rec}
              onDismiss={(id) => dismiss.mutate(id)}
              onPromote={onPromote}
              busy={busy}
            />
          ))}
        </div>
      ) : (
        <div className="panel">
          <p className="empty">
            {tab === "PENDING"
              ? "No pending recommendations — generate some or check Dismissed/Promoted."
              : `No ${tab === "ALL" ? "" : tab.toLowerCase() + " "}recommendations yet.`}
          </p>
        </div>
      )}
    </>
  );
}
