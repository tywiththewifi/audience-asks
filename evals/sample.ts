/** Picks the fixed 40-per-channel sample that evals/labels.json labels. Deterministic. */
import { readFileSync } from "node:fs";
import { worthSorting } from "../src/lib/pipeline/sort";
import type { Comment } from "../src/lib/types";

export const FIXTURES = ["vidiq", "petermckinnon", "nilered", "aliabdaal", "joshuaweissman"];

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function loadFixture(name: string) {
  return JSON.parse(readFileSync(`evals/fixtures/${name}.json`, "utf8")) as {
    channel: import("../src/lib/types").Channel;
    videos: import("../src/lib/types").Video[];
    comments: Comment[];
  };
}

export function labelSample(name: string, size = 40): Comment[] {
  const pool = loadFixture(name).comments.filter(worthSorting).sort((a, b) => a.id.localeCompare(b.id));
  const rand = rng(name.length * 7919);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

if (process.argv[1]?.endsWith("sample.ts")) {
  for (const f of FIXTURES) for (const c of labelSample(f)) console.log(`${f}\t${c.id}\t${c.text.replace(/\s+/g, " ").slice(0, 300)}`);
}
