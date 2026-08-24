/**
 * Phase D stress engine (SHADOW) — component tests against a fixture that
 * mirrors the §8.5 gateway contract, INCLUDING the shapes that are easiest
 * to render dishonestly:
 *   - a HISTORICAL row that is UNAVAILABLE because its window falls outside
 *     the stored history (null P&L, dates in the server `reason`) while the
 *     RUN health stays ACTIVE — the worst health among rows that PRICED;
 *   - the whole hypothetical grid with `validated: false`;
 *   - a DEGRADED row whose coverage mixes FULL_REVAL and DELTA_LINEAR;
 *   - a positive-P&L row (a scenario the book GAINS in);
 *   - a stress-view `positions_excluded` gap list.
 *
 * What these tests pin (the rules that are cheap to break in a refactor):
 *   1. Signs are the server's — `pnl_usd` is gain-positive, and a loss
 *      renders NEGATIVE. Nothing here negates a server number.
 *   2. Honest nulls — an UNAVAILABLE row shows an em dash plus its own
 *      reason (with the real dates), never 0.
 *   3. `validated: false` always carries the UNVALIDATED badge.
 *   4. Method coverage travels with the number.
 *   5. The WORST row is the SERVER's pick, highlighted where the server put
 *      it — never re-sorted and never recomputed client-side.
 *   6. SHADOW is stated on screen.
 *   7. The user-scenario form validates to the documented ranges, shows
 *      errors INLINE (§47 — no native dialog), and appends the row the
 *      server returned.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { StressBlock, StressRow, StressRunResponse } from "@/lib/types";

// The form calls api.risk.stressRun; the module is mocked so no fetch runs.
const stressRun = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { risk: { stressRun: (...a: unknown[]) => stressRun(...a) } },
}));

import StressScenarios from "./StressScenarios";

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
  stressRun.mockReset();
});

afterEach(() => {
  cleanup();
  store.clear();
});

function draw(node: React.ReactElement) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

/* ---------------------------------------------------------------- fixtures */

/** The row the server picked as worst — a real reprice on a mixed book. */
const WORST_ROW: StressRow = {
  name: "Equity -10% / IV +40%",
  kind: "HYPOTHETICAL",
  validated: false,
  pnl_usd: -4210.5,
  pnl_pct_nav: -0.042,
  loss_usd: 4210.5,
  loss_pct_nav: 0.042,
  method_coverage: { FULL_REVAL: 3, DELTA_LINEAR: 1 },
  health: "DEGRADED",
  reason: "AAPL#12: no iv0 — priced DELTA_LINEAR (provider chain had no IV)",
  params: {
    spot_shock: -0.1,
    iv_shock: 0.4,
    iv_shock_source: "SPECIFIED",
    days_forward: 0.0,
    uniform_beta_1: true,
    source: "CATALOGUE",
    validated: false,
  },
};

function fixture(overrides: Partial<StressBlock> = {}): StressBlock {
  return {
    mode: "SHADOW",
    catalogue_version: "d.1",
    model_version: "1.0.0",
    health: "DEGRADED",
    reason: null,
    n_stock_legs: 1,
    n_option_legs: 3,
    method_coverage: { FULL_REVAL: 3, DELTA_LINEAR: 1 },
    rows: [
      {
        name: "2024-08-05 vol spike",
        kind: "HISTORICAL",
        validated: true,
        pnl_usd: -2870.25,
        pnl_pct_nav: -0.0287,
        loss_usd: 2870.25,
        loss_pct_nav: 0.0287,
        method_coverage: { FULL_REVAL: 3, DELTA_LINEAR: 1 },
        health: "ACTIVE",
        reason: null,
        params: { spot_shock: -0.062, iv_shock: 0.83, iv_shock_source: "RV_PROXY" },
      },
      {
        // A named window OUTSIDE the stored history: an UNAVAILABLE ROW with
        // its dates in the reason — NOT a failed run.
        name: "2025-04 tariff drawdown",
        kind: "HISTORICAL",
        validated: true,
        pnl_usd: null,
        pnl_pct_nav: null,
        loss_usd: null,
        loss_pct_nav: null,
        method_coverage: {},
        health: "UNAVAILABLE",
        reason:
          "window 2025-04-02 → 2025-04-08 is outside the stored history (2025-06-02 → 2026-08-14)",
        params: null,
      },
      WORST_ROW,
      {
        // The book GAINS here — a positive P&L must not be painted as a loss.
        name: "Equity +5% / IV -15%",
        kind: "HYPOTHETICAL",
        validated: false,
        pnl_usd: 1180.75,
        pnl_pct_nav: 0.0118,
        loss_usd: -1180.75,
        loss_pct_nav: -0.0118,
        method_coverage: { FULL_REVAL: 4 },
        health: "ACTIVE",
        reason: null,
        params: null,
      },
      {
        name: "IV crush (flat, -40%)",
        kind: "IV_GRID",
        validated: false,
        pnl_usd: -1990.0,
        pnl_pct_nav: -0.0199,
        loss_usd: 1990.0,
        loss_pct_nav: 0.0199,
        method_coverage: { FULL_REVAL: 3, DELTA_LINEAR: 1 },
        health: "ACTIVE",
        reason: null,
        params: null,
      },
    ],
    worst: WORST_ROW,
    per_position: { "AAPL#12": -1200.0, "MSFT#7": -3010.5 },
    positions_excluded: [
      {
        key: "NVDA#3",
        reason: "contract NVDA260918C00150000 missing from today's chain — no stress leg",
      },
    ],
    ...overrides,
  };
}

function userResponse(row: Partial<StressRow> = {}): StressRunResponse {
  return {
    mode: "SHADOW",
    as_of: "2026-08-18T14:31:00+00:00",
    run_id: 41,
    nav: 100000,
    n_stock_legs: 1,
    n_option_legs: 3,
    positions_excluded: [],
    per_position: {},
    note: "SHADOW: a read of the current book under a hypothesis.",
    scenario: {
      name: "User: equity -15.0% / IV +60% / +5d",
      kind: "USER",
      validated: false,
      pnl_usd: -7325.5,
      pnl_pct_nav: -0.0733,
      loss_usd: 7325.5,
      loss_pct_nav: 0.0733,
      method_coverage: { FULL_REVAL: 3, DELTA_LINEAR: 1 },
      health: "DEGRADED",
      reason: null,
      params: null,
      ...row,
    },
  };
}

/* ---------------------------------------------------------------- tests */

describe("StressScenarios — the catalogue table", () => {
  it("states SHADOW on screen and pins the catalogue/model versions", () => {
    draw(<StressScenarios stress={fixture()} />);
    expect(screen.getAllByText("SHADOW").length).toBeGreaterThan(0);
    expect(screen.getByText(/catalogue d\.1/)).toBeTruthy();
    expect(screen.getByText(/model 1\.0\.0/)).toBeTruthy();
    // The book behind the numbers, not a position count.
    expect(screen.getByText(/1 stock \/ 3 option legs/)).toBeTruthy();
  });

  it("renders the server's sign: a loss is NEGATIVE, a gain is positive", () => {
    draw(<StressScenarios stress={fixture()} />);
    // -4210.5 formatted as USD with the minus the server sent.
    expect(screen.getByText("-$4,211")).toBeTruthy();
    expect(screen.getByText("-4.20%")).toBeTruthy();
    // The scenario the book GAINS in stays positive — never flipped.
    expect(screen.getByText("$1,181")).toBeTruthy();
    expect(screen.getByText("1.18%")).toBeTruthy();
  });

  it("shows an UNAVAILABLE window as an em dash plus its verbatim reason, never 0", () => {
    draw(<StressScenarios stress={fixture()} />);
    const row = screen.getByText("2025-04 tariff drawdown").closest("tr")!;
    expect(
      within(row).getByText(
        "window 2025-04-02 → 2025-04-08 is outside the stored history (2025-06-02 → 2026-08-14)",
      ),
    ).toBeTruthy();
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(within(row).queryByText("$0")).toBeNull();
    expect(within(row).getByText("UNAVAILABLE")).toBeTruthy();
  });

  it("badges every unvalidated scenario and leaves validated ones unbadged", () => {
    draw(<StressScenarios stress={fixture()} />);
    // Three unvalidated rows in the fixture: two HYPOTHETICAL, one IV_GRID.
    expect(screen.getAllByText("UNVALIDATED")).toHaveLength(3);
    const historical = screen.getByText("2024-08-05 vol spike").closest("tr")!;
    expect(within(historical).queryByText("UNVALIDATED")).toBeNull();
  });

  it("keeps the method coverage next to the number it qualifies", () => {
    draw(<StressScenarios stress={fixture()} />);
    // The worst scenario's name also appears in the summary line below the
    // table, so scope by ROW rather than by the first match.
    const row = document.querySelector('tr[data-worst="true"]') as HTMLElement;
    // enumLabel renders EN tokens with spaces ("FULL_REVAL" -> "FULL REVAL").
    expect(within(row).getByText("FULL REVAL")).toBeTruthy();
    expect(within(row).getByText("DELTA LINEAR")).toBeTruthy();
    // A zero-count method is dropped rather than printed as "0 DELTA_LINEAR".
    const gain = screen.getByText("Equity +5% / IV -15%").closest("tr")!;
    expect(within(gain).getByText("FULL REVAL")).toBeTruthy();
    expect(within(gain).queryByText("DELTA LINEAR")).toBeNull();
  });

  it("highlights the SERVER's worst row where the server put it, without re-sorting", () => {
    draw(<StressScenarios stress={fixture()} />);
    const marked = document.querySelectorAll('tr[data-worst="true"]');
    expect(marked).toHaveLength(1);
    expect(within(marked[0] as HTMLElement).getByText("WORST")).toBeTruthy();
    // Catalogue order preserved: the historical rows still come first.
    const names = Array.from(document.querySelectorAll("tbody tr")).map(
      (tr) => tr.querySelector("td")?.textContent ?? "",
    );
    expect(names[0]).toContain("2024-08-05 vol spike");
    expect(names[1]).toContain("2025-04 tariff drawdown");
  });

  it("restates the worst row's loss in the VaR/ES sign using the server's own field", () => {
    draw(<StressScenarios stress={fixture()} />);
    // loss_usd = +4210.5 (positive = money lost) — sent by the server, not
    // derived here from pnl_usd.
    expect(screen.getByText(/loss \$4,211 in the VaR\/ES sign/)).toBeTruthy();
  });

  it("lists the stress view's OWN excluded positions with the server reason", () => {
    draw(<StressScenarios stress={fixture()} />);
    expect(screen.getByText("NVDA#3")).toBeTruthy();
    expect(
      screen.getByText(
        "contract NVDA260918C00150000 missing from today's chain — no stress leg",
      ),
    ).toBeTruthy();
  });

  it("keeps run health ACTIVE when only an out-of-history window is UNAVAILABLE", () => {
    // The server's rule: run health is the worst among rows that PRICED.
    draw(<StressScenarios stress={fixture({ health: "ACTIVE", reason: null })} />);
    const badges = screen.getAllByText("ACTIVE");
    expect(badges.length).toBeGreaterThan(0);
    // The UNAVAILABLE row still shows its own health on its own line.
    const row = screen.getByText("2025-04 tariff drawdown").closest("tr")!;
    expect(within(row).getByText("UNAVAILABLE")).toBeTruthy();
  });

  it("shows an honest empty state, with the server's reason, when no scenario ran", () => {
    draw(
      <StressScenarios
        stress={fixture({
          rows: [],
          worst: null,
          health: "UNAVAILABLE",
          reason: "no open position has a priceable stress leg",
        })}
      />,
    );
    expect(
      screen.getAllByText("no open position has a priceable stress leg").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("WORST")).toBeNull();
  });

  it("renders the Chinese scenario-kind vocabulary, which the shared enum table omits", () => {
    // "HISTORICAL" already means the VaR estimator family in the shared
    // table, so scenario kinds carry their OWN vocabulary here.
    store.set("lang", "zh");
    draw(<StressScenarios stress={fixture()} />);
    expect(screen.getAllByText("历史情景").length).toBe(2);
    expect(screen.getAllByText("假设情景").length).toBe(2);
    expect(screen.getByText("波动率网格")).toBeTruthy();
    // Server strings stay VERBATIM English even in Chinese (§26/§36).
    expect(screen.getByText("2024-08-05 vol spike")).toBeTruthy();
    expect(
      screen.getByText(
        "window 2025-04-02 → 2025-04-08 is outside the stored history (2025-06-02 → 2026-08-14)",
      ),
    ).toBeTruthy();
  });

  it("survives a mid-rollout block that omits every optional field", () => {
    // Only the four fields the type requires; nothing may crash.
    const minimal = {
      rows: [],
      worst: null,
      health: "UNAVAILABLE",
      catalogue_version: "d.1",
    } as StressBlock;
    expect(() => draw(<StressScenarios stress={minimal} />)).not.toThrow();
    expect(screen.getByText(/catalogue d\.1/)).toBeTruthy();
    expect(screen.getByText(/0 stock \/ 0 option legs/)).toBeTruthy();
  });
});

describe("StressScenarios — the user-defined scenario form (§26/§51)", () => {
  it("converts percent inputs to the fractional, RELATIVE shocks the API takes", async () => {
    const user = userEvent.setup();
    stressRun.mockResolvedValue(userResponse());
    draw(<StressScenarios stress={fixture()} />);

    const equity = screen.getByLabelText("Equity shock in percent");
    const iv = screen.getByLabelText("IV shock in relative percent");
    const days = screen.getByLabelText("Days forward");
    await user.clear(equity);
    await user.type(equity, "-15");
    await user.clear(iv);
    await user.type(iv, "60");
    await user.clear(days);
    await user.type(days, "5");
    await user.click(screen.getByRole("button", { name: "Run scenario" }));

    await waitFor(() => expect(stressRun).toHaveBeenCalledTimes(1));
    expect(stressRun).toHaveBeenCalledWith({
      equity_shock: -0.15,
      iv_shock: 0.6,
      days_forward: 5,
    });
  });

  it("appends the row the server returned, badged USER and UNVALIDATED", async () => {
    const user = userEvent.setup();
    stressRun.mockResolvedValue(userResponse());
    draw(<StressScenarios stress={fixture()} />);
    await user.click(screen.getByRole("button", { name: "Run scenario" }));

    await waitFor(() =>
      expect(screen.getByText("User: equity -15.0% / IV +60% / +5d")).toBeTruthy(),
    );
    const row = screen.getByText("User: equity -15.0% / IV +60% / +5d").closest("tr")!;
    expect(within(row).getByText("USER")).toBeTruthy();
    expect(within(row).getByText("UNVALIDATED")).toBeTruthy();
    expect(within(row).getByText("-$7,326")).toBeTruthy();
    // A user hypothesis never becomes the catalogue's worst row.
    expect(document.querySelectorAll('tr[data-worst="true"]')).toHaveLength(1);
  });

  it("rejects an out-of-range shock INLINE and never calls the API", async () => {
    const user = userEvent.setup();
    draw(<StressScenarios stress={fixture()} />);
    const equity = screen.getByLabelText("Equity shock in percent");
    await user.clear(equity);
    await user.type(equity, "-95"); // −0.95 < the documented −0.9 floor
    await user.click(screen.getByRole("button", { name: "Run scenario" }));

    expect(
      await screen.findByText("Equity shock must be between -90% and 200%."),
    ).toBeTruthy();
    expect(stressRun).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range IV shock and a bad day count inline", async () => {
    const user = userEvent.setup();
    draw(<StressScenarios stress={fixture()} />);
    const iv = screen.getByLabelText("IV shock in relative percent");
    const days = screen.getByLabelText("Days forward");
    await user.clear(iv);
    await user.type(iv, "900"); // 9.0 > the documented 5.0 ceiling
    await user.clear(days);
    await user.type(days, "400");
    await user.click(screen.getByRole("button", { name: "Run scenario" }));

    expect(
      await screen.findByText("IV shock must be between -90% and 500%."),
    ).toBeTruthy();
    expect(screen.getByText("Days forward must be between 0 and 365.")).toBeTruthy();
    expect(stressRun).not.toHaveBeenCalled();
  });

  it("renders the server's 422 text verbatim, inline — no native dialog", async () => {
    const user = userEvent.setup();
    stressRun.mockRejectedValue(
      new Error("equity_shock: Input should be greater than or equal to -0.9"),
    );
    draw(<StressScenarios stress={fixture()} />);
    await user.click(screen.getByRole("button", { name: "Run scenario" }));

    expect(
      await screen.findByText("equity_shock: Input should be greater than or equal to -0.9"),
    ).toBeTruthy();
  });

  it("sends an optional name only when the user typed one", async () => {
    const user = userEvent.setup();
    stressRun.mockResolvedValue(userResponse({ name: "My crash" }));
    draw(<StressScenarios stress={fixture()} />);
    await user.type(screen.getByLabelText("Scenario name"), "My crash");
    await user.click(screen.getByRole("button", { name: "Run scenario" }));

    await waitFor(() => expect(stressRun).toHaveBeenCalledTimes(1));
    expect(stressRun.mock.calls[0][0]).toMatchObject({ name: "My crash" });
  });
});
