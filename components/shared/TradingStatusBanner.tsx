"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";

/**
 * Single source of truth for "will the system generate orders right now?".
 *
 * The global kill switch and per-symbol enablement are two independent facts;
 * rendering them as two independent ENABLED/PAUSED banners let Dashboard and
 * Trading Pool contradict each other (green "TRADING ENABLED" on one page,
 * amber "ALL TRADING PAUSED" on the other, at the same instant). This
 * component combines both into ONE effective headline; the raw facts render
 * as a detail line underneath. The ENABLED/PAUSED vocabulary is reserved for
 * the global switch alone.
 *
 * Safety invariants preserved from the originals: unknown global status is
 * presented as PAUSED, and green is never shown while the pool is unknown.
 */
export default function TradingStatusBanner({
  statusKnown,
  globalEnabled,
  pausedReason,
  poolKnown,
  enabledCount,
  poolSize,
  action,
}: {
  statusKnown: boolean;
  globalEnabled: boolean;
  pausedReason?: string | null;
  poolKnown: boolean;
  enabledCount: number;
  poolSize: number;
  action?: ReactNode;
}) {
  const t = useT();

  let tone: "paused" | "neutral" | "active";
  let headline: string;
  if (!globalEnabled) {
    tone = "paused";
    headline = statusKnown
      ? t(
          `TRADING PAUSED — ${pausedReason || "no reason given"}`,
          `交易已暂停 — ${pausedReason || "未提供原因"}`,
        )
      : t(
          "TRADING PAUSED — global status unavailable; treated as paused",
          "交易已暂停 — 全局状态不可用，按已暂停处理",
        );
  } else if (!poolKnown) {
    tone = "neutral";
    headline = t(
      "Global kill switch is on — loading per-symbol enablement…",
      "全局紧急开关已开启 — 正在加载单标的启用状态…",
    );
  } else if (enabledCount === 0) {
    tone = "neutral";
    headline = t(
      `NO ORDERS WILL BE GENERATED — the global kill switch is on, but 0 of ${poolSize} Trading Pool ${poolSize === 1 ? "symbol has" : "symbols have"} trading enabled`,
      `当前不会产生订单 — 全局紧急开关已开启，但交易池 ${poolSize} 个标的中 0 个启用交易`,
    );
  } else {
    tone = "active";
    headline = t(
      `TRADING ENABLED — ${enabledCount} of ${poolSize} Trading Pool ${enabledCount === 1 ? "symbol" : "symbols"} may generate orders (every order still passes the full gate chain)`,
      `交易已启用 — 交易池 ${enabledCount}/${poolSize} 个标的可能产生订单（每笔订单仍须通过完整闸门链）`,
    );
  }

  return (
    <div className={`banner ${tone}`}>
      <span className="row" style={{ justifyContent: "space-between" }}>
        <span>{headline}</span>
        {action}
      </span>
      <span className="banner-facts">
        {t("Global kill switch:", "全局紧急开关：")}{" "}
        {statusKnown
          ? globalEnabled
            ? t("ENABLED", "已启用")
            : t("PAUSED", "已暂停")
          : t("unavailable", "不可用")}
        {" · "}
        {t("Symbols with trading enabled:", "已启用交易的标的：")}{" "}
        {poolKnown ? `${enabledCount}/${poolSize}` : "…"}
        {!globalEnabled &&
          t(
            " — global pause overrides per-symbol enablement.",
            " — 全局暂停优先于单标的启用设置。",
          )}
      </span>
    </div>
  );
}
