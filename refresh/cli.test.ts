import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeCli } from "./cli";

const runRefresh = vi.hoisted(() => vi.fn());
vi.mock("./run", () => ({ runRefresh }));

const THEATRE = "22222222-2222-2222-2222-222222222222";
const refresh = vi.fn();

beforeEach(() => {
  runRefresh.mockReset().mockResolvedValue(0);
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("refresh CLI", () => {
  it("defaults to a global preview", async () => {
    expect(await executeCli(refresh, [])).toBe(0);
    expect(runRefresh).toHaveBeenCalledWith(refresh, {
      theatreId: undefined,
      apply: false,
    });
  });

  it("passes the theatre ID and apply flag to the refresh runner", async () => {
    expect(await executeCli(refresh, [THEATRE, "--apply"])).toBe(0);
    expect(runRefresh).toHaveBeenCalledWith(refresh, {
      theatreId: THEATRE,
      apply: true,
    });
  });

  it("supports applying globally without a theatre ID", async () => {
    expect(await executeCli(refresh, ["--apply"])).toBe(0);
    expect(runRefresh).toHaveBeenCalledWith(refresh, {
      theatreId: undefined,
      apply: true,
    });
  });

  it("returns a nonzero exit code for refresh failures", async () => {
    runRefresh.mockResolvedValueOnce(2);
    expect(await executeCli(refresh, ["--apply"])).toBe(1);
  });

  it("propagates setup failures", async () => {
    runRefresh.mockRejectedValueOnce(
      new Error("DATABASE_URL is not configured"),
    );
    await expect(executeCli(refresh, [])).rejects.toThrow(
      "DATABASE_URL is not configured",
    );
  });

  it.each(["--help", "-h"])(
    "shows help without running a refresh (%s)",
    async (arg) => {
      expect(await executeCli(refresh, [arg])).toBe(0);
      expect(runRefresh).not.toHaveBeenCalled();
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining("Usage: refresh [options] [theatre-id]"),
      );
      expect(process.stdout.write).not.toHaveBeenCalledWith(
        expect.stringContaining("--prod"),
      );
    },
  );

  it.each([
    { args: ["invalid"] },
    { args: [THEATRE, THEATRE] },
    { args: ["--unknown"] },
    { args: ["--prod"] },
  ])("rejects invalid arguments $args before running", async ({ args }) => {
    expect(await executeCli(refresh, args)).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("error:"),
    );
    expect(runRefresh).not.toHaveBeenCalled();
  });
});
