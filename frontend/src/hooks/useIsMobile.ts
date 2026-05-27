import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

function getViewportWidth(): number {
  if (typeof window === "undefined") return 768;
  const htmlWidth = document.documentElement?.clientWidth ?? 0;
  const visualWidth = window.visualViewport?.width ?? 0;
  return Math.max(window.innerWidth || 0, htmlWidth, visualWidth);
}

function getIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return getViewportWidth() <= 767;
}

/**
 * Subscribe to the single-column upload breakpoint.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (!window.matchMedia) return getIsMobile();
    return window.matchMedia(MOBILE_QUERY).matches || getIsMobile();
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsMobile(getIsMobile());
    sync();
    const raf = window.requestAnimationFrame(sync);
    const timer = window.setTimeout(sync, 100);
    const mql = window.matchMedia?.(MOBILE_QUERY);
    const onChange = () => sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener("pageshow", sync);
    window.visualViewport?.addEventListener("resize", sync);
    if (mql?.addEventListener) mql.addEventListener("change", onChange);
    else mql?.addListener(onChange);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("pageshow", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      if (mql?.removeEventListener) mql.removeEventListener("change", onChange);
      else mql?.removeListener(onChange);
    };
  }, []);

  return isMobile;
}
