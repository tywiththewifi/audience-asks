import { describe, expect, it } from "vitest";
import { groundCoverage } from "../src/lib/pipeline/coverage";
import { findOutliers, median, sentimentByVideo } from "../src/lib/pipeline/health";
import type { AskCard, CommentLabel, Video } from "../src/lib/types";
import { comment } from "./helpers";

const video = (id: string, views?: number, publishedAt = `2026-0${id.length}-01T00:00:00Z`): Video => ({ id, title: `Video ${id}`, publishedAt, views });
const card = (id: string, ask: string, videos: { id: string; count: number }[] = []) =>
  ({ id, ask, summary: "", videos: videos.map((v) => ({ ...v, title: v.id })) }) as unknown as AskCard;

it("takes the median of odd and even lists", () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 3, 2])).toBe(2.5);
  expect(median([])).toBeUndefined();
});

describe("sentimentByVideo", () => {
  it("counts praise and complaints per video, oldest first", () => {
    const videos = [video("bb", 0, "2026-05-01T00:00:00Z"), video("a", 0, "2026-01-01T00:00:00Z")];
    const cs = [comment("love it", { videoId: "bb" }), comment("too long", { videoId: "bb" }), comment("great", { videoId: "a" })];
    const labels = new Map<string, CommentLabel>([
      [cs[0].id, "praise"],
      [cs[1].id, "complaint"],
      [cs[2].id, "praise"],
    ]);
    const rows = sentimentByVideo(videos, cs, labels);
    expect(rows.map((r) => [r.id, r.praise, r.complaint, r.comments])).toEqual([
      ["a", 1, 0, 1],
      ["bb", 1, 1, 2],
    ]);
  });
});

describe("findOutliers", () => {
  const videos = ["v1", "v2", "v3", "v4", "v5", "v6"].map((id, i) => video(id, [100, 120, 90, 110, 500, 230][i]));
  it("flags videos at 2× the median or more, biggest first, with their top ask", () => {
    const cards = [card("c1", "Do a lens review", [{ id: "v5", count: 4 }]), card("c2", "Show the edit", [{ id: "v5", count: 9 }])];
    const out = findOutliers(videos, cards, new Map([["v5", 12]]));
    expect(out.medianViews).toBe(115);
    expect(out.videos.map((v) => [v.id, v.multiple, v.asks, v.topAsk])).toEqual([
      ["v5", 4.3, 12, "Show the edit"],
      ["v6", 2, 0, undefined],
    ]);
  });
  it("needs at least five videos with views", () => {
    expect(findOutliers(videos.slice(0, 4), [], new Map()).videos).toEqual([]);
  });
});

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
