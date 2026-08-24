/**
 * ConfirmDateDialog tests — the one path by which an ESTIMATED date becomes
 * a fact (§7, §78).
 *
 * The load-bearing behaviour is what gets SUBMITTED. The server reads an
 * offsetless `scheduled_at` as America/New_York, so the dialog must send the
 * user's ET wall clock unshifted. If it ever sent the browser's zone (or a
 * UTC-normalised instant), a user outside ET would confirm 16:05 ET and the
 * platform would store a different hour — silently reclassifying an
 * after-market release. That is exactly the failure §10 forbids, so it is
 * pinned here rather than trusted.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { EventRow } from "@/lib/types";
import ConfirmDateDialog from "./ConfirmDateDialog";

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

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    event_id: 42,
    event_key: "EARNINGS:NVDA:2026-08-27",
    event_type: "EARNINGS",
    title: "NVDA earnings (estimated from filing cadence)",
    ticker: "NVDA",
    company_id: null,
    scheduled_at_utc: "2026-08-27T20:05:00+00:00",
    scheduled_at_local: "2026-08-27T16:05:00-04:00",
    event_timezone: "America/New_York",
    session: "AFTER_MARKET",
    status: "ESTIMATED",
    is_estimated: true,
    source: "DERIVED",
    source_name: "derived_cadence",
    source_url: null,
    source_event_id: null,
    last_verified_at: null,
    previous_event_id: null,
    comparison_reason: null,
    days_to_event: 8.2,
    lifecycle: "SCHEDULED",
    relevance_tier: "POSITION",
    importance: 90,
    importance_stored: null,
    importance_components: { event_type_base: 60, relevance: 30 },
    importance_raw_total: 90,
    importance_was_clamped: false,
    importance_model_version: "importance-v1",
    series_id: null,
    agency: null,
    release_period: null,
    fiscal_quarter: null,
    fiscal_year: null,
    speaker: null,
    topic: null,
    revision_history: [],
    exposure: null,
    ...overrides,
  };
}

function renderDialog(opts: {
  event?: EventRow;
  pending?: boolean;
  error?: string | null;
} = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <LanguageProvider>
      <ConfirmDateDialog
        event={opts.event ?? makeEvent()}
        onSubmit={onSubmit}
        onClose={onClose}
        pending={opts.pending ?? false}
        error={opts.error ?? null}
      />
    </LanguageProvider>,
  );
  return { onSubmit, onClose };
}

describe("ConfirmDateDialog — submitted value is the ET wall clock, unshifted", () => {
  it("prefills the datetime input from the event's OWN local clock", () => {
    renderDialog();
    const input = screen.getByLabelText(/Scheduled date & time/i) as HTMLInputElement;
    // 16:05 ET, NOT re-expressed in the test runner's zone and NOT the UTC 20:05.
    expect(input.value).toBe("2026-08-27T16:05");
  });

  it("submits the offsetless string verbatim — the server reads it as ET", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();
    await user.click(screen.getByRole("button", { name: /^Confirm date$/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const body = onSubmit.mock.calls[0][0];
    expect(body.scheduled_at).toBe("2026-08-27T16:05");
    expect(body.scheduled_at).not.toContain("Z");
    expect(body.scheduled_at).not.toMatch(/[+-]\d{2}:\d{2}$/);
  });

  it("carries the chosen session so BMO/AMC is asserted, not re-derived", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();
    await user.selectOptions(screen.getByLabelText(/Session/i), "BEFORE_MARKET");
    await user.click(screen.getByRole("button", { name: /^Confirm date$/i }));
    expect(onSubmit.mock.calls[0][0].session).toBe("BEFORE_MARKET");
  });

  it("defaults the session to the event's current one", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();
    await user.click(screen.getByRole("button", { name: /^Confirm date$/i }));
    expect(onSubmit.mock.calls[0][0].session).toBe("AFTER_MARKET");
  });
});

describe("ConfirmDateDialog — the source citation", () => {
  it("sends the URL when one is given", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();
    await user.type(
      screen.getByLabelText(/Source URL/i),
      "https://investor.nvidia.com/events",
    );
    await user.click(screen.getByRole("button", { name: /^Confirm date$/i }));
    expect(onSubmit.mock.calls[0][0].source_url).toBe(
      "https://investor.nvidia.com/events",
    );
  });

  it("omits the field rather than sending an empty string when left blank", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();
    await user.click(screen.getByRole("button", { name: /^Confirm date$/i }));
    expect(onSubmit.mock.calls[0][0].source_url).toBeUndefined();
  });

  it("stays OPTIONAL — a missing citation must not push the user back to the estimate", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();
    const submit = screen.getByRole("button", { name: /^Confirm date$/i });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("ConfirmDateDialog — states", () => {
  it("shows the server's 422 message VERBATIM, never paraphrased", () => {
    renderDialog({ error: "unknown session 'AFTER'; expected one of [...]" });
    expect(
      screen.getByText("unknown session 'AFTER'; expected one of [...]"),
    ).toBeTruthy();
  });

  it("pending disables both actions so a double-submit cannot fire", () => {
    renderDialog({ pending: true });
    const submit = screen.getByRole("button", { name: /Confirming…/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^Cancel$/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("Cancel closes without submitting anything", async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderDialog();
    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is a real ARIA dialog (Modal), not a native prompt", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("states the current ESTIMATED date so the user sees what they are replacing", () => {
    renderDialog();
    expect(screen.getByText(/Currently ESTIMATED for/i)).toBeTruthy();
  });

  it("names the timezone the field is interpreted in", () => {
    renderDialog();
    expect(screen.getByText(/America\/New_York/)).toBeTruthy();
  });

  it("renders bilingually when the persisted language is zh", () => {
    store.set("lang", "zh");
    renderDialog();
    expect(screen.getByRole("button", { name: /^确认日期$/ })).toBeTruthy();
    expect(screen.getByText(/当前为估算日期/)).toBeTruthy();
  });
});
