// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SignUpForm } from "./SignUpForm";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/use-auth-action", () => ({
  useAuthAction: () => [null, vi.fn(), false],
}));
vi.mock("./actions", () => ({ signUpWithHandle: vi.fn() }));

afterEach(cleanup);

it("asks only for a handle and password and explains password recovery", () => {
  const { container } = render(<SignUpForm />);
  expect(screen.getByLabelText("Handle")).toBeTruthy();
  expect(screen.getByLabelText("Password")).toBeTruthy();
  expect(
    [...container.querySelectorAll("form input:not([type=hidden])")].map(
      (input) => input.getAttribute("name"),
    ),
  ).toEqual(["username", "password"]);
  expect(
    screen.getByText("There's no password reset, so keep it somewhere safe."),
  ).toBeTruthy();
});
