"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { DECISION_BADGE, HEAT_BADGE, fmtPct, fmtUsd, utilizationSeverity } from "@/lib/risk-format";
import type { AuditEvent, PortfolioRisk, RiskDecision, RiskLimits } from "@/lib/types";

/* ---------------------------------------------------------------- limits copy */

const LIMIT_ROWS: { key: keyof RiskLimits; label: string; meaning: string }[] = [
  {
    key: "single_name_risk_pct",
    label: "Single-name risk",
    meaning: "Max risk (stop distance × size) in any one name, as % of NAV.",
  },
  {
    key: "single_name_capital_pct",
    label: "Single-name capital",
    meaning: "Max capital deployed into any one name, as % of NAV.",
  },
  {
    key: "bucket_risk_pct",
    label: "Bucket risk cap",
    meaning: "Max combined open risk inside any correlation bucket, as % of NAV.",
  },
  {
    key: "heat_elevated_pct",
    label: "Heat: ELEVATED",
    meaning: "Portfolio Heat at or above this is ELEVATED — new trades are sized down.",
  },
  {
    key: "heat_high_pct",
    label: "Heat: HIGH",
    meaning: "Portfolio Heat at or above this is HIGH — only the strongest signals get sized.",
  },
  {
    key: "heat_reject_pct",
    label: "Heat: reject",
    meaning: "Portfolio Heat at or above this BLOCKS all new risk.",
  },
  {
    key: "abs_max_trade_risk_pct",
    label: "Abs max trade risk",
    meaning: "Absolute ceiling on any single trade's risk, as % of NAV — never exceeded.",
  },
];

/* ---------------------------------------------------------------- helpers */

const NO_DATA = (
  <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>no data</span>
);

function decisionFromDetails(details: Record<string, unknown>): {
  decision: RiskDecision | null;
  reasons: string;
} {
  const d = details.decision;
  const decision =
    d === "APPROVE" || d === "APPROVE_WITH_RESIZE" || d === "REJECT" ? d : null;
  const rc = details.reason_codes;
  const reasons = Array.isArray(rc)
    ? rc.filter((r): r is string => typeof r === "string").join(", ")
    : "";
  return { decision, reasons };
}

/* ---------------------------------------------------------------- panels */

function StatTiles({ d }: { d: PortfolioRisk }) {
  // Cash severity: red below the floor, amber within 5 points of it.
  // cash_pct / cash_floor_pct are FRACTIONS (0.20 = 20%), so 5 points = 0.05.
  const cashSeverity =
    d.cash_pct < d.cash_floor_pct
      ? "var(--red)"
      : d.cash_pct < d.cash_floor_pct + 0.05
        ? "var(--amber)"
        : undefined;

  return (
    <div className="statbar">
      <div className="stat">
        <div className="label">Portfolio NAV</div>
        <div className="value">{fmtUsd(d.nav)}</div>
      </div>
      <div className="stat">
        <div className="label">Cash</div>
        <div className="value" style={cashSeverity ? { color: cashSeverity } : undefined}>
          {fmtUsd(d.cash)}
          <span style={{ fontSize: 13, marginLeft: 6 }}>{fmtPct(d.cash_pct)}</span>
        </div>
        <div className="sub" style={cashSeverity ? { color: cashSeverity } : undefined}>
          floor {fmtPct(d.cash_floor_pct)} of NAV
          {d.cash_pct < d.cash_floor_pct
            ? " — BELOW FLOOR"
            : d.cash_pct < d.cash_floor_pct + 0.05
              ? " — near floor"
              : ""}
        </div>
      </div>
      <div className="stat">
        <div className="label">Portfolio Heat</div>
        <div className="value">
          {fmtPct(d.portfolio_heat_pct)}{" "}
          <span className={`badge ${HEAT_BADGE[d.heat_state]}`}>{d.heat_state}</span>
        </div>
        <div className="sub">total open risk if every stop is hit</div>
      </div>
      <div className="stat">
        <div className="label">Max New Risk</div>
        <div className="value">{fmtUsd(d.max_new_risk_usd)}</div>
        <div className="sub">{fmtPct(d.max_new_risk_pct)} of NAV available</div>
      </div>
      <div className="stat">
        <div className="label">Market Regime</div>
        <div className="value" style={{ fontSize: 15 }}>{d.market_regime}</div>
      </div>
      <div className="stat">
        <div className="label">Trading</div>
        <div className="value">
          <span className={`badge ${d.trading_enabled ? "green" : "amber"}`}>
            {d.trading_enabled ? "ENABLED" : "PAUSED"}
          </span>
        </div>
        <div className="sub">
          <Link href="/" style={{ color: "var(--accent)" }}>
            Dashboard controls →
          </Link>
        </div>
      </div>
    </div>
  );
}

function BucketsPanel({ d }: { d: PortfolioRisk }) {
  return (
    <div className="panel">
      <h2>Correlation buckets</h2>
      {d.buckets.length > 0 ? (
        d.buckets.map((b) => {
          // utilization_pct is a FRACTION of the cap (1.0 = cap fully used).
          const utilPct = b.utilization_pct * 100;
          const sev = utilizationSeverity(utilPct);
          const width = Math.max(0, Math.min(100, utilPct));
          return (
            <div className="bucket" key={b.name}>
              <div className="bucket-head">
                <span className="name">{b.name}</span>
                <span className="figures">
                  risk {fmtUsd(b.risk_usd)} · {fmtPct(b.risk_pct)} of NAV · cap{" "}
                  {fmtPct(b.cap_pct)} · {fmtPct(b.utilization_pct, 0)} used
                </span>
              </div>
              <div
                className={`meter-track ${sev}`}
                role="meter"
                aria-valuenow={utilPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${b.name} bucket: ${fmtPct(b.risk_pct)} of NAV risk against a ${fmtPct(b.cap_pct)} cap`}
              >
                <div className={`meter-fill ${sev}`} style={{ width: `${width}%` }} />
              </div>
              <div className="bucket-members">
                {b.tickers.length > 0 ? b.tickers.join(" · ") : "no members"}
              </div>
            </div>
          );
        })
      ) : (
        <p className="empty">No correlation buckets configured.</p>
      )}
    </div>
  );
}

function PositionsPanel({ d }: { d: PortfolioRisk }) {
  return (
    <div className="panel">
      <h2>Open positions</h2>
      {d.positions.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="num">Qty</th>
                <th className="num">Avg price</th>
                <th className="num">Market price</th>
                <th className="num">Market value</th>
                <th className="num">Max loss</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {d.positions.map((p) => (
                <tr key={p.ticker}>
                  <td className="ticker">{p.ticker}</td>
                  <td className="num">{p.quantity.toLocaleString()}</td>
                  <td className="num">{fmtUsd(p.avg_price, 2)}</td>
                  <td className="num">{p.market_price == null ? NO_DATA : fmtUsd(p.market_price, 2)}</td>
                  <td className="num">{p.market_value == null ? NO_DATA : fmtUsd(p.market_value)}</td>
                  <td className="num" style={{ color: "var(--red)" }}>
                    {fmtUsd(p.max_loss)}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(p.opened_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No open positions — paper execution arrives in Phase 6.</p>
      )}
    </div>
  );
}

function LimitsPanel({ d }: { d: PortfolioRisk }) {
  return (
    <div className="panel">
      <h2>Hard limits</h2>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
        Configured caps enforced by the risk engine — read-only here; every veto they cause
        is audited.
      </p>
      <table>
        <thead>
          <tr>
            <th>Limit</th>
            <th className="num">Value</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {LIMIT_ROWS.map((r) => (
            <tr key={r.key}>
              <td style={{ whiteSpace: "nowrap" }}>{r.label}</td>
              <td className="num">{fmtPct(d.limits[r.key])}</td>
              <td style={{ color: "var(--text-dim)", fontFamily: "inherit" }}>{r.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskDecisionsPanel({
  events,
  errorMessage,
}: {
  events: AuditEvent[] | undefined;
  errorMessage?: string;
}) {
  const decisions = (events ?? []).filter((e) => e.action === "RISK_DECISION");
  return (
    <div className="panel">
      <h2>Recent risk decisions</h2>
      {errorMessage !== undefined ? (
        <p className="error">Audit trail unavailable: {errorMessage}</p>
      ) : events === undefined ? (
        <p className="empty">Loading audit events…</p>
      ) : decisions.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Ticker</th>
                <th>Decision</th>
                <th>Reasons</th>
              </tr>
            </thead>
            <tbody>
              {decisions.slice(0, 20).map((e) => {
                const { decision, reasons } = decisionFromDetails(e.details);
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleString()}</td>
                    <td className="ticker">{e.entity_id}</td>
                    <td>
                      {decision ? (
                        <span className={`badge ${DECISION_BADGE[decision]}`}>{decision}</span>
                      ) : (
                        <span className="badge dim">UNKNOWN</span>
                      )}
                    </td>
                    <td style={{ color: "var(--text-dim)" }}>
                      {reasons ||
                        (Object.keys(e.details).length > 0 ? JSON.stringify(e.details) : "")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          No risk decisions yet — generate a Trade Plan on a symbol page to see one.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- page */

export default function RiskPage() {
  const risk = useQuery({ queryKey: ["portfolio-risk"], queryFn: api.portfolio.risk });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.audit.list() });

  return (
    <>
      <h1>Risk</h1>
      <p className="subtitle">
        NAV, cash floor, Portfolio Heat, and correlation buckets — the page that decides
        whether new risk is allowed.
      </p>

      {risk.isPending ? (
        <div className="panel">
          <p className="empty">Loading portfolio risk…</p>
        </div>
      ) : risk.isError ? (
        <div className="panel">
          <p className="error">Portfolio risk unavailable: {risk.error.message}</p>
        </div>
      ) : (
        <>
          <p className="datasource">
            as of {new Date(risk.data.as_of).toLocaleString()}
          </p>
          <StatTiles d={risk.data} />
          <BucketsPanel d={risk.data} />
          <PositionsPanel d={risk.data} />
          <LimitsPanel d={risk.data} />
        </>
      )}

      <RiskDecisionsPanel
        events={audit.data}
        errorMessage={audit.isError ? audit.error.message : undefined}
      />
    </>
  );
}
