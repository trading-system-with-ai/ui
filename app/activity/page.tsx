"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import type { AuditActorType } from "@/lib/types";

const ACTOR_TYPES: AuditActorType[] = ["USER", "SYSTEM", "LLM"];

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
  const [filter, setFilter] = useState("");
  const [actorType, setActorType] = useState<AuditActorType | "">("");
  const [action, setAction] = useState("");

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
  const clearAll = () => {
    setFilter("");
    setActorType("");
    setAction("");
  };

  return (
    <>
      <h1>Activity</h1>
      <p className="subtitle">
        Complete audit trail — every recommendation, approval, order, rejection, and exit is
        recorded. No black-box state transitions.
      </p>

      <div className="panel">
        <div className="row">
          <input
            type="text"
            placeholder="FILTER BY TICKER"
            value={filter}
            onChange={(e) => setFilter(e.target.value.toUpperCase())}
            maxLength={10}
          />
          {activeFilterCount > 0 && (
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
              {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active ·{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  clearAll();
                }}
                style={{ color: "var(--accent)" }}
              >
                Clear all
              </a>
            </span>
          )}
        </div>

        <div style={chipRowStyle}>
          <span style={chipRowLabelStyle}>Actor</span>
          <FilterChip label="All" active={actorType === ""} onClick={() => setActorType("")} />
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
          <span style={chipRowLabelStyle}>Action</span>
          <FilterChip label="All" active={action === ""} onClick={() => setAction("")} />
          {(actions.data ?? []).map((a) => (
            <FilterChip key={a} label={a} active={action === a} onClick={() => setAction(a)} />
          ))}
          {actions.isError && (
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
              action list unavailable
            </span>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Events</h2>
        {audit.isPending ? (
          <p className="empty">Loading…</p>
        ) : audit.isError ? (
          <p className="error">Audit trail unavailable: {audit.error.message}</p>
        ) : audit.data.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleString()}</td>
                  <td>
                    <span className={`badge ${e.actor_type.toLowerCase()}`}>{e.actor_type}</span>
                  </td>
                  <td>{e.action}</td>
                  <td className="ticker">{e.entity_id}</td>
                  <td style={{ color: "var(--text-dim)" }}>
                    {Object.keys(e.details).length > 0 ? JSON.stringify(e.details) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">
            No audit events{activeFilterCount > 0 ? " match the current filters" : ""}.
          </p>
        )}
      </div>
    </>
  );
}
