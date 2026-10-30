import { afterEach, describe, expect, it, vi } from "vitest";
import { Quota, commentUrl, getRecentVideos, parseChannelInput } from "../src/lib/youtube";

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

describe("getRecentVideos with a cutoff", () => {
  const item = (id: string, date: string) => ({
    snippet: { title: `Video ${id}`, publishedAt: date },
    contentDetails: { videoId: id, videoPublishedAt: date },
  });
  const channel = { id: "UC1", title: "Test", uploadsPlaylistId: "UU1" };

  afterEach(() => vi.unstubAllGlobals());

  it("leaves out older videos and stops paging at the cutoff", async () => {
    const pages = [
      { nextPageToken: "p2", items: [item("a", "2026-10-01T00:00:00Z"), item("b", "2026-06-01T00:00:00Z")] },
      { nextPageToken: "p3", items: [item("c", "2026-02-01T00:00:00Z"), item("d", "2025-01-01T00:00:00Z")] },
      { items: [item("e", "2024-01-01T00:00:00Z")] },
    ];
    const fetchMock = vi.fn(async () => Response.json(pages.shift()));
    vi.stubGlobal("fetch", fetchMock);
    const videos = await getRecentVideos(channel, 30, new Quota(), Date.parse("2025-10-29T00:00:00Z"));
    expect(videos.map((v) => v.id)).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads every page when there's no cutoff", async () => {
    const pages = [{ nextPageToken: "p2", items: [item("a", "2026-10-01T00:00:00Z")] }, { items: [item("b", "2020-01-01T00:00:00Z")] }];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(pages.shift())));
    const videos = await getRecentVideos(channel, 30, new Quota());
    expect(videos.map((v) => v.id)).toEqual(["a", "b"]);
  });
});
