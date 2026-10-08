import { afterEach, describe, expect, it, vi } from "vitest";
import * as justwatch from "./justwatch";

const offer = (overrides: Record<string, unknown> = {}) => ({
  monetizationType: "FLATRATE",
  standardWebURL: "https://www.netflix.com/title/123",
  package: {
    packageId: 8,
    clearName: "Netflix",
    icon: "/icon/123/s100/netflix.png",
  },
  ...overrides,
});
const node = (
  tmdbId: string | number = "603",
  offers: unknown = [offer()],
) => ({
  content: { externalIds: { tmdbId }, fullPath: "/us/movie/the-matrix" },
  offers,
});
const response = (nodes: unknown[] = [node()]) => ({
  data: { popularTitles: { edges: nodes.map((node) => ({ node })) } },
});
const mockResponse = (body: unknown) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

afterEach(() => vi.unstubAllGlobals());

describe("JustWatch GraphQL client", () => {
  it("matches the TMDB id, resolves icons and stores provider links", async () => {
    mockResponse(response([node("999"), node(603)]));
    const result = await justwatch.getAvailability(603, "The Matrix");
    expect(result).toEqual({
      country: "US",
      status: "matched",
      checkedAt: expect.any(String),
      url: "https://www.justwatch.com/us/movie/the-matrix",
      offers: [
        {
          packageId: 8,
          name: "Netflix",
          iconUrl: "https://images.justwatch.com/icon/123/s100/netflix.png",
          url: "https://www.netflix.com/title/123",
          type: "FLATRATE",
        },
      ],
    });
    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      variables: { title: "The Matrix" },
    });
    expect(JSON.parse(String(init?.body)).query).toContain(
      "[FREE, ADS, FLATRATE, RENT]",
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("never uses another movie's offers when titles match", async () => {
    mockResponse(response([node("999")]));
    expect(await justwatch.getAvailability(603, "The Matrix")).toMatchObject({
      status: "not_found",
      offers: [],
      url: null,
    });
  });

  it("distinguishes a matched movie without offers from an unmatched movie", async () => {
    mockResponse(response([node("603", [])]));
    expect(await justwatch.getAvailability(603, "The Matrix")).toMatchObject({
      status: "matched",
      offers: [],
    });
    mockResponse(response([]));
    expect((await justwatch.getAvailability(603, "The Matrix")).status).toBe(
      "not_found",
    );
  });

  it("deduplicates quality variants but preserves different monetization types", async () => {
    mockResponse(
      response([
        node("603", [
          offer(),
          offer(),
          offer({ monetizationType: "FREE" }),
          offer({ monetizationType: "ADS" }),
        ]),
      ]),
    );
    const result = await justwatch.getAvailability(603, "The Matrix");
    expect(result.offers.map((item) => item.type)).toEqual([
      "FLATRATE",
      "FREE",
      "ADS",
    ]);
  });

  it("discards unsafe or missing links and restricts icon and attribution hosts", async () => {
    mockResponse(
      response([
        {
          ...node("603", [
            offer({ standardWebURL: "javascript:alert(1)" }),
            offer({ standardWebURL: null }),
            offer({ standardWebURL: "https://user:password@example.com" }),
            offer({
              package: {
                packageId: 8,
                clearName: "Netflix",
                icon: "https://other.test/icon.png",
              },
            }),
          ]),
          content: {
            externalIds: { tmdbId: "603" },
            fullPath: "https://other.test",
          },
        },
      ]),
    );
    const result = await justwatch.getAvailability(603, "The Matrix");
    expect(result.url).toBeNull();
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].iconUrl).toBeNull();
  });

  it.each([
    null,
    {},
    { data: null },
    { errors: [{ message: "Blocked" }] },
    { ...response(), errors: [{ message: "Partial failure" }] },
    response([null]),
    response([node("603", null)]),
    response([node("603", [offer({ package: null })])]),
    response([node("603", [offer({ monetizationType: "BUY" })])]),
  ])(
    "rejects invalid or partial responses rather than claiming no availability: %j",
    async (body) => {
      mockResponse(body);
      await expect(
        justwatch.getAvailability(603, "The Matrix"),
      ).rejects.toThrow("JustWatch");
    },
  );

  it("reports HTTP and network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 429 })),
    );
    await expect(justwatch.getAvailability(603, "The Matrix")).rejects.toThrow(
      "429",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network unavailable")),
    );
    await expect(justwatch.getAvailability(603, "The Matrix")).rejects.toThrow(
      "Network unavailable",
    );
  });
});
