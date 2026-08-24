/**
 * Phase E VaR/ES model validation (SHADOW/RESEARCH) — component tests
 * against a fixture mirroring the §9.4 gateway contract, including the
 * shapes that are easiest to render dishonestly:
 *   - a row with too few forecasts (UNAVAILABLE, null p-values, real counts);
 *   - a RED row whose exceedance count rejects the coverage hypothesis;
 *   - a GARCH row that must carry RESEARCH on top of the panel's SHADOW;
 *   - a null comparison (neither model earned a preference);
 *   - `validation: null` (no backtest yet) and an absent block entirely.
 *
 * What these tests pin (the rules that are cheap to break in a refactor):
 *   1. Nothing is recomputed — verdicts, rates and the preference are the
 *      SERVER's words, rendered as sent.
 *   2. Honest nulls — a missing p-value is an em dash plus the row's own
 *      reason, never 0.0000; the counts stay visible.
 *   3. Exceedances are shown AGAINST their expectation (count and rate).
 *   4. A GARCH row is always badged RESEARCH.
 *   5. The §63 criterion sentence renders VERBATIM.
 *   6. "Run now" posts, swaps in the fresh rows, and reports failure INLINE
 *      (§47 — no native dialog).
 *   7. SHADOW is stated on screen.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { ValidationBlock, ValidationRow, ValidationRunResponse } from "@/lib/types";

// The button calls api.risk.validationRun; the module is mocked so no fetch runs.
const validationRun = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { risk: { validationRun: (...a: unknown[]) => validationRun(...a) } },
}));

import ModelValidation from "./ModelValidation";

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

beforeEach(() => {
  validationRun.mockReset();
});

afterEach(() => {
  cleanup();
  store.clear();
});

function draw(node: React.ReactElement) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

/* ---------------------------------------------------------------- fixtures */

function row(overrides: Partial<ValidationRow> = {}): ValidationRow {
  return {
    model_name: "historical_var",
    model_version: "1.0.0",
    distribution: "EMPIRICAL",
    confidence: 0.95,
    horizon_days: 1,
    window: 250,
    n_forecasts: 348,
    exceedances: 19,
    rate: 0.0546,
    expected_rate: 0.05,
    kupiec_lr: 0.153,
    kupiec_p: 0.6957,
    christoffersen_lr: 0.884,
    christoffersen_p: 0.3471,
    es_severity_ratio: 0.94,
    verdict: "GREEN",
    health: "ACTIVE",
    reason: null,
    ...overrides,
  };
}

/** The full §9.4 shape: the six views the runner scores, plus a comparison. */
function fixture(overrides: Partial<ValidationBlock> = {}): ValidationBlock {
  return {
    as_of: "2026-08-18T09:15:00+00:00",
    rows: [
      row(),
      // 99% view badly under-covered: the coverage hypothesis is REJECTED.
      row({
        confidence: 0.99,
        n_forecasts: 348,
        exceedances: 14,
        rate: 0.0402,
        expected_rate: 0.01,
        kupiec_lr: 26.4,
        kupiec_p: 0.0000,
        christoffersen_lr: 5.9,
        christoffersen_p: 0.0151,
        es_severity_ratio: 1.37,
        verdict: "RED",
        health: "ACTIVE",
        reason: null,
      }),
      row({
        model_name: "gaussian_var",
        distribution: "NORMAL",
        exceedances: 24,
        rate: 0.069,
        kupiec_p: 0.0308,
        christoffersen_p: 0.2214,
        es_severity_ratio: 1.12,
        verdict: "YELLOW",
      }),
      row({
        model_name: "ewma_var",
        distribution: "EMPIRICAL_VOL_SCALED",
        exceedances: 18,
        rate: 0.0517,
        kupiec_p: 0.8842,
        christoffersen_p: 0.6613,
        es_severity_ratio: 0.98,
        verdict: "GREEN",
      }),
      // RESEARCH row — GARCH, and it must say so.
      row({
        model_name: "garch11_var",
        model_version: "1.0.0",
        distribution: "EMPIRICAL_GARCH_SCALED",
        exceedances: 17,
        rate: 0.0489,
        kupiec_p: 0.9271,
        christoffersen_p: 0.7402,
        es_severity_ratio: 0.91,
        verdict: "GREEN",
      }),
      // Honest null: below the minimum forecast count. The COUNTS are real
      // and stay on screen; every statistic is null with a server reason.
      row({
        model_name: "garch11_var",
        distribution: "EMPIRICAL_GARCH_SCALED",
        confidence: 0.99,
        n_forecasts: 41,
        exceedances: 1,
        rate: null,
        expected_rate: null,
        kupiec_lr: null,
        kupiec_p: null,
        christoffersen_lr: null,
        christoffersen_p: null,
        es_severity_ratio: null,
        verdict: null,
        health: "UNAVAILABLE",
        reason: "n_forecasts=41 < min_forecasts=60",
      }),
    ],
    comparison: {
      ewma_kupiec_p: 0.8842,
      garch_kupiec_p: 0.9271,
      // The backend sends the MODEL-NAME key, not a display word
      // (risk_validation.ewma_vs_garch -> COMPARISON_GARCH_KEY).
      preferred: "garch_var",
      criterion:
        "GARCH may move RESEARCH → SHADOW only if, over >= 250 forecast days, its Kupiec p >= EWMA's, its Christoffersen p >= 0.05, and diagnostics never FAILED in the window.",
    },
    ...overrides,
  };
}

/** Locate a table row by the model label in its first cell. */
function findRow(modelName: string, nth = 0): HTMLElement {
  const cells = screen
    .getAllByText(modelName)
    .map((el) => el.closest("tr"))
    .filter((tr): tr is HTMLTableRowElement => tr != null);
  expect(cells.length).toBeGreaterThan(nth);
  return cells[nth];
}

/* ---------------------------------------------------------------- tests */

describe("ModelValidation — the full backtest payload", () => {
  it("renders one row per scored model view", () => {
    draw(<ModelValidation v={fixture()} />);
    // Six views: historical 95/99, gaussian 95, ewma 95, garch 95/99.
    expect(screen.getAllByText("historical_var")).toHaveLength(2);
    expect(screen.getAllByText("gaussian_var")).toHaveLength(1);
    expect(screen.getAllByText("ewma_var")).toHaveLength(1);
    expect(screen.getAllByText("garch11_var")).toHaveLength(2);
  });

  it("shows exceedances against their expectation, as counts AND rates", () => {
    draw(<ModelValidation v={fixture()} />);
    const r = findRow("historical_var", 0);
    // 19 observed against 348 × 0.05 = 17.4 expected.
    expect(within(r).getByText("19")).toBeTruthy();
    expect(within(r).getByText(/17\.4/)).toBeTruthy();
    // …and the same fact as rates.
    expect(within(r).getByText(/5\.46%/)).toBeTruthy();
    expect(within(r).getByText(/5\.00%/)).toBeTruthy();
  });

  it("renders the server's verdicts verbatim, never recomputing one", () => {
    draw(<ModelValidation v={fixture()} />);
    expect(within(findRow("historical_var", 0)).getByText("GREEN")).toBeTruthy();
    // The 99% row is RED even though its Christoffersen p (0.0151) alone
    // would not say so — the verdict is the server's, not a client rule.
    expect(within(findRow("historical_var", 1)).getByText("RED")).toBeTruthy();
    expect(within(findRow("gaussian_var")).getByText("YELLOW")).toBeTruthy();
  });

  it("shows both p-values and the ES severity ratio", () => {
    draw(<ModelValidation v={fixture()} />);
    const r = findRow("historical_var", 0);
    expect(within(r).getByText("0.6957")).toBeTruthy();
    expect(within(r).getByText("0.3471")).toBeTruthy();
    expect(within(r).getByText("0.94×")).toBeTruthy();
  });

  it("badges every GARCH row RESEARCH", () => {
    draw(<ModelValidation v={fixture()} />);
    for (const n of [0, 1]) {
      expect(within(findRow("garch11_var", n)).getByText("RESEARCH")).toBeTruthy();
    }
    // A non-GARCH row must NOT be badged research.
    expect(within(findRow("historical_var", 0)).queryByText("RESEARCH")).toBeNull();
  });

  it("states SHADOW on screen", () => {
    draw(<ModelValidation v={fixture()} />);
    expect(screen.getAllByText("SHADOW").length).toBeGreaterThan(0);
    expect(screen.getByText(/alter no trading decision/i)).toBeTruthy();
  });

  it("shows the walk-forward window each forecast used (§43 provenance)", () => {
    draw(<ModelValidation v={fixture()} />);
    expect(within(findRow("historical_var", 0)).getByText("250")).toBeTruthy();
    expect(within(findRow("historical_var", 0)).getByText("348")).toBeTruthy();
  });
});

describe("ModelValidation — honest nulls", () => {
  it("renders em dashes plus the server reason for an under-sampled row, never zeros", () => {
    draw(<ModelValidation v={fixture()} />);
    const r = findRow("garch11_var", 1); // the 99% row with 41 forecasts
    expect(within(r).getByText("n_forecasts=41 < min_forecasts=60")).toBeTruthy();
    expect(within(r).getByText("UNAVAILABLE")).toBeTruthy();
    // No fabricated statistics anywhere in the row.
    expect(within(r).queryByText("0.0000")).toBeNull();
    expect(within(r).queryByText("0.00×")).toBeNull();
    // …but the real counts still show: they are WHY the p-values are absent.
    expect(within(r).getByText("41")).toBeTruthy();
    expect(within(r).getByText("1")).toBeTruthy();
  });

  it("renders a zero p-value as a number, not as a missing one", () => {
    draw(<ModelValidation v={fixture()} />);
    // kupiec_p = 0.0 on the RED row is a real, meaningful statistic.
    expect(within(findRow("historical_var", 1)).getByText("0.0000")).toBeTruthy();
  });
});

describe("ModelValidation — the §63 comparison", () => {
  it("renders both p-values, the preference and the criterion VERBATIM", () => {
    const v = fixture();
    draw(<ModelValidation v={v} />);
    // Scope to the comparison box: 0.8842 is ALSO the ewma_var row's Kupiec
    // p, and the point of this assertion is that the comparison restates it
    // from the server's own comparison object rather than reading the table.
    const box = screen.getByText(v.comparison!.criterion).closest("div")!;
    expect(within(box).getByText(/0\.8842/)).toBeTruthy();
    expect(within(box).getByText(/0\.9271/)).toBeTruthy();
    expect(within(box).getByText("GARCH")).toBeTruthy();
  });

  it("maps the server's model-name key to the display word (never renders 'garch_var')", () => {
    const v = fixture();
    draw(<ModelValidation v={v} />);
    const box = screen.getByText(v.comparison!.criterion).closest("div")!;
    // The wire value is "garch_var"; the panel's own heading says
    // "EWMA vs GARCH", so the raw key must never reach the screen.
    expect(within(box).queryByText(/garch_var/)).toBeNull();
    expect(within(box).getByText("GARCH")).toBeTruthy();
  });

  it("maps the EWMA key too", () => {
    const v = fixture({
      comparison: {
        ewma_kupiec_p: 0.91,
        garch_kupiec_p: 0.44,
        preferred: "conditional_var",
        criterion: "EWMA remains the incumbent conditional forecaster.",
      },
    });
    draw(<ModelValidation v={v} />);
    const box = screen.getByText(v.comparison!.criterion).closest("div")!;
    expect(within(box).queryByText(/conditional_var/)).toBeNull();
    expect(within(box).getAllByText("EWMA").length).toBeGreaterThan(0);
  });

  it("says so plainly when neither model earned a preference", () => {
    const v = fixture({
      comparison: {
        ewma_kupiec_p: 0.41,
        garch_kupiec_p: null,
        preferred: null,
        criterion: "Fewer than 250 forecast days — the comparison criterion is not met.",
      },
    });
    draw(<ModelValidation v={v} />);
    expect(screen.getByText(/neither/i)).toBeTruthy();
    expect(
      screen.getByText("Fewer than 250 forecast days — the comparison criterion is not met."),
    ).toBeTruthy();
  });

  it("omits the comparison entirely when the server sent none", () => {
    draw(<ModelValidation v={fixture({ comparison: null })} />);
    expect(screen.queryByText(/EWMA vs GARCH/)).toBeNull();
    // The table is still there — a missing comparison is not a missing run.
    expect(screen.getAllByText("historical_var").length).toBeGreaterThan(0);
  });
});

describe("ModelValidation — empty states", () => {
  it("shows the 'no backtest yet' state when the block is null", () => {
    draw(<ModelValidation v={null} />);
    expect(
      screen.getByText("No backtest yet — runs daily with the scheduled snapshot."),
    ).toBeTruthy();
    // No table, and no fabricated verdict.
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("GREEN")).toBeNull();
  });

  it("still offers 'Run now' with no persisted rows", () => {
    draw(<ModelValidation v={null} />);
    expect(screen.getByRole("button", { name: /run now/i })).toBeTruthy();
  });

  it("shows the empty state when the server sent an empty row list", () => {
    draw(<ModelValidation v={fixture({ rows: [], comparison: null })} />);
    expect(
      screen.getByText("No backtest yet — runs daily with the scheduled snapshot."),
    ).toBeTruthy();
  });
});

describe("ModelValidation — Run now (§47 inline errors)", () => {
  it("posts, then renders the fresh rows the server returned", async () => {
    const res: ValidationRunResponse = {
      as_of: "2026-08-18T15:00:00+00:00",
      rows: [
        row({
          model_name: "historical_var",
          exceedances: 21,
          rate: 0.0603,
          kupiec_p: 0.3812,
          verdict: "GREEN",
        }),
      ],
    };
    validationRun.mockResolvedValue(res);
    draw(<ModelValidation v={fixture()} />);

    await userEvent.click(screen.getByRole("button", { name: /run now/i }));

    await waitFor(() => expect(validationRun).toHaveBeenCalledTimes(1));
    // The endpoint takes no body — the parameters are server-side.
    expect(validationRun.mock.calls[0]).toEqual([]);
    await waitFor(() => {
      // Fresh rows REPLACE the persisted ones: one historical row now, not two.
      expect(screen.getAllByText("historical_var")).toHaveLength(1);
    });
    expect(screen.getByText(/2026-08-18T15:00:00/)).toBeTruthy();
  });

  it("shows a server failure INLINE and keeps the existing rows", async () => {
    validationRun.mockRejectedValue(new Error("book P&L series unavailable: n=12 < window=250"));
    draw(<ModelValidation v={fixture()} />);

    await userEvent.click(screen.getByRole("button", { name: /run now/i }));

    await waitFor(() =>
      expect(
        screen.getByText("book P&L series unavailable: n=12 < window=250"),
      ).toBeTruthy(),
    );
    // The prior record is not discarded because a re-run failed.
    expect(screen.getAllByText("historical_var")).toHaveLength(2);
  });

  it("uses no browser-native dialog on failure", async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    validationRun.mockRejectedValue(new Error("nope"));
    draw(<ModelValidation v={null} />);

    await userEvent.click(screen.getByRole("button", { name: /run now/i }));

    await waitFor(() => expect(screen.getByText("nope")).toBeTruthy());
    expect(alertSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("ModelValidation — bilingual", () => {
  it("renders Chinese chrome while keeping server strings verbatim", async () => {
    store.set("lang", "zh");
    const v = fixture();
    draw(<ModelValidation v={v} />);
    await waitFor(() => expect(screen.getByText(/模型验证/)).toBeTruthy());
    // Verdicts get a real Chinese rendering…
    expect(screen.getAllByText("通过").length).toBeGreaterThan(0);
    expect(screen.getByText("拒绝")).toBeTruthy();
    // …while the server's criterion sentence and model tokens stay verbatim.
    expect(screen.getByText(v.comparison!.criterion)).toBeTruthy();
    expect(screen.getAllByText("historical_var").length).toBe(2);
    expect(screen.getByText("n_forecasts=41 < min_forecasts=60")).toBeTruthy();
  });
});
