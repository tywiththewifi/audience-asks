import { expect, it } from "vitest";
import { createArrayItemParser } from "../src/lib/json-stream";

const doc = JSON.stringify(
  {
    topics: [
      { ask: 'Why "zero views"? {not a brace}', comment_refs: ["c1", "c2"], quotes: [{ ref: "c1", quote: "back\\slash ] and [" }] },
      { ask: "Second", comment_refs: [], quotes: [] },
    ],
  },
  null,
  1,
);

function items(chunks: string[]) {
  const got: unknown[] = [];
  const feed = createArrayItemParser((json) => got.push(JSON.parse(json)));
  for (const c of chunks) feed(c);
  return got;
}

it("hands over each finished item, whatever the chunk boundaries", () => {
  const expected = JSON.parse(doc).topics;
  expect(items([doc])).toEqual(expected);
  expect(items([...doc])).toEqual(expected);
  for (let size = 2; size < 40; size += 7) {
    const chunks = [];
    for (let i = 0; i < doc.length; i += size) chunks.push(doc.slice(i, i + size));
    expect(items(chunks)).toEqual(expected);
  }
});

it("hands over an item as soon as it closes, before the document ends", () => {
  const got = items([doc.slice(0, doc.indexOf('"Second"'))]);
  expect(got).toHaveLength(1);
});

it("ignores an item the stream cut off", () => {
  expect(items(['{"topics": [{"ask": "a"}, {"ask": "b'])).toEqual([{ ask: "a" }]);
});
