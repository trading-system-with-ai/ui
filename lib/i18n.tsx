"use client";

/**
 * Lightweight i18n: English + Simplified Chinese.
 *
 * Scope by design: UI chrome (navigation, labels, the metric glossary) is
 * bilingual; SERVER-GENERATED strings (gate details, fail reasons, audit
 * text) stay verbatim English — they are audit-worthy exact records the UI
 * must never paraphrase (§26/§36), translation included.
 *
 * The language persists in localStorage ("lang"). Default: en.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "zh";

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "en",
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    // try/catch: storage can be absent or throw (Safari private mode, test
    // environments). Language then simply defaults to "en" per session.
    try {
      const stored = window.localStorage.getItem("lang");
      if (stored === "zh" || stored === "en") setLangState(stored);
    } catch {
      /* no persisted language */
    }
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem("lang", l);
    } catch {
      /* switch still applies for this session */
    }
  }, []);
  return (
    <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

/** Pick the active language's variant of a two-string pair. */
export function useT() {
  const { lang } = useLang();
  return useCallback(
    (en: string, zh: string) => (lang === "zh" ? zh : en),
    [lang],
  );
}
