"use client";

import { useQuery } from "@tanstack/react-query";
import { api, retryUnlessTerminal } from "./api";

/**
 * §16 data-plan capabilities, shared by every surface that adapts to what the
 * Massive plan actually includes (the Settings panel, the option-chain
 * context notes). One cache entry for the whole app: the server itself caches
 * the probe for ~5 minutes, so staleTime matches and refocus refetches stay
 * quiet. The 503 (no provider configured) is terminal for this render —
 * retrying only delays the honest not-configured state.
 */
export function useCapabilities() {
  return useQuery({
    queryKey: ["market-capabilities"],
    // Explicit arrow: useQuery passes a QueryFunctionContext as the first
    // argument, which would land in capabilities()' truthy `refresh` param
    // and bypass the server's probe cache on every fetch.
    queryFn: () => api.market.capabilities(),
    staleTime: 5 * 60_000,
    retry: retryUnlessTerminal,
  });
}
