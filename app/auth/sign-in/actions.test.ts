import { APIError } from "better-auth/api";
import { beforeEach, expect, it, vi } from "vitest";
import { signInWithHandleOrEmail } from "./actions";

const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signInUsername: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ auth: { api: mocks } }));

const form = (identifier: string, password = "password") => {
  const data = new FormData();
  data.set("identifier", identifier);
  data.set("password", password);
  return data;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.signInEmail.mockResolvedValue({});
  mocks.signInUsername.mockResolvedValue({});
});

it("signs in with a normalized handle and preserves the redirect", async () => {
  const data = form(" @Alice-2 ", "1234");
  data.set("next", "/join/invite");
  expect(await signInWithHandleOrEmail(null, data)).toEqual({
    redirectTo: "/join/invite",
  });
  expect(mocks.signInUsername).toHaveBeenCalledWith({
    body: { username: "alice-2", password: "1234xxxx", rememberMe: true },
  });
  expect(mocks.signInEmail).not.toHaveBeenCalled();
});

it("continues to sign in existing accounts by email", async () => {
  expect(
    await signInWithHandleOrEmail(null, form(" alice@example.com ")),
  ).toEqual({ redirectTo: "/" });
  expect(mocks.signInEmail).toHaveBeenCalledWith({
    body: {
      email: "alice@example.com",
      password: "password",
      rememberMe: true,
    },
  });
  expect(mocks.signInUsername).not.toHaveBeenCalled();
});

it("reports invalid credentials instead of redirecting", async () => {
  mocks.signInUsername.mockRejectedValue(
    new APIError("UNAUTHORIZED", { message: "Invalid username or password" }),
  );
  expect(await signInWithHandleOrEmail(null, form("alice"))).toEqual({
    error: "Invalid username or password",
  });
});

it("does not redirect if the auth provider fails to create a session", async () => {
  mocks.signInUsername.mockResolvedValue(null);
  expect(await signInWithHandleOrEmail(null, form("alice"))).toEqual({
    error: "Could not sign in. Please try again.",
  });
});

it("requires both an identifier and password", async () => {
  expect(await signInWithHandleOrEmail(null, form("", ""))).toEqual({
    error: "Enter your handle or email and password.",
  });
  expect(mocks.signInEmail).not.toHaveBeenCalled();
  expect(mocks.signInUsername).not.toHaveBeenCalled();
});
