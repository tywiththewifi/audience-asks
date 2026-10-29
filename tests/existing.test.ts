import { describe, expect, it } from "vitest";
import { pickMatches, verdictFor } from "../src/lib/pipeline/existing";
import type { SearchResult } from "../src/lib/types";
import { decodeEntities, durationSeconds } from "../src/lib/youtube";

const result = (id: string, extra: Partial<SearchResult> = {}): SearchResult => ({
  id,
  title: `Video ${id}`,
  description: "",
  channelId: "UCother",
  channelTitle: "Someone",
  publishedAt: "2025-01-01T00:00:00Z",
  ...extra,
});

describe("pickMatches", () => {
  const results = [result("a", { views: 10 }), result("b", { views: 500 }), result("c", { channelId: "UCmine" }), result("d")];

  it("keeps same and close results, same first, then by views", () => {
    const out = pickMatches(results, [
      { ref: "r1", match: "same" },
      { ref: "r2", match: "same" },
      { ref: "r3", match: "close" },
      { ref: "r4", match: "different" },
    ]);
    expect(out.map((m) => m.id)).toEqual(["b", "a", "c"]);
  });

  it("ignores refs it never showed the model, and repeats", () => {
    const out = pickMatches(results, [
      { ref: "r9", match: "same" },
      { ref: "r1", match: "same" },
      { ref: "r1", match: "close" },
    ]);
    expect(out.map((m) => [m.id, m.match])).toEqual([["a", "same"]]);
  });

  it("flags the creator's own videos", () => {
    const out = pickMatches(results, [{ ref: "r3", match: "same" }], "UCmine");
    expect(out[0].ownChannel).toBe(true);
  });
});

describe("verdictFor", () => {
  const m = (match: "same" | "close", ownChannel = false) => ({ match, ownChannel });
  it.each([
    [[], "open"],
    [[m("close"), m("close")], "open"],
    [[m("same")], "some"],
    [[m("same"), m("same"), m("close")], "some"],
    [[m("same"), m("same"), m("same")], "crowded"],
    [[m("same"), m("same"), m("same"), m("same", true)], "yours"],
    [[m("close", true)], "open"],
  ] as const)("%j is %s", (matches, verdict) => {
    expect(verdictFor([...matches])).toBe(verdict);
  });
});

it("parses YouTube durations", () => {
  expect(durationSeconds("PT59S")).toBe(59);
  expect(durationSeconds("PT1H2M3S")).toBe(3723);
  expect(durationSeconds("P1DT1M")).toBe(86460);
  expect(durationSeconds(undefined)).toBeUndefined();
});

it("decodes search snippets", () => {
  expect(decodeEntities("Don&#39;t &quot;Stop&quot; &amp; Go")).toBe(`Don't "Stop" & Go`);
});
