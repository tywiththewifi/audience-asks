import { expect, it } from "vitest";
import { createSSEParser } from "../src/lib/sse";

it("parses events split across chunks and ignores comments", () => {
  const got: unknown[] = [];
  const feed = createSSEParser((d) => got.push(d));
  feed('data: {"a":1}\n\n: ping\n\ndata: {"b"');
  feed(':2}\n\n');
  expect(got).toEqual([{ a: 1 }, { b: 2 }]);
});
