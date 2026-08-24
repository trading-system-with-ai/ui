"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";

/**
 * Which provider is missing. "market-data" is the default because most
 * surfaces depend on Massive; "llm" is used only by the recommendations
 * generator; "broker" covers execution — approve and close.
 */
export type NotConfiguredVariant = "market-data" | "llm" | "broker";

/** Bilingual string pair resolved at render via useT(). */
type L = { en: string; zh: string };

const TITLE: Record<NotConfiguredVariant, L> = {
  "market-data": { en: "Market data not configured", zh: "市场数据未配置" },
  llm: { en: "LLM provider not configured", zh: "LLM 服务商未配置" },
  broker: { en: "Broker not configured", zh: "券商未配置" },
};

/**
 * Fallback wording used only when the server sent no message (e.g. an older
 * backend, or a transport error that swallowed the body). It names the same
 * configuration the backend names, so the instruction is never vague.
 */
const FALLBACK_MESSAGE: Record<NotConfiguredVariant, L> = {
  "market-data": {
    en: "market data provider is not configured — set MARKET_DATA_PROVIDER and the corresponding credentials",
    zh: "市场数据服务商未配置——请设置 MARKET_DATA_PROVIDER 及相应凭证",
  },
  llm: {
    en: "LLM provider is not configured — set LLM_PROVIDER and the corresponding credentials",
    zh: "LLM 服务商未配置——请设置 LLM_PROVIDER 及相应凭证",
  },
  broker: {
    en: "broker is not configured — set BROKER_PROVIDER and the corresponding paper-trading credentials",
    zh: "券商未配置——请设置 BROKER_PROVIDER 及相应的模拟盘凭证",
  },
};

/**
 * Closing promise, stated on every occurrence. The data variants promise no
 * invented numbers; the broker variant promises no invented FILL — the internal
 * simulator is never silently substituted for a real broker, so an unconfigured
 * broker means nothing was sent to any market.
 *
 * Two forms rather than one derived from the other: the inline note continues a
 * sentence, so its wording is written out instead of being mechanically
 * re-cased from the panel's.
 */
const POLICY: Record<NotConfiguredVariant, { panel: L; inline: L }> = {
  "market-data": {
    panel: {
      en: "No data is shown rather than estimated or synthetic values.",
      zh: "宁可不显示数据，也不显示估算或合成的数值。",
    },
    inline: {
      en: "no data is shown rather than estimated or synthetic values.",
      zh: "宁可不显示数据，也不显示估算或合成的数值。",
    },
  },
  llm: {
    panel: {
      en: "No data is shown rather than estimated or synthetic values.",
      zh: "宁可不显示数据，也不显示估算或合成的数值。",
    },
    inline: {
      en: "no data is shown rather than estimated or synthetic values.",
      zh: "宁可不显示数据，也不显示估算或合成的数值。",
    },
  },
  broker: {
    panel: {
      en: "No order was placed — nothing was sent to any broker, and no simulated fill is substituted for one.",
      zh: "未提交任何订单——没有任何指令发送至任何券商，也不会以模拟成交冒充真实成交。",
    },
    inline: {
      en: "no order was placed, and no simulated fill is substituted for one.",
      zh: "未提交任何订单，也不会以模拟成交冒充真实成交。",
    },
  },
};

/**
 * The single explicit NOT-CONFIGURED state, rendered wherever a surface would
 * otherwise show numbers it does not have.
 *
 * The system has exactly one data source, and exactly one execution path. When
 * either is unset the backend returns 503 rather than any value, and this panel
 * takes the place of the numbers — it never renders a placeholder figure, and
 * no caller may substitute one. The closing line is fixed copy: it is the
 * promise the whole change exists to keep, so it is stated on every occurrence
 * rather than left implied.
 */
export default function NotConfigured({
  variant = "market-data",
  message,
  title,
  children,
}: {
  variant?: NotConfiguredVariant;
  /** The server's own message from the 503 detail; rendered verbatim. */
  message?: string | null;
  /** Override the heading (e.g. to name the specific surface). */
  title?: string;
  /** Optional extra context, rendered under the standard lines. */
  children?: ReactNode;
}) {
  const t = useT();
  const fallback = FALLBACK_MESSAGE[variant];
  const text =
    message != null && message.trim() !== "" ? message : t(fallback.en, fallback.zh);
  return (
    <div className="not-configured" role="status">
      <div className="nc-head">
        <span className="badge amber">{t("NOT CONFIGURED", "未配置")}</span>
        <strong>{title ?? t(TITLE[variant].en, TITLE[variant].zh)}</strong>
      </div>
      <p className="nc-message">{text}</p>
      <p className="nc-policy">{t(POLICY[variant].panel.en, POLICY[variant].panel.zh)}</p>
      {children}
    </div>
  );
}

/**
 * Inline one-liner for places where a full panel would break the layout —
 * a table footnote or a disabled control's explanation. Same promise, same
 * amber treatment, no numbers.
 */
export function NotConfiguredNote({
  variant = "market-data",
  message,
}: {
  variant?: NotConfiguredVariant;
  message?: string | null;
}) {
  const t = useT();
  const fallback = FALLBACK_MESSAGE[variant];
  const text =
    message != null && message.trim() !== "" ? message : t(fallback.en, fallback.zh);
  return (
    <p className="nc-inline">
      <span className="badge amber">{t("NOT CONFIGURED", "未配置")}</span> {text} —{" "}
      {t(POLICY[variant].inline.en, POLICY[variant].inline.zh)}
    </p>
  );
}
