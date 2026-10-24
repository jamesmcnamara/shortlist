"use client";

import confetti from "canvas-confetti";
import { useCallback, useEffect, useRef } from "react";

export function useConfetti() {
  const isMounted = useRef(false);
  const animation = useRef<{
    canvas: HTMLCanvasElement;
    fire: confetti.CreateTypes;
  } | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      animation.current?.fire.reset();
      animation.current?.canvas.remove();
      animation.current = null;
    };
  }, []);

  return useCallback(() => {
    if (
      !isMounted.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    if (!animation.current) {
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      Object.assign(canvas.style, {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: "1000",
      });
      document.body.appendChild(canvas);
      animation.current = {
        canvas,
        fire: confetti.create(canvas, {
          resize: true,
          useWorker: true,
          disableForReducedMotion: true,
        }),
      };
    }

    const options: confetti.Options = {
      colors: ["#386d87", "#f4b942", "#ed6a5a", "#a978d4", "#8fbaca"],
      scalar: 1.4,
      ticks: 240,
      gravity: 0.9,
      spread: 85,
      startVelocity: 65,
    };

    const current = animation.current;
    void current.fire({
      ...options,
      particleCount: 160,
      angle: 60,
      origin: { x: 0.05, y: 0.8 },
    });
    void current.fire({
      ...options,
      particleCount: 160,
      angle: 120,
      origin: { x: 0.95, y: 0.8 },
    });
    const finished = current.fire({
      ...options,
      particleCount: 180,
      spread: 120,
      startVelocity: 45,
      origin: { x: 0.5, y: 0.55 },
    });
    void finished?.then(() => {
      if (animation.current === current) {
        current.canvas.remove();
        animation.current = null;
      }
    });
  }, []);
}
