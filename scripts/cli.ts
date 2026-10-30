/**
 * Run the pipeline from the terminal:
 *   npm run asks -- @handle [--videos 30] [--per-video 100] [--months 12] [--json out.json]
 */
import { writeFile } from "node:fs/promises";
import { withEarlierState } from "../src/lib/pipeline/cards";
import { runAudienceAsks } from "../src/lib/pipeline/run";
import type { AskCard, RunStats } from "../src/lib/types";
import { toMarkdown } from "../src/lib/markdown";

const args = process.argv.slice(2);
const channel = args.find((a) => !a.startsWith("--"));
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!channel) {
  console.error("Usage: npm run asks -- <@handle | channel URL> [--videos 30] [--per-video 100] [--months 12, 0 for any age] [--json out.json]");
  process.exit(1);
}

const cards = new Map<string, AskCard>();
const started = new Set<string>();
let stats: RunStats | undefined;
let title = channel;
for await (const ev of runAudienceAsks(channel, { maxVideos: Number(flag("videos") ?? 30), commentsPerVideo: Number(flag("per-video") ?? 100), months: flag("months") === undefined ? undefined : Number(flag("months")) })) {
  // Grouping repeats its start message with a running count of topics, which only the page needs.
  if (ev.type === "progress" && (ev.status === "done" || !started.has(ev.step))) {
    started.add(ev.step);
    console.error(`${ev.status === "done" ? "✓" : "…"} ${ev.message}`);
  }
  if (ev.type === "channel") title = ev.channel.title;
  if (ev.type === "step_error") console.error(`✗ ${ev.step}: ${ev.message}`);
  if (ev.type === "card") cards.set(ev.card.id, ev.card);
  if (ev.type === "cards") {
    const earlier = [...cards.values()];
    cards.clear();
    for (const card of withEarlierState(ev.cards, earlier)) cards.set(card.id, card);
  }
  if (ev.type === "idea") {
    const card = cards.get(ev.cardId);
    if (card) {
      card.idea = ev.idea;
      card.ideaError = ev.error;
    }
  }
  if (ev.type === "coverage") for (const m of ev.matches) cards.get(m.cardId)!.answeredBy = m.match;
  if (ev.type === "done") stats = ev.stats;
}

const list = [...cards.values()];
console.log(toMarkdown(title, list, { comments: stats?.range, videos: stats?.videoRange }));
if (stats) console.error(`\n${stats.comments} comments, ${stats.quotaUnits} quota units, $${stats.costUsd.toFixed(3)}, ${(stats.ms / 1000).toFixed(1)}s`);
const out = flag("json");
if (out) await writeFile(out, JSON.stringify({ channel: title, cards: list, stats }, null, 2));
