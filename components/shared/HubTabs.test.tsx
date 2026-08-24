/**
 * Hub tab shell (IA consolidation 2026-08-20): ?tab= initializes the
 * active tab on mount (window.location pattern), switching renders the
 * chosen tab and updates the URL without navigation.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
  // the jsdom harness has no App Router; mirror ?tab= from the real URL so
  // both the mount path and the navigation path read the same source
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { LanguageProvider } from "@/lib/i18n";
import HubTabs from "./HubTabs";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const TABS = [
  { id: "a", en: "Alpha", zh: "甲", render: () => <p>alpha-content</p> },
  { id: "b", en: "Beta", zh: "乙", render: () => <p>beta-content</p> },
];

function wrap(ui: React.ReactNode) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("HubTabs", () => {
  it("renders the default tab and switches on click", async () => {
    wrap(<HubTabs tabs={TABS} defaultTab="a" />);
    expect(screen.getByText("alpha-content")).toBeTruthy();
    expect(screen.queryByText("beta-content")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(screen.getByText("beta-content")).toBeTruthy();
    expect(window.location.search).toContain("tab=b");
  });

  it("initializes from ?tab= on mount", () => {
    window.history.replaceState(null, "", "/?tab=b");
    wrap(<HubTabs tabs={TABS} defaultTab="a" />);
    expect(screen.getByText("beta-content")).toBeTruthy();
  });

  it("falls back to default on an unknown ?tab=", () => {
    window.history.replaceState(null, "", "/?tab=zzz");
    wrap(<HubTabs tabs={TABS} defaultTab="a" />);
    expect(screen.getByText("alpha-content")).toBeTruthy();
  });
});
