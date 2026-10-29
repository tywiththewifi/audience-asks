import { z } from "zod";
import { TTL, cacheKey, cached } from "../cache";
import { MODELS, Meter, structured } from "../llm";
import type { CheckVerdict, ExistingVideo, IdeaCheck, SearchResult } from "../types";
import { Quota, searchVideos } from "../youtube";

export const CHECK_RESULTS = 10;

const JudgeSchema = z.object({
  results: z.array(z.object({ ref: z.string(), match: z.enum(["same", "close", "different"]) })),
  summary: z.string(),
  angle: z.string(),
});

export const CHECK_SYSTEM = `You check whether a video idea already exists on YouTube. You get what viewers asked for, the proposed titles, and the top YouTube search results for it.

Rate every result:
- "same": a viewer who asked this would feel the video answers it. Same subject and the same question or request, even if the title is worded differently.
- "close": same subject, but it answers a different question or only part of this one.
- "different": anything else, including videos that only share keywords.

Judge only from each result's title, description and channel. Don't guess what a video contains beyond that.

"summary": one plain sentence for the creator on what already exists, using only these results (how many make this video, how old they are, how many views).
"angle": one sentence on how the creator's version could stand out, based on what the viewers asked and what the existing videos miss. If nothing matches, say what the video must cover to answer the ask.`;

export type CheckInput = {
  ask: string;
  summary: string;
  titles: string[];
  query: string;
  /** The channel the ask came from, so its own videos can be flagged. */
  channelId?: string;
};

export function verdictFor(matches: Pick<ExistingVideo, "match" | "ownChannel">[]): CheckVerdict {
  if (matches.some((m) => m.ownChannel && m.match === "same")) return "yours";
  const same = matches.filter((m) => m.match === "same").length;
  if (same >= 3) return "crowded";
  if (same >= 1) return "some";
  return "open";
}

/** Keeps only results the model rated same or close, by refs it was actually given. Same first, then by views. */
export function pickMatches(
  results: SearchResult[],
  ratings: { ref: string; match: "same" | "close" | "different" }[],
  channelId?: string,
): ExistingVideo[] {
  const byRef = new Map(results.map((r, i) => [`r${i + 1}`, r]));
  const seen = new Set<string>();
  const out: ExistingVideo[] = [];
  for (const { ref, match } of ratings) {
    const r = byRef.get(ref);
    if (!r || match === "different" || seen.has(ref)) continue;
    seen.add(ref);
    out.push({ ...r, match, ownChannel: !!channelId && r.channelId === channelId });
  }
  return out.sort((a, b) => (a.match === b.match ? (b.views ?? 0) - (a.views ?? 0) : a.match === "same" ? -1 : 1));
}

const age = (iso: string) => {
  const days = (Date.now() - Date.parse(iso)) / 86_400_000;
  return days < 60 ? `${Math.round(days)} days ago` : days < 730 ? `${Math.round(days / 30)} months ago` : `${Math.round(days / 365)} years ago`;
};

/** Searches YouTube for the idea and asks a small model which results already make this video. */
export async function checkIdea(input: CheckInput, meter = new Meter()): Promise<IdeaCheck> {
  const query = input.query.trim();
  const quota = new Quota();
  const search = await cached(cacheKey("search", query.toLowerCase(), CHECK_RESULTS), TTL.day, () =>
    searchVideos(query, CHECK_RESULTS, quota),
  );
  const results = search.value;
  let matches: ExistingVideo[] = [];
  let summary = "No videos came up for this search.";
  let angle = "";
  let judgeHit = true;
  if (results.length) {
    const list = results
      .map(
        (r, i) =>
          `r${i + 1}. "${r.title}" by ${r.channelTitle}${r.channelId === input.channelId ? " (this creator's own channel)" : ""} · ${age(r.publishedAt)} · ${
            r.views === undefined ? "views hidden" : `${r.views.toLocaleString("en-US")} views`
          }${r.seconds !== undefined && r.seconds <= 180 ? " · Short" : ""}\n    ${r.description.replace(/\s+/g, " ").slice(0, 200)}`,
      )
      .join("\n");
    const judged = await cached(
      cacheKey("check", MODELS.check, CHECK_SYSTEM, input.ask, input.titles, results.map((r) => r.id)),
      TTL.day,
      () =>
        structured({
          model: MODELS.check,
          system: CHECK_SYSTEM,
          user: `What viewers asked: ${input.ask}
In more detail: ${input.summary}
Proposed titles:
${input.titles.map((t) => `- ${t}`).join("\n")}

Top YouTube results for "${query}":
${list}`,
          schema: JudgeSchema,
          effort: "low",
          maxTokens: 3000,
          meter,
        }),
    );
    judgeHit = judged.hit;
    matches = pickMatches(results, judged.value.results, input.channelId);
    summary = judged.value.summary;
    angle = judged.value.angle;
  }
  return {
    query,
    verdict: verdictFor(matches),
    summary,
    angle,
    matches,
    searched: results.length,
    checkedAt: new Date().toISOString(),
    quotaUnits: quota.units,
    costUsd: Number(meter.costUsd.toFixed(4)),
    cached: search.hit && judgeHit,
  };
}
