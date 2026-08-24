"use client";

/**
 * "Not on the Watchlist" banner (2026-08-20, §4.2 amended by user decision:
 * research surfaces are OPEN — overview, bars, technicals, options chain,
 * news and trade plans serve any ticker via lazy backfill).
 *
 * Membership now means exactly two things, and this banner says only that:
 * CONTINUOUS TRACKING (daily data maintenance, signals, inclusion in the
 * recommendation flow) and BACKTEST eligibility. Research first, add after.
 *
 * The add path is research-only (confirmed via dialog, never authorizes
 * trading). A 409 — already added elsewhere — reaches the goal state, so it
 * recovers silently instead of surfacing an error.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/Toast";
import { api, ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";

export default function NotOnWatchlistBanner({ ticker }: { ticker: string }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  // Only for the pending-recommendations hint — approving a recommendation
  // on the Recommendations page both resolves it and adds the symbol.
  // PENDING only (shares the Recommendations page's default cache entry),
  // no polling — a static hint doesn't need the 15s default interval.
  const recs = useQuery({
    queryKey: ["recommendations", "PENDING"],
    queryFn: () => api.recommendations.list("PENDING"),
    staleTime: 60_000,
    refetchInterval: false,
  });
  const pendingCount = (recs.data ?? []).filter(
    (r) => r.ticker === ticker && r.status === "PENDING",
  ).length;

  const afterJoin = () => {
    qc.invalidateQueries({ queryKey: ["watchlist"] });
    qc.invalidateQueries({ queryKey: ["watchlist-overview"] });
    qc.invalidateQueries({ queryKey: ["recommendations"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const add = useMutation({
    mutationFn: () => api.watchlist.add(ticker),
    onSuccess: () => {
      setError("");
      setAdding(false);
      toast(
        "SUCCESS",
        t(
          `${ticker} added to Watchlist — continuous tracking begins; trading is NOT authorized`,
          `${ticker} 已加入自选列表 — 开始持续跟踪；并未授权交易`,
        ),
      );
      afterJoin();
    },
    onError: (e: Error) => {
      setAdding(false);
      if (e instanceof ApiError && e.status === 409) {
        afterJoin();
        return;
      }
      setError(e.message);
    },
  });

  return (
    <>
      {adding && (
        <ConfirmDialog
          title={t(`Add ${ticker} to Watchlist`, `将 ${ticker} 加入自选列表`)}
          confirmLabel={t("Add", "加入")}
          loading={add.isPending}
          onCancel={() => setAdding(false)}
          onConfirm={() => add.mutate()}
        >
          <p>
            {t(
              "Adding starts continuous tracking only: daily data maintenance, signals, and inclusion in the recommendation flow, plus backtest eligibility. It does not authorize trading.",
              "加入后仅开始持续跟踪：每日维护数据、计算信号并纳入推荐流程，同时获得回测资格。并不授权交易。",
            )}
          </p>
        </ConfirmDialog>
      )}
      <div className="panel" data-testid="not-on-watchlist-banner">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <strong>{t("Not on the Watchlist", "尚未加入自选列表")}</strong>
            <p style={{ margin: "4px 0 0", color: "var(--text-dim)", fontSize: 13 }}>
              {t(
                `You can research ${ticker} fully right here. Adding it starts continuous tracking (daily data, signals, recommendation flow) and unlocks backtests.`,
                `你可以在此完整研究 ${ticker}。加入自选列表后开始持续跟踪（每日数据、信号、推荐流程），并解锁回测。`,
              )}
            </p>
            {pendingCount > 0 && (
              <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                {t(
                  `${pendingCount} pending recommendation${pendingCount === 1 ? "" : "s"} for this symbol — approving one on the `,
                  `该标的有 ${pendingCount} 条待处理推荐 — 在`,
                )}
                <Link href="/research?tab=recommendations">{t("Recommendations page", "推荐页")}</Link>
                {t(
                  " also adds it to the Watchlist.",
                  "上批准其中任意一条，即会同时将该标的加入自选列表。",
                )}
              </p>
            )}
            {error && <p className="error">{error}</p>}
          </div>
          <button className="primary" onClick={() => setAdding(true)} disabled={add.isPending}>
            {t("Add to Watchlist", "加入自选列表")}
          </button>
        </div>
      </div>
    </>
  );
}
