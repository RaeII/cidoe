import { useEffect } from "react";
import type { CreateTypes, Options } from "canvas-confetti";

/** Uma celebração por abertura; canvas próprio evita clipping e sobreposição com outros efeitos. */
export function RewardConfetti() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let canvas: HTMLCanvasElement | undefined;
    let fire: CreateTypes | undefined;
    const timer = window.setTimeout(() => {
      void import("canvas-confetti").then(({ default: confetti }) => {
        if (cancelled || document.hidden) return;
        const tokens = getComputedStyle(document.documentElement);
        const colors = ["--color-ambar", "--color-verde", "--color-papel"]
          .map((token) => tokens.getPropertyValue(token).trim());
        // Canvas novo a cada efeito: OffscreenCanvas não pode ser transferido duas vezes no StrictMode.
        canvas = document.createElement("canvas");
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60";
        document.body.appendChild(canvas);
        fire = confetti.create(canvas, { resize: true, useWorker: true, disableForReducedMotion: true });
        const options: Options = {
          colors, shapes: ["square"], origin: { x: 0.5, y: 0.7 }, ticks: 200,
        };
        // Realistic Look: cinco camadas nas proporções do exemplo, com 300 partículas no total.
        void fire({ ...options, particleCount: 75, spread: 26, startVelocity: 55 });
        void fire({ ...options, particleCount: 60, spread: 60 });
        void fire({ ...options, particleCount: 105, spread: 100, decay: 0.91, scalar: 0.8 });
        void fire({ ...options, particleCount: 30, spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
        return fire({ ...options, particleCount: 30, spread: 120, startVelocity: 45 })
          ?.then(() => canvas?.remove());
      }).catch((error: unknown) => {
        canvas?.remove();
        console.warn("Não foi possível exibir o confete", error);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      fire?.reset();
      canvas?.remove();
    };
  }, []);
  return null;
}
