"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import NotConfigured from "@/components/shared/NotConfigured";
import { useToast } from "@/components/shared/Toast";
import { api, isMarketDataNotConfigured, notConfiguredMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useCapabilities } from "@/lib/use-capabilities";
import type {
  AccountPermissions,
  CapabilityStatus,
  PlatformConfig,
  ProviderConnections,
  ProviderConnectionsPutResult,
  ProviderConnectionsUpdate,
} from "@/lib/types";
import { fmtPct, fmtUsd } from "@/lib/risk-format";
import FlowNav from "@/components/shared/FlowNav";

/** Panel heading with the plan-section chip every panel carries. */
function PanelTitle({ title, section }: { title: string; section: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
      <h2 style={{ marginBottom: 0 }}>{title}</h2>
      <span className="chip">{section}</span>
    </div>
  );
}

/** Parameter | Value | Meaning table used by every parameter panel. */
function ParamTable({ rows }: { rows: [name: string, value: string, meaning: string][] }) {
  const t = useT();
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t("Parameter", "参数")}</th>
            <th className="num">{t("Value", "数值")}</th>
            <th>{t("Meaning", "含义")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, value, meaning]) => (
            <tr key={name}>
              <td style={{ whiteSpace: "nowrap" }}>{name}</td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>
                {value}
              </td>
              <td style={{ fontFamily: "inherit", fontSize: 12, color: "var(--text-dim)" }}>
                {meaning}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------- connections (§15 / §16) */

/**
 * Success state after a PUT: a brief confirmation line, plus the adopted-cash
 * figure when connecting the broker with an empty local ledger adopted the
 * real account's cash.
 */
interface ConnectDone {
  text: string;
  cashAdopted?: number;
}

/**
 * CONNECTED green / NOT CONNECTED red — the server's `configured` boolean is
 * the only authority, never the presence of a name or a stored secret.
 */
function ConnBadge({ configured }: { configured: boolean }) {
  const t = useT();
  return (
    <span className={`badge ${configured ? "green" : "red"}`}>
      {configured ? t("CONNECTED", "已连接") : t("NOT CONNECTED", "未连接")}
    </span>
  );
}

/**
 * "key stored ✓" — the server holds this write-only secret, so connecting does
 * not require re-entering it. The value itself never comes back from any API;
 * only this boolean does.
 */
function StoredMark({ stored }: { stored: boolean }) {
  const t = useT();
  if (!stored) return null;
  return (
    <span style={{ color: "var(--green)", textTransform: "none", marginLeft: 6 }}>
      {t("key stored ✓", "密钥已保存 ✓")}
    </span>
  );
}

/**
 * Shared PUT mutation for every connection card. On ANY success the ENTIRE
 * query cache is invalidated — no key on purpose: connecting or disconnecting
 * a source changes what every surface in the app can honestly show, so
 * everything refetches. Never optimistic: state renders only from the
 * server's response, and errors (422 detail text, network) surface inline.
 */
function useConnectionPut(onDone: (res: ProviderConnectionsPutResult) => void) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  return useMutation({
    mutationFn: (update: ProviderConnectionsUpdate) => api.config.providers.put(update),
    onSuccess: (res) => {
      toast(
        "SUCCESS",
        t(
          "Configuration updated — provider connections saved",
          "配置已更新 — 服务商连接已保存",
        ),
      );
      qc.invalidateQueries();
      onDone(res);
    },
  });
}

/** Inline result lines shared by the three cards: error red, success green. */
function ConnResult({
  error,
  done,
}: {
  error: Error | null;
  done: ConnectDone | null;
}) {
  const t = useT();
  return (
    <>
      {error != null && (
        <p className="error" style={{ marginTop: 0 }}>
          {error.message}
        </p>
      )}
      {error == null && done != null && (
        <>
          <p className="conn-ok">{done.text}</p>
          {done.cashAdopted != null && (
            <p className="conn-cash-adopted">
              {t(
                "Portfolio cash aligned to the broker account:",
                "组合现金已对齐至券商账户：",
              )}{" "}
              {fmtUsd(done.cashAdopted, 2)}
            </p>
          )}
        </>
      )}
    </>
  );
}

/** Market Data: provider choice (data_source.md §1 — Alpaca is the
 *  authoritative market-data source; Massive remains selectable for
 *  installs still keyed to it). Alpaca market data authenticates with the
 *  SAME credentials as the broker connection. */
function MarketDataCard({ conns }: { conns: ProviderConnections }) {
  const t = useT();
  const active = conns.market_data.provider;
  const [choice, setChoice] = useState<"alpaca" | "massive">(
    active === "massive" ? "massive" : "alpaca",
  );
  const [key, setKey] = useState("");
  const [done, setDone] = useState<ConnectDone | null>(null);
  const [lastAction, setLastAction] = useState<"connect" | "disconnect">("connect");
  const put = useConnectionPut((res) => {
    setKey("");
    setDone({
      text: res.market_data.configured
        ? t("Connected.", "已连接。")
        : lastAction === "disconnect"
          ? t("Disconnected.", "已断开。")
          : t(
              "Saved — provider selected but NOT configured (see the reason above; missing credentials?).",
              "已保存 — 服务商已选定但尚未配置成功（见上方原因；是否缺少凭证？）。",
            ),
    });
  });
  const massiveStored = conns.secrets_set.massive_api_key;
  const alpacaKeysStored =
    conns.secrets_set.alpaca_api_key_id && conns.secrets_set.alpaca_api_secret_key;

  const connect = () => {
    setDone(null);
    setLastAction("connect");
    const update: ProviderConnectionsUpdate = { market_data_provider: choice };
    if (choice === "massive" && key.trim() !== "") update.massive_api_key = key.trim();
    put.mutate(update);
  };

  return (
    <div className="conn-card">
      <div className="conn-head">
        <span className="conn-name">
          {t("Market Data", "行情数据")}{active ? ` (${active})` : ""}
        </span>
        <ConnBadge configured={conns.market_data.configured} />
      </div>
      {conns.market_data.reason != null && conns.market_data.reason.trim() !== "" && (
        <p className="conn-reason">{conns.market_data.reason}</p>
      )}
      <div className="conn-field">
        <label htmlFor="market-data-provider">{t("Provider", "服务商")}</label>
        <select
          id="market-data-provider"
          value={choice}
          onChange={(e) => setChoice(e.target.value as "alpaca" | "massive")}
        >
          <option value="alpaca">
            {t(
              "Alpaca (stocks · options · news) — recommended",
              "Alpaca（股票 · 期权 · 新闻）— 推荐",
            )}
          </option>
          <option value="massive">Massive</option>
        </select>
        <p className="conn-help">
          {t(
            "Per the data-source architecture, Alpaca is authoritative for all market data; Massive is reserved for fundamentals. No silent cross-provider fallback.",
            "按照数据源架构，Alpaca 是所有行情数据的权威来源；Massive 仅用于基本面数据。不存在跨服务商的静默回退。",
          )}
        </p>
      </div>
      {choice === "alpaca" ? (
        <div className="conn-field">
          <label>{t("Credentials", "凭证")}</label>
          <p className="conn-help">
            {t(
              "Uses the SAME Alpaca keys as the Broker connection below.",
              "与下方券商连接使用同一套 Alpaca 密钥。",
            )}{" "}
            {alpacaKeysStored
              ? t(
                  "Alpaca keys are stored — nothing more to enter.",
                  "Alpaca 密钥已保存 — 无需再输入。",
                )
              : t(
                  "No Alpaca keys stored yet — connect the Broker card first (or enter keys there).",
                  "尚未保存 Alpaca 密钥 — 请先连接券商卡片（或在那里输入密钥）。",
                )}
          </p>
        </div>
      ) : (
        <div className="conn-field">
          <label htmlFor="massive-api-key">
            {t("API key", "API 密钥")}
            <StoredMark stored={massiveStored} />
          </label>
          <input
            id="massive-api-key"
            type="password"
            placeholder="MASSIVE_API_KEY"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
          <p className="conn-help">
            {t(
              "Write-only — once saved the key is never displayed again.",
              "只写不读 — 保存后密钥不会再显示。",
            )}
            {massiveStored &&
              t(
                " A key is stored; leave blank to keep it, or enter a new one to replace it.",
                " 已保存一个密钥；留空则保留原密钥，输入新密钥则替换。",
              )}
          </p>
        </div>
      )}
      <div className="conn-actions">
        <button
          className="primary"
          onClick={connect}
          disabled={put.isPending || (choice === "alpaca" && !alpacaKeysStored)}
        >
          {put.isPending ? t("Saving…", "保存中…") : t("Connect", "连接")}
        </button>
        {active !== "" && (
          <button
            className="danger"
            disabled={put.isPending}
            onClick={() => {
              setDone(null);
              setLastAction("disconnect");
              put.mutate({ market_data_provider: "" });
            }}
          >
            {t("Disconnect", "断开连接")}
          </button>
        )}
      </div>
      <ConnResult error={put.error} done={done} />
    </div>
  );
}

/** LLM (OpenAI): write-only API key + editable model name + output language. */
function OpenAiCard({ conns }: { conns: ProviderConnections }) {
  const t = useT();
  const [key, setKey] = useState("");
  // Seeded from the server's current model; the card mounts only once the GET
  // has data, so the initial value is the real configured model.
  const [model, setModel] = useState(conns.llm.model);
  const [outputLanguage, setOutputLanguage] = useState<"en" | "zh">(
    conns.llm.output_language,
  );
  const [done, setDone] = useState<ConnectDone | null>(null);
  const put = useConnectionPut((res) => {
    setKey("");
    setDone({
      text: res.llm.configured
        ? t("Connected.", "已连接。")
        : t("Disconnected.", "已断开。"),
    });
  });
  const stored = conns.secrets_set.llm_api_key;

  const connect = () => {
    setDone(null);
    const update: ProviderConnectionsUpdate = { llm_provider: "openai" };
    if (key.trim() !== "") update.llm_api_key = key.trim();
    if (model.trim() !== "") update.llm_model = model.trim();
    if (outputLanguage !== conns.llm.output_language) {
      update.llm_output_language = outputLanguage;
    }
    put.mutate(update);
  };

  return (
    <div className="conn-card">
      <div className="conn-head">
        <span className="conn-name">LLM (OpenAI)</span>
        <ConnBadge configured={conns.llm.configured} />
      </div>
      {conns.llm.reason != null && conns.llm.reason.trim() !== "" && (
        <p className="conn-reason">{conns.llm.reason}</p>
      )}
      <div className="conn-field">
        <label htmlFor="llm-api-key">
          {t("API key", "API 密钥")}
          <StoredMark stored={stored} />
        </label>
        <input
          id="llm-api-key"
          type="password"
          placeholder="LLM_API_KEY"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
        />
        <p className="conn-help">
          {t(
            "Write-only — once saved the key is never displayed again.",
            "只写不读 — 保存后密钥不会再显示。",
          )}
          {stored &&
            t(
              " A key is stored; leave blank to keep it, or enter a new one to replace it.",
              " 已保存一个密钥；留空则保留原密钥，输入新密钥则替换。",
            )}
        </p>
      </div>
      <div className="conn-field">
        <label htmlFor="llm-model">{t("Model", "模型")}</label>
        <input
          id="llm-model"
          type="text"
          placeholder={t("model name", "模型名称")}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          autoComplete="off"
          // Model names are case-sensitive lowercase identifiers — override
          // the global ticker-style uppercase transform on text inputs.
          style={{ textTransform: "none", width: "100%", fontSize: 13, padding: "6px 10px" }}
        />
      </div>
      <div className="conn-field">
        <label htmlFor="llm-output-language">
          {t("Analysis language", "分析输出语言")}
        </label>
        <select
          id="llm-output-language"
          value={outputLanguage}
          onChange={(e) => setOutputLanguage(e.target.value as "en" | "zh")}
          style={{ width: "100%", fontSize: 13, padding: "6px 10px" }}
        >
          <option value="en">English</option>
          <option value="zh">简体中文</option>
        </select>
        <p className="conn-help">
          {t(
            "Follows the sidebar language switch automatically (switching the UI language retargets this too); setting it here overrides until the next switch. Applies to NEWLY generated analysis (recommendation summaries, catalyst narrative, evidence snippets). Existing stored analyses keep the language they were generated in — records are never rewritten. Machine fields (catalyst type, reason codes) stay English.",
            "自动跟随侧边栏的界面语言切换 (切换界面语言时同步更新此项);在此手动设置可覆盖,直到下次切换语言。只作用于之后新生成的分析 (推荐摘要、催化剂叙述、证据摘录)。已存储的历史分析保持生成时的语言 — 记录永不改写。机器字段 (催化剂类型、原因代码) 保持英文。",
          )}
        </p>
      </div>
      <div className="conn-actions">
        <button className="primary" onClick={connect} disabled={put.isPending}>
          {put.isPending ? t("Saving…", "保存中…") : t("Connect", "连接")}
        </button>
        {conns.llm.configured && (
          <button
            className="danger"
            disabled={put.isPending}
            onClick={() => {
              setDone(null);
              put.mutate({ llm_provider: "" });
            }}
          >
            {t("Disconnect", "断开连接")}
          </button>
        )}
      </div>
      <ConnResult error={put.error} done={done} />
    </div>
  );
}

/**
 * Web Search (Brave): write-only API key, exactly like the other secrets.
 *
 * The key is sent here and returned by NOTHING — the server reports only a
 * presence boolean, so it never reaches the browser after being stored.
 */
function WebSearchCard({ conns }: { conns: ProviderConnections }) {
  const t = useT();
  const conn = conns.web_search;
  const [key, setKey] = useState("");
  const [done, setDone] = useState<ConnectDone | null>(null);
  const put = useConnectionPut((res) => {
    setKey("");
    setDone({
      text: res.web_search?.configured
        ? t("Connected.", "已连接。")
        : t("Disconnected.", "已断开。"),
    });
  });

  const submit = () => {
    const update: ProviderConnectionsUpdate = {
      web_search_provider: key.trim() === "" ? "" : "brave",
    };
    if (key.trim() !== "") update.brave_api_key = key.trim();
    put.mutate(update);
  };

  return (
    <div className="conn-card" data-testid="conn-web-search">
      <div className="conn-head">
        <span className="conn-name">{t("Web Search (Brave)", "网页搜索 (Brave)")}</span>
        <ConnBadge configured={Boolean(conn?.configured)} />
      </div>
      {conn?.reason != null && conn.reason.trim() !== "" && (
        <p className="conn-reason">{conn.reason}</p>
      )}
      <div className="conn-field">
        <label htmlFor="brave-api-key">
          {t("API key", "API 密钥")}
          <StoredMark stored={Boolean(conns.secrets_set?.brave_api_key)} />
        </label>
        <input
          id="brave-api-key"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t("paste key to connect", "粘贴密钥以连接")}
        />
        <p className="conn-help">
          {t(
            "Powers bounded external research on catalyst pages. Search is metered: it runs only when you press Refresh sources, never on page load or refresh.",
            "为事件页面的有限外部研究提供支持。搜索按量计费：仅在你点击「刷新来源」时执行，页面加载或刷新时都不会触发。",
          )}
        </p>
      </div>
      <div className="conn-actions">
        <button type="button" className="btn" onClick={submit} disabled={put.isPending}>
          {t("Save", "保存")}
        </button>
      </div>
      <ConnResult error={put.error} done={done} />
    </div>
  );
}

/**
 * Prediction Markets (Polymarket): an ENABLE TOGGLE, not a credential form.
 *
 * There is no key field here and there never will be one: the subsystem uses
 * public read-only endpoints, and the platform asks for no wallet, no signing
 * key and no trading credential. It is still opt-in because it is an
 * outbound network dependency the operator should choose deliberately.
 */
function PredictionMarketsCard({ conns }: { conns: ProviderConnections }) {
  const t = useT();
  const conn = conns.prediction_markets;
  const [done, setDone] = useState<ConnectDone | null>(null);
  const put = useConnectionPut((res) => {
    setDone({
      text: res.prediction_markets?.configured
        ? t("Enabled.", "已启用。")
        : t("Disabled.", "已停用。"),
    });
  });

  const enabled = Boolean(conn?.configured);
  return (
    <div className="conn-card" data-testid="conn-prediction-markets">
      <div className="conn-head">
        <span className="conn-name">
          {t("Prediction Markets (Polymarket)", "预测市场 (Polymarket)")}
        </span>
        <ConnBadge configured={enabled} />
      </div>
      {conn?.reason != null && conn.reason.trim() !== "" && (
        <p className="conn-reason">{conn.reason}</p>
      )}
      <p className="conn-help" data-testid="pm-readonly-note">
        {t(
          "Public read-only · No trading credentials required. The platform reads public pricing only — it never places an order and holds no wallet.",
          "公开只读 · 无需交易凭证。平台仅读取公开定价——绝不下单，也不持有任何钱包。",
        )}
      </p>
      <div className="conn-actions">
        <button
          type="button"
          className="btn"
          disabled={put.isPending}
          onClick={() =>
            put.mutate({ prediction_markets_provider: enabled ? "" : "polymarket" })
          }
        >
          {enabled ? t("Disable", "停用") : t("Enable", "启用")}
        </button>
      </div>
      <ConnResult error={put.error} done={done} />
    </div>
  );
}

/** Broker (Alpaca Paper): write-only key ID + secret key; paper-only by construction. */
function AlpacaCard({ conns }: { conns: ProviderConnections }) {
  const t = useT();
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [done, setDone] = useState<ConnectDone | null>(null);
  const put = useConnectionPut((res) => {
    setKeyId("");
    setSecret("");
    setDone({
      text: res.broker.configured
        ? t("Connected.", "已连接。")
        : t("Disconnected.", "已断开。"),
      cashAdopted: res.cash_adopted,
    });
  });
  const idStored = conns.secrets_set.alpaca_api_key_id;
  const secretStored = conns.secrets_set.alpaca_api_secret_key;

  const connect = () => {
    setDone(null);
    const update: ProviderConnectionsUpdate = { broker_provider: "alpaca_paper" };
    if (keyId.trim() !== "") update.alpaca_api_key_id = keyId.trim();
    if (secret.trim() !== "") update.alpaca_api_secret_key = secret.trim();
    put.mutate(update);
  };

  return (
    <div className="conn-card">
      <div className="conn-head">
        <span className="conn-name">{t("Broker (Alpaca Paper)", "券商 (Alpaca Paper)")}</span>
        <ConnBadge configured={conns.broker.configured} />
      </div>
      {conns.broker.reason != null && conns.broker.reason.trim() !== "" && (
        <p className="conn-reason">{conns.broker.reason}</p>
      )}
      <div className="conn-field">
        <label htmlFor="alpaca-key-id">
          {t("Key ID", "密钥 ID")}
          <StoredMark stored={idStored} />
        </label>
        <input
          id="alpaca-key-id"
          type="password"
          placeholder="ALPACA_API_KEY_ID"
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="conn-field">
        <label htmlFor="alpaca-secret-key">
          {t("Secret Key", "私密密钥")}
          <StoredMark stored={secretStored} />
        </label>
        <input
          id="alpaca-secret-key"
          type="password"
          placeholder="ALPACA_API_SECRET_KEY"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="off"
        />
        <p className="conn-help">
          {t(
            "Write-only — once saved the credentials are never displayed again.",
            "只写不读 — 保存后凭证不会再显示。",
          )}
          {(idStored || secretStored) &&
            t(
              " Stored credentials are kept unless replaced; leave a field blank to keep it.",
              " 已保存的凭证除非被替换否则保持不变；留空即保留原值。",
            )}
        </p>
      </div>
      <p className="conn-note">
        {t(
          "Paper trading only — the live API is unreachable by construction.",
          "仅限模拟交易 — 实盘 API 在架构上不可触达。",
        )}
      </p>
      <div className="conn-actions">
        <button className="primary" onClick={connect} disabled={put.isPending}>
          {put.isPending ? t("Saving…", "保存中…") : t("Connect", "连接")}
        </button>
        {conns.broker.configured && (
          <button
            className="danger"
            disabled={put.isPending}
            onClick={() => {
              setDone(null);
              put.mutate({ broker_provider: "" });
            }}
          >
            {t("Disconnect", "断开连接")}
          </button>
        )}
      </div>
      <ConnResult error={put.error} done={done} />
    </div>
  );
}

/**
 * Connections panel — the UI-managed runtime provider layer (§15 provider
 * identity, §16 nothing assumed from configuration: the server's `configured`
 * verdict and `reason` are rendered, never inferred client-side). Sits above
 * the read-only config view because it is the one editable surface here.
 */
function ConnectionsPanel() {
  const t = useT();
  const conns = useQuery({
    queryKey: ["provider-connections"],
    queryFn: api.config.providers.get,
  });

  return (
    <div className="panel">
      <PanelTitle title={t("Connections", "服务连接")} section="§15 · §16" />
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
        {t(
          "Providers are configured here at runtime — no .env editing. Secrets are write-only: the server stores them and reports only that one is stored, never the value. Connecting or disconnecting a source refreshes every page in the app.",
          "服务商在此处运行时配置 — 无需编辑 .env。密钥只写不读：服务器保存后仅报告“已保存”状态，绝不返回密钥本身。连接或断开任一数据源都会刷新应用内的所有页面。",
        )}
      </p>
      {conns.isPending ? (
        <p className="empty">{t("Loading connection state…", "正在加载连接状态…")}</p>
      ) : conns.isError ? (
        <p className="error" style={{ marginTop: 0 }}>
          {t("Connection state unavailable:", "连接状态不可用：")} {conns.error.message}
        </p>
      ) : (
        <div className="conn-cards">
          <MarketDataCard key={conns.data.market_data.provider} conns={conns.data} />
          <OpenAiCard conns={conns.data} />
          <AlpacaCard conns={conns.data} />
          <WebSearchCard conns={conns.data} />
          <PredictionMarketsCard conns={conns.data} />
        </div>
      )}
    </div>
  );
}

/**
 * Provider value. There is no default provider and no synthetic fallback: an
 * unconfigured provider is a RED "NOT CONFIGURED" state, not a soft warning,
 * because every surface depending on it will show nothing at all. When it IS
 * configured the actual provider name is the label.
 *
 * `configured` comes from the server's own boolean; the name is only used as a
 * fallback for backends that predate the flag.
 */
function ProviderValue({ value, configured }: { value: string; configured?: boolean }) {
  const t = useT();
  const isConfigured = configured ?? value.trim() !== "";
  return (
    <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
        {isConfigured ? value : <span style={{ color: "var(--text-dim)" }}>—</span>}
      </span>
      {!isConfigured && (
        <span className="badge red">{t("NOT CONFIGURED", "未配置")}</span>
      )}
    </span>
  );
}

/** Signal-parameter values are numbers or (lo, hi) tuples serialized as arrays. */
function fmtSignalValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(" – ");
  if (typeof v === "number") return String(v);
  return String(v);
}

/** Key-value dump of a (long) signal-parameter object, in declaration order. */
function SignalParamGrid({ params }: { params: Record<string, unknown> }) {
  return (
    <div className="kv" style={{ marginTop: 10 }}>
      {Object.entries(params).map(([k, v]) => (
        <div key={k}>
          <div className="k">{k}</div>
          <div className="v">{fmtSignalValue(v)}</div>
        </div>
      ))}
    </div>
  );
}

function AllowedBadge({ allowed }: { allowed: boolean }) {
  const t = useT();
  return (
    <span className={`badge ${allowed ? "green" : "red"}`}>
      {allowed ? t("ALLOWED", "允许") : t("BLOCKED", "禁止")}
    </span>
  );
}

/* -------------------------------------------------- account permissions (§5 / §24) */

/** "alpaca" → "Alpaca", "paper" → "Paper" — for the §24 "Broker: Alpaca Paper" line. */
function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * The full §2 permission matrix in §24 display order. The six forbidden flags
 * are always false when present; rows render only for fields the server
 * actually sent (older backends sent just the first four).
 */
const PERMISSION_ROWS: {
  key: keyof AccountPermissions;
  label: { en: string; zh: string };
  meaning: { en: string; zh: string };
}[] = [
  {
    key: "long_stock",
    label: { en: "Long stock", zh: "股票多头" },
    meaning: { en: "Buy and hold shares.", zh: "买入并持有股票。" },
  },
  {
    key: "long_call",
    label: { en: "Long calls", zh: "买入看涨期权" },
    meaning: { en: "Buy call options (bull side).", zh: "买入看涨期权（看多方向）。" },
  },
  {
    key: "long_put",
    label: { en: "Long puts", zh: "买入看跌期权" },
    meaning: { en: "Buy put options (bear side).", zh: "买入看跌期权（看空方向）。" },
  },
  {
    key: "short_stock",
    label: { en: "Short stock", zh: "股票空头" },
    meaning: {
      en: "FULLY OPERABLE (Phase 3 complete) — requires Margin ON too. The §8 matrix emits SHORT_STOCK only in the two bear cells where premium is unbuyable (STRONG/EXTREME, MODERATE/HIGH without spreads); puts stay the preferred bear expression. Gap-inflated stop sizing (2× the 2×ATR stop), mirrored exits (stop ABOVE entry), SELL_TO_OPEN/BUY_TO_CLOSE at the broker, §16 delta −1, §18 negative-quantity claim, bear-mirror backtest included.",
      zh: "完全可用（Phase 3 完成）— 需同时开启保证金。§8 矩阵仅在权利金贵到不可买的两个看空死角格（强势/极端 IV、中等/高 IV 且无价差）给出 SHORT_STOCK；put 仍是首选的看空表达。跳空加倍的止损风控（2× 的 2×ATR 止损）、镜像离场（止损位于开仓价上方）、券商侧 SELL_TO_OPEN/BUY_TO_CLOSE、§16 delta −1、§18 负数量认领，含空头镜像回测。",
    },
  },
  {
    key: "naked_short_call",
    label: { en: "Naked calls", zh: "裸卖看涨期权" },
    meaning: {
      en: "PERMANENTLY LOCKED — double refusal: Alpaca does not offer naked short options at ANY approval level (broker refusal, probed), and the risk is unbounded (§4 charter). Short calls exist only COVERED (see Covered calls).",
      zh: "永久锁定 — 双重拒绝：Alpaca 任何期权等级都不提供裸卖期权（券商侧拒绝，已实测），且风险无上限（§4 章程）。卖出 call 只能以备兑形式存在（见备兑看涨期权）。",
    },
  },
  {
    key: "naked_short_put",
    label: { en: "Naked puts", zh: "裸卖看跌期权" },
    meaning: {
      en: "PERMANENTLY LOCKED — Alpaca offers short puts only CASH-SECURED (broker refusal for naked), matching the §4 charter. See Cash-secured puts.",
      zh: "永久锁定 — Alpaca 只允许现金担保形式的卖出 put（裸卖被券商侧拒绝），与 §4 章程一致。见现金担保看跌期权。",
    },
  },
  {
    key: "defined_risk_spreads",
    label: { en: "Defined spreads", zh: "限定风险价差" },
    meaning: {
      en: "FULLY OPERABLE (roadmap Phase 1 complete): §8 matrix spread cells, §9-S two-leg selection, net-debit risk sizing, ATOMIC multi-leg execution (paper), leg-paired positions/exits, §18 reconciliation, backtests. Off = the matrix degrades spread cells to the single-leg instrument, explained in every plan.",
      zh: "完全可用（路线图 Phase 1 完成）：§8 矩阵价差格、§9-S 双腿选择、净权利金风控、原子多腿执行（paper）、腿配对持仓/离场、§18 对账、回测。关闭时矩阵将价差格降级为单腿工具，每个计划中都有明示。",
    },
  },
  {
    key: "covered_call",
    label: { en: "Covered calls", zh: "备兑看涨期权" },
    meaning: {
      en: "FULLY OPERABLE (Phase 2 complete): sell a call against 100 held shares/contract via POST /api/income/covered-call — shares are PINNED (unsellable) until buyback; §-selection 30-45 DTE / |Δ| 0.15-0.35 OTM; managed at 50% profit capture / 2x loss stop / 21 DTE; §16 negative greeks, §18 short-leg claim, buy-write backtest included.",
      zh: "完全可用（Phase 2 完成）：对持有的每 100 股卖出一张 call（/api/income/covered-call）— 抵押股份被钉住（不可卖出）直至买回；§ 选择 30-45 DTE / |Δ| 0.15-0.35 虚值；按 50% 利润截获 / 2× 止损 / 21 DTE 管理；含 §16 负希腊值、§18 短腿认领与买写回测。",
    },
  },
  {
    key: "cash_secured_put",
    label: { en: "Cash-secured puts", zh: "现金担保看跌期权" },
    meaning: {
      en: "FULLY OPERABLE (Phase 2 complete): sell a put backed by LOCKED cash (strike × 100/contract, excluded from deployable cash) via POST /api/income/cash-secured-put; same mechanical management; CSP backtest included (cash-settled assignment approximation, documented).",
      zh: "完全可用（Phase 2 完成）：卖出由锁定现金担保的 put（每张锁定 行权价 × 100，从可部署资金中扣除，/api/income/cash-secured-put）；同一套机械管理；含 CSP 回测（现金结算指派近似，已文档明示）。",
    },
  },
  {
    key: "margin",
    label: { en: "Margin", zh: "保证金" },
    meaning: {
      en: "OPERABLE for SHORTING ONLY (Phase 3 complete): margin here exists to back short stock — the broker enforces buying power and maintenance on its side. Levered LONG sizing stays off by charter (§12 sizes from cash, never buying power).",
      zh: "仅用于支撑做空（Phase 3 完成）：此处的保证金用于支持股票做空 — 购买力与维持保证金由券商侧执行。杠杆做多刻意不启用（§12 始终按现金而非购买力确定仓位）。",
    },
  },
];

/**
 * §24 Account Permissions panel. The header line ("Broker: Alpaca Paper") and
 * the CASH-CONSTRAINED SIMULATION badge come from the broker's OWN status
 * endpoint — the badge appears only when the broker itself reports paper mode.
 * The table below is the platform permission matrix: what Alpaca Paper
 * technically permits never overrides it (§2, §23).
 */
// The three REAL flags (§5) the user may toggle; everything else in the
// matrix is §33 display-and-refuse (no code path exists) and stays locked.
const EDITABLE_PERMISSIONS = new Set<keyof AccountPermissions>([
  "long_stock",
  "long_call",
  "long_put",
  // Roadmap Phase 1 partial scope: gates spread RESEARCH + BACKTEST now;
  // live spread execution keeps its own §10 veto until mleg lands (the row
  // meaning text states this).
  "defined_risk_spreads",
  // Phase 2 unlock (2026-08-17): the collateralized short-premium chain is
  // complete end to end — real toggles now.
  "covered_call",
  "cash_secured_put",
  // Phase 3 unlock (2026-08-17): margin-backed short stock — the §8 dead-end
  // bear cells, mirrored exits, broker short/cover, §18. Both must be ON for
  // SHORT_STOCK to trade; only the naked shorts stay locked, forever.
  "short_stock",
  "margin",
]);

function AccountPermissionsPanel({ cfg }: { cfg: PlatformConfig }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  // Never 503s — "no broker" is a real, reportable state, not a failure.
  const broker = useQuery({ queryKey: ["broker-status"], queryFn: api.broker.status });
  const status = broker.data;
  // Toggle one REAL permission via the runtime-config layer ("true"/"false"
  // strict). The change applies at once to plan generation, the §10 live
  // gate chain and the backtest gate — all read the same Settings factory.
  const setPerm = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) =>
      api.config.providers.put({ [`allow_${key}`]: value ? "true" : "false" }),
    onSuccess: () => {
      toast(
        "SUCCESS",
        t(
          "Permission updated — applies to plans, live gating and backtests",
          "权限已更新 — 即刻作用于计划生成、实盘闸门与回测",
        ),
      );
      qc.invalidateQueries({ queryKey: ["platform-config"] });
    },
  });

  // Null-safe against the old 4-field payload: only fields the server sent
  // become rows. The six forbidden flags arrive as literal `false`, never
  // derived client-side.
  const rows = PERMISSION_ROWS.filter((r) => cfg.account_permissions[r.key] !== undefined);
  // Old-shape fallback: short_stock had NO flag before the 10-field payload —
  // keep the guaranteed BLOCKED row so the §24 display never loses it.
  const hasShortStockFlag = cfg.account_permissions.short_stock !== undefined;

  return (
    <div className="panel">
      <PanelTitle title={t("Account Permissions", "账户权限")} section="§5 · §24" />

      {/* §24 header — broker identity + account mode, from broker status. */}
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
          {t("Broker:", "券商：")}{" "}
          {status == null ? (
            <span style={{ color: "var(--text-dim)" }}>
              {broker.isError ? t("status unavailable", "状态不可用") : "…"}
            </span>
          ) : status.configured ? (
            <strong>
              {cap(status.provider || t("broker", "券商"))}
              {status.mode != null && <> {cap(status.mode)}</>}
            </strong>
          ) : (
            <span style={{ color: "var(--text-dim)" }}>—</span>
          )}
        </span>
        {/* Unconfigured broker keeps the existing red not-configured treatment. */}
        {status != null && !status.configured && (
          <span className="badge red">{t("NOT CONFIGURED", "未配置")}</span>
        )}
        {status?.mode === "paper" && (
          <span className="badge accent" style={{ fontSize: 12 }}>
            {t(
              "Account Mode: CASH-CONSTRAINED SIMULATION",
              "账户模式：现金约束模拟",
            )}
          </span>
        )}
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Capability", "能力")}</th>
              <th>{t("Status", "状态")}</th>
              <th>{t("Action", "操作")}</th>
              <th>{t("Meaning", "含义")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const allowed = cfg.account_permissions[r.key] === true;
              const editable = EDITABLE_PERMISSIONS.has(r.key);
              return (
                <tr key={r.key}>
                  <td style={{ whiteSpace: "nowrap" }}>{t(r.label.en, r.label.zh)}</td>
                  <td>
                    <AllowedBadge allowed={allowed} />
                  </td>
                  <td>
                    {editable ? (
                      <button
                        className={allowed ? "danger" : "primary"}
                        style={{ fontSize: 11, padding: "3px 10px" }}
                        disabled={setPerm.isPending}
                        onClick={() => setPerm.mutate({ key: r.key, value: !allowed })}
                      >
                        {allowed ? t("Disable", "关闭") : t("Enable", "开启")}
                      </button>
                    ) : (
                      <span
                        style={{ fontSize: 11, color: "var(--text-dim)" }}
                        title={t(
                          "No code path exists for this capability (§33) — it cannot be enabled from anywhere.",
                          "平台没有该能力的任何代码路径 (§33) — 任何入口都无法开启。",
                        )}
                      >
                        {t("locked", "锁定")} 🔒
                      </span>
                    )}
                  </td>
                  <td style={{ fontFamily: "inherit", fontSize: 12, color: "var(--text-dim)" }}>
                    {t(r.meaning.en, r.meaning.zh)}
                  </td>
                </tr>
              );
            })}
            {!hasShortStockFlag && (
              <tr>
                <td style={{ whiteSpace: "nowrap" }}>{t("Short stock", "股票空头")}</td>
                <td>
                  <span className="badge red">{t("BLOCKED", "禁止")}</span>
                </td>
                <td />
                <td style={{ fontFamily: "inherit", fontSize: 12, color: "var(--text-dim)" }}>
                  {t(
                    "Short stock does not exist in this system — there is no flag for it (§5).",
                    "本系统不存在股票做空 — 因此没有对应的权限开关 (§5)。",
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* §24 note — verbatim from the guide, as a dim callout. */}
      <div
        style={{
          borderLeft: "3px solid var(--border)",
          paddingLeft: 10,
          marginTop: 12,
        }}
      >
        <p style={{ color: "var(--text-dim)", fontSize: 12, margin: 0 }}>
          {t(
            "Alpaca Paper may technically support additional strategies, but the platform intentionally mirrors the configured real-account restrictions.",
            "Alpaca Paper 在技术上或许支持更多策略，但平台刻意与已配置的真实账户限制保持一致。",
          )}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------- data-plan capabilities (§16) */

/**
 * Display metadata for the probe keys the backend reports today. Unknown keys
 * still render (label = the raw key) — the server's report is never filtered.
 */
const CAPABILITY_META: Record<
  string,
  { label: { en: string; zh: string }; meaning: { en: string; zh: string } }
> = {
  stock_history: {
    label: { en: "Stock history", zh: "股票历史数据" },
    meaning: {
      en: "Daily OHLCV bars — backfill, indicators, regime/signal engines, backtests.",
      zh: "日线 OHLCV K 线 — 用于回填、指标、市场状态/信号引擎与回测。",
    },
  },
  stock_realtime: {
    label: { en: "Stock realtime", zh: "股票实时行情" },
    meaning: {
      en: "Live snapshot quotes — market overview indices and current prices.",
      zh: "实时快照报价 — 用于市场总览指数与当前价格。",
    },
  },
  option_chain: {
    label: { en: "Option chain", zh: "期权链" },
    meaning: {
      en: "Options snapshots — chains, §7 vol regime, §9 contract selection.",
      zh: "期权快照 — 期权链、§7 波动率状态、§9 合约筛选。",
    },
  },
  option_contracts: {
    label: { en: "Option contracts", zh: "期权合约" },
    meaning: {
      en: "Contract reference data (expirations/strikes, open interest) — feeds the EOD options view and the chain's OI merge.",
      zh: "合约参考数据（到期日/行权价、未平仓量）— 供 EOD 期权视图及期权链的 OI 合并使用。",
    },
  },
  news: {
    label: { en: "News feed", zh: "新闻源" },
    meaning: {
      en: "Real news articles — LLM recommendation grounding (Phase 8). NOT IN PLAN disables Recommendations refresh.",
      zh: "真实新闻文章 — LLM 推荐的事实依据（Phase 8）。若不在套餐内则推荐刷新被禁用。",
    },
  },
};

/**
 * One capability verdict (§16): `true` = verified working, `false` = the
 * subscribed plan does not include it, a string = the probe itself failed —
 * a fault, NOT evidence of absence, so it gets the red treatment and the
 * server's own error text (truncated, full string in the tooltip).
 */
function CapabilityStatusCell({ value }: { value: CapabilityStatus }) {
  const t = useT();
  if (value === true)
    return <span className="badge green">{t("AVAILABLE", "可用")}</span>;
  if (value === false) {
    return (
      <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <span className="badge amber">{t("NOT IN PLAN", "不在套餐内")}</span>
        <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
          {t(
            "Not included in the market-data provider's current subscription",
            "行情数据服务商当前订阅套餐未包含此能力",
          )}
        </span>
      </span>
    );
  }
  return (
    <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      <span className="badge red">{t("PROBE FAILED", "探测失败")}</span>
      <span
        title={value}
        style={{
          color: "var(--red)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          maxWidth: "min(320px, 100%)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "inline-block",
          verticalAlign: "bottom",
        }}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * §16 Data Plan Capabilities panel: what the configured provider's plan
 * ACTUALLY includes, verified by probing the real API — never assumed from
 * configuration. A provider that cannot probe (the stub) yields
 * `capabilities: null` and the server's message is shown instead of rows;
 * no provider at all yields the standard not-configured state.
 */
function DataPlanCapabilitiesPanel() {
  const t = useT();
  const caps = useCapabilities();
  const qc = useQueryClient();
  // §16: bypasses the server's ~5-min probe cache — the button for "I just
  // upgraded the plan, ask the provider again right now".
  const reprobe = useMutation({
    mutationFn: () => api.market.capabilities(true),
    onSuccess: (data) => qc.setQueryData(["market-capabilities"], data),
  });

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <PanelTitle title={t("Data Plan Capabilities", "数据套餐能力")} section="§16" />
        <button
          className="btn"
          onClick={() => reprobe.mutate()}
          disabled={reprobe.isPending || caps.isPending}
          title={t(
            "Bypass the server's probe cache and re-verify against the provider API now (e.g. right after a plan upgrade)",
            "绕过服务器的探测缓存，立即对服务商 API 重新验证（例如刚升级套餐后）",
          )}
        >
          {reprobe.isPending ? t("Probing…", "探测中…") : t("Re-probe now", "立即重新探测")}
        </button>
      </div>
      {caps.isPending ? (
        <p className="empty">{t("Probing provider capabilities…", "正在探测服务商能力…")}</p>
      ) : caps.isError ? (
        isMarketDataNotConfigured(caps.error) ? (
          <NotConfigured message={notConfiguredMessage(caps.error)}>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
              {t(
                "Capabilities are probed against the real provider API — with no provider configured there is nothing to probe.",
                "能力状态通过探测真实的服务商 API 得出 — 未配置服务商时无从探测。",
              )}
            </p>
          </NotConfigured>
        ) : (
          <p className="error">
            {t("Capabilities unavailable:", "能力状态不可用：")} {caps.error.message}
          </p>
        )
      ) : (
        <>
          <p className="datasource" style={{ marginBottom: 12 }}>
            {t(
              `provider: ${caps.data.provider} · probed live against the provider API (cached ~5 min server-side) · as of ${new Date(caps.data.as_of).toLocaleString()}`,
              `服务商：${caps.data.provider} · 已对服务商 API 实时探测（服务器端缓存约 5 分钟）· 截至 ${new Date(caps.data.as_of).toLocaleString()}`,
            )}
          </p>
          {caps.data.capabilities == null ? (
            <p className="empty">
              {caps.data.message ??
                t(
                  "The provider reported no capabilities and gave no reason.",
                  "服务商未报告任何能力，也未给出原因。",
                )}
            </p>
          ) : (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Capability", "能力")}</th>
                      <th>{t("Status", "状态")}</th>
                      <th>{t("Meaning", "含义")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(caps.data.capabilities).map(([key, value]) => {
                      const meta = CAPABILITY_META[key];
                      return (
                        <tr key={key}>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {meta != null ? t(meta.label.en, meta.label.zh) : key}
                          </td>
                          <td>
                            <CapabilityStatusCell value={value} />
                          </td>
                          <td
                            style={{
                              fontFamily: "inherit",
                              fontSize: 12,
                              color: "var(--text-dim)",
                            }}
                          >
                            {meta != null ? t(meta.meaning.en, meta.meaning.zh) : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 12 }}>
                {t(
                  "Verified by probing the real provider API, never assumed from configuration (§16). A probe failure is a fault — availability unknown — not evidence the capability is absent.",
                  "通过探测真实的服务商 API 验证，绝不从配置臆断 (§16)。探测失败是一次故障 — 可用性未知 — 而非该能力不存在的证据。",
                )}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ConfigView({ cfg }: { cfg: PlatformConfig }) {
  const t = useT();
  const rl = cfg.risk_limits;
  const ex = cfg.exit_params;
  const sel = cfg.selector_params;
  const vt = cfg.vol_target_params;
  const bt = cfg.backtest_defaults;
  const pt = cfg.paper_trading;
  const killEnabled = cfg.kill_switch.trading_enabled === true;
  // The server's booleans are authoritative; fall back to a non-empty provider
  // name only for backends that predate the flags.
  const marketDataConfigured =
    cfg.providers.market_data_configured ?? cfg.providers.market_data.trim() !== "";
  const llmConfigured = cfg.providers.llm_configured ?? cfg.providers.llm.trim() !== "";
  const broker = cfg.providers.broker ?? "";
  const brokerConfigured = cfg.providers.broker_configured ?? broker.trim() !== "";

  return (
    <>
      {/* -------------------------------------------------- environment & providers */}
      <div className="panel">
        <PanelTitle title={t("Environment & Providers", "运行环境与服务商")} section="§22" />
        <div className="kv">
          <div>
            <div className="k">{t("Environment", "运行环境")}</div>
            <div className="v" style={{ marginTop: 2 }}>
              <span className="badge accent">{cfg.environment.toUpperCase()}</span>
            </div>
          </div>
          <div>
            <div className="k">{t("Market data provider", "行情数据服务商")}</div>
            <div className="v" style={{ marginTop: 2 }}>
              <ProviderValue
                value={cfg.providers.market_data}
                configured={cfg.providers.market_data_configured}
              />
            </div>
          </div>
          <div>
            <div className="k">{t("LLM provider", "LLM 服务商")}</div>
            <div className="v" style={{ marginTop: 2 }}>
              <ProviderValue
                value={cfg.providers.llm}
                configured={cfg.providers.llm_configured}
              />
            </div>
          </div>
          <div>
            <div className="k">{t("LLM model", "LLM 模型")}</div>
            <div className="v" style={{ marginTop: 2 }}>
              {cfg.providers.llm_model || <span style={{ color: "var(--text-dim)" }}>—</span>}
            </div>
          </div>
          <div>
            <div className="k">{t("Broker", "券商")}</div>
            <div className="v" style={{ marginTop: 2 }}>
              {/* Same red NOT CONFIGURED treatment as the data providers — an
                  unconfigured broker means no order can be placed at all, not a
                  fallback to the internal simulator. */}
              <ProviderValue value={broker} configured={cfg.providers.broker_configured} />
            </div>
          </div>
          <div>
            <div className="k">{t("Broker mode", "券商模式")}</div>
            <div className="v" style={{ marginTop: 2 }}>
              {/* Paper-only by construction: the adapter hard-refuses any
                  non-paper base URL, so there is no live mode to display. */}
              {brokerConfigured ? (
                <span className="badge green">{t("PAPER", "模拟盘")}</span>
              ) : (
                <span style={{ color: "var(--text-dim)" }}>—</span>
              )}
            </div>
          </div>
        </div>
        {!marketDataConfigured && (
          <NotConfigured>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
              {t(
                "Every market-data surface — indices, prices, indicators, option chains, trade plans, backtests and exit sweeps — returns nothing until MARKET_DATA_PROVIDER and its credentials are set.",
                "在设置 MARKET_DATA_PROVIDER 及其凭证之前，所有行情数据界面 — 指数、价格、指标、期权链、交易计划、回测与离场扫描 — 均不返回任何数据。",
              )}
            </p>
          </NotConfigured>
        )}
        {!llmConfigured && (
          <NotConfigured variant="llm">
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
              {t(
                "Recommendation generation is unavailable until LLM_PROVIDER and its credentials are set. Existing recommendation rows still list.",
                "在设置 LLM_PROVIDER 及其凭证之前，推荐生成不可用。已有的推荐记录仍会列出。",
              )}
            </p>
          </NotConfigured>
        )}
        {!brokerConfigured && (
          <NotConfigured variant="broker">
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
              {t(
                "Approve and Close are disabled until the broker and its paper-trading credentials are set. Existing positions still list; the internal simulator does not stand in for a broker.",
                "在设置券商及其模拟交易凭证之前，批准与平仓功能被禁用。已有持仓仍会列出；内部模拟器不会代替券商。",
              )}
            </p>
          </NotConfigured>
        )}
        {brokerConfigured && (
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 10 }}>
            {t(
              "Execution is paper-only: the adapter refuses any non-paper base URL, so live trading cannot be reached by configuration alone.",
              "执行仅限模拟盘：适配器拒绝任何非模拟盘 base URL，因此仅靠配置无法触达实盘交易。",
            )}
          </p>
        )}
      </div>

      {/* -------------------------------------------------- kill switch */}
      <div className="panel">
        <PanelTitle title={t("Kill Switch", "紧急停止开关")} section="§18" />
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span className={`badge ${killEnabled ? "green" : "red"}`}>
            {killEnabled ? t("TRADING ENABLED", "交易已启用") : t("TRADING PAUSED", "交易已暂停")}
          </span>
          {!killEnabled && (
            <span style={{ fontSize: 13 }}>
              {cfg.kill_switch.reason || t("no reason given", "未给出原因")}
            </span>
          )}
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 8 }}>
          {t(
            "The global kill switch overrides every per-symbol enablement.",
            "全局紧急停止开关优先于所有单个标的的启用状态。",
          )}{" "}
          <Link href="/" style={{ color: "var(--accent)" }}>
            {t(
              "Pause / resume controls live on the Dashboard →",
              "暂停 / 恢复控制位于仪表盘 →",
            )}
          </Link>
        </p>
      </div>

      {/* -------------------------------------------------- account permissions */}
      <AccountPermissionsPanel cfg={cfg} />

      {/* -------------------------------------------------- data-plan capabilities */}
      <DataPlanCapabilitiesPanel />

      {/* -------------------------------------------------- risk limits */}
      <div className="panel">
        <PanelTitle title={t("Risk Limits", "风险限额")} section="§12" />
        <ParamTable
          rows={[
            ["budget_weak", fmtPct(rl.budget_weak, 2), t("Per-trade risk budget at WEAK signal strength, fraction of NAV (§12.2).", "信号强度为 WEAK 时的单笔风险预算，占 NAV 比例 (§12.2)。")],
            ["budget_moderate", fmtPct(rl.budget_moderate, 2), t("Per-trade risk budget at MODERATE strength (§12.2).", "强度为 MODERATE 时的单笔风险预算 (§12.2)。")],
            ["budget_strong", fmtPct(rl.budget_strong, 2), t("Per-trade risk budget at STRONG strength (§12.2).", "强度为 STRONG 时的单笔风险预算 (§12.2)。")],
            ["budget_very_strong", fmtPct(rl.budget_very_strong, 2), t("Per-trade risk budget at VERY_STRONG strength (§12.2).", "强度为 VERY_STRONG 时的单笔风险预算 (§12.2)。")],
            ["abs_max_trade_risk", fmtPct(rl.abs_max_trade_risk, 2), t("Absolute per-trade ceiling no tier or confidence may override (§12.2).", "任何强度档位或置信度都不可突破的单笔绝对上限 (§12.2)。")],
            ["single_name_risk", fmtPct(rl.single_name_risk, 2), t("Max open risk per underlying (§12.3).", "单一标的的最大未平仓风险 (§12.3)。")],
            ["single_name_capital", fmtPct(rl.single_name_capital, 0), t("Max capital deployed per underlying (§12.3).", "单一标的的最大资金投入 (§12.3)。")],
            ["bucket_risk", fmtPct(rl.bucket_risk, 1), t("Combined risk cap for one correlation bucket (§12.4).", "单个相关性分组的合计风险上限 (§12.4)。")],
            ["heat_elevated", fmtPct(rl.heat_elevated, 1), t("Portfolio heat boundary: ELEVATED state begins (§12.5).", "组合热度边界：进入 ELEVATED 状态 (§12.5)。")],
            ["heat_high", fmtPct(rl.heat_high, 1), t("Portfolio heat boundary: HIGH state begins (§12.5).", "组合热度边界：进入 HIGH 状态 (§12.5)。")],
            ["heat_reject", fmtPct(rl.heat_reject, 1), t("At or above this heat, NO new risk is accepted (§12.5).", "热度达到或超过此值时，不再接受任何新增风险 (§12.5)。")],
            ["strength_weak", rl.strength_weak.toFixed(0), t("|edge| at or above this maps to the WEAK tier; below it there is no valid signal (§12.2).", "|edge| 达到或超过此值映射为 WEAK 档；低于此值则不构成有效信号 (§12.2)。")],
            ["strength_moderate", rl.strength_moderate.toFixed(0), t("|edge| threshold for the MODERATE tier (§12.2).", "MODERATE 档的 |edge| 阈值 (§12.2)。")],
            ["strength_strong", rl.strength_strong.toFixed(0), t("|edge| threshold for the STRONG tier (§12.2).", "STRONG 档的 |edge| 阈值 (§12.2)。")],
            ["strength_very_strong", rl.strength_very_strong.toFixed(0), t("|edge| threshold for the VERY_STRONG tier (§12.2).", "VERY_STRONG 档的 |edge| 阈值 (§12.2)。")],
            ["max_delta_notional_pct_nav", fmtPct(rl.max_delta_notional_pct_nav, 0), t("Max |delta-adjusted notional| as a share of NAV (§16).", "|delta 调整后名义敞口| 占 NAV 的最大比例 (§16)。")],
            ["max_net_theta_pct_nav", fmtPct(rl.max_net_theta_pct_nav, 2), t("Max |net theta| per day as a share of NAV (§16).", "每日 |净 theta| 占 NAV 的最大比例 (§16)。")],
            ["max_net_vega_pct_nav", fmtPct(rl.max_net_vega_pct_nav, 1), t("Max |net vega| per IV point as a share of NAV (§16).", "每 IV 点 |净 vega| 占 NAV 的最大比例 (§16)。")],
          ]}
        />

        <h3
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "var(--text-dim)",
            margin: "16px 0 6px",
          }}
        >
          {t("Cash floors by regime (§13)", "各市场状态的现金下限 (§13)")}
        </h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Regime", "市场状态")}</th>
                <th className="num">{t("Minimum cash (of NAV)", "最低现金 (占 NAV)")}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rl.cash_floors).map(([regime, floor]) => (
                <tr key={regime}>
                  <td style={{ whiteSpace: "nowrap" }}>{regime}</td>
                  <td className="num">{fmtPct(floor, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "var(--text-dim)",
            margin: "16px 0 6px",
          }}
        >
          {t("Static correlation buckets (§12.4)", "静态相关性分组 (§12.4)")}
        </h3>
        {Object.keys(rl.correlation_buckets).length > 0 ? (
          Object.entries(rl.correlation_buckets).map(([name, tickers]) => (
            <div key={name} className="bucket">
              <div className="bucket-head">
                <span className="name">{name}</span>
                <span className="figures">
                  {t(
                    `${tickers.length} tickers · shared cap ${fmtPct(rl.bucket_risk, 1)}`,
                    `${tickers.length} 只标的 · 共享上限 ${fmtPct(rl.bucket_risk, 1)}`,
                  )}
                </span>
              </div>
              <div className="bucket-members">{tickers.join(" · ")}</div>
            </div>
          ))
        ) : (
          <p className="empty">
            {t("No static correlation buckets configured.", "未配置静态相关性分组。")}
          </p>
        )}
      </div>

      {/* -------------------------------------------------- exit parameters */}
      <div className="panel">
        <PanelTitle title={t("Exit Parameters", "离场参数")} section="§11" />
        <ParamTable
          rows={[
            ["exit_edge_threshold", String(ex.exit_edge_threshold), t("SIGNAL_DECAY fires when the directional edge drops below this — deliberately easier than entry (§11.1).", "方向性 edge 跌破此值时触发 SIGNAL_DECAY — 刻意比进场条件更宽松 (§11.1)。")],
            ["atr_trail_k", String(ex.atr_trail_k), t("Trailing-stop distance in ATR multiples below the highest close since entry (§11.5).", "移动止损距离：入场以来最高收盘价下方的 ATR 倍数 (§11.5)。")],
            ["time_stop_bars", String(ex.time_stop_bars), t("Bars after which a going-nowhere position is abandoned (§11.6).", "持仓横盘无进展达到此 K 线数后放弃 (§11.6)。")],
            ["min_move_atr", String(ex.min_move_atr), t("Minimum favourable move, in ATR multiples, required to escape the time stop (§11.6).", "豁免时间止损所需的最小有利波动（ATR 倍数）(§11.6)。")],
            ["atr_period", String(ex.atr_period), t("ATR period used by the trailing exit and the time stop.", "移动止损与时间止损所用的 ATR 周期。")],
            ["premium_hard_stop_pct", fmtPct(ex.premium_hard_stop_pct, 0), t("Options only: loss of this fraction of the entry premium fires PREMIUM_HARD_STOP (§11.3).", "仅限期权：亏损达到入场权利金的此比例时触发 PREMIUM_HARD_STOP (§11.3)。")],
            ["dte_exit_threshold", `${ex.dte_exit_threshold} DTE`, t("Options only: at or below this DTE, DTE_EXIT fires rather than holding into the gamma/theta zone (§11.7).", "仅限期权：DTE 降至此值或以下时触发 DTE_EXIT，而非持有进入 gamma/theta 风险区 (§11.7)。")],
          ]}
        />
      </div>

      {/* -------------------------------------------------- contract selector */}
      <div className="panel">
        <PanelTitle title={t("Contract Selector", "合约筛选器")} section="§9" />
        <ParamTable
          rows={[
            ["dte_min", `${sel.dte_min} days`, t("Minimum days-to-expiry for a candidate contract (§9.1).", "候选合约的最短到期天数 (§9.1)。")],
            ["dte_max", `${sel.dte_max} days`, t("Maximum days-to-expiry for a candidate contract (§9.1).", "候选合约的最长到期天数 (§9.1)。")],
            ["abs_delta_min", sel.abs_delta_min.toFixed(2), t("Minimum |delta| — right-agnostic window (§9.1).", "最小 |delta| — 不区分认购/认沽的区间 (§9.1)。")],
            ["abs_delta_max", sel.abs_delta_max.toFixed(2), t("Maximum |delta| (§9.1).", "最大 |delta| (§9.1)。")],
            ["min_open_interest", String(sel.min_open_interest), t("Open-interest liquidity floor (§9.1).", "未平仓量流动性下限 (§9.1)。")],
            ["min_volume", String(sel.min_volume), t("Daily volume liquidity floor (§9.1).", "日成交量流动性下限 (§9.1)。")],
            ["max_spread_pct", fmtPct(sel.max_spread_pct, 0), t("Max relative bid-ask spread, (ask − bid) / mid (§9.1).", "最大相对买卖价差，(ask − bid) / mid (§9.1)。")],
            ["max_theta_premium_pct", fmtPct(sel.max_theta_premium_pct, 0), t("Max fraction of the premium that decays away per calendar day (§9.1).", "每个日历日权利金衰减的最大比例 (§9.1)。")],
            ["top_n", String(sel.top_n), t("How many eligible contracts get a rank (§9.2).", "参与排名的合格合约数量 (§9.2)。")],
            ["w_liquidity", String(sel.w_liquidity), t("Ranking weight: liquidity term (§9.2 v0 heuristic).", "排名权重：流动性项（§9.2 v0 启发式）。")],
            ["w_theta", String(sel.w_theta), t("Ranking weight: theta-burden term (§9.2).", "排名权重：theta 负担项 (§9.2)。")],
            ["w_delta_fit", String(sel.w_delta_fit), t("Ranking weight: delta-fit term (§9.2).", "排名权重：delta 匹配项 (§9.2)。")],
          ]}
        />
      </div>

      {/* -------------------------------------------------- vol targeting */}
      <div className="panel">
        <PanelTitle title={t("Vol Targeting", "波动率目标")} section="§14" />
        <ParamTable
          rows={[
            ["target_vol", fmtPct(vt.target_vol, 0), t("Annualized portfolio volatility target the forecast is matched against.", "预测所对标的年化组合波动率目标。")],
            ["max_multiplier", `${vt.max_multiplier}×`, t("Hard cap on UPWARD scaling in calm markets — low vol must not balloon sizes.", "平静市况下向上放大的硬性上限 — 低波动不得使仓位膨胀。")],
            ["min_multiplier", `${vt.min_multiplier}×`, t("Floor on downward scaling so a vol spike shrinks sizing sanely, not to zero.", "向下缩减的下限，使波动率骤升时仓位合理收缩而非归零。")],
          ]}
        />
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 8 }}>
          {t(
            "The multiplier scales NEW risk budgets only; hard risk caps always apply regardless (§14, §44 rule 20).",
            "该乘数只作用于新增风险预算；硬性风险上限在任何情况下都始终生效（§14，§44 规则 20）。",
          )}
        </p>
      </div>

      {/* -------------------------------------------------- signal parameters */}
      <div className="panel">
        <PanelTitle title={t("Signal Parameters", "信号参数")} section="§6" />
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 8 }}>
          {t(
            "Every value is a tunable backtest parameter — defaults are starting points for optimization, never truths (§6.2).",
            "每个数值都是可调的回测参数 — 默认值只是优化的起点，绝非真理 (§6.2)。",
          )}
        </p>
        <details className="skip-details">
          <summary>
            {t(
              `Regime engine (§6.1) — ${Object.keys(cfg.regime_params).length} parameters`,
              `市场状态引擎 (§6.1) — ${Object.keys(cfg.regime_params).length} 个参数`,
            )}
          </summary>
          <SignalParamGrid params={cfg.regime_params as unknown as Record<string, unknown>} />
        </details>
        <details className="skip-details" style={{ marginTop: 10 }}>
          <summary>
            {t(
              `Directional scorer (§6.2) — ${Object.keys(cfg.directional_params).length} parameters`,
              `方向评分器 (§6.2) — ${Object.keys(cfg.directional_params).length} 个参数`,
            )}
          </summary>
          <SignalParamGrid
            params={cfg.directional_params as unknown as Record<string, unknown>}
          />
        </details>
      </div>

      {/* -------------------------------------------------- backtest defaults */}
      <div className="panel">
        <PanelTitle title={t("Backtest Defaults", "回测默认值")} section="§20" />
        <ParamTable
          rows={[
            ["position_pct", fmtPct(bt.position_pct, 0), t("Fraction of current equity deployed per entry.", "每次进场投入的当前权益比例。")],
            ["commission_per_share", fmtUsd(bt.commission_per_share, 3), t("Commission charged per share on BOTH the buy and the sell fill (§44 rule 11).", "买入与卖出成交均按每股收取的佣金（§44 规则 11）。")],
            ["slippage_bps", `${bt.slippage_bps} bps`, t("Slippage applied against us on every fill (§44 rule 11).", "每笔成交都对我方不利方向计入的滑点（§44 规则 11）。")],
            ["entry_edge_threshold", String(bt.entry_edge_threshold), t("Minimum directional edge (with BULL bias, bull regime) to enter (§11.1).", "进场所需的最小方向性 edge（BULL 倾向、牛市状态下）(§11.1)。")],
            ["exit_edge_threshold", String(bt.exit_edge_threshold), t("SIGNAL_DECAY exit threshold — must be ≤ entry threshold (§11.1).", "SIGNAL_DECAY 离场阈值 — 必须 ≤ 进场阈值 (§11.1)。")],
            ["atr_trail_k", String(bt.atr_trail_k), t("ATR multiple of the trailing stop (§11.5).", "移动止损的 ATR 倍数 (§11.5)。")],
            ["time_stop_bars", String(bt.time_stop_bars), t("Bars before a stagnant position is abandoned (§11.6).", "停滞持仓被放弃前的 K 线数 (§11.6)。")],
            ["min_move_atr", String(bt.min_move_atr), t("Minimum move (ATR multiples) to escape the time stop (§11.6).", "豁免时间止损的最小波动（ATR 倍数）(§11.6)。")],
            ["warmup_bars", String(bt.warmup_bars), t("Bars withheld at the start so every indicator is fully formed (§20.3).", "起始阶段预留的 K 线数，确保所有指标完全成形 (§20.3)。")],
          ]}
        />
      </div>

      {/* -------------------------------------------------- paper trading */}
      <div className="panel">
        <PanelTitle title={t("Paper Trading", "模拟交易")} section="§43 · Phase 6" />
        <ParamTable
          rows={[
            ["initial_cash", fmtUsd(pt.initial_cash, 0), t("Starting cash of the paper portfolio.", "模拟组合的初始现金。")],
            ["slippage_bps", `${pt.slippage_bps} bps`, t("Fill model: BUY at close × (1 + bps/10000), SELL at close × (1 − bps/10000).", "成交模型：买入按收盘价 × (1 + bps/10000)，卖出按收盘价 × (1 − bps/10000)。")],
            ["commission_per_share", fmtUsd(pt.commission_per_share, 3), t("Stock commission per share, charged both ways.", "股票每股佣金，买卖双向收取。")],
            ["commission_per_contract", fmtUsd(pt.commission_per_contract, 2), t("Option commission per contract, charged both ways.", "期权每张合约佣金，买卖双向收取。")],
          ]}
        />
      </div>
    </>
  );
}

export default function SettingsPage() {
  const t = useT();
  const config = useQuery({ queryKey: ["platform-config"], queryFn: api.config.get });

  return (
    <>
      <h1>{t("Settings", "设置")}</h1>
      <p className="subtitle">
        {t(
          "The configuration every engine is actually running with — §44 rule 2 (“every rule must be configuration-driven”) made visible.",
          "所有引擎实际运行所用的配置 — §44 规则 2（“每条规则都必须由配置驱动”）的可视化呈现。",
        )}
      </p>
      <FlowNav stage="connect" />

      {/* Runtime provider connections — the one editable surface on this page. */}
      <ConnectionsPanel />

      <div className="preview-note">
        <strong>{t("Read-only", "只读")}</strong>{" "}
        {t(
          "view of the configuration the engines are actually using. Provider connections are managed above; editing the remaining parameters arrives in a later phase.",
          "视图 — 展示各引擎实际使用的配置。服务商连接在上方管理；其余参数的编辑将在后续阶段提供。",
        )}
      </div>

      {config.data ? (
        <ConfigView cfg={config.data} />
      ) : config.isError ? (
        <div className="panel">
          <p className="error" style={{ marginTop: 0 }}>
            {t("Configuration unavailable:", "配置不可用：")} {config.error.message}
          </p>
          <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
            {t(
              "GET /api/config failed — the backend may not be running.",
              "GET /api/config 请求失败 — 后端可能未运行。",
            )}
          </p>
        </div>
      ) : (
        <div className="panel">
          <p className="empty">{t("Loading configuration…", "正在加载配置…")}</p>
        </div>
      )}
    </>
  );
}
