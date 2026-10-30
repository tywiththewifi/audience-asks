import { describe, expect, it } from "vitest";
import { groundTopics, mergeDuplicates, quoteIsInComment, refNumber } from "../src/lib/pipeline/grounding";
import { comment } from "./helpers";

describe("quoteIsInComment", () => {
  it("accepts exact and whitespace/quote-mark variants", () => {
    const text = "Can you do a video on   lighting a small room? I’m stuck.";
    expect(quoteIsInComment("lighting a small room", text)).toBe(true);
    expect(quoteIsInComment("Can you do a video on lighting", text)).toBe(true);
    expect(quoteIsInComment("I'm stuck", text)).toBe(true);
    expect(quoteIsInComment('"lighting a small room?"', text)).toBe(true);
  });

  it("rejects reworded, translated or tiny quotes", () => {
    const text = "Can you do a video on lighting a small room?";
    expect(quoteIsInComment("lighting a tiny room", text)).toBe(false);
    expect(quoteIsInComment("iluminar una habitación", text)).toBe(false);
    expect(quoteIsInComment("a", text)).toBe(false);
  });
});

describe("groundTopics", () => {
  const a = comment("How do you light a small room on a budget?");
  const b = comment("Please make a lighting video for tiny apartments");
  const refs = new Map([
    ["c0", a],
    ["c1", b],
  ]);

  it("keeps a topic whose refs and quotes check out", () => {
    const { valid, invalid } = groundTopics(
      [
        {
          ask: "How do I light a small room?",
          kind: "question",
          summary: "Viewers in small spaces want lighting help.",
          comment_refs: ["c0", "c1"],
          quotes: [{ ref: "c0", quote: "light a small room on a budget" }],
        },
      ],
      refs,
    );
    expect(invalid).toEqual([]);
    expect(valid[0].commentIds).toEqual([a.id, b.id]);
    expect(valid[0].quotes).toEqual([{ commentId: a.id, quote: "light a small room on a budget" }]);
  });

  it("drops a topic that cites a comment id that does not exist", () => {
    const { valid, invalid } = groundTopics(
      [{ ask: "x", kind: "request", summary: "", comment_refs: ["c0", "c99"], quotes: [{ ref: "c0", quote: "light a small room" }] }],
      refs,
    );
    expect(valid).toEqual([]);
    expect(invalid[0].problems[0]).toContain("c99");
  });

  it("drops a topic whose quote is not in the comment", () => {
    const { valid, invalid } = groundTopics(
      [{ ask: "x", kind: "request", summary: "", comment_refs: ["c1"], quotes: [{ ref: "c1", quote: "lighting video for big studios" }] }],
      refs,
    );
    expect(valid).toEqual([]);
    expect(invalid[0].problems[0]).toContain("not in c1");
  });

  it("drops a topic with no quotes", () => {
    const { invalid } = groundTopics([{ ask: "x", kind: "request", summary: "", comment_refs: ["c1"], quotes: [] }], refs);
    expect(invalid[0].problems).toContain("has no quotes");
  });
});

describe("mergeDuplicates", () => {
  it("folds a topic that mostly repeats a bigger one", () => {
    const t = (ids: string[]) => ({ ask: ids.join(), kind: "question" as const, summary: "", commentIds: ids, quotes: [] });
    const { topics, merged } = mergeDuplicates([t(["1", "2", "3", "4"]), t(["3", "4", "5"]), t(["9", "10"])]);
    expect(merged).toBe(1);
    expect(topics).toHaveLength(2);
    expect(topics[0].commentIds.sort()).toEqual(["1", "2", "3", "4", "5"]);
  });
});

describe("refNumber", () => {
  it.each([
    ["v12", 12],
    [" v12 ", 12],
    ["v12. Some title", 12],
    ["V3", 3],
    ["v", undefined],
    ["x12", undefined],
    ["v12abc", 12],
    ["a1. Why does it?", undefined],
  ] as const)("%j", (ref, n) => {
    expect(refNumber(ref, "v")).toBe(n);
  });
});
