// @vitest-environment jsdom

import { league, nomination } from "@/app/lib/fantasy-fixtures";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import styles from "./Fantasy.module.css";
import { FantasyDashboard } from "./FantasyDashboard";

const mocks = vi.hoisted(() => ({ reducedMotion: true }));

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => mocks.reducedMotion,
}));

class FixedWidth {
  constructor(private callback: ResizeObserverCallback) {}
  observe = (target: Element) =>
    this.callback(
      [{ target, contentRect: { width: 480 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  unobserve = () => {};
  disconnect = () => {};
}

class AlwaysVisible {
  constructor(private callback: IntersectionObserverCallback) {}
  observe = (target: Element) =>
    this.callback(
      [{ target, isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  unobserve = () => {};
  disconnect = () => {};
}

beforeEach(() => {
  mocks.reducedMotion = true;
  vi.stubGlobal("ResizeObserver", FixedWidth);
  vi.stubGlobal("IntersectionObserver", AlwaysVisible);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const show = (nominees = league, onOpen = vi.fn()) => {
  render(<FantasyDashboard nominees={nominees} onOpen={onOpen} />);
  return onOpen;
};

const maya = () => screen.getByRole("group", { name: "Maya Chen's movies" });
const sam = () => screen.getByRole("group", { name: "Sam Ortiz's movies" });
const stillToCome = () =>
  within(screen.getByRole("heading", { name: "Still to come" }).parentElement!);
const ledger = (by: string) =>
  screen.getByRole("list", { name: `Movies ranked by ${by}` });
const ledgerOrder = (by: string) =>
  within(ledger(by))
    .getAllByRole("button")
    .map((row) => row.getAttribute("aria-label")?.split(",")[0]);

describe("standings", () => {
  it("names the leader and the size of the lead", () => {
    show();
    expect(screen.getByRole("heading", { name: "Standings" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Standings" }).nextElementSibling
        ?.textContent,
    ).toBe("Maya leads Sam by +$310m");
  });

  it("lists players best first with their net", () => {
    show();
    const rows = screen.getAllByRole("listitem").slice(0, 3);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Maya Chen+$460m"),
      expect.stringContaining("Sam Ortiz+$150m"),
      expect.stringContaining("Jo Park$0"),
    ]);
  });

  it("flags players who are still waiting on numbers", () => {
    show();
    expect(screen.getByText("3 movies")).toBeTruthy();
    expect(screen.getByText("2 of 3 scored")).toBeTruthy();
    expect(screen.getByText("0 of 1 scored")).toBeTruthy();
  });

  it("puts every scored movie in its owner's bar", () => {
    show();
    expect(
      within(maya())
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Heat Wave, +$500m", "Mystery Date, +$10m", "Cold Open, -$50m"]);
    expect(
      within(sam())
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Slow Burn, +$300m", "Big Flop, -$150m"]);
  });

  it("stacks gains and losses separately, biggest first on each side", () => {
    show([
      nomination(1, "maya", "Big gain", null, [100, 160]),
      nomination(2, "maya", "Small gain", null, [100, 140]),
      nomination(3, "maya", "Small loss", null, [100, 80]),
      nomination(4, "maya", "Big loss", null, [100, 20]),
      nomination(5, "maya", "Break-even", null, [100, 100]),
      nomination(6, "maya", "Missing", null, null),
    ]);
    const segments = within(maya()).getAllByRole("button");
    expect(segments.map((button) => button.getAttribute("aria-label"))).toEqual(
      [
        "Big gain, +$60",
        "Small gain, +$40",
        "Big loss, -$80",
        "Small loss, -$20",
      ],
    );
    expect(segments.map((button) => parseFloat(button.style.left))).toEqual([
      50, 80, 10, 0,
    ]);
  });

  it("calls a tie a tie", () => {
    show([
      nomination(1, "maya", "A", "2026-03-01", [10, 30]),
      nomination(2, "sam", "B", "2026-03-01", [10, 30]),
    ]);
    expect(
      screen.getByRole("heading", { name: "Standings" }).nextElementSibling
        ?.textContent,
    ).toBe("Maya and Sam are tied at +$20.");
  });

  it("describes a one-player league without a comparison", () => {
    show([nomination(1, "maya", "A", "2026-03-01", [10, 30])]);
    expect(
      screen.getByRole("heading", { name: "Standings" }).nextElementSibling
        ?.textContent,
    ).toBe("Maya is at +$20 so far.");
    expect(screen.queryByText(/lead comes from/)).toBeNull();
  });

  it("explains what to expect before any numbers exist", () => {
    show([nomination(1, "maya", "Next Winter", "2026-12-25", null)]);
    expect(screen.getByText(/Nothing has numbers yet/)).toBeTruthy();
    expect(screen.queryByText(/lead comes from/)).toBeNull();
    expect(screen.queryByText("The race so far")).toBeNull();
    expect(screen.queryByText("Every movie, ranked")).toBeNull();
    expect(screen.getByText("Still to come")).toBeTruthy();
  });

  it("has a friendly empty state", () => {
    show([]);
    expect(screen.getByText(/No movies yet/)).toBeTruthy();
  });
});

describe("selecting a movie", () => {
  const heatWave = () =>
    within(maya()).getByRole("button", { name: "Heat Wave, +$500m" });

  it("opens an inspector and dims nothing else away for good", () => {
    show();
    fireEvent.click(heatWave());
    const inspector = screen.getByRole("group", { name: "Heat Wave details" });
    expect(within(inspector).getByText("Maya\u2019s pick")).toBeTruthy();
    expect(heatWave().getAttribute("aria-pressed")).toBe("true");
    expect(
      within(sam())
        .getByRole("button", { name: "Slow Burn, +$300m" })
        .hasAttribute("data-dim"),
    ).toBe(true);
  });

  it("closes on a second tap, the clear button and Escape", () => {
    show();
    fireEvent.click(heatWave());
    fireEvent.click(heatWave());
    expect(
      screen.queryByRole("group", { name: "Heat Wave details" }),
    ).toBeNull();

    fireEvent.click(heatWave());
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(
      screen.queryByRole("group", { name: "Heat Wave details" }),
    ).toBeNull();

    fireEvent.click(heatWave());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("group", { name: "Heat Wave details" }),
    ).toBeNull();
  });

  it("opens the movie's discussion", () => {
    const onOpen = show();
    fireEvent.click(heatWave());
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("follows the movie from one chart to the next, never showing two", () => {
    show();
    fireEvent.click(heatWave());
    fireEvent.click(
      screen.getByRole("button", { name: "Heat Wave, +$500m to the lead" }),
    );
    expect(
      screen.getAllByRole("group", { name: "Heat Wave details" }),
    ).toHaveLength(1);

    fireEvent.click(
      within(ledger("net")).getByRole("button", { name: "Heat Wave, +$500m" }),
    );
    expect(
      screen.getAllByRole("group", { name: "Heat Wave details" }),
    ).toHaveLength(1);
  });

  it("explains movies that don't count yet", () => {
    show();
    fireEvent.click(
      screen.getByRole("button", { name: /^Next Winter, no numbers yet/ }),
    );
    expect(
      within(
        screen.getByRole("group", { name: "Next Winter details" }),
      ).getByText("Not out yet, so nothing counts."),
    ).toBeTruthy();
  });
});

describe("where the lead comes from", () => {
  it("breaks the lead into movies that add up to the total", () => {
    show();
    expect(
      screen.getByRole("heading", {
        name: "Where Maya\u2019s lead comes from",
      }),
    ).toBeTruthy();
    const rows = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
      .filter((label) => label?.endsWith("to the lead"));
    expect(rows).toEqual([
      "Heat Wave, +$500m to the lead",
      "Slow Burn, -$300m to the lead",
      "Big Flop, +$150m to the lead",
      "Cold Open, -$50m to the lead",
      "Mystery Date, +$10m to the lead",
    ]);
    expect(screen.getByText("Lead").nextElementSibling?.textContent).toBe(
      "+$310m",
    );
  });

  it("leaves the total bar's background to its CSS rule", () => {
    show();
    const total = screen
      .getByText("Lead")
      .closest("li")!
      .querySelector<HTMLSpanElement>(`.${styles.stepBar}`);
    expect(total?.hasAttribute("data-total")).toBe(true);
    expect(total?.style.background).toBe("");
  });

  it("switches opponents when there are three players", () => {
    show([...league, nomination(8, "jo", "Jo Hit", "2026-02-01", [10, 100])]);
    expect(screen.getByText(/helps Sam\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "vs Jo" }));
    expect(screen.getByText(/helps Jo\./)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "vs Jo" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows no opponent pills for two players", () => {
    show([
      nomination(1, "maya", "A", "2026-03-01", [10, 30]),
      nomination(2, "sam", "B", "2026-03-01", [10, 20]),
    ]);
    expect(screen.queryByRole("button", { name: /^vs / })).toBeNull();
  });
});

describe("the race", () => {
  it("plots one dot per movie with a release date", () => {
    show();
    const race = screen.getByRole("group", {
      name: "Cumulative net by release date for each player",
    });
    const dots = within(race).getAllByRole("button");
    expect(dots).toHaveLength(6);
    expect(
      within(race).queryByRole("button", { name: /Mystery Date/ }),
    ).toBeNull();
    expect(
      within(race).getByRole("button", {
        name: "No Numbers, no numbers yet. Sam total $0",
      }),
    ).toBeTruthy();
  });

  it("selects a movie from its dot", () => {
    show();
    fireEvent.click(
      screen.getByRole("button", { name: /^Slow Burn, \+\$300m\. Sam total/ }),
    );
    expect(
      screen.getByRole("group", { name: "Slow Burn details" }),
    ).toBeTruthy();
  });

  it("selects from the keyboard", () => {
    show();
    fireEvent.keyDown(
      screen.getByRole("button", { name: /^Slow Burn, \+\$300m\. Sam total/ }),
      { key: "Enter" },
    );
    expect(
      screen.getByRole("group", { name: "Slow Burn details" }),
    ).toBeTruthy();
  });

  it("labels each line's end with the final net", () => {
    show();
    const race = within(
      screen.getByRole("group", {
        name: "Cumulative net by release date for each player",
      }),
    );
    expect(race.getByText("+$450m").previousElementSibling?.textContent).toBe(
      "Maya",
    );
    expect(race.getByText("+$150m").previousElementSibling?.textContent).toBe(
      "Sam",
    );
  });
});

describe("long names", () => {
  it("are cut short at the end of the race lines", () => {
    const base = nomination(1, "maya", "A", "2026-03-01", [10, 30]);
    const other = nomination(2, "sam", "B", "2026-04-01", [10, 20]);
    show([
      {
        ...base,
        nominator: { ...base.nominator, name: "Bartholomew-Christopher Lee" },
      },
      other,
    ]);
    expect(screen.getByText("Bartholomew\u2026")).toBeTruthy();
  });
});

describe("every movie, ranked", () => {
  it("ranks by net and re-ranks by return", () => {
    show();
    expect(ledgerOrder("net")).toEqual([
      "Heat Wave",
      "Slow Burn",
      "Mystery Date",
      "Cold Open",
      "Big Flop",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Return" }));
    expect(ledgerOrder("return")).toEqual([
      "Slow Burn",
      "Heat Wave",
      "Mystery Date",
      "Cold Open",
      "Big Flop",
    ]);
  });

  it("collapses long lists until asked", () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      nomination(
        index + 1,
        index % 2 ? "maya" : "sam",
        `Movie ${index + 1}`,
        "2026-03-01",
        [10, 20 + index],
      ),
    );
    show(many);
    expect(within(ledger("net")).getAllByRole("button")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show all 10" }));
    expect(within(ledger("net")).getAllByRole("button")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(within(ledger("net")).getAllByRole("button")).toHaveLength(8);
  });
});

describe("still to come", () => {
  it("lists unreleased movies by date and missing numbers separately", () => {
    show();
    expect(screen.getByText("Dec 25 \u00b7 in 70 days")).toBeTruthy();
    expect(screen.getByText("Missing numbers")).toBeTruthy();
    expect(
      stillToCome().getByRole("button", { name: /No Numbers/ }),
    ).toBeTruthy();
  });

  it("opens the movie straight away", () => {
    const onOpen = show();
    fireEvent.click(stillToCome().getByRole("button", { name: /Next Winter/ }));
    expect(onOpen).toHaveBeenCalledWith(6);
  });

  it("is hidden when every movie has numbers", () => {
    show([nomination(1, "maya", "A", "2026-03-01", [10, 30])]);
    expect(screen.queryByText("Still to come")).toBeNull();
  });
});

describe("motion", () => {
  it("renders the full dashboard with animations on", () => {
    mocks.reducedMotion = false;
    show();
    expect(screen.getByRole("heading", { name: "Standings" })).toBeTruthy();
    expect(screen.getByText("The race so far")).toBeTruthy();
  });
});
