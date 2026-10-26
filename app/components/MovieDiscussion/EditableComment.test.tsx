// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditableComment } from "./EditableComment";
import styles from "./MovieDiscussion.module.css";

afterEach(cleanup);

const props = {
  allowBlank: true,
  emptyText: "Add a description and #tags.",
  editLabel: "Edit description",
  inputLabel: "Description",
};

describe("EditableComment tags", () => {
  it("highlights hashtags as blue text without making them interactive", () => {
    const value = "Spooky #horror movies to watch during the #2026 Halloween season.";
    const { container } = render(<EditableComment {...props} value={value} />);
    expect(container.textContent).toBe(value);
    expect([...container.querySelectorAll(`.${styles.tag}`)].map((tag) => tag.textContent))
      .toEqual(["#horror", "#2026"]);
    expect(screen.getByText("#horror").tagName).toBe("SPAN");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("preserves casing, duplicate tags, Unicode, whitespace, and punctuation", () => {
    const value = 'Movies (#Sci-Fi), #Sci-Fi\n\t"#Cafe\u0301" #\u6620\u753b.';
    const { container } = render(<EditableComment {...props} value={value} />);
    expect(container.textContent).toBe(value);
    expect([...container.querySelectorAll(`.${styles.tag}`)].map((tag) => tag.textContent))
      .toEqual(["#Sci-Fi", "#Sci-Fi", "#Cafe\u0301", "#\u6620\u753b"]);
  });

  it("does not highlight URL fragments, headings, or hashes inside words", () => {
    const value = "https://example.com/#fragment word#hash\n# Heading\n# ##";
    const { container } = render(<EditableComment {...props} value={value} />);
    expect(container.textContent).toBe(value);
    expect(container.querySelector(`.${styles.tag}`)).toBeNull();
  });

  it("leaves the empty prompt unhighlighted", () => {
    const { container } = render(<EditableComment {...props} value="" />);
    expect(screen.getByText(props.emptyText)).toBeTruthy();
    expect(container.querySelector(`.${styles.tag}`)).toBeNull();
  });

  it("edits and saves the original plain text rather than rendered markup", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const { rerender } = render(
      <EditableComment {...props} value="Spooky #Horror" onSave={onSave} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    const input = screen.getByRole("textbox", { name: "Description" });
    expect((input as HTMLTextAreaElement).value).toBe("Spooky #Horror");
    fireEvent.change(input, { target: { value: "Funny #Comedy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(onSave).toHaveBeenCalledWith("Funny #Comedy");
    rerender(<EditableComment {...props} value="Funny #Comedy" onSave={onSave} />);
    expect(screen.getByText("#Comedy").className).toBe(styles.tag);
    expect(screen.queryByText("#Horror")).toBeNull();
  });
});
