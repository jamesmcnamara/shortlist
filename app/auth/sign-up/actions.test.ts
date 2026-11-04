import { APIError } from "better-auth/api";
import { beforeEach, expect, it, vi } from "vitest";
import { signUpWithEmail } from "./actions";

const signUp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { signUpEmail: signUp } },
}));

const form = (username: string) => {
  const data = new FormData();
  data.set("name", "Alice");
  data.set("email", "alice@example.com");
  data.set("password", "example-password");
  data.set("username", username);
  return data;
};
beforeEach(() => vi.resetAllMocks());

it("sends the normalized chosen handle to the auth plugin", async () => {
  expect(await signUpWithEmail(null, form(" Alice-2 "))).toEqual({
    redirectTo: "/",
  });
  expect(signUp).toHaveBeenCalledWith({
    body: {
      name: "Alice",
      email: "alice@example.com",
      password: "example-password",
      username: "alice-2",
    },
  });
});

it.each(["", "ab", "-alice", "alice-", "alice/name", "a".repeat(31)])(
  "rejects invalid handle %s before creating an account",
  async (username) => {
    expect(await signUpWithEmail(null, form(username))).toHaveProperty("error");
    expect(signUp).not.toHaveBeenCalled();
  },
);

it("shows the auth plugin's duplicate-handle error", async () => {
  signUp.mockRejectedValue(
    new APIError("BAD_REQUEST", { message: "Username is already taken." }),
  );
  expect(await signUpWithEmail(null, form("alice"))).toEqual({
    error: "Username is already taken.",
  });
});
