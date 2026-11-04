import { useEffect } from "react";

export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const style = document.documentElement.style;
    let frame = 0;
    const update = () => {
      // Zoom manual deve ampliar a página sem reorganizar os formulários.
      if (viewport.scale !== 1) return;
      style.setProperty("--viewport-height", `${viewport.height}px`);
      style.setProperty("--viewport-top", `${viewport.offsetTop}px`);
      style.setProperty("--viewport-bottom", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    };
    const revealInput = (event: Event) => {
      if (viewport.scale !== 1) return;
      update();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const input = document.activeElement;
        if (!(input instanceof HTMLElement) || !input.matches("input, textarea, [contenteditable='true']")) return;
        if (event.type === "click" && event.target !== input) return;
        const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
        input.scrollIntoView({ block: "start", inline: "nearest", behavior });
      });
    };

    update();
    viewport.addEventListener("resize", revealInput);
    viewport.addEventListener("scroll", update);
    document.addEventListener("focusin", revealInput);
    document.addEventListener("click", revealInput);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", revealInput);
      viewport.removeEventListener("scroll", update);
      document.removeEventListener("focusin", revealInput);
      document.removeEventListener("click", revealInput);
      style.removeProperty("--viewport-height");
      style.removeProperty("--viewport-top");
      style.removeProperty("--viewport-bottom");
    };
  }, []);
}
