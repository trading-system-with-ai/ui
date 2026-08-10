"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";

export default function ActivityPage() {
  const [filter, setFilter] = useState("");
  const audit = useQuery({
    queryKey: ["audit", filter],
    queryFn: () => api.audit.list(filter || undefined),
  });

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
          {filter && <button onClick={() => setFilter("")}>Clear</button>}
        </div>
      </div>

      <div className="panel">
        <h2>Events</h2>
        {audit.data && audit.data.length > 0 ? (
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
          <p className="empty">No audit events{filter ? ` for ${filter}` : ""}.</p>
        )}
      </div>
    </>
  );
}
