/**
 * Nav language-switch tests: picking a language flips the UI immediately AND
 * fire-and-forgets a PUT retargeting the server's LLM output language, so
 * newly generated analysis follows the interface language. A failed sync must
 * never block or revert the UI switch.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import Nav from "./Nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// This jsdom build ships no working localStorage (same shim as Term.test).
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

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  store.clear();
  vi.unstubAllGlobals();
});

function renderNav() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <Nav />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("Nav language switch → LLM output language sync", () => {
  it("switching to 中文 flips nav labels and PUTs llm_output_language=zh", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: "中文" }));

    expect(screen.getByText("总览")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/config/providers");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ llm_output_language: "zh" });
  });

  it("re-clicking the active language sends nothing", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed sync leaves the UI switched anyway", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => ({ detail: "backend down" }),
    });
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: "中文" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText("总览")).toBeTruthy();
  });
});
