import { beforeEach, expect, it, vi } from "vitest";
import NamedTheatreLayout from "./layout";

const mocks = vi.hoisted(() => ({
  theatre: vi.fn(),
  redirect: vi.fn(),
  path: "/u/@alice/movie-club",
}));

vi.mock("@/lib/named-routes", () => ({
  resolveNamedTheatre: mocks.theatre,
  resolveUsernameRedirect: mocks.redirect,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-shortlist-user-route": mocks.path }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const layout = () =>
  NamedTheatreLayout({
    children: null,
    params: Promise.resolve({ userId: "%40alice", theatreSlug: "movie-club" }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.theatre.mockResolvedValue(null);
  mocks.redirect.mockResolvedValue(null);
  mocks.path = "/u/@alice/movie-club";
});

it("keeps an existing theatre without checking redirects", async () => {
  mocks.theatre.mockResolvedValue({ id: "theatre" });
  const result = await layout();
  expect(result.props.theatreId).toBe("theatre");
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it("returns 404 when neither the original nor the mapped theatre exists", async () => {
  await expect(layout()).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.redirect).toHaveBeenCalledWith("%40alice", "movie-club");
});

it.each([
  ["/u/@alice/movie-club", "/u/@bob/movie-club"],
  [
    "/u/%40alice/movie-club?tag=comedy&tag=drama",
    "/u/@bob/movie-club?tag=comedy&tag=drama",
  ],
  [
    "/u/@alice/movie-club/settings?tab=members",
    "/u/@bob/movie-club/settings?tab=members",
  ],
])("redirects %s to %s without changing the suffix", async (path, target) => {
  mocks.path = path;
  mocks.redirect.mockResolvedValue("bob");
  await expect(layout()).rejects.toThrow(`REDIRECT:${target}`);
});
