import { describe, expect, it } from "vitest";
import { commentUrl, parseChannelInput } from "../src/lib/youtube";

describe("parseChannelInput", () => {
  it.each([
    ["@vidIQ", { kind: "handle", value: "@vidIQ" }],
    ["vidIQ", { kind: "handle", value: "@vidIQ" }],
    ["https://www.youtube.com/@vidIQ", { kind: "handle", value: "@vidIQ" }],
    ["youtube.com/@vidIQ/videos", { kind: "handle", value: "@vidIQ" }],
    ["https://m.youtube.com/@mkbhd?si=abc", { kind: "handle", value: "@mkbhd" }],
    ["https://www.youtube.com/channel/UCZLFu8bHbwtnIgWLg5UtINw", { kind: "id", value: "UCZLFu8bHbwtnIgWLg5UtINw" }],
    ["UCZLFu8bHbwtnIgWLg5UtINw", { kind: "id", value: "UCZLFu8bHbwtnIgWLg5UtINw" }],
    ["https://www.youtube.com/user/marquesbrownlee", { kind: "username", value: "marquesbrownlee" }],
    ["https://www.youtube.com/c/vidIQ", { kind: "handle", value: "@vidIQ" }],
  ])("parses %s", (input, expected) => {
    expect(parseChannelInput(input)).toEqual(expected);
  });

  it.each(["", "   ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "a b c"])("rejects %j", (input) => {
    expect(() => parseChannelInput(input)).toThrow();
  });
});

it("links straight to the comment", () => {
  expect(commentUrl({ id: "Ugx1", videoId: "abc" })).toBe("https://www.youtube.com/watch?v=abc&lc=Ugx1");
});
