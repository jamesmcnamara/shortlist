// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Movie, MovieDetails } from "@/src/db/schema";
import { SWRConfig } from "swr";
import { Compare } from "./Compare";

const movie = {
  id: 7,
  tmdbId: 157336,
  createdAt: new Date(),
  details: { id: 157336, title: "Interstellar" } as MovieDetails,
  ratings: { services: [], raw: {} },
} satisfies Movie;

function renderCompare() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ updatedThrough: 2025, movies: {} })),
  );
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <Compare initialMovies={[movie]} />
    </SWRConfig>,
  );
}

describe("Compare", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("links each poster to its movie detail page", () => {
    renderCompare();

    expect(
      screen.getByRole("link", { name: "Interstellar" }).getAttribute("href"),
    ).toBe("/m/7");
  });

  it("keeps the remove button outside the poster link", () => {
    renderCompare();
    const remove = screen.getByRole("button", { name: "Remove Interstellar" });

    expect(remove.closest("a")).toBeNull();
    fireEvent.click(remove);
    expect(screen.queryByRole("link", { name: "Interstellar" })).toBeNull();
  });
});
