import { describe, expect, it } from "vitest";
import { groundCoverage } from "../src/lib/pipeline/coverage";
import type { AskCard, Video } from "../src/lib/types";

const video = (id: string): Video => ({ id, title: `Video ${id}`, publishedAt: `2026-0${id.length}-01T00:00:00Z` });
const card = (id: string, ask: string, videos: { id: string; count: number }[] = []) =>
  ({ id, ask, summary: "", videos: videos.map((v) => ({ ...v, title: v.id })) }) as unknown as AskCard;

describe("groundCoverage", () => {
  const cards = [card("c1", "Lens review", [{ id: "x1", count: 3 }]), card("c2", "Editing setup", [{ id: "x2", count: 2 }])];
  const catalog = [video("old1"), video("x1"), video("old2")];

  it("keeps matches by refs it was given, one per ask", () => {
    const out = groundCoverage(cards, catalog, [
      { ask: "a1", video: "v1", level: "answers" },
      { ask: "a1", video: "v3", level: "partly" },
      { ask: "a2", video: "v3", level: "partly" },
      { ask: "a9", video: "v1", level: "answers" },
      { ask: "a2", video: "v99", level: "answers" },
    ]);
    expect([...out].map(([id, m]) => [id, m.videoId, m.level])).toEqual([
      ["c1", "old1", "answers"],
      ["c2", "old2", "partly"],
    ]);
  });

  it("drops a match on the video most of the askers were watching", () => {
    const out = groundCoverage(cards, catalog, [{ ask: "a1", video: "v2", level: "answers" }]);
    expect(out.size).toBe(0);
  });

  it("keeps it when only a few of the askers were on that video", () => {
    const spread = [card("c1", "Lens review", [{ id: "x9", count: 5 }, { id: "x1", count: 1 }])];
    const out = groundCoverage(spread, catalog, [{ ask: "a1", video: "v2", level: "answers" }]);
    expect(out.get("c1")?.videoId).toBe("x1");
  });
});

it("reads refs even when the model echoes the whole line", () => {
  const cards = [card("c1", "Lens review")];
  const catalog = [video("old1")];
  const out = groundCoverage(cards, catalog, [{ ask: "a1. Lens review", video: "v1. Video old1 (2026-01-01)", level: "answers" }]);
  expect(out.get("c1")?.videoId).toBe("old1");
});
