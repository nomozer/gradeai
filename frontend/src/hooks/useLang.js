import { useCallback, useState } from "react";

const KEY = "hitl_lang";

export function useLang(fallback = "en") {
  const [lang, setLangState] = useState(
    () => localStorage.getItem(KEY) || fallback,
  );

  const toggle = useCallback(() => {
    setLangState((prev) => {
      const next = prev === "en" ? "vi" : "en";
      localStorage.setItem(KEY, next);
      return next;
    });
  }, []);

  return { lang, toggle };
}
