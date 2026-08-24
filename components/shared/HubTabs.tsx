"use client";

/**
 * Hub-page tab shell (IA consolidation 2026-08-20: 11 nav entries → 7).
 *
 * A hub renders EXISTING page components under tabs — zero content
 * forking, the old routes stay reachable for deep links. The active tab
 * follows ?tab= BOTH on mount and on client navigations (verifier catch:
 * a same-hub <Link> like FlowNav's "8 Audit" changes only the query
 * string, which never remounts the page — useSearchParams is the signal
 * that fires then; hub pages wrap this shell in <Suspense> as the App
 * Router requires). Local tab clicks update state directly and mirror
 * the URL with history.replaceState so hub links stay shareable.
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";

export interface HubTab {
  id: string;
  en: string;
  zh: string;
  render: () => ReactNode;
}

export default function HubTabs({ tabs, defaultTab }: { tabs: HubTab[]; defaultTab: string }) {
  const t = useT();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(defaultTab);
  useEffect(() => {
    const q = searchParams?.get("tab");
    if (q && tabs.some((x) => x.id === q)) setTab(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const pick = (id: string) => {
    setTab(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* URL not updated; the tab still switches */
    }
  };
  const active = tabs.find((x) => x.id === tab) ?? tabs[0];
  return (
    <>
      <div className="tabs" style={{ marginBottom: 4 }}>
        {tabs.map((x) => (
          <button
            key={x.id}
            className={active.id === x.id ? "active" : ""}
            onClick={() => pick(x.id)}
          >
            {t(x.en, x.zh)}
          </button>
        ))}
      </div>
      {active.render()}
    </>
  );
}
