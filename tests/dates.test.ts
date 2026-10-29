import { describe, expect, it } from "vitest";
import { dateRange, monthsAgo } from "../src/lib/pipeline/run";
import { formatDate, toMarkdown } from "../src/lib/markdown";
import { comment } from "./helpers";

describe("monthsAgo", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  it("goes back whole calendar months", () => {
    expect(new Date(monthsAgo(12, now)!).toISOString()).toBe("2025-10-29T12:00:00.000Z");
    expect(new Date(monthsAgo(6, now)!).toISOString()).toBe("2026-04-29T12:00:00.000Z");
  });
  it("has no cutoff for 0", () => {
    expect(monthsAgo(0, now)).toBeUndefined();
  });
});

describe("dateRange", () => {
  it("finds the oldest and newest comment", () => {
    const comments = [
      comment("b", { publishedAt: "2026-03-01T00:00:00Z" }),
      comment("a", { publishedAt: "2025-04-09T00:00:00Z" }),
      comment("c", { publishedAt: "2026-10-29T00:00:00Z" }),
    ];
    expect(dateRange(comments)).toEqual({ from: "2025-04-09T00:00:00Z", to: "2026-10-29T00:00:00Z" });
  });
  it("is undefined with no comments", () => {
    expect(dateRange([])).toBeUndefined();
  });
});

it("puts the range in the Markdown export", () => {
  expect(formatDate("2025-04-09T23:30:00Z")).toBe("Apr 9, 2025");
  expect(toMarkdown("Test", [], { from: "2025-04-09T00:00:00Z", to: "2026-10-29T00:00:00Z" })).toContain(
    "Comments from Apr 9, 2025 to Oct 29, 2026.",
  );
});
