import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 900px)";

/**
 * Subscribe to a viewport breakpoint via matchMedia. The 900 px line is the
 * point at which the 260 px Sidebar + grading workspace start to feel
 * cramped — below it we collapse to a single-column layout with the Sidebar
 * docked to the top instead of the left edge.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  return isMobile;
}
