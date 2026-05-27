import { useEffect, useState } from "react";

/**
 * Responsive breakpoint tiers — each device class gets its own
 * layout strategy rather than squeezing a desktop layout into mobile.
 *
 *   desktop  ≥ 1200 px   Full capsule stepper, floating tab capsule, sidebar open
 *   laptop   768–1199 px  ☰ in header (no brand text), stepper compact, sidebar hidden
 *   tablet   481–767 px   ☰ header, stepper mini, ActionBar vertical, nav hidden
 *   mobile   ≤ 480 px     ☰ + avatar only, numbered-circle stepper, cards stacked
 */
export type Breakpoint = "desktop" | "laptop" | "tablet" | "mobile";

function getViewportWidth(): number {
  if (typeof window === "undefined") return 1200;
  const htmlWidth = document.documentElement?.clientWidth ?? 0;
  const visualWidth = window.visualViewport?.width ?? 0;
  return Math.max(window.innerWidth || 0, htmlWidth, visualWidth);
}

function getBreakpoint(): Breakpoint {
  if (typeof window === "undefined") return "desktop";
  const w = getViewportWidth();
  if (w <= 480) return "mobile";
  if (w <= 767) return "tablet";
  if (w <= 1199) return "laptop";
  return "desktop";
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(getBreakpoint);

  useEffect(() => {
    const handler = () => setBp(getBreakpoint());
    handler();
    const raf = window.requestAnimationFrame(handler);
    const timer = window.setTimeout(handler, 100);
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    window.addEventListener("pageshow", handler);
    window.visualViewport?.addEventListener("resize", handler);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
      window.removeEventListener("pageshow", handler);
      window.visualViewport?.removeEventListener("resize", handler);
    };
  }, []);

  return bp;
}
