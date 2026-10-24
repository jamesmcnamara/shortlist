// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConfetti } from "./useConfetti";

const { fire, create } = vi.hoisted(() => {
  const fire = Object.assign(vi.fn(), { reset: vi.fn() });
  return { fire, create: vi.fn(() => fire) };
});

vi.mock("canvas-confetti", () => ({ default: { create } }));

beforeEach(() => {
  fire.mockReturnValue(null);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useConfetti", () => {
  it("fires three bold bursts on a viewport-sized, non-interactive canvas", () => {
    const { result } = renderHook(() => useConfetti());
    expect(document.querySelector("canvas")).toBeNull();

    act(() => result.current());

    const canvas = document.querySelector("canvas");
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
    expect(canvas?.style.position).toBe("fixed");
    expect(canvas?.style.width).toBe("100%");
    expect(canvas?.style.height).toBe("100%");
    expect(canvas?.style.pointerEvents).toBe("none");
    expect(create).toHaveBeenCalledWith(canvas, {
      resize: true,
      useWorker: true,
      disableForReducedMotion: true,
    });
    expect(fire).toHaveBeenCalledTimes(3);
    expect(fire.mock.calls.map(([options]) => options.particleCount)).toEqual([
      160, 160, 180,
    ]);
    expect(fire.mock.calls.map(([options]) => options.origin.x)).toEqual([
      0.05, 0.95, 0.5,
    ]);
    fire.mock.calls.forEach(([options]) => {
      expect(options.scalar).toBeGreaterThan(1);
      expect(options.ticks).toBe(240);
    });
  });

  it("reuses its canvas for repeated celebrations and cleans up on unmount", () => {
    const { result, rerender, unmount } = renderHook(() => useConfetti());
    const celebrate = result.current;
    act(() => celebrate());
    rerender();
    expect(result.current).toBe(celebrate);
    act(() => result.current());

    expect(create).toHaveBeenCalledOnce();
    expect(document.querySelectorAll("canvas")).toHaveLength(1);
    expect(fire).toHaveBeenCalledTimes(6);

    unmount();
    expect(fire.reset).toHaveBeenCalledOnce();
    expect(document.querySelector("canvas")).toBeNull();
    act(() => celebrate());
    expect(create).toHaveBeenCalledOnce();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("checks reduced motion on every celebration without creating a canvas", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const { result } = renderHook(() => useConfetti());
    act(() => result.current());

    expect(window.matchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
    expect(create).not.toHaveBeenCalled();
    expect(fire).not.toHaveBeenCalled();
    expect(document.querySelector("canvas")).toBeNull();

    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    act(() => result.current());
    expect(fire).toHaveBeenCalledTimes(3);

    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    act(() => result.current());
    expect(fire).toHaveBeenCalledTimes(3);
  });

  it("removes a finished canvas and starts fresh for the next celebration", async () => {
    const finished = Promise.withResolvers<null>();
    fire.mockReturnValue(finished.promise);
    const { result } = renderHook(() => useConfetti());
    act(() => result.current());
    const canvas = document.querySelector("canvas");

    await act(async () => finished.resolve(null));
    expect(document.querySelector("canvas")).toBeNull();

    act(() => result.current());
    expect(create).toHaveBeenCalledTimes(2);
    expect(document.querySelector("canvas")).not.toBe(canvas);
  });
});
