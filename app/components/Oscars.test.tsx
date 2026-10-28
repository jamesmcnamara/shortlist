// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Movie, MovieDetails } from "@/src/db/schema";
import { SWRConfig } from "swr";
import { Oscars } from "./Oscars";

const movie = {
  id: 1,
  tmdbId: 157336,
  createdAt: new Date(),
  details: {
    id: 157336,
    title: "Interstellar",
    imdb_id: "tt0816692",
  } as MovieDetails,
  ratings: { services: [], raw: {} },
} satisfies Movie;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Oscars", () => {
  it("shows an expandable summary for multiple nominations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          updatedThrough: 2025,
          movies: {
            tt0816692: {
              wins: 1,
              nominations: 5,
              entries: [
                {
                  year: "2014",
                  category: "PRODUCTION DESIGN",
                  winner: false,
                  major: false,
                  name: "Nathan Crowley",
                },
                {
                  year: "2014",
                  category: "CINEMATOGRAPHY",
                  winner: true,
                  major: true,
                  name: "Paul Franklin",
                },
              ],
            },
          },
        }),
      }),
    );

    renderMovieOscars();

    expect(await screen.findByText("Won 1 Major Oscar")).toBeTruthy();
    expect(screen.getByText("1 major nomination · 5 total")).toBeTruthy();
    fireEvent.click(screen.getByText("Won 1 Major Oscar"));
    const entries = screen.getAllByRole("listitem");
    expect(entries[0].textContent).toContain("Production Design");
    expect(entries[1].textContent).toContain("Cinematography");
    expect(screen.getByText("Winner")).toBeTruthy();
    expect(screen.getByText("Paul Franklin")).toBeTruthy();
  });

  it("shows the full detail directly for one nomination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          updatedThrough: 2025,
          movies: {
            tt0816692: {
              wins: 0,
              nominations: 1,
              entries: [
                {
                  year: "2014",
                  category: "VISUAL EFFECTS",
                  winner: false,
                  major: false,
                  name: "Paul Franklin",
                },
              ],
            },
          },
        }),
      }),
    );

    renderMovieOscars();

    expect(
      await screen.findByText("Nominated for Visual Effects"),
    ).toBeTruthy();
    expect(screen.getByText("2014 · Paul Franklin")).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
  });
});

const renderMovieOscars = () =>
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <Oscars movie={movie} />
    </SWRConfig>,
  );
