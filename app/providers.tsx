"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ToastProvider } from "@/components/shared/Toast";
import { LanguageProvider } from "@/lib/i18n";
import { pollIntervalFor } from "@/lib/query-policy";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /**
             * Polling is OPT-IN, per query key — see `lib/query-policy`. A
             * blanket 15s interval re-rendered long research pages under the
             * reader's cursor and threw away their scroll position several
             * times a minute, to re-fetch stored bytes that had not changed.
             */
            refetchInterval: (query) => pollIntervalFor(query.queryKey),
            /**
             * Same reason: refocusing the tab must not reset a page the
             * reader deliberately left open. Live keys still poll on their
             * own timer, so nothing goes stale unnoticed.
             */
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ToastProvider>{children}</ToastProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
