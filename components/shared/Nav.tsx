"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useLang, type Lang } from "@/lib/i18n";

// IA consolidation 2026-08-20 (user: "页面还是过多"): 11 entries → 7 hubs.
// Research = recommendations + catalysts + watchlist; Trading = pool +
// positions; Oversight = risk + activity — merged as TABS on hub routes;
// the original routes stay reachable for deep links, and `extra` lists the
// legacy prefixes each hub owns so detail pages (/watchlist/AAPL,
// /catalysts/ev-1 …) still highlight their hub.
export const SECTIONS: {
  href: string;
  en: string;
  zh: string;
  extra?: string[];
}[] = [
  { href: "/", en: "Dashboard", zh: "总览" },
  {
    href: "/research",
    en: "Research",
    zh: "研究",
    extra: ["/recommendations", "/catalysts", "/watchlist"],
  },
  { href: "/backtests", en: "Backtests", zh: "回测" },
  {
    href: "/trading",
    en: "Trading",
    zh: "交易",
    extra: ["/trading-pool", "/positions"],
  },
  {
    href: "/oversight",
    en: "Oversight",
    zh: "风控与审计",
    extra: ["/risk", "/activity"],
  },
  { href: "/guide", en: "Guide", zh: "使用指南" },
  { href: "/settings", en: "Settings", zh: "设置" },
];

// Does this nav entry own the current URL? Detail routes (/watchlist/AAPL,
// /catalysts/ev-123) highlight their section entry.
function ownsPrefix(prefix: string, pathname: string): boolean {
  return pathname === prefix || (prefix !== "/" && pathname.startsWith(prefix + "/"));
}

// Hub entries also own the legacy routes they absorbed (`extra` prefixes).
function owns(entry: { href: string; extra?: string[] }, pathname: string): boolean {
  if (ownsPrefix(entry.href, pathname)) return true;
  return (entry.extra ?? []).some((p) => ownsPrefix(p, pathname));
}

const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "zh", label: "中文" },
];

export default function Nav() {
  const pathname = usePathname();
  const { lang, setLang } = useLang();
  const qc = useQueryClient();
  // The UI language is the platform language: switching it also retargets
  // the server-side LLM output language, so NEWLY generated analysis
  // (recommendation summaries, catalyst narrative) follows the interface.
  // Fire-and-forget: the UI switch itself must never block on the backend;
  // a failed sync just leaves the previous generation language in place
  // (visible in Settings → LLM, where it can still be set manually).
  const syncLlmLanguage = useMutation({
    mutationFn: (l: Lang) => api.config.providers.put({ llm_output_language: l }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["provider-connections"] }),
  });
  const pickLang = (l: Lang) => {
    if (l === lang) return;
    setLang(l);
    syncLlmLanguage.mutate(l);
  };
  return (
    <aside className="sidebar">
      <div className="brand">Options Platform</div>
      <nav>
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className={owns(s, pathname) ? "active" : ""}>
            {lang === "zh" ? s.zh : s.en}
          </Link>
        ))}
      </nav>
      <div className="nav-switches">
        <div className="lang-switch-label">{lang === "zh" ? "语言" : "Language"}</div>
        <div className="lang-switch" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l.value}
              type="button"
              className={lang === l.value ? "active" : ""}
              onClick={() => pickLang(l.value)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
