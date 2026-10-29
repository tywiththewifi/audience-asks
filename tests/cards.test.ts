import { describe, expect, it } from "vitest";
import { buildCard, evidenceFor, rankCards } from "../src/lib/pipeline/cards";
import { worthSorting } from "../src/lib/pipeline/sort";
import { comment } from "./helpers";

describe("buildCard", () => {
  it("counts distinct viewers, not comments", () => {
    const a = comment("How do you light a small room?", { authorChannelId: "UCsame", likeCount: 5 });
    const b = comment("Seriously, how do you light a small room??", { authorChannelId: "UCsame" });
    const c = comment("Small room lighting video please", { videoId: "v2", videoTitle: "Two" });
    const byId = new Map([a, b, c].map((x) => [x.id, x]));
    const card = buildCard(
      { ask: "How do I light a small room?", kind: "question", summary: "", commentIds: [a.id, b.id, c.id], quotes: [{ commentId: c.id, quote: "Small room lighting" }] },
      byId,
      Date.parse("2026-10-20T00:00:00Z"),
    );
    expect(card.viewerCount).toBe(2);
    expect(card.videos.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(card.proof[0].commentId).toBe(c.id); // grounded quote first
    expect(card.proof[1].commentId).toBe(a.id); // then most liked
    expect(card.recentCount).toBe(3);
    expect(card.evidence).toBe("thin");
  });
});

it("labels evidence by viewers and spread", () => {
  expect(evidenceFor(12, 3)).toBe("strong");
  expect(evidenceFor(12, 1)).toBe("some");
  expect(evidenceFor(3, 1)).toBe("some");
  expect(evidenceFor(2, 2)).toBe("thin");
});

it("ranks by distinct viewers, then likes", () => {
  const base = { kind: "question", summary: "", commentIds: [], videos: [], proof: [], evidence: "thin", recentCount: 0 } as const;
  const ranked = rankCards([
    { ...base, id: "a", ask: "a", viewerCount: 3, likeCount: 1 },
    { ...base, id: "b", ask: "b", viewerCount: 9, likeCount: 0 },
    { ...base, id: "c", ask: "c", viewerCount: 3, likeCount: 50 },
  ]);
  expect(ranked.map((c) => c.id)).toEqual(["b", "c", "a"]);
});

it("skips comments too short to hold an ask", () => {
  expect(worthSorting(comment("🔥🔥🔥"))).toBe(false);
  expect(worthSorting(comment("first!"))).toBe(false);
  expect(worthSorting(comment("What mic is that?"))).toBe(true);
});
