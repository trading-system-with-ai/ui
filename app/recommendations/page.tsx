"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import NotConfigured from "@/components/shared/NotConfigured";
import { useToast } from "@/components/shared/Toast";
import {
  api,
  isLlmNotConfigured,
  isNewsNotAvailable,
  newsNotAvailableMessage,
  notConfiguredMessage,
} from "@/lib/api";
import { useT } from "@/lib/i18n";
import type {
  Recommendation,
  RecommendationRefreshResult,
  RecommendationStatus,
} from "@/lib/types";
import FlowNav from "@/components/shared/FlowNav";
import { RecCard, STATUS_ZH } from "@/components/recommendations/RecCard";

type Tab = RecommendationStatus | "ALL";

const TABS: { key: Tab; en: string; zh: string }[] = [
  { key: "PENDING", en: "Pending", zh: "待处理" },
  { key: "DISMISSED", en: "Dismissed", zh: "已忽略" },
  { key: "PROMOTED", en: "Promoted", zh: "已加入自选" },
  { key: "ALL", en: "All", zh: "全部" },
];

/* ---------------------------------------------------------------- page */

export default function RecommendationsPage() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("PENDING");
  const [error, setError] = useState("");
  const [refreshResult, setRefreshResult] = useState<RecommendationRefreshResult | null>(null);
  const [promotedTicker, setPromotedTicker] = useState("");

  const recs = useQuery({
    queryKey: ["recommendations", tab],
    queryFn: () => api.recommendations.list(tab),
  });
  // User decision 2026-08-20: week-old proposals are meaningless — the
  // pending view hides them outright (the backend marks them EXPIRED on
  // the next refresh; mirrors EXPIRE_AFTER_DAYS in routers/recommendations.py).
  const EXPIRE_AFTER_DAYS = 7;
  const now = Date.now();
  const isExpiredAge = (ts: string) =>
    now - new Date(ts).getTime() >= EXPIRE_AFTER_DAYS * 86400000;
  const visibleRecs =
    tab === "PENDING"
      ? (recs.data ?? []).filter((r) => !isExpiredAge(r.ts))
      : (recs.data ?? []);
  const hiddenExpired =
    tab === "PENDING" ? (recs.data?.length ?? 0) - visibleRecs.length : 0;
  // Same cache entry Settings uses — names the actual model behind "the
  // configured LLM provider" on the source line.
  const providers = useQuery({
    queryKey: ["provider-connections"],
    queryFn: api.config.providers.get,
  });
  const llm = providers.data?.llm;

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
    // The LLM 503 and the news-plan 503 each get a dedicated panel below, not
    // the red error box — nothing failed: the provider is unset, or its plan
    // simply lacks the news endpoint.
    onError: (e: Error) =>
      setError(isLlmNotConfigured(e) || isNewsNotAvailable(e) ? "" : e.message),
  });

  const llmUnconfigured = isLlmNotConfigured(refresh.error);
  const newsUnavailable = isNewsNotAvailable(refresh.error);

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
      setPromoting(null);
      toast(
        "SUCCESS",
        t(
          `${result.watchlist_ticker} added to Watchlist — research begins; trading is NOT authorized`,
          `${result.watchlist_ticker} 已加入自选列表 — 开始研究；并未授权交易`,
        ),
      );
      setPromotedTicker(result.watchlist_ticker);
      invalidateRecs();
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.invalidateQueries({ queryKey: ["watchlist-overview"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  // The dialog IS the governance step (§29): promotion is the only path from
  // a recommendation to the Watchlist, and it requires this explicit approval.
  const [promoting, setPromoting] = useState<Recommendation | null>(null);
  const onPromote = (rec: Recommendation) => setPromoting(rec);

  const busy = dismiss.isPending || promote.isPending;

  return (
    <>
      {promoting != null && (
        <ConfirmDialog
          title={t(
            `Add ${promoting.ticker} to Watchlist`,
            `将 ${promoting.ticker} 加入自选列表`,
          )}
          confirmLabel={t("Add", "加入")}
          loading={promote.isPending}
          onCancel={() => setPromoting(null)}
          onConfirm={() => promote.mutate(promoting.id)}
        >
          <p>
            {t(
              "This is your explicit approval step. The LLM only proposed this symbol.",
              "这是你的显式批准步骤。LLM 仅是提议了该标的。",
            )}
          </p>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>
            {t(
              "Adding it starts research only. It does not authorize trading — nothing enters the Watchlist, and nothing ever trades, without your confirmation.",
              "加入后仅开始研究，并不授权交易 — 未经你的确认，任何标的都不会进入自选列表，也绝不会发生任何交易。",
            )}
          </p>
        </ConfirmDialog>
      )}
      <h1>{t("Recommendations", "推荐")}</h1>
      <p className="subtitle">
        {t(
          "The LLM proposes — you decide. Recommendations never enter the Watchlist or trade automatically.",
          "LLM 只提议 — 由你决定。推荐永远不会自动进入自选列表或自动交易。",
        )}
      </p>
      <FlowNav stage="screen" />

      <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
        {t(
          "Dimmed cards are stale: a pending recommendation older than 48 hours has likely lost its timing edge — treat it as reference, not a fresh signal. Click any ticker to research it fully — you do not have to add it to the Watchlist first.",
          "灰色卡片表示已陈旧：超过 48 小时仍未处理的推荐，其催化剂时效大概率已衰减 — 仅作参考，不再是新鲜信号。点击任意代码即可完整研究该标的 — 无需先加入自选列表。",
        )}
      </p>

      <p className="datasource">
        {llm?.configured && llm.provider
          ? t(
              `source: ${llm.provider}${llm.model ? ` (${llm.model})` : ""}`,
              `数据来源：${llm.provider}${llm.model ? `（${llm.model}）` : ""}`,
            )
          : t("source: the configured LLM provider", "数据来源：已配置的 LLM 提供商")}
      </p>

      <div className="row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <button
          className="primary"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending || llmUnconfigured}
          title={
            llmUnconfigured
              ? t(
                  "No LLM provider is configured — nothing can be generated.",
                  "未配置 LLM 提供商 — 无法生成任何推荐。",
                )
              : undefined
          }
        >
          {refresh.isPending
            ? t("Generating…", "生成中…")
            : t("Generate recommendations", "生成推荐")}
        </button>
      </div>

      {llmUnconfigured && (
        <NotConfigured variant="llm" message={notConfiguredMessage(refresh.error)}>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
            {t(
              "Recommendations are model output with cited evidence — none are generated from a template. Existing rows below are unaffected.",
              "推荐均为附带引用证据的模型输出 — 不会由模板生成。下方已有条目不受影响。",
            )}
          </p>
        </NotConfigured>
      )}

      {/* Phase 8 — NOT the not-configured state: a provider IS connected, but
          its plan lacks the news endpoint, so nothing can be grounded.
          Amber, graceful, and distinct from the LLM / market-data panels. */}
      {newsUnavailable && (
        <div className="not-configured" role="status">
          <div className="nc-head">
            <span className="badge amber">{t("NOT IN PLAN", "套餐未包含")}</span>
            <strong>
              {t(
                "News not included in the market-data plan",
                "行情数据套餐不包含新闻",
              )}
            </strong>
          </div>
          <p className="nc-message">
            {newsNotAvailableMessage(refresh.error) ||
              t(
                "the subscribed market-data plan does not include the news endpoint",
                "当前订阅的行情数据套餐不包含新闻接口",
              )}
          </p>
          <p className="nc-policy">
            {t(
              "Recommendations are grounded on real news articles — with no news source, none are generated rather than falling back to ungrounded output. Existing rows below are unaffected.",
              "推荐基于真实新闻文章生成 — 没有新闻来源时将不生成任何推荐，而不会退回到无依据的输出。下方已有条目不受影响。",
            )}
          </p>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
            {t("Upgraded the plan? Re-check what it includes in", "已升级套餐？请在")}{" "}
            <Link href="/settings" style={{ color: "var(--accent)" }}>
              {t(
                "Settings → Data Plan Capabilities (“Re-probe now”)",
                "设置 → 数据套餐能力（“立即重新探测”）",
              )}
            </Link>
            {t(".", "中重新检查其包含的内容。")}
          </p>
        </div>
      )}

      {refreshResult && (
        <div className="preview-note">
          <strong>
            {t(
              `${refreshResult.created.length} created`,
              `新建 ${refreshResult.created.length} 条`,
            )}
          </strong>
          {t(", ", "，")}
          {t(
            `${refreshResult.skipped.length} skipped`,
            `跳过 ${refreshResult.skipped.length} 条`,
          )}
          {/* Phase 8 news-grounding summary — only when the backend sent it. */}
          {refreshResult.news && (
            <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "6px 0 0" }}>
              {t(
                `News: ${refreshResult.news.fetched} fetched · ${refreshResult.news.new} new · grounded on ${refreshResult.news.grounding} articles`,
                `新闻：抓取 ${refreshResult.news.fetched} 条 · 新增 ${refreshResult.news.new} 条 · 基于 ${refreshResult.news.grounding} 篇文章生成`,
              )}
            </p>
          )}
          {refreshResult.skipped.length > 0 && (
            <details className="skip-details">
              <summary>{t("skip reasons", "跳过原因")}</summary>
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
              {t(
                `${promotedTicker} added to the Watchlist — research starts there, trading never starts here.`,
                `${promotedTicker} 已加入自选列表 — 研究从那里开始，交易绝不会从这里开始。`,
              )}
            </span>
            <Link href="/research?tab=watchlist" className="btn">
              {t("Open Watchlist →", "打开自选列表 →")}
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
        {TABS.map((tabDef) => (
          <button
            key={tabDef.key}
            className={tab === tabDef.key ? "active" : ""}
            onClick={() => setTab(tabDef.key)}
          >
            {t(tabDef.en, tabDef.zh)}
          </button>
        ))}
      </div>

      {recs.isPending ? (
        <div className="panel">
          <p className="empty">{t("Loading recommendations…", "正在加载推荐…")}</p>
        </div>
      ) : recs.isError ? (
        <div className="panel">
          <p className="error">
            {t(
              `Recommendations unavailable: ${recs.error.message}`,
              `无法加载推荐：${recs.error.message}`,
            )}
          </p>
        </div>
      ) : visibleRecs.length > 0 ? (
        <>
          {hiddenExpired > 0 && (
            <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
              {t(
                `${hiddenExpired} proposal${hiddenExpired > 1 ? "s" : ""} older than 7 days hidden — a week-old catalyst is dead; the next refresh marks them EXPIRED (visible under “All”).`,
                `已隐藏 ${hiddenExpired} 条超过 7 天的旧推荐 — 一周前的催化剂已失效;下次刷新将标记为「已过期」(可在“全部”中查看)。`,
              )}
            </p>
          )}
          <div className="rec-grid">
            {visibleRecs.map((rec) => (
              <RecCard
                key={rec.id}
                rec={rec}
                onDismiss={(id) => dismiss.mutate(id)}
                onPromote={onPromote}
                busy={busy}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="panel">
          <p className="empty">
            {tab === "PENDING" && hiddenExpired > 0
              ? t(
                  `All ${hiddenExpired} pending proposals are older than 7 days (hidden) — refresh to expire them and generate fresh ones.`,
                  `全部 ${hiddenExpired} 条待处理推荐都已超过 7 天(已隐藏)— 点击刷新将其标记过期并生成新推荐。`,
                )
              : tab === "PENDING"
              ? t(
                  "No pending recommendations — generate some or check Dismissed/Promoted.",
                  "暂无待处理的推荐 — 可点击生成，或查看“已忽略 / 已加入自选”。",
                )
              : tab === "ALL"
                ? t("No recommendations yet.", "暂无推荐。")
                : t(
                    `No ${tab.toLowerCase()} recommendations yet.`,
                    `暂无${STATUS_ZH[tab]}的推荐。`,
                  )}
          </p>
        </div>
      )}
    </>
  );
}
