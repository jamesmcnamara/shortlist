import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("starts movie enrichment after a successful nomination without awaiting it", async () => {
  let finishEnrichment!: (response: Response) => void;
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 1 }))
    .mockResolvedValueOnce(Response.json({ id: 2 }))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishEnrichment = resolve;
        }),
    );
  vi.stubGlobal("fetch", fetchMock);

  const nominations = await Promise.all([
    api.theatre("theatre").nominations.create({ movieId: 7, comment: "" }),
    api.theatre("another-theatre").nominations.create({
      movieId: 7,
      comment: "",
    }),
  ]);

  expect(nominations).toEqual([{ id: 1 }, { id: 2 }]);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(fetchMock.mock.calls[2][0]).toBe("/api/movies/7/enrich");
  finishEnrichment(Response.json({ id: 7, details: {} }));
});

it("does not start movie enrichment when nomination creation fails", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    api.theatre("theatre").nominations.create({ movieId: 7, comment: "" }),
  ).rejects.toThrow("Forbidden");
  expect(fetchMock).toHaveBeenCalledOnce();
});
