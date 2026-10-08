// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MovieStreaming } from "./MovieStreaming";
import { MovieSearchResult } from "./MovieSearchResult";
import { MovieDiscussion } from "./MovieDiscussion/MovieDiscussion";
import { STREAMING_SERVICES } from "@/app/lib/streaming-services";
import type {
  JustWatchAvailability,
  StreamingOffer,
} from "@/app/lib/justwatch-types";
import type { MovieDetails, Nomination } from "@/src/db/schema";
import streamingStyles from "./MovieStreaming.module.css";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { name: "User" } } }) },
}));

const offer = (
  packageId: number,
  type: StreamingOffer["type"] = "FLATRATE",
): StreamingOffer => ({
  packageId,
  type,
  name: `Service ${packageId}`,
  iconUrl: `https://images.justwatch.com/icon/${packageId}/s100/icon.png`,
  url: `https://stream.example.com/${packageId}`,
});
const availability = (offers: StreamingOffer[]): JustWatchAvailability => ({
  country: "US",
  checkedAt: "2026-10-06T12:00:00.000Z",
  status: "matched",
  url: "https://www.justwatch.com/us/movie/test",
  offers,
});
const nomination: Nomination = {
  id: 1,
  roomId: "room",
  userId: "user",
  movieId: 1,
  comment: null,
  completed: false,
  createdAt: new Date(),
  movie: {
    id: 1,
    tmdbId: 123,
    createdAt: new Date(),
    details: {
      title: "A Movie",
      year: 2026,
      justWatch: availability([offer(8), offer(191, "FREE")]),
    } as MovieDetails,
    ratings: { services: [], raw: {} },
  },
  nominator: { id: "user", name: "User", email: "user@example.com" },
  nomcoms: [],
  seenBy: [],
};

afterEach(cleanup);

describe("streaming service row", () => {
  it("shows only the configured services with icons, safe links and attribution", () => {
    render(
      <MovieStreaming
        availability={availability([offer(8), offer(191, "FREE"), offer(999)])}
      />,
    );
    expect(
      screen
        .getByRole("link", {
          name: "Watch on Netflix: Included with subscription",
        })
        .getAttribute("href"),
    ).toBe("https://stream.example.com/8");
    expect(
      screen
        .getByRole("link", { name: "Watch on Kanopy: Free" })
        .getAttribute("rel"),
    ).toBe("noopener noreferrer");
    expect(screen.getByText("Free")).toBeTruthy();
    expect(screen.queryByText("Service 999")).toBeNull();
    expect(
      screen.getByRole("link", { name: "JustWatch" }).getAttribute("href"),
    ).toBe(availability([]).url);
    const icon = screen
      .getByRole("link", { name: /Watch on Netflix/ })
      .querySelector("img");
    expect(icon?.className).toBe(streamingStyles.icon);
    expect(icon?.getAttribute("width")).toBe("24");
  });

  it("accepts a custom service list instead of the default list", () => {
    render(
      <MovieStreaming
        availability={availability([offer(8), offer(999, "ADS")])}
        services={[{ name: "Custom", packageIds: [999] }]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Watch on Custom: Free with ads" }),
    ).toBeTruthy();
    expect(screen.queryByText("Netflix")).toBeNull();
  });

  it("matches subscription variants and prefers free offers without duplicates", () => {
    render(
      <MovieStreaming
        availability={availability([
          offer(8),
          offer(1796, "ADS"),
          offer(1796, "FREE"),
          offer(2100),
        ])}
      />,
    );
    expect(screen.getAllByText("Netflix")).toHaveLength(1);
    expect(
      screen
        .getByRole("link", { name: "Watch on Netflix: Free" })
        .getAttribute("href"),
    ).toBe("https://stream.example.com/1796");
    expect(
      screen.getByRole("link", { name: /Watch on Amazon Prime Video/ }),
    ).toBeTruthy();
    expect(
      STREAMING_SERVICES.flatMap((service) => service.packageIds),
    ).not.toContain(1825);
  });

  it.each([
    [undefined, "Streaming availability not checked yet."],
    [
      { ...availability([]), status: "unavailable" as const },
      "Streaming availability is temporarily unavailable.",
    ],
    [
      { ...availability([]), status: "not_found" as const },
      "No matching movie found on JustWatch.",
    ],
    [availability([]), "Not included on your streaming services."],
  ])("distinguishes empty and unknown states", (data, message) => {
    render(<MovieStreaming availability={data} />);
    expect(screen.getByText(message)).toBeTruthy();
  });

  it("keeps the service name when an icon fails", () => {
    render(<MovieStreaming availability={availability([offer(8)])} />);
    const link = screen.getByRole("link", { name: /Watch on Netflix/ });
    fireEvent.error(link.querySelector("img")!);
    expect(link.querySelector("img")).toBeNull();
    expect(screen.getByText("Netflix")).toBeTruthy();
  });

  it("does not render an unsafe stored offer URL", () => {
    render(
      <MovieStreaming
        availability={availability([
          { ...offer(8), url: "javascript:alert(1)" },
        ])}
      />,
    );
    expect(screen.queryByRole("link", { name: /Watch on Netflix/ })).toBeNull();
  });

  it("renders links in search without selecting the movie, and preserves keyboard selection", () => {
    const onSelect = vi.fn();
    render(<MovieSearchResult movie={nomination.movie} onSelect={onSelect} />);
    const link = screen.getByRole("link", { name: /Watch on Netflix/ });
    fireEvent.click(link);
    fireEvent.keyDown(link, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(link.closest("li[role=button]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "A Movie" }));
    expect(onSelect).toHaveBeenCalledWith(nomination.movie);
  });

  it("shows rentals only for rent-enabled services and prefers streaming offers", () => {
    render(<MovieStreaming
      availability={availability([offer(10, "RENT"), offer(2, "RENT"), offer(8, "RENT"), offer(15), offer(15, "RENT")])}
      services={[
        { name: "Prime", packageIds: [9, 10], rent: true },
        { name: "Apple TV", packageIds: [2], rent: true },
        { name: "Netflix", packageIds: [8] },
        { name: "Hulu", packageIds: [15], rent: true },
      ]}
    />);
    expect(screen.getByRole("link", { name: "Watch on Prime: Rent" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Watch on Apple TV: Rent" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Netflix/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Watch on Hulu: Included with subscription" })).toBeTruthy();
  });

  it("checks JustWatch from the empty state and reports failures", async () => {
    let fail!: (error: Error) => void;
    const onRefresh = vi.fn(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    render(<MovieStreaming onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Check JustWatch" }));
    const checking = await screen.findByRole("button", { name: "Checking…" });
    expect(checking.hasAttribute("disabled")).toBe(true);
    fireEvent.click(checking);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    fail(new Error("Down"));
    expect(
      await screen.findByText("Couldn't check JustWatch. Try again later."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Check JustWatch" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("hides the check button when there are offers or no refresh handler", () => {
    render(
      <MovieStreaming
        availability={availability([offer(8)])}
        onRefresh={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Check JustWatch" }),
    ).toBeNull();
    cleanup();
    render(<MovieStreaming />);
    expect(
      screen.queryByRole("button", { name: "Check JustWatch" }),
    ).toBeNull();
  });

  it("renders the same streaming row in movie discussions", () => {
    render(
      <MovieDiscussion
        nomination={nomination}
        hasSeen={false}
        currentUserId="user"
        onUpdateComment={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /Watch on Netflix/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Watch on Kanopy/ })).toBeTruthy();
  });
});
