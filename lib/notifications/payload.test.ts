import { describe, expect, it } from "vitest";
import { theatreUrl } from "./payload";

describe("theatre notification URLs", () => {
  const id = "44444444-4444-4444-4444-444444444444";

  it.each(["/theatres", "/rooms"])("accepts %s links", (prefix) => {
    expect(theatreUrl.safeParse(`${prefix}/${id}`).success).toBe(true);
  });

  it.each(["/", "/theatres/not-a-uuid", `/theatres/${id}/settings`])(
    "rejects invalid links: %s",
    (path) => {
      expect(theatreUrl.safeParse(path).success).toBe(false);
    },
  );
});
