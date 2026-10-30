import { z } from "zod";
import { MODELS, type Meter, structured } from "../llm";
import type { AskCard, CatalogMatch, Video } from "../types";
import { refNumber } from "./grounding";

const CoverageSchema = z.object({
  matches: z.array(
    z.object({
      ask: z.string().describe("The ask's ref only, like a3"),
      video: z.string().describe("The video's ref only, like v12"),
      level: z.enum(["answers", "partly"]),
    }),
  ),
});

export const COVERAGE_SYSTEM = `You match what a channel's viewers are asking for against the channel's own past videos, to find the asks the channel has already answered.

You get numbered asks (a1, a2…) and the channel's video titles (v1, v2…) with their dates.

For each ask, return the one past video that best answers it, if any does:
- "answers": the title clearly promises to answer this specific ask. A viewer who asked would be satisfied being sent to that video.
- "partly": the title takes on this same specific question, but answers only part of it, or an older version of it (for example, last year's rules).

Sharing a broad subject is not a match. On a channel where every video is about the same field, most asks will have no match, and that's the useful answer. When in doubt, leave the ask out.

Give refs only ("a3", "v12"), not the text. Judge only from the titles; don't guess at what a video contains.`;

/**
 * Which asks the channel's back catalogue already answers. The model only sees refs (a1, v1), and code drops
 * any ref it wasn't given. A match is dropped too when most of the people asking were watching that very
 * video: it plainly didn't answer them.
 */
export function groundCoverage(cards: AskCard[], catalog: Video[], raw: z.infer<typeof CoverageSchema>["matches"]) {
  const out = new Map<string, CatalogMatch>();
  for (const m of raw) {
    const a = refNumber(m.ask, "a");
    const v = refNumber(m.video, "v");
    const card = a ? cards[a - 1] : undefined;
    const video = v ? catalog[v - 1] : undefined;
    if (!card || !video || out.has(card.id)) continue;
    const total = card.videos.reduce((n, v) => n + v.count, 0);
    const onThatVideo = card.videos.find((v) => v.id === video.id)?.count ?? 0;
    if (total && onThatVideo / total >= 0.5) continue;
    out.set(card.id, { videoId: video.id, title: video.title, publishedAt: video.publishedAt, level: m.level });
  }
  return out;
}

export async function matchCatalog(cards: AskCard[], catalog: Video[], meter: Meter, channelTitle: string) {
  if (!cards.length || !catalog.length) return new Map<string, CatalogMatch>();
  const out = await structured({
    model: MODELS.check,
    system: COVERAGE_SYSTEM,
    user: `Channel: ${channelTitle}

Asks:
${cards.map((c, i) => `a${i + 1}. ${c.ask} (${c.summary.replace(/\s+/g, " ").slice(0, 200)})`).join("\n")}

Past videos:
${catalog.map((v, i) => `v${i + 1}. ${v.title} (${v.publishedAt.slice(0, 10)})`).join("\n")}`,
    schema: CoverageSchema,
    effort: "low",
    maxTokens: 4000,
    meter,
  });
  return groundCoverage(cards, catalog, out.matches);
}
