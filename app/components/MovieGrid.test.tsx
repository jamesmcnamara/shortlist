// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Nomination } from "@/src/db/schema";
import { MovieGrid, type MovieAnimation } from "./MovieGrid";

const mocks = vi.hoisted(() => ({
  reducedMotion: false,
  animate: vi.fn(() => ({ stop: vi.fn() })),
}));

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => mocks.reducedMotion,
  useAnimate: () => [useRef(null), mocks.animate],
}));

beforeEach(() => {
  mocks.reducedMotion = false;
  mocks.animate.mockClear();
});
afterEach(cleanup);

const nominations = (ids: number[]) => ids.map((id) => ({ id }) as Nomination);
const grid = (ids: number[], animation: MovieAnimation) => (
  <MovieGrid nominees={nominations(ids)} animation={animation}>
    {(nom, index) => (
      <button data-testid={`movie-${nom.id}`}>
        {nom.id}: rank {index + 1}
      </button>
    )}
  </MovieGrid>
);

describe("movie grid animations", () => {
  it.each(["glide", "spring", "fade", "off"] as const)(
    "preserves movie identity through additions, sorting and filtering in %s mode",
    async (animation) => {
      const { rerender } = render(grid([1, 2, 3], animation));
      const original = screen.getByTestId("movie-2");
      rerender(grid([4, 3, 2, 1], animation));
      expect(screen.getByTestId("movie-2")).toBe(original);
      expect(original.textContent).toBe("2: rank 3");
      rerender(grid([2, 4], animation));
      expect(screen.getByTestId("movie-2")).toBe(original);
      await waitFor(() => expect(screen.queryByTestId("movie-1")).toBeNull());
      expect(
        screen.getAllByRole("button").map((button) => button.textContent),
      ).toEqual(["2: rank 1", "4: rank 2"]);
      rerender(grid([], animation));
      await waitFor(() =>
        expect(screen.queryAllByRole("button")).toHaveLength(0),
      );
    },
  );

  it("makes exiting cards inert and handles a filter being quickly cleared", async () => {
    const { rerender } = render(grid([1, 2], "glide"));
    rerender(grid([2], "glide"));
    expect(
      screen.getByTestId("movie-1").parentElement?.hasAttribute("inert"),
    ).toBe(true);
    rerender(grid([1, 2], "glide"));
    await waitFor(() =>
      expect(
        screen.getByTestId("movie-1").parentElement?.hasAttribute("inert"),
      ).toBe(false),
    );
  });

  it("fades reorders, but not initial render or unrelated updates", () => {
    const { rerender } = render(grid([1, 2], "fade"));
    expect(mocks.animate).not.toHaveBeenCalled();
    rerender(grid([1, 2], "fade"));
    expect(mocks.animate).not.toHaveBeenCalled();
    rerender(grid([2, 1], "fade"));
    expect(mocks.animate).toHaveBeenCalledOnce();
  });

  it("turns off fade and entrance effects for reduced motion", () => {
    mocks.reducedMotion = true;
    const { rerender } = render(grid([1], "fade"));
    rerender(grid([2, 1], "fade"));
    expect(mocks.animate).not.toHaveBeenCalled();
    expect(screen.getByTestId("movie-2").parentElement?.style.opacity).toBe(
      "1",
    );
  });
});
