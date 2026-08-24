/**
 * Phase C pre-trade comparison (SHADOW) — component tests against three
 * payload shapes the backend really produces:
 *   1. FULL — every §46 row populated, caps that bind and caps that do not,
 *      a hypothetical statistical resize below the Tier 0 approved quantity;
 *   2. ALL-NULL — the block is present but the candidate had no returns, so
 *      every before/after/delta is null and each row carries a reason;
 *   3. MISSING — a plan generated before Phase C: no comparison, no binding
 *      constraints, no shadow block at all.
 *
 * What these tests pin (the rules that are cheap to break in a refactor):
 *   1. SHADOW is stated ON SCREEN, and the hypothetical statistical quantity
 *      never displaces the Tier 0 approved quantity.
 *   2. Honest nulls — a null renders an em dash plus the server reason,
 *      never 0 and never a borrowed number.
 *   3. `unit` chooses the formatter: "usd" → $, "pct_nav"/"pct" → % of a
 *      FRACTION (0.032 → "3.20%").
 *   4. Deltas carry an explicit sign.
 *   5. Binding constraints are grouped HARD_LIMIT first, and the statistical
 *      group says it changed nothing.
 *   6. A pre-Phase-C payload renders NOTHING — never an empty table that
 *      implies a measurement was taken.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type {
  OrderPreviewRisk,
  RiskComparisonWireRow,
  RiskComparisonTier0WireRow,
  ShadowStatistical,
} from "@/lib/types";
import TradeComparison from "./TradeComparison";

// This jsdom build ships no working localStorage; LanguageProvider reads it.
const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
});

afterEach(() => {
  cleanup();
  store.clear();
});

function draw(node: React.ReactElement) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

/* ---------------------------------------------------------------- fixtures */

/** The Tier 0 half of the payload — unchanged by Phase C. */
function tier0(): OrderPreviewRisk {
  return {
    decision: "APPROVE_WITH_RESIZE",
    approved_quantity: 2,
    signal_strength: "MODERATE",
    risk_budget_pct: 0.0075,
    trade_risk_usd: 840,
    reason_codes: ["SINGLE_NAME_RISK_CAP", "PORTFOLIO_ES_LIMIT"],
    explanations: ["resized from 4 to 2 by the single-name risk cap"],
    heat_before_pct: 0.032,
    heat_after_pct: 0.04,
    cash_after_pct: 0.38,
  };
}

/**
 * §46 rows. Hand-checked numbers, all fractions where the unit says so:
 *   heat        0.032 → 0.040, delta +0.008  → "+0.80%"
 *   cash        0.420 → 0.380, delta −0.040  → "−4.00%" (neutral colour)
 *   ES hist 95  $919.90 → $1,204.30, delta +$284.40 (== incremental ES)
 */
function fullRows(): RiskComparisonWireRow[] {
  return [
    {
      metric: "var_hist_95",
      before_usd: 754.97,
      after_usd: 981.2,
      delta_usd: 226.23,
      before_health: "ACTIVE",
      after_health: "ACTIVE",
      reason: null,
    },
    {
      metric: "es_hist_95",
      before_usd: 919.9,
      after_usd: 1204.3,
      delta_usd: 284.4,
      before_health: "ACTIVE",
      after_health: "ACTIVE",
      reason: null,
    },
    {
      // A DEGRADED row still shows its number — health qualifies, not hides.
      metric: "gaussian_es_95",
      before_usd: 865.2,
      after_usd: 1103.4,
      delta_usd: 238.2,
      before_health: "ACTIVE",
      after_health: "DEGRADED",
      reason: "gaussian trust LOW: excess kurtosis 1.80",
    },
    {
      metric: "volatility",
      before_usd: 1234.5,
      after_usd: 1502.8,
      delta_usd: 268.3,
      before_health: "ACTIVE",
      after_health: "ACTIVE",
      reason: null,
    },
    {
      // An UNMEASURABLE row: both sides null, with the model's own reason.
      metric: "es_hist_99",
      before_usd: null,
      after_usd: null,
      delta_usd: null,
      before_health: "UNAVAILABLE",
      after_health: "UNAVAILABLE",
      reason: "n_obs 8 < min_obs 60",
    },
  ];
}

/** The Tier 0 rows exactly as the gateway sends them (fractions). */
function fullTier0Rows(): RiskComparisonTier0WireRow[] {
  return [
    { metric: "portfolio_heat_pct", before_pct: 0.032, after_pct: 0.04, layer: "HARD_LIMIT" },
    { metric: "cash_pct", before_pct: 0.42, after_pct: 0.38, layer: "HARD_LIMIT" },
  ];
}

function fullShadow(): ShadowStatistical {
  return {
    hypothetical: {
      decision: "APPROVE_WITH_RESIZE",
      quantity: 1,
      binding: ["PORTFOLIO_ES_LIMIT"],
    },
    caps: [
      {
        code: "PORTFOLIO_ES_LIMIT",
        layer: "STATISTICAL",
        cap_qty: 1,
        sentence:
          "portfolio ES-95 would be 6.10% of NAV at 2 contracts (limit 5.00%); largest passing quantity is 1",
        measured: { es95_pct_nav_at_requested: 0.061, es95_pct_nav_at_cap: 0.048 },
      },
      {
        // A cap that did NOT bind is still reported — a limit measured and
        // passed is information.
        code: "BUCKET_ES_CONTRIBUTION_CAP:TECH_MEGA",
        layer: "CONCENTRATION",
        cap_qty: 2,
        sentence: "bucket TECH_MEGA ES share 47.0% at 2 contracts (limit 50.0%) — no cap",
        measured: { bucket_es_share_at_requested: 0.47 },
      },
    ],
    limits: {
      max_portfolio_es95_pct_nav: 0.05,
      max_single_position_es_share: 0.35,
      max_bucket_es_share: 0.5,
      max_incremental_es95_pct_nav: 0.015,
      min_obs: 60,
      mode: "SHADOW",
    },
    correlation_state: null,
  };
}

/** 1. FULL — everything present. */
function full(): OrderPreviewRisk {
  return {
    ...tier0(),
    comparison: {
      quantity: 2,
      mode: "SHADOW",
      rows: fullRows(),
      tier0_rows: fullTier0Rows(),
      health: "ACTIVE",
      reason: null,
    },
    binding_constraints: [
      { code: "PORTFOLIO_ES_LIMIT", layer: "STATISTICAL" },
      { code: "SINGLE_NAME_RISK_CAP", layer: "HARD_LIMIT" },
      { code: "BUCKET_ES_CONTRIBUTION_CAP:TECH_MEGA", layer: "CONCENTRATION" },
    ],
    shadow_statistical: fullShadow(),
  };
}

/** 2. ALL-NULL — the candidate has no returns; nothing could be estimated. */
function allNull(): OrderPreviewRisk {
  const reason = "candidate ticker ZZZZ has no stored returns; n=0 < min_obs=60";
  return {
    ...tier0(),
    decision: "APPROVE",
    approved_quantity: 4,
    reason_codes: [],
    explanations: [],
    comparison: {
      quantity: 4,
      mode: "SHADOW",
      rows: [
        {
          metric: "es_hist_95",
          before_usd: null,
          after_usd: null,
          delta_usd: null,
          before_health: "UNAVAILABLE",
          after_health: "UNAVAILABLE",
          reason,
        },
        {
          metric: "var_hist_95",
          before_usd: null,
          after_usd: null,
          delta_usd: null,
          before_health: "UNAVAILABLE",
          after_health: "UNAVAILABLE",
          reason,
        },
      ],
      health: "UNAVAILABLE",
      reason,
    },
    binding_constraints: [],
    shadow_statistical: {
      hypothetical: { decision: "APPROVE", quantity: 4, binding: [] },
      caps: [],
      limits: { mode: "SHADOW", min_obs: 60 },
      correlation_state: null,
      note: "statistical layer raised: no returns for the candidate — no cap produced",
    },
  };
}

/** 3. MISSING — a plan stored before Phase C shipped. */
function missing(): OrderPreviewRisk {
  return tier0();
}

/* ---------------------------------------------------------------- tests */

describe("TradeComparison — full payload", () => {
  it("states SHADOW on screen and keeps the Tier 0 quantity primary", () => {
    draw(<TradeComparison risk={full()} quantityRequested={4} unitSuffix=" CONTRACTS" />);
    // The disclaimer is rendered, not merely implied by a badge.
    expect(
      screen.getByText("SHADOW: statistical layer does not alter decisions yet."),
    ).toBeDefined();
    // Requested / approved / hypothetical all present and distinguishable.
    expect(screen.getByText("Requested")).toBeDefined();
    expect(screen.getByText("4 CONTRACTS")).toBeDefined();
    expect(screen.getByText("Approved (Tier 0)")).toBeDefined();
    expect(screen.getByText("2 CONTRACTS")).toBeDefined();
    // The hypothetical (1) is BESIDE the approved (2), never instead of it.
    expect(screen.getByText("1 CONTRACTS")).toBeDefined();
  });

  it("formats each row by its declared unit, not by its label", () => {
    draw(<TradeComparison risk={full()} quantityRequested={4} />);
    // usd → currency
    expect(screen.getByText("$920")).toBeDefined(); // ES before, fmtUsd 0 digits
    expect(screen.getByText("$1,204")).toBeDefined(); // ES after
    // pct_nav → fraction × 100, 2 decimals
    expect(screen.getByText("3.20%")).toBeDefined(); // heat before
    expect(screen.getByText("4.00%")).toBeDefined(); // heat after
    // Tier 0 rows arrive as `before_pct`/`after_pct` fractions and the
    // statistical rows as `*_usd`; the UNIT decides the formatter, so both
    // vocabularies coexist in one table without either being misread.
    expect(screen.getByText("42.00%")).toBeDefined(); // cash before
    expect(screen.getByText("$1,235")).toBeDefined(); // volatility before, usd
  });

  it("signs every delta and colours risk-increasing ones amber", () => {
    const { container } = draw(<TradeComparison risk={full()} quantityRequested={4} />);
    expect(screen.getByText("+0.80%")).toBeDefined(); // heat +0.008
    expect(screen.getByText("+$284")).toBeDefined(); // incremental ES delta
    expect(screen.getByText("−4.00%")).toBeDefined(); // cash −0.04, minus sign
    const heatDelta = screen.getByText("+0.80%");
    expect(heatDelta.getAttribute("style")).toContain("var(--amber)");
    // Cash is the deliberate exception: less cash after a buy is expected,
    // so the cell stays neutral rather than claiming a verdict.
    expect(screen.getByText("−4.00%").getAttribute("style")).toContain("var(--text-dim)");
    expect(container.textContent).toContain("Current vs after trade");
  });

  it("groups binding constraints HARD_LIMIT first and marks the shadow group", () => {
    draw(<TradeComparison risk={full()} quantityRequested={4} />);
    const badges = screen.getAllByText(/^(HARD_LIMIT|STATISTICAL|CONCENTRATION)$/);
    // First badge in DOM order is the deciding layer.
    expect(badges[0].textContent).toBe("HARD_LIMIT");
    expect(screen.getByText("these decided the approved quantity")).toBeDefined();
    expect(
      screen.getAllByText("SHADOW — computed and logged; these changed nothing").length,
    ).toBeGreaterThan(0);
    // The §47 cap sentence travels with the code, verbatim.
    expect(
      screen.getAllByText(
        /portfolio ES-95 would be 6\.10% of NAV at 2 contracts \(limit 5\.00%\); largest passing quantity is 1/,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("lists caps that did not bind alongside the one that did", () => {
    draw(<TradeComparison risk={full()} quantityRequested={4} />);
    const capTable = screen.getByText("Cap qty").closest("table");
    expect(capTable).not.toBeNull();
    const body = within(capTable as HTMLElement);
    expect(body.getByText("BUCKET_ES_CONTRIBUTION_CAP:TECH_MEGA")).toBeDefined();
    expect(
      body.getByText("bucket TECH_MEGA ES share 47.0% at 2 contracts (limit 50.0%) — no cap"),
    ).toBeDefined();
  });

  it("shows a DEGRADED row's number and its health badge together", () => {
    draw(<TradeComparison risk={full()} quantityRequested={4} />);
    expect(screen.getByText("Gaussian ES 95%")).toBeDefined();
    expect(screen.getByText("$865")).toBeDefined(); // the number is NOT hidden
    expect(screen.getAllByText("DEGRADED").length).toBeGreaterThan(0);
  });
});

describe("TradeComparison — all-null payload", () => {
  it("renders em dashes and the server reason, never a zero", () => {
    const { container } = draw(<TradeComparison risk={allNull()} quantityRequested={4} />);
    // Two rows × three numeric cells = six dashes, and no fabricated zeros.
    expect(container.querySelectorAll("tbody td.num").length).toBe(6);
    expect(container.textContent).not.toContain("$0");
    expect(container.textContent).not.toContain("0.00%");
    expect(
      screen.getAllByText(
        "candidate ticker ZZZZ has no stored returns; n=0 < min_obs=60",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("badges the comparison UNAVAILABLE and reports the shadow raise", () => {
    draw(<TradeComparison risk={allNull()} quantityRequested={4} />);
    expect(screen.getAllByText("UNAVAILABLE").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "statistical layer raised: no returns for the candidate — no cap produced",
      ),
    ).toBeDefined();
  });

  it("still shows the Tier 0 approved quantity and the SHADOW sentence", () => {
    draw(<TradeComparison risk={allNull()} quantityRequested={4} unitSuffix=" SHARES" />);
    expect(screen.getByText("Approved (Tier 0)")).toBeDefined();
    expect(screen.getAllByText("4 SHARES").length).toBeGreaterThan(0);
    expect(
      screen.getByText("SHADOW: statistical layer does not alter decisions yet."),
    ).toBeDefined();
  });

  it("renders no binding-constraints section when there are none", () => {
    draw(<TradeComparison risk={allNull()} quantityRequested={4} />);
    expect(screen.queryByText("Binding constraints")).toBeNull();
  });
});

describe("TradeComparison — Phase D STRESS layer (SHADOW)", () => {
  /** A STRESS cap is a real backend layer (design §8.5), not an unknown one:
   *  it must group under its OWN badge. The regression this pins is a
   *  `LAYER_ORDER` that omits "STRESS", which silently badged a genuine
   *  stress constraint as "OTHER". */
  it("groups a STRESS constraint under STRESS, never OTHER", () => {
    const withStress: OrderPreviewRisk = {
      ...tier0(),
      binding_constraints: [
        { code: "STRESS_LOSS_LIMIT", layer: "STRESS" },
        { code: "SINGLE_NAME_RISK_CAP", layer: "HARD_LIMIT" },
      ],
    };
    draw(<TradeComparison risk={withStress} quantityRequested={4} />);
    expect(screen.getByText("STRESS")).toBeDefined();
    expect(screen.queryByText("OTHER")).toBeNull();
    expect(screen.getByText("STRESS_LOSS_LIMIT")).toBeDefined();
  });

  it("still renders a layer the backend invents later, after the known ones", () => {
    const unknown: OrderPreviewRisk = {
      ...tier0(),
      binding_constraints: [
        { code: "SOME_FUTURE_CAP", layer: "LIQUIDITY" as never },
      ],
    };
    draw(<TradeComparison risk={unknown} quantityRequested={4} />);
    expect(screen.getByText("OTHER")).toBeDefined();
    expect(screen.getByText("SOME_FUTURE_CAP")).toBeDefined();
  });

  it("marks the STRESS group as SHADOW, not as deciding", () => {
    const withStress: OrderPreviewRisk = {
      ...tier0(),
      binding_constraints: [{ code: "STRESS_LOSS_LIMIT", layer: "STRESS" }],
    };
    draw(<TradeComparison risk={withStress} quantityRequested={4} />);
    expect(
      screen.getByText("SHADOW — computed and logged; these changed nothing"),
    ).toBeDefined();
  });
});

describe("TradeComparison — missing fields (pre-Phase-C plan)", () => {
  it("renders nothing at all rather than an empty table", () => {
    const { container } = draw(<TradeComparison risk={missing()} quantityRequested={4} />);
    expect(container.innerHTML).toBe("");
  });

  it("does not crash when only some of the three fields are present", () => {
    const partial: OrderPreviewRisk = {
      ...tier0(),
      binding_constraints: [{ code: "HEAT_GATE_REJECT", layer: "HARD_LIMIT" }],
    };
    draw(<TradeComparison risk={partial} quantityRequested={null} />);
    expect(screen.getByText("HEAT_GATE_REJECT")).toBeDefined();
    // No comparison rows → the honest empty line, not a blank table body.
    expect(
      screen.getByText("No before/after comparison was produced for this trade."),
    ).toBeDefined();
    // quantityRequested null ⇒ the engine sized it.
    expect(screen.getByText("auto")).toBeDefined();
  });

  it("tolerates explicit nulls in every optional field", () => {
    const nulled: OrderPreviewRisk = {
      ...tier0(),
      comparison: null,
      binding_constraints: null,
      shadow_statistical: null,
    };
    const { container } = draw(<TradeComparison risk={nulled} quantityRequested={4} />);
    expect(container.innerHTML).toBe("");
  });
});

/* ---------------------------------------------------------------------------
 * REGRESSION (QA Phase C): the REAL gateway payload.
 *
 * The Phase C UI was written from the task brief before the gateway landed,
 * against invented field names (`before`/`after`/`delta`/`label`/`unit`, a
 * bare `caps` array, `comparison.mode`). The gateway actually sends
 * `before_usd`/`after_usd`/`delta_usd`/`before_health`, a separate
 * `tier0_rows` list, and `caps: {health, reason, rows}` — so every row
 * rendered as "—" and the caps table was empty.
 *
 * These fixtures are copied VERBATIM from a live gateway preview response
 * (services: tests/test_orders_shadow_c.py fixture) so the drift cannot
 * silently return.
 * ------------------------------------------------------------------------ */

/** Verbatim from a live `/api/orders/preview` response. */
function gatewayRisk(): OrderPreviewRisk {
  return {
    ...tier0(),
    decision: "APPROVE",
    approved_quantity: 194,
    comparison: {
      quantity: 194,
      health: "ACTIVE",
      reason: null,
      rows: [
        {
          metric: "var_hist_95",
          before_usd: 129.2527997732487,
          after_usd: 362.2837685091212,
          before_pct_nav: 0.0011890360907192666,
          after_pct_nav: 0.00333275934134376,
          delta_usd: 233.0309687358725,
          delta_pct_nav: 0.002143723250624493,
          before_health: "ACTIVE",
          after_health: "ACTIVE",
          reason: null,
        },
        {
          metric: "es_hist_95",
          before_usd: 130.25574670922842,
          after_usd: 469.28740109227215,
          delta_usd: 339.0316543830437,
          before_health: "ACTIVE",
          after_health: "ACTIVE",
          reason: null,
        },
      ],
      tier0_rows: [
        {
          metric: "portfolio_heat_pct",
          before_pct: 0.009291299327622097,
          after_pct: 0.015267503728882885,
          layer: "HARD_LIMIT",
        },
        { metric: "cash_pct", before_pct: null, after_pct: 0.71, layer: "HARD_LIMIT" },
      ],
      incremental_es_95_usd: 339.0316543830437,
      candidate_es_share_after: 0.8051190101133054,
    },
    binding_constraints: [],
    shadow_statistical: {
      hypothetical: {
        decision: "REJECT",
        quantity: 0,
        binding: ["BUCKET_ES_CONTRIBUTION_CAP:TECH_MEGA", "ES_CONTRIBUTION_CAP"],
      },
      // The gateway shape: an OBJECT, not a bare array.
      caps: {
        health: "ACTIVE",
        reason: null,
        rows: [
          {
            code: "ES_CONTRIBUTION_CAP",
            layer: "CONCENTRATION",
            cap_qty: 36,
            sentence:
              "GOOGL would hold 80.5% of the portfolio's ES-95 risk contributions at 194 unit(s), above the 35.0% single-position limit; quantity reduced from 194 to 36, where its share is 34.7%.",
            measured: { es_share_at_requested: 0.8051190101133054 },
          },
        ],
      },
      limits: {
        max_portfolio_es95_pct_nav: 0.05,
        max_single_position_es_share: 0.35,
        max_bucket_es_share: 0.5,
        max_incremental_es95_pct_nav: 0.015,
        min_obs: 60,
        mode: "SHADOW",
      },
      correlation_state: null,
    },
  } as unknown as OrderPreviewRisk;
}

describe("TradeComparison — the REAL gateway payload (drift regression)", () => {
  it("renders the gateway's *_usd numbers instead of a table of dashes", () => {
    const { container } = draw(<TradeComparison risk={gatewayRisk()} quantityRequested={null} />);
    // The actual measured tails, formatted as currency.
    expect(screen.getByText("$129")).toBeDefined();
    expect(screen.getByText("$362")).toBeDefined();
    expect(screen.getByText("+$233")).toBeDefined();
    expect(screen.getByText("$130")).toBeDefined();
    expect(screen.getByText("$469")).toBeDefined();
    // ES 95% delta AND the synthesised "Incremental ES 95% (this trade)" row
    // (= ES after − ES before) both read +$339 — by construction identical.
    expect(screen.getAllByText("+$339").length).toBe(2);
    expect(screen.getByText("Incremental ES 95% (this trade)")).toBeDefined();
    // The candidate's ES share row (§46 "Single-name RC"): 0 → 80.5%.
    expect(screen.getByText("This position's share of ES 95%")).toBeDefined();
    expect(screen.getAllByText("80.51%").length).toBeGreaterThanOrEqual(1);
    // Not a single numeric cell may be a dash when the server measured it.
    const dashCells = Array.from(container.querySelectorAll("tbody td.num")).filter(
      (td) => td.textContent === "—",
    );
    // Only the ONE genuinely-null Tier 0 cash "before" plus its delta.
    expect(dashCells.length).toBe(2);
  });

  it("renders the Tier 0 hard-limit rows the gateway sends separately", () => {
    draw(<TradeComparison risk={gatewayRisk()} quantityRequested={null} />);
    expect(screen.getByText("Portfolio heat")).toBeDefined();
    expect(screen.getByText("0.93%")).toBeDefined(); // heat before
    expect(screen.getByText("1.53%")).toBeDefined(); // heat after
    // A genuinely-absent Tier 0 endpoint stays an honest dash, not a zero.
    expect(screen.getByText("Cash")).toBeDefined();
  });

  it("reads caps from the {health, reason, rows} object the gateway sends", () => {
    draw(<TradeComparison risk={gatewayRisk()} quantityRequested={null} />);
    expect(screen.getAllByText("ES_CONTRIBUTION_CAP").length).toBeGreaterThan(0);
    expect(screen.getByText(/would hold 80\.5% of the portfolio's ES-95/)).toBeDefined();
  });

  it("takes SHADOW from limits.mode when the comparison omits it", () => {
    draw(<TradeComparison risk={gatewayRisk()} quantityRequested={null} />);
    expect(screen.getAllByText("SHADOW").length).toBeGreaterThan(0);
  });

  it("never crashes on an empty risk object", () => {
    expect(() =>
      draw(<TradeComparison risk={{} as OrderPreviewRisk} quantityRequested={null} />),
    ).not.toThrow();
  });

  it("never crashes when approved_quantity is absent but a comparison is present", () => {
    const risk = { comparison: { quantity: 5, rows: [] } } as unknown as OrderPreviewRisk;
    expect(() => draw(<TradeComparison risk={risk} quantityRequested={null} />)).not.toThrow();
  });
});

/* ------------------------------------------------- Phase D — stress (SHADOW) */

/**
 * The Phase D additions to the SAME payload: one extra §46 row
 * (`worst_stress_loss`, in the VaR/ES LOSS sign) and a STRESS-layer cap in
 * the binding list. Both arrive in the shapes the gateway already uses, so
 * the table must render them without a special case — the only Phase D
 * requirement here is that the STRESS layer gets its OWN group (not the
 * "OTHER" bucket) and that the loss is NAMED by its scenario.
 */
function stressRisk(): OrderPreviewRisk {
  const base = full();
  return {
    ...base,
    comparison: {
      ...base.comparison!,
      rows: [
        ...fullRows(),
        {
          metric: "worst_stress_loss",
          layer: "STRESS",
          // A LOSS (positive = money lost), same column direction as VaR/ES.
          before_usd: 4210.5,
          after_usd: 5980.25,
          before_pct_nav: 0.042,
          after_pct_nav: 0.0598,
          delta_usd: 1769.75,
          delta_pct_nav: 0.0178,
          before_health: "DEGRADED",
          after_health: "DEGRADED",
          before_scenario: "Equity -10% / IV +40%",
          after_scenario: "Equity -10% / IV +40%",
          reason: null,
        },
      ],
    },
    binding_constraints: [
      ...(base.binding_constraints ?? []),
      { code: "STRESS_LOSS_LIMIT", layer: "STRESS" },
    ],
    shadow_statistical: {
      ...fullShadow(),
      stress: {
        worst_before: {
          scenario: "Equity -10% / IV +40%",
          kind: "HYPOTHETICAL",
          validated: false,
          pnl_usd: -4210.5,
          loss_usd: 4210.5,
          loss_pct_nav: 0.042,
          method_coverage: { FULL_REVAL: 3, DELTA_LINEAR: 1 },
          health: "DEGRADED",
          reason: null,
        },
        worst_after: {
          scenario: "Equity -10% / IV +40%",
          kind: "HYPOTHETICAL",
          validated: false,
          pnl_usd: -5980.25,
          loss_usd: 5980.25,
          loss_pct_nav: 0.0598,
          method_coverage: { FULL_REVAL: 4, DELTA_LINEAR: 1 },
          health: "DEGRADED",
          reason: null,
        },
        cap: {
          code: "STRESS_LOSS_LIMIT",
          layer: "STRESS",
          cap_qty: 1,
          sentence:
            "worst stress loss would be 5.98% of NAV at 2 contracts (limit 10.00%); largest passing quantity is 1",
          measured: { worst_loss_pct_nav_at_requested: 0.0598 },
        },
        hypothetical: {
          decision: "APPROVE_WITH_RESIZE",
          quantity: 1,
          binding: ["STRESS_LOSS_LIMIT"],
        },
        health: "DEGRADED",
        reason: null,
      },
    },
  };
}

describe("TradeComparison — Phase D stress row and STRESS layer", () => {
  it("labels the worst_stress_loss row instead of showing its raw slug", () => {
    draw(<TradeComparison risk={stressRisk()} quantityRequested={4} />);
    expect(screen.getByText("Worst stress loss")).toBeDefined();
    expect(screen.queryByText("worst_stress_loss")).toBeNull();
  });

  it("renders the loss in the VaR/ES sign with a signed delta", () => {
    draw(<TradeComparison risk={stressRisk()} quantityRequested={4} />);
    const row = screen.getByText("Worst stress loss").closest("tr")!;
    expect(within(row).getByText("$4,211")).toBeDefined();
    expect(within(row).getByText("$5,980")).toBeDefined();
    // Positive delta = the trade DEEPENS the worst case.
    expect(within(row).getByText("+$1,770")).toBeDefined();
  });

  it("names the scenario the loss was measured in — never an anonymous figure", () => {
    draw(<TradeComparison risk={stressRisk()} quantityRequested={4} />);
    const row = screen.getByText("Worst stress loss").closest("tr")!;
    expect(within(row).getByText("Equity -10% / IV +40%")).toBeDefined();
  });

  it("groups the STRESS cap under its OWN layer, not the unknown-layer bucket", () => {
    draw(<TradeComparison risk={stressRisk()} quantityRequested={4} />);
    expect(screen.getAllByText("STRESS").length).toBeGreaterThan(0);
    expect(screen.queryByText("OTHER")).toBeNull();
    expect(screen.getAllByText("STRESS_LOSS_LIMIT").length).toBeGreaterThan(0);
  });

  it("keeps HARD_LIMIT first and says the shadow layers changed nothing", () => {
    draw(<TradeComparison risk={stressRisk()} quantityRequested={4} />);
    const badges = Array.from(document.querySelectorAll(".badge"))
      .map((b) => b.textContent)
      .filter((tx) => tx === "HARD_LIMIT" || tx === "STRESS" || tx === "STATISTICAL");
    expect(badges[0]).toBe("HARD_LIMIT");
    expect(
      screen.getAllByText("SHADOW — computed and logged; these changed nothing").length,
    ).toBeGreaterThan(0);
  });

  it("renders a stress row whose sides could not be measured as dashes + reason", () => {
    const risk = stressRisk();
    risk.comparison!.rows = [
      {
        metric: "worst_stress_loss",
        layer: "STRESS",
        before_usd: null,
        after_usd: null,
        delta_usd: null,
        before_health: "UNAVAILABLE",
        after_health: "UNAVAILABLE",
        before_scenario: null,
        after_scenario: null,
        reason: "no priceable stress leg in the book",
      },
    ];
    draw(<TradeComparison risk={risk} quantityRequested={4} />);
    const row = screen.getByText("Worst stress loss").closest("tr")!;
    expect(within(row).getByText("no priceable stress leg in the book")).toBeDefined();
    expect(within(row).queryByText("$0")).toBeNull();
  });
});

/* ------------------------------------------------- §36/§37/§59 sizing v2 */

/**
 * The sizing-v2 SHADOW block. The audit calls the missing model-risk budget
 * effect "the most consequential gap in the programme", so these tests pin
 * the two things that make the display honest: SHADOW is stated on screen,
 * and a modifier whose input was MISSING renders a dash rather than "1.00×"
 * (which would read as "this input said everything is fine").
 */
describe("sizing v2 (SHADOW)", () => {
  function withSizing(sizing: Record<string, unknown> | null): OrderPreviewRisk {
    const risk = full();
    return {
      ...risk,
      shadow_statistical: {
        ...(risk.shadow_statistical as ShadowStatistical),
        sizing_v2: sizing,
      } as ShadowStatistical,
    };
  }

  const populated = {
    es_modifier: 0.5,
    correlation_modifier: 0.85,
    model_health_modifier: 0.7,
    candidate_budget_pct: 0.014875,
    budget_pct_used: 0.05,
    budget_delta_pct: -0.035125,
    risk_linked_cash_floor_pct: 0.41,
    risk_linked_cash_floor_binds: true,
    regime_floor_pct: 0.2,
    health: "ACTIVE",
    reason: null,
    notes: [],
    mode: "SHADOW",
  };

  it("renders the modifiers, the candidate budget and a SHADOW badge", () => {
    draw(<TradeComparison risk={withSizing(populated)} quantityRequested={4} />);

    expect(screen.getByText("Sizing v2 (hypothetical)")).toBeDefined();
    // The three modifiers the production budget does NOT compose.
    expect(screen.getByText(/ES 0\.50×/)).toBeDefined();
    expect(screen.getByText(/correlation 0\.85×/)).toBeDefined();
    expect(screen.getByText(/model health 0\.70×/)).toBeDefined();
    // budget_pct_used and candidate, as % of NAV.
    expect(screen.getByText(/budget used 5\.00% → candidate 1\.49%/)).toBeDefined();
    // SHADOW is stated on screen, never merely implied.
    expect(screen.getAllByText("SHADOW").length).toBeGreaterThan(0);
  });

  it("shows the shadow cash floor and flags that it would bind", () => {
    draw(<TradeComparison risk={withSizing(populated)} quantityRequested={4} />);
    expect(screen.getByText(/cash floor 20\.00% → 41\.00%/)).toBeDefined();
    expect(screen.getByText("would bind")).toBeDefined();
  });

  it("renders a DASH, never 1.00×, for a modifier whose input was missing", () => {
    draw(
      <TradeComparison
        risk={withSizing({ ...populated, es_modifier: null, model_health_modifier: null })}
        quantityRequested={4}
      />,
    );
    // A missing input is held at 1.0 INTERNALLY so the budget stays honest,
    // but printing "1.00×" here would claim the input said things are fine.
    expect(screen.getByText(/ES —/)).toBeDefined();
    expect(screen.getByText(/model health —/)).toBeDefined();
  });

  it("renders the server's own reason and notes verbatim", () => {
    draw(
      <TradeComparison
        risk={withSizing({
          ...populated,
          health: "DEGRADED",
          notes: ["ES was unavailable; this does NOT mean ES is low"],
        })}
        quantityRequested={4}
      />,
    );
    expect(screen.getByText("ES was unavailable; this does NOT mean ES is low")).toBeDefined();
  });

  it("renders NOTHING when the backend predates sizing v2", () => {
    draw(<TradeComparison risk={withSizing(null)} quantityRequested={4} />);
    expect(screen.queryByText("Sizing v2 (hypothetical)")).toBeNull();
  });
});
