import { beforeEach, expect, it, vi } from "vitest";
import Theatres from "./page";

const session = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUserId: session.user }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

beforeEach(() => vi.resetAllMocks());

it("redirects the old directory to the signed-in user's page", async () => {
  session.user.mockResolvedValue("alice");
  await expect(Theatres()).rejects.toThrow("REDIRECT:/u/alice");
});

it("sends signed-out directory visitors to sign-in", async () => {
  session.user.mockResolvedValue(null);
  await expect(Theatres()).rejects.toThrow("REDIRECT:/auth/sign-in");
});
