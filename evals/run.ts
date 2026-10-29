/**
 * Evals on frozen comment snapshots. Needs an Anthropic key; costs well under $1 a run.
 *   npm run evals            all fixtures
 *   npm run evals -- vidiq   one fixture
 * Writes evals/results/latest.json and prints the Markdown table that goes in EVALS.md.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { Meter } from "../src/lib/llm";
import { overlap } from "../src/lib/pipeline/grounding";
import { groupAsks } from "../src/lib/pipeline/group";
import { sortComments, worthSorting } from "../src/lib/pipeline/sort";
import { buildCard } from "../src/lib/pipeline/cards";
import { ASK_KINDS, type CommentLabel } from "../src/lib/types";
import { FIXTURES, loadFixture } from "./sample";

process.env.NO_CACHE = "1";

type Gold = { fixture: string; id: string; label: CommentLabel };
const gold = (JSON.parse(readFileSync("evals/labels.json", "utf8")) as { labels: Gold[] }).labels;
const isAsk = (l?: string) => (ASK_KINDS as readonly string[]).includes(l ?? "");

const only = process.argv[2];
const fixtures = only ? [only] : FIXTURES;
const rows = [];

for (const name of fixtures) {
  const fx = loadFixture(name);
  const byId = new Map(fx.comments.map((c) => [c.id, c]));
  const t0 = Date.now();
  const meter = new Meter();

  // Sort the whole channel, as production does.
  const candidates = fx.comments.filter(worthSorting);
  const sorted = await sortComments(candidates, meter);
  const tSort = Date.now();

  // Sort accuracy against the hand labels for this channel.
  const mine = gold.filter((g) => g.fixture === name);
  let exact = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const confusions: { id: string; gold: string; got?: string; text: string }[] = [];
  for (const g of mine) {
    const got = sorted.labels.get(g.id);
    if (got === g.label) exact += 1;
    else confusions.push({ id: g.id, gold: g.label, got, text: byId.get(g.id)?.text.slice(0, 160) ?? "" });
    if (isAsk(got) && isAsk(g.label)) tp += 1;
    if (isAsk(got) && !isAsk(g.label)) fp += 1;
    if (!isAsk(got) && isAsk(g.label)) fn += 1;
  }

  // Group, with the grounding check.
  const asks = candidates.filter((c) => isAsk(sorted.labels.get(c.id)));
  const grouped = await groupAsks(asks, meter, { channelTitle: fx.channel.title });
  const cards = grouped.topics.map((t) => buildCard(t, byId));

  // Final output must cite only real comments with real quotes.
  let finalCites = 0;
  let finalReal = 0;
  for (const card of cards) {
    for (const id of card.commentIds) {
      finalCites += 1;
      if (byId.has(id)) finalReal += 1;
    }
  }
  let nearDupes = 0;
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) if (overlap(cards[i].commentIds, cards[j].commentIds) >= 0.3) nearDupes += 1;

  const row = {
    fixture: name,
    comments: fx.comments.length,
    sortedComments: candidates.length,
    asks: asks.length,
    labelled: mine.length,
    sortAccuracy: exact / mine.length,
    askPrecision: tp + fp ? tp / (tp + fp) : null,
    askRecall: tp + fn ? tp / (tp + fn) : null,
    confusions,
    topicsFirstPass: grouped.firstPass.topics,
    invalidTopicsFirstPass: grouped.firstPass.invalidTopics,
    citedRefsRealFirstPass: grouped.firstPass.validRefs / Math.max(1, grouped.firstPass.refs),
    quotesExactFirstPass: grouped.firstPass.validQuotes / Math.max(1, grouped.firstPass.quotes),
    topicsDropped: grouped.dropped,
    duplicatesMerged: grouped.mergedDuplicates,
    nearDuplicatePairsLeft: nearDupes,
    finalCards: cards.length,
    finalCitationsReal: finalReal / Math.max(1, finalCites),
    costUsd: meter.costUsd,
    sortSeconds: (tSort - t0) / 1000,
    totalSeconds: (Date.now() - t0) / 1000,
  };
  rows.push(row);
  console.error(`${name}: ${JSON.stringify(row)}`);
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
const table = [
  "| Channel | Comments | Sort accuracy | Ask precision / recall | Real citations (1st pass) | Exact quotes (1st pass) | Topics dropped | Dupes merged / left | Cards | Real citations (final) | Cost | Time |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.fixture} | ${r.comments} | ${pct(r.sortAccuracy)} (n=${r.labelled}) | ${pct(r.askPrecision)} / ${pct(r.askRecall)} | ${pct(r.citedRefsRealFirstPass)} | ${pct(r.quotesExactFirstPass)} | ${r.topicsDropped} | ${r.duplicatesMerged} / ${r.nearDuplicatePairsLeft} | ${r.finalCards} | ${pct(r.finalCitationsReal)} | $${r.costUsd.toFixed(3)} | ${r.totalSeconds.toFixed(0)}s |`,
  ),
].join("\n");
console.log(table);

await mkdir("evals/results", { recursive: true });
await writeFile("evals/results/latest.json", JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
await writeFile("evals/results/latest.md", `${table}\n`);

// CI gates: anything that would show a creator a fake comment fails the build.
const failures = rows.filter((r) => r.finalCitationsReal < 1 || r.sortAccuracy < 0.75);
if (failures.length) {
  console.error(`Eval gate failed for: ${failures.map((r) => r.fixture).join(", ")}`);
  process.exit(1);
}
