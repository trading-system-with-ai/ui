"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { AuditActorType } from "@/lib/types";
import FlowNav from "@/components/shared/FlowNav";

const ACTOR_TYPES: AuditActorType[] = ["USER", "SYSTEM", "LLM"];

/** Rows rendered before "Show more" — hundreds of ingestion events otherwise
 *  bury the orders and vetoes this page exists to surface. */
const PAGE_SIZE = 50;

/** Compact one-line digest of an audit payload; the full JSON stays one
 *  click away. Raw `JSON.stringify` walls made the trail unscannable. */
function DetailsCell({ details }: { details: Record<string, unknown> }) {
  const t = useT();
  const keys = Object.keys(details);
  if (keys.length === 0) return null;
  const compact = (v: unknown): string => {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > 44 ? `${s.slice(0, 41)}…` : s;
  };
  const shown = keys.slice(0, 3);
  const rest = keys.length - shown.length;
  const digest =
    shown.map((k) => `${k}: ${compact(details[k])}`).join(" · ") +
    (rest > 0 ? t(` +${rest} more`, ` +${rest} 项`) : "");
  // Nothing hidden behind the digest → no expander to disappoint a click.
  if (rest === 0 && shown.every((k) => compact(details[k]) === (typeof details[k] === "string" ? details[k] : JSON.stringify(details[k])))) {
    return <span>{digest}</span>;
  }
  return (
    <details className="audit-details">
      <summary>{digest}</summary>
      <pre>{JSON.stringify(details, null, 2)}</pre>
    </details>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        padding: "3px 8px",
        borderRadius: 4,
        background: active ? "rgba(68, 147, 248, 0.15)" : "var(--bg)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        color: active ? "var(--accent)" : "var(--text-dim)",
        fontWeight: active ? 700 : 400,
      }}
    >
      {label}
    </button>
  );
}

const chipRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
  marginTop: 10,
};

const chipRowLabelStyle: React.CSSProperties = {
  color: "var(--text-dim)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  minWidth: 44,
};

export default function ActivityPage() {
  const t = useT();
  const [filter, setFilter] = useState("");
  const [actorType, setActorType] = useState<AuditActorType | "">("");
  const [action, setAction] = useState("");

  // Deep-link seam: other pages link here as /oversight?tab=activity&q=TICKER ("show me
  // this symbol's audit trail"). Read once on mount — plain
  // window.location keeps this free of the useSearchParams Suspense
  // requirement, and SSR renders the unfiltered view.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) setFilter(q.toUpperCase().slice(0, 10));
    } catch {
      /* unfiltered view stands */
    }
  }, []);

  const actions = useQuery({
    queryKey: ["audit-actions"],
    queryFn: () => api.audit.actions(),
  });
  const audit = useQuery({
    queryKey: ["audit", filter, action, actorType],
    queryFn: () =>
      api.audit.list(filter || undefined, action || undefined, actorType || undefined),
  });

  const activeFilterCount = [filter, actorType, action].filter(Boolean).length;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // New filters mean a new list — restart paging.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, action, actorType]);
  const clearAll = () => {
    setFilter("");
    setActorType("");
    setAction("");
  };

  return (
    <>
      <h1>{t("Activity", "活动日志")}</h1>
      <p className="subtitle">
        {t(
          "Complete audit trail — every recommendation, approval, order, rejection, and exit is recorded. No black-box state transitions.",
          "完整审计轨迹 — 每一次推荐、审批、下单、拒绝与离场均有记录，状态流转没有黑箱。",
        )}
      </p>
      <FlowNav stage="audit" />

      <div className="panel">
        <div className="row">
          <input
            type="text"
            placeholder={t("FILTER BY TICKER", "按代码筛选")}
            value={filter}
            onChange={(e) => setFilter(e.target.value.toUpperCase())}
            maxLength={10}
          />
          {activeFilterCount > 0 && (
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
              {t(
                `${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""} active`,
                `${activeFilterCount} 个筛选条件生效`,
              )}{" "}
              ·{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  clearAll();
                }}
                style={{ color: "var(--accent)" }}
              >
                {t("Clear all", "清除全部")}
              </a>
            </span>
          )}
        </div>

        <div style={chipRowStyle}>
          <span style={chipRowLabelStyle}>{t("Actor", "操作者")}</span>
          <FilterChip
            label={t("All", "全部")}
            active={actorType === ""}
            onClick={() => setActorType("")}
          />
          {ACTOR_TYPES.map((t) => (
            <FilterChip
              key={t}
              label={t}
              active={actorType === t}
              onClick={() => setActorType(t)}
            />
          ))}
        </div>

        <div style={chipRowStyle}>
          <span style={chipRowLabelStyle}>{t("Action", "操作")}</span>
          <FilterChip
            label={t("All", "全部")}
            active={action === ""}
            onClick={() => setAction("")}
          />
          {(actions.data ?? []).map((a) => (
            <FilterChip key={a} label={a} active={action === a} onClick={() => setAction(a)} />
          ))}
          {actions.isError && (
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
              {t("action list unavailable", "操作列表不可用")}
            </span>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>{t("Events", "事件")}</h2>
        {audit.isPending ? (
          <p className="empty">{t("Loading…", "加载中…")}</p>
        ) : audit.isError ? (
          <p className="error">
            {t(
              `Audit trail unavailable: ${audit.error.message}`,
              `审计日志不可用：${audit.error.message}`,
            )}
          </p>
        ) : audit.data.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Time", "时间")}</th>
                  <th>{t("Actor", "操作者")}</th>
                  <th>{t("Action", "操作")}</th>
                  <th>{t("Entity", "对象")}</th>
                  <th>{t("Details", "详情")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.slice(0, visibleCount).map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleString()}</td>
                    <td>
                      <span className={`badge ${e.actor_type.toLowerCase()}`}>{e.actor_type}</span>
                    </td>
                    <td>{e.action}</td>
                    <td className="ticker">{e.entity_id}</td>
                    <td style={{ color: "var(--text-dim)" }}>
                      <DetailsCell details={e.details} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {audit.data.length > visibleCount && (
              <button
                type="button"
                style={{ marginTop: 10 }}
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                {t(
                  `Show more (${visibleCount} of ${audit.data.length})`,
                  `显示更多（${visibleCount} / ${audit.data.length}）`,
                )}
              </button>
            )}
          </div>
        ) : (
          <p className="empty">
            {activeFilterCount > 0
              ? t("No audit events match the current filters.", "没有符合当前筛选条件的审计事件。")
              : t("No audit events.", "暂无审计事件。")}
          </p>
        )}
      </div>
    </>
  );
}
