import { describe, expect, it } from "vitest";
import { generateInviteCode } from "@/app/lib/rooms";

describe("room helpers", () => {
  it("generates readable invite codes", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(10);
    expect(code).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
  });
});
