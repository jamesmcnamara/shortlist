// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataProvider } from "@/app/lib/data/DataProvider";
import type { VoteAction } from "@/app/lib/extensions/movieclub/shared";
import type { Nomination, Person } from "@/src/db/schema";
import { TheatreProvider } from "./TheatreContext";
import { TheatreContainer } from "./TheatreContainer";

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: {
        session: { id: "alice-session" },
        user: { id: "alice", username: "alice" },
      },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("sort=votes"),
  usePathname: () => "/u/@alice/club",
}));
vi.mock("@/app/components/ShortlistHeader", () => ({
  ShortlistHeader: ({ children }: { children?: ReactNode }) => (
    <header>{children}</header>
  ),
}));
vi.mock("@/app/components/ViewControls", () => ({
  ViewControls: () => null,
}));
vi.mock("@/app/components/NotificationBell", () => ({
  NotificationBell: () => null,
}));
vi.mock("@/app/components/MovieCard", () => ({
  MovieCard: ({
    nomination,
    footer,
    onClick,
  }: {
    nomination: Nomination;
    footer?: ReactNode;
    onClick: () => void;
  }) => (
    <article aria-label={nomination.movie.details.title}>
      <button onClick={onClick}>{nomination.movie.details.title}</button>
      <p>{nomination.comment}</p>
      {footer}
    </article>
  ),
}));

const theatreId = "11111111-1111-1111-1111-111111111111";
const base = `/api/theatres/${theatreId}`;
const alice: Person = { id: "alice", name: "Alice", username: "alice" };
const bob: Person = { id: "bob", name: "Bob", username: "bob" };
const carol: Person = { id: "carol", name: "Carol", username: "carol" };
const fetchMock = vi.fn<typeof fetch>();

function film(id: number, title: string, voters: Person[]): Nomination {
  return {
    id,
    theatreId,
    userId: bob.id,
    movieId: id,
    comment: null,
    completedAt: null,
    createdAt: new Date(2026, 10, id),
    movie: {
      id,
      tmdbId: id,
      createdAt: new Date(),
      details: { title } as Nomination["movie"]["details"],
      ratings: { services: [], raw: {} },
    },
    nominator: bob,
    nomcoms: [],
    seenBy: [],
    extensions: { movieclub: { voters }, other: { untouched: true } },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function show() {
  return render(
    <DataProvider>
      <SWRConfig
        value={{
          dedupingInterval: 0,
          focusThrottleInterval: 0,
          shouldRetryOnError: false,
        }}
      >
        <TheatreProvider theatreId={theatreId}>
          <TheatreContainer />
        </TheatreProvider>
      </SWRConfig>
    </DataProvider>,
  );
}

function setup(action: VoteAction, myVotes = action === "vote" ? 1 : 2) {
  const save = deferred<Response>();
  const refresh = deferred<Response>();
  let holdReads = false;
  let nominations = [
    film(1, "Arrival", [bob, ...Array<Person>(myVotes).fill(alice)]),
    film(
      2,
      "Heat",
      Array<Person>(action === "vote" ? myVotes + 1 : myVotes).fill(carol),
    ),
  ];
  fetchMock.mockImplementation(async (input, init) => {
    if (input === `${base}/extensions/movieclub`) {
      expect(init?.method).toBe("POST");
      return save.promise;
    }
    if (input === `${base}/nominations`) {
      return holdReads ? refresh.promise : Response.json(nominations);
    }
    if (input === base) {
      return Response.json({
        theatre: { id: theatreId, name: "Club", description: "#movieclub" },
        membership: { userId: alice.id, role: "member" },
        members: [{ ...alice, role: "member" }],
      });
    }
    if (input === "/api/theatres?previews=true") return Response.json([]);
    throw new Error(`Unexpected request: ${input}`);
  });
  return {
    save,
    refresh,
    initial: nominations,
    holdReads: () => {
      holdReads = true;
    },
    confirm: () => {
      holdReads = false;
      nominations = [
        {
          ...film(1, "Arrival", [
            bob,
            ...Array<Person>(myVotes + (action === "vote" ? 1 : -1)).fill(
              alice,
            ),
          ]),
          comment: "Confirmed by server",
        },
        nominations[1],
      ];
    },
  };
}

const control = (title: string, action: VoteAction = "vote") =>
  screen.getByRole<HTMLButtonElement>("button", {
    name: action === "vote" ? `Upvote ${title}` : `Remove a vote from ${title}`,
  });
const arrival = () => within(screen.getByRole("article", { name: "Arrival" }));
const expectAllocation = (count: number) => {
  if (count === 0) {
    expect(arrival().queryByText(/from you$/)).toBeNull();
  } else {
    expect(arrival().getByText(`${count} from you`)).toBeTruthy();
  }
};
const discussion = () =>
  within(screen.getByRole("region", { name: "Discussion about Arrival" }));
const avatarLabel = (count: number) =>
  count > 1 ? `Alice, ${count} votes` : "Alice";
const order = () =>
  screen
    .getAllByRole("article")
    .map((article) => article.getAttribute("aria-label"));

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("optimistic movie club voting", () => {
  const changes = [
    { action: "vote", before: 0, after: 1 },
    { action: "vote", before: 1, after: 2 },
    { action: "unvote", before: 2, after: 1 },
    { action: "unvote", before: 1, after: 0 },
  ] as const;

  it.each(changes)(
    "updates counts, avatars, quota, and sorting before saving $action ($before to $after)",
    async ({ action, before, after }) => {
      const { save, confirm } = setup(action, before);
      show();
      await screen.findByRole("button", { name: "Upvote Arrival" });
      expect(order()).toEqual(
        action === "unvote" ? ["Arrival", "Heat"] : ["Heat", "Arrival"],
      );

      fireEvent.click(control("Arrival", action));

      await waitFor(() => expectAllocation(after));
      expect(
        arrival().getByRole("img", {
          name: `${after + 1} ${after === 0 ? "upvote" : "upvotes"}`,
        }),
      ).toBeTruthy();
      expect(
        screen.getByText(`${5 - after} votes left`).closest("header"),
      ).toBeTruthy();
      expect(arrival().queryByRole("list", { name: "Upvoted by" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Arrival" }));
      expect(
        Boolean(discussion().queryByRole("img", { name: avatarLabel(after) })),
      ).toBe(after > 0);
      expect(order()).toEqual(
        action === "unvote" ? ["Heat", "Arrival"] : ["Arrival", "Heat"],
      );
      expect(control("Arrival").disabled).toBe(true);
      expect(control("Arrival", "unvote").disabled).toBe(true);
      expect(control("Heat").disabled).toBe(true);
      fireEvent.click(control("Heat"));
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(1);
      const [, init] = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "POST",
      )!;
      expect(JSON.parse(String(init?.body))).toEqual({
        nominationId: 1,
        action,
      });

      await act(async () => {
        confirm();
        save.resolve(Response.json({ votesLeft: 5 - after }));
      });
      await arrival().findByText("Confirmed by server");
      await waitFor(() => expect(control("Arrival").disabled).toBe(false));
      expectAllocation(after);
    },
  );

  it.each(changes)(
    "rolls back a rejected $action ($before to $after) and shows the error",
    async ({ action, before, after }) => {
      const { save, holdReads, refresh, initial } = setup(action, before);
      show();
      await screen.findByRole("button", { name: "Upvote Arrival" });
      fireEvent.click(control("Arrival", action));
      await waitFor(() => expectAllocation(after));
      fireEvent.click(screen.getByRole("button", { name: "Arrival" }));
      holdReads();

      await act(async () => {
        save.resolve(
          Response.json(
            { error: "Unable to save your vote." },
            { status: 409 },
          ),
        );
      });

      await screen.findByText("Unable to save your vote.");
      expectAllocation(before);
      expect(
        Boolean(discussion().queryByRole("img", { name: avatarLabel(before) })),
      ).toBe(before > 0);
      expect(
        screen.getByText(`${5 - before} votes left`).closest("header"),
      ).toBeTruthy();
      expect(order()).toEqual(
        action === "unvote" ? ["Arrival", "Heat"] : ["Heat", "Arrival"],
      );
      expect(control("Arrival").disabled).toBe(false);
      await act(async () => {
        refresh.resolve(Response.json(initial));
      });
    },
  );

  it("keeps an optimistic vote through stale focus and automatic mutation refreshes", async () => {
    const { save, refresh, holdReads, confirm, initial } = setup("vote");
    show();
    await screen.findByRole("button", { name: "Upvote Arrival" });
    holdReads();
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([path]) => path === `${base}/nominations`),
      ).toHaveLength(2),
    );
    fireEvent.click(control("Arrival"));
    await waitFor(() => expectAllocation(2));

    await act(async () => {
      refresh.resolve(Response.json(initial));
    });
    expectAllocation(2);

    await act(async () => {
      confirm();
      save.resolve(Response.json({ votesLeft: 3 }));
    });
    await waitFor(() => expect(control("Arrival").disabled).toBe(false));
    expectAllocation(2);
    await screen.findByText("Confirmed by server");
  });
});
