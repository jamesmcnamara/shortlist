// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/app/lib/api";
import { parseMovieTitles, type MovieImportResult } from "@/app/lib/bulk-movie-import";
import { BulkMovieImport } from "./BulkMovieImport";

afterEach(cleanup);

const added: MovieImportResult = {
  status: "added", movie: { id: 1, title: "Arrival", year: 2016 },
};
const deferred = () => {
  let resolve!: (result: MovieImportResult) => void;
  const promise = new Promise<MovieImportResult>((done) => { resolve = done; });
  return { resolve, promise };
};
function open(input: string) {
  fireEvent.click(screen.getByRole("button", { name: "Import movies" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Movie titles" }), {
    target: { value: input },
  });
}
function submit() {
  fireEvent.submit(screen.getByRole("textbox", { name: "Movie titles" }).closest("form")!);
}

describe("bulk movie import", () => {
  it("trims, ignores blank lines, and deduplicates titles in input order", () => {
    expect(parseMovieTitles(" Arrival \r\n\nThe Matrix\rARRIVAL\nArrival\rSpirited Away ")).toEqual([
      "Arrival", "The Matrix", "Spirited Away",
    ]);
  });

  it("disables an empty import and uses real CSS Module classes", () => {
    const { container } = render(<BulkMovieImport onImport={vi.fn()} />);
    open("  \n ");
    expect(screen.getByRole("button", { name: /Import.*movies/ }).hasAttribute("disabled")).toBe(true);
    expect(container.innerHTML).not.toContain('class="undefined"');
  });

  it("imports sequentially, prevents double submission, and shows matches/progress", async () => {
    const first = deferred();
    const onImport = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({ status: "not_found" });
    render(<BulkMovieImport onImport={onImport} />);
    open(" Arrival \nARRIVAL\nUnknown");
    submit();
    submit();
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledWith("Arrival");
    expect(screen.getByRole("status").textContent).toContain("0 of 2 processed");
    expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Close import" }).hasAttribute("disabled")).toBe(true);
    await act(async () => first.resolve(added));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(2));
    expect(onImport).toHaveBeenLastCalledWith("Unknown");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Import complete. 2 of 2 processed. 1 added."));
    expect(screen.getByText("Matched: Arrival (2016)")).toBeTruthy();
    expect(screen.getByText("No match found - skipped")).toBeTruthy();
  });

  it("reports existing movies and errors, continues, and retries only failures", async () => {
    const onImport = vi.fn()
      .mockResolvedValueOnce({ ...added, status: "already_on_list" })
      .mockRejectedValueOnce(new ApiError("Lookup failed", 502))
      .mockResolvedValueOnce(added)
      .mockResolvedValueOnce(added);
    render(<BulkMovieImport onImport={onImport} />);
    open("Existing\nFailed\nArrival");
    submit();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry failed titles" })).toBeTruthy());
    expect(onImport).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Already on this list - skipped")).toBeTruthy();
    expect(screen.getByText("Lookup failed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry failed titles" }));
    await waitFor(() => expect(screen.queryByText("Lookup failed")).toBeNull());
    expect(onImport).toHaveBeenCalledTimes(4);
    expect(onImport).toHaveBeenLastCalledWith("Failed");
    expect(screen.getByRole("status").textContent).toContain("2 added.");
  });

  it("finishes the current title before stopping and can continue remaining titles", async () => {
    const first = deferred();
    const onImport = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(added);
    render(<BulkMovieImport onImport={onImport} />);
    open("Arrival\nNext");
    submit();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByRole("button", { name: "Stopping..." }).hasAttribute("disabled")).toBe(true);
    await act(async () => first.resolve(added));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("Import stopped. 1 of 2 processed. 1 added.");
    fireEvent.click(screen.getByRole("button", { name: "Continue import" }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(2));
    expect(onImport).toHaveBeenLastCalledWith("Next");
  });

  it.each([401, 403, 404, 503])("stops on blocking error %s, leaving other titles pending", async (status) => {
    const onImport = vi.fn().mockRejectedValue(new ApiError("Access unavailable", status));
    render(<BulkMovieImport onImport={onImport} />);
    open("Arrival\nNext");
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Import stopped"));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("Import stopped. 1 of 2 processed.");
  });

  it("retrying a failed title does not process pending titles after a stop", async () => {
    const onImport = vi.fn()
      .mockRejectedValueOnce(new ApiError("Credentials unavailable", 503))
      .mockResolvedValueOnce(added);
    render(<BulkMovieImport onImport={onImport} />);
    open("Failed\nPending");
    submit();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Retry failed titles" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("1 added."));
    expect(onImport).toHaveBeenCalledTimes(2);
    expect(onImport).toHaveBeenLastCalledWith("Failed");
    expect(screen.getByRole("button", { name: "Continue import" })).toBeTruthy();
  });

  it("does not start more requests after unmount", async () => {
    const first = deferred();
    const onImport = vi.fn().mockReturnValue(first.promise);
    const { unmount } = render(<BulkMovieImport onImport={onImport} />);
    open("Arrival\nNext");
    submit();
    unmount();
    await act(async () => first.resolve(added));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("clears old results when input changes and respects other submissions", async () => {
    const onImport = vi.fn().mockResolvedValue(added);
    const { rerender } = render(<BulkMovieImport onImport={onImport} />);
    open("Arrival");
    submit();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Import complete"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Next" } });
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<BulkMovieImport onImport={onImport} isDisabled />);
    submit();
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});
