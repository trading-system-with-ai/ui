/**
 * Term explainer + i18n tests: glossary card open/close, bilingual content
 * (EN default, zh via persisted language), unknown-key passthrough, and the
 * one-card-at-a-time rule — against the REAL glossary the app ships.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import Term from "./Term";

// This jsdom build ships no working localStorage; the provider persists the
// language there, so give the window a minimal in-memory one.
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

describe("Term (metric explainer)", () => {
  it("unknown glossary key renders children untouched, no button", () => {
    render(<Term k="not-a-real-key">IV</Term>);
    expect(screen.getByText("IV")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("click opens the English card by default; Escape closes it", async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <Term k="iv">IV</Term>
      </LanguageProvider>,
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.click(screen.getByRole("button", { name: "IV" }));
    const card = screen.getByRole("tooltip");
    expect(card.textContent).toContain("Implied volatility");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("the card portals to document.body so overflow containers can't clip it", async () => {
    // Regression (2026-08-16): rendered inline, the card was clipped by
    // scroll-table ancestors — the last metric row's card was invisible.
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <div style={{ overflow: "auto" }}>
          <Term k="exposure">Exposure</Term>
        </div>
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Exposure" }));
    const card = screen.getByRole("tooltip");
    expect(card.parentElement).toBe(document.body);
  });

  it("persisted lang=zh renders the Simplified Chinese card", async () => {
    window.localStorage.setItem("lang", "zh");
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <Term k="open_interest">OI</Term>
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: "OI" }));
    expect(screen.getByRole("tooltip").textContent).toContain("持仓量");
  });

  it("opening a second card closes the first (one at a time)", async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <Term k="bid">Bid</Term>
        <Term k="ask">Ask</Term>
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Bid" }));
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const cards = screen.getAllByRole("tooltip");
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain("Ask");
  });
});
