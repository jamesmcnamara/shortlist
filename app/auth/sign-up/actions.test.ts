import { APIError } from "better-auth/api";
import { beforeEach, expect, it, vi } from "vitest";
import { signUpWithHandle } from "./actions";

const signUp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { signUpEmail: signUp } },
}));

const form = (username: string) => {
  const data = new FormData();
  data.set("password", "example-password");
  data.set("username", username);
  return data;
};
beforeEach(() => vi.resetAllMocks());

it("creates an account with the normalized handle and no supplied email", async () => {
  expect(await signUpWithHandle(null, form(" @Alice-2 "))).toEqual({
    redirectTo: "/",
  });
  expect(signUp).toHaveBeenCalledWith({
    body: {
      name: "alice-2",
      email: expect.stringContaining("@accounts.shortlist.invalid"),
      password: "example-password",
      username: "alice-2",
    },
  });
});

it.each(["", "ab", "-alice", "alice-", "alice/name", "a".repeat(31)])(
  "rejects invalid handle %s before creating an account",
  async (username) => {
    expect(await signUpWithHandle(null, form(username))).toHaveProperty(
      "error",
    );
    expect(signUp).not.toHaveBeenCalled();
  },
);

it("requires a password before creating an account", async () => {
  const data = form("alice");
  data.delete("password");
  expect(await signUpWithHandle(null, data)).toEqual({
    error: "Enter a handle and password.",
  });
  expect(signUp).not.toHaveBeenCalled();
});

it("shows the auth plugin's duplicate-handle error", async () => {
  signUp.mockRejectedValue(
    new APIError("BAD_REQUEST", { message: "Username is already taken." }),
  );
  expect(await signUpWithHandle(null, form("alice"))).toEqual({
    error: "Username is already taken.",
  });
});
