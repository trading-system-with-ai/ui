"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import NotConfigured, { NotConfiguredNote } from "@/components/shared/NotConfigured";
import { useToast } from "@/components/shared/Toast";
import {
  ApiError,
  api,
  isMarketDataNotConfigured,
  notConfiguredMessage,
  retryUnlessTerminal,
} from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import { OPPORTUNITY_BADGE, TRADEABILITY_BADGE } from "@/lib/risk-format";
import type { PromotionCheck, PromotionCheckErrorDetail } from "@/lib/types";
import FlowNav from "@/components/shared/FlowNav";

/** Narrow the 422 `detail` from POST /api/trading-pool to the §4.3 checks shape. */
function isPromotionCheckFailure(detail: unknown): detail is PromotionCheckErrorDetail {
  return (
    typeof detail === "object" &&
    detail !== null &&
    Array.isArray((detail as { checks?: unknown }).checks)
  );
}

function backtestBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("FAIL")) return "red";
  if (s.includes("COMPLET") || s.includes("PASS")) return "green";
  if (s.includes("RUN") || s.includes("PEND")) return "amber";
  return "dim";
}

function edgeColor(v: number): string {
  if (v > 0) return "var(--green)";
  if (v < 0) return "var(--red)";
  return "var(--text-dim)";
}

export default function WatchlistPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  const el = useEnumLabel();
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState("");
  /** §4.3 — the ticker whose promotion checks failed, with the checks to review. */
  const [checkFailure, setCheckFailure] = useState<{
    ticker: string;
    checks: PromotionCheck[];
  } | null>(null);
  const [promoteNote, setPromoteNote] = useState<{
    ticker: string;
    risksAcknowledged: boolean;
  } | null>(null);

  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist.list });
  const pool = useQuery({ queryKey: ["trading-pool"], queryFn: api.tradingPool.list });
  const overview = useQuery({
    queryKey: ["watchlist-overview"],
    queryFn: api.watchlist.overview,
    retry: retryUnlessTerminal,
  });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api.plans.list() });
  const poolTickers = new Set(pool.data?.map((p) => p.ticker));
  const overviewMap = new Map(overview.data?.map((o) => [o.ticker, o]) ?? []);
  // §33 Plan Status column: the most relevant plan per ticker — ACTIVE wins,
  // else the newest plan's status (list is newest-first).
  const planByTicker = new Map<string, string>();
  for (const p of plans.data ?? []) {
    const existing = planByTicker.get(p.ticker);
    if (existing === "ACTIVE") continue;
    if (p.status === "ACTIVE" || existing == null) planByTicker.set(p.ticker, p.status);
  }
  // While the overview is still loading (or a symbol's signals cannot be
  // computed yet), research cells stay EMPTY — no gray placeholders (user
  // 2026-08-20); the ticker plus add/remove/promote stay usable throughout.
  // With no provider every research column is empty by definition — each row
  // stays as its ticker plus dashes, and the panel says why once.
  const overviewUnconfigured = isMarketDataNotConfigured(overview.error);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["watchlist"] });
    qc.invalidateQueries({ queryKey: ["watchlist-overview"] });
    qc.invalidateQueries({ queryKey: ["trading-pool"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const add = useMutation({
    mutationFn: () => api.watchlist.add(ticker),
    onSuccess: () => {
      toast(
        "SUCCESS",
        t(
          `${ticker.toUpperCase()} added to Watchlist — research only, no trading authorized`,
          `${ticker.toUpperCase()} 已加入自选列表——仅供研究，未授权交易`,
        ),
      );
      setTicker("");
      setError("");
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (tk: string) => api.watchlist.remove(tk),
    onSuccess: (_, tk) => {
      toast("INFO", t(`${tk} removed from Watchlist`, `${tk} 已从自选列表移除`));
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  // §4.3 promote flow: always try WITHOUT acknowledgement first. A 422 whose
  // detail carries the checks opens the review panel below the table; the
  // danger action there retries with acknowledge=true (permanently audited).
  const promote = useMutation({
    mutationFn: ({ ticker, acknowledge }: { ticker: string; acknowledge?: boolean }) =>
      api.tradingPool.promote(ticker, acknowledge),
    onSuccess: (res) => {
      setCheckFailure(null);
      setAckFor(null);
      setError("");
      setPromoteNote({
        ticker: res.ticker,
        risksAcknowledged: res.risks_acknowledged === true,
      });
      invalidate();
    },
    onError: (e: Error, vars) => {
      if (e instanceof ApiError && e.status === 422 && isPromotionCheckFailure(e.detail)) {
        setPromoteNote(null);
        setError("");
        setCheckFailure({ ticker: vars.ticker, checks: e.detail.checks });
      } else {
        setError(e.message);
      }
    },
  });

  // §27: acknowledge/remove flows are application dialogs, never native.
  const [ackFor, setAckFor] = useState<{ ticker: string; checks: PromotionCheck[] } | null>(
    null,
  );
  const [removingTicker, setRemovingTicker] = useState<string | null>(null);

  const acknowledgeAndPromote = (failure: { ticker: string; checks: PromotionCheck[] }) =>
    setAckFor(failure);

  return (
    <>
      {ackFor != null && (
        <ConfirmDialog
          title={t(
            `Acknowledge risks and promote ${ackFor.ticker}`,
            `确认风险并晋升 ${ackFor.ticker}`,
          )}
          confirmLabel={t("Acknowledge and Promote", "确认风险并晋升")}
          destructive
          loading={promote.isPending}
          onCancel={() => setAckFor(null)}
          onConfirm={() => promote.mutate({ ticker: ackFor.ticker, acknowledge: true })}
        >
          <p>{t("The §4.3 readiness checks did not pass:", "§4.3 就绪性检查未通过：")}</p>
          <ul className="why-list" style={{ margin: "8px 0" }}>
            {ackFor.checks
              .filter((c) => !c.passed)
              .map((c) => (
                <li key={c.name}>
                  <strong>{c.name}</strong>: {c.detail}
                </li>
              ))}
          </ul>
          <p style={{ color: "var(--amber)" }}>
            {t(
              "This override — including the full list of failed checks — is permanently recorded in the TRADING_POOL_ADD audit trail (§38). The acknowledgement cannot be hidden or removed later.",
              "本次覆盖操作——包括全部未通过检查的完整清单——将被永久记录在 TRADING_POOL_ADD 审计轨迹中（§38）。该风险确认此后无法隐藏或删除。",
            )}
          </p>
        </ConfirmDialog>
      )}
      {removingTicker != null && (
        <ConfirmDialog
          title={t(
            `Remove ${removingTicker} from Watchlist`,
            `将 ${removingTicker} 移出自选列表`,
          )}
          confirmLabel={t("Remove", "移除")}
          destructive
          loading={remove.isPending}
          onCancel={() => setRemovingTicker(null)}
          onConfirm={() => {
            remove.mutate(removingTicker);
            setRemovingTicker(null);
          }}
        >
          <p>
            {t(
              `Removes ${removingTicker} from research and also revokes any Trading Pool authorization it holds. Stored history and audit records are kept.`,
              `将 ${removingTicker} 从研究范围中移除，并同时撤销其持有的任何交易池授权。已存储的历史数据与审计记录将予保留。`,
            )}
          </p>
        </ConfirmDialog>
      )}
      <h1>{t("Watchlist", "自选列表")}</h1>
      <p className="subtitle">
        {t(
          "Only you can add or remove symbols. Data download and research start after a symbol joins the Watchlist — the Watchlist itself can never trade.",
          "只有您本人可以添加或移除标的。数据下载与研究在标的加入自选列表后开始——自选列表本身永远不会执行交易。",
        )}
      </p>
      <FlowNav stage="research" />

      <div className="panel">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (ticker.trim()) add.mutate();
          }}
        >
          <input
            type="text"
            placeholder={t("TICKER", "股票代码")}
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            maxLength={10}
          />
          <button type="submit" className="primary" disabled={add.isPending || !ticker.trim()}>
            {t("Add to Watchlist", "加入自选列表")}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      {promoteNote && (
        <div className={`banner ${promoteNote.risksAcknowledged ? "paused" : "active"}`}>
          {t(
            `${promoteNote.ticker} promoted to the Trading Pool.`,
            `${promoteNote.ticker} 已晋升至交易池。`,
          )}
          {promoteNote.risksAcknowledged &&
            t(
              " Risks acknowledged — the override and the failed checks are permanently recorded in the audit trail (§4.3).",
              "风险已确认——该覆盖操作及未通过的检查已永久记录在审计轨迹中（§4.3）。",
            )}
        </div>
      )}

      <div className="panel">
        <h2>
          {t("Symbols", "标的")} ({watchlist.data?.length ?? 0})
        </h2>
        {overviewUnconfigured ? (
          <NotConfigured message={notConfiguredMessage(overview.error)}>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
              {t(
                "Price, regime, edge, bias and opportunity are all derived from market data. Each symbol still lists, and adding, removing and promoting stay available.",
                "价格、市况、优势、倾向与机会均由市场数据推导。各标的仍照常列出，添加、移除与晋升操作依然可用。",
              )}
            </p>
          </NotConfigured>
        ) : overview.isError ? (
          <p className="error" style={{ marginTop: 0, marginBottom: 8 }}>
            {t("Research columns unavailable:", "研究列不可用：")} {overview.error.message}
          </p>
        ) : null}
        {watchlist.data && watchlist.data.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Ticker", "代码")}</th>
                  <th className="num">{t("Price", "价格")}</th>
                  <th>{t("Regime", "市况")}</th>
                  <th className="num">{t("Edge", "优势")}</th>
                  <th>{t("Classification", "分类")}</th>
                  <th>{t("Tradeability", "可交易性")}</th>
                  <th>{t("Plan", "计划")}</th>
                  <th>{t("Opportunity", "机会")}</th>
                  <th>{t("Backtest", "回测")}</th>
                  <th>{t("Pool status", "交易池状态")}</th>
                  <th style={{ textAlign: "right" }}>{t("Actions", "操作")}</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.data.map((w) => {
                  const o = overviewMap.get(w.ticker);
                  return (
                    <tr key={w.ticker}>
                      <td className="ticker">
                        <Link href={`/watchlist/${w.ticker}`} className="ticker-link">
                          {w.ticker}
                        </Link>
                      </td>
                      <td className="num">
                        {o?.price != null ? (
                          `$${o.price.toFixed(2)}`
                        ) : null}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {o?.regime != null ? (
                          el(o.regime)
                        ) : null}
                      </td>
                      <td className="num">
                        {o?.directional_edge != null ? (
                          <span style={{ color: edgeColor(o.directional_edge) }}>
                            {o.directional_edge > 0 ? "+" : ""}
                            {o.directional_edge.toFixed(1)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {o?.edge_class ? (
                          <span className={`badge ${o.edge_class.toLowerCase()}`}>
                            {el(o.edge_class)}
                          </span>
                        ) : o?.bias ? (
                          <span className={`badge ${o.bias.toLowerCase()}`}>{el(o.bias)}</span>
                        ) : null}
                      </td>
                      <td>
                        {o?.tradeability ? (
                          <span className={`badge ${TRADEABILITY_BADGE[o.tradeability]}`}>
                            {el(o.tradeability)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {planByTicker.get(w.ticker) ? (
                          <span
                            className={`badge ${
                              planByTicker.get(w.ticker) === "ACTIVE"
                                ? "green"
                                : planByTicker.get(w.ticker) === "GENERATED"
                                  ? "amber"
                                  : "dim"
                            }`}
                          >
                            {el(planByTicker.get(w.ticker))}
                          </span>
                        ) : (
                          null
                        )}
                      </td>
                      <td>
                        {o?.opportunity_status ? (
                          <span
                            className={`badge ${OPPORTUNITY_BADGE[o.opportunity_status] ?? "dim"}`}
                          >
                            {el(o.opportunity_status)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          {o?.backtest_status ? (
                            <span className={`badge ${backtestBadgeClass(o.backtest_status)}`}>
                              {el(o.backtest_status)}
                            </span>
                          ) : null}
                          {o?.last_backtest_id != null && (
                            <Link
                              href={`/backtests?id=${o.last_backtest_id}`}
                              style={{ color: "var(--accent)" }}
                            >
                              {t("View", "查看")}
                            </Link>
                          )}
                        </span>
                      </td>
                      <td>
                        {poolTickers.has(w.ticker) ? (
                          <span className="badge on">{t("IN TRADING POOL", "已入交易池")}</span>
                        ) : (
                          <span className="badge off">{t("RESEARCH ONLY", "仅研究")}</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <Link href={`/watchlist/${encodeURIComponent(w.ticker)}`} className="btn">
                            {t("Analyze", "分析")}
                          </Link>
                          {!poolTickers.has(w.ticker) && (
                            <button
                              onClick={() => promote.mutate({ ticker: w.ticker })}
                              disabled={promote.isPending}
                              title={t(
                                "Promote to Trading Pool — authorizes execution after all gates",
                                "晋升至交易池 — 通过全部闸门后方可执行",
                              )}
                              style={{ whiteSpace: "nowrap" }}
                            >
                              {t("Promote", "晋升")}
                            </button>
                          )}
                          <button
                            className="danger"
                            onClick={() => setRemovingTicker(w.ticker)}
                          >
                            {t("Remove", "移除")}
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {overviewUnconfigured && (
              <NotConfiguredNote message={notConfiguredMessage(overview.error)} />
            )}
          </div>
        ) : watchlist.isPending ? (
          <p className="empty">{t("Loading…", "加载中…")}</p>
        ) : (
          <p className="empty">
            {t(
              "Watchlist is empty. Add a ticker above to begin research.",
              "自选列表为空。在上方添加股票代码即可开始研究。",
            )}
          </p>
        )}
      </div>

      {checkFailure && (
        <div className="panel" style={{ borderColor: "var(--red)" }}>
          <h2 style={{ color: "var(--red)" }}>
            {t("Promotion checks failed", "晋升检查未通过")} — {checkFailure.ticker}
          </h2>
          <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0 }}>
            {checkFailure.checks.map((c) => (
              <li
                key={c.name}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    color: c.passed ? "var(--green)" : "var(--red)",
                    fontWeight: 600,
                  }}
                >
                  {c.passed ? "✓" : "✗"} {c.name}
                </span>{" "}
                <span
                  style={
                    // LIQUIDITY runs in REPORT mode (risk-engine audit §7.3):
                    // it always passes and its detail carries the measured
                    // ADV20 + hypothetical verdict — render it dimmed so a
                    // pass never reads as an ENFORCED liquidity check.
                    c.name === "LIQUIDITY"
                      ? { color: "var(--text-dim)", fontStyle: "italic" }
                      : undefined
                  }
                >
                  {c.detail}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            {t(
              "Promoting anyway records the override — including every failed check above — in the TRADING_POOL_ADD audit trail, permanently (§4.3, §38).",
              "若仍选择晋升，该覆盖操作——包括上方所有未通过的检查——将被永久记录在 TRADING_POOL_ADD 审计轨迹中（§4.3、§38）。",
            )}
          </p>
          <div className="row">
            <button onClick={() => setCheckFailure(null)}>{t("Cancel", "取消")}</button>
            <button
              className="danger"
              disabled={promote.isPending}
              onClick={() => acknowledgeAndPromote(checkFailure)}
            >
              {t("Acknowledge risks & promote anyway", "确认风险并仍然晋升")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
