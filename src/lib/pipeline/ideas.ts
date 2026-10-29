import { z } from "zod";
import type { AskCard, Comment, VideoIdea } from "../types";
import { MODELS, type Meter, structured } from "../llm";

const IdeaSchema = z.object({
  title_a: z.string(),
  title_b: z.string(),
  hook: z.string(),
  why: z.string(),
  search_query: z.string(),
});

export const IDEAS_SYSTEM = `You turn a cluster of real viewer comments into one video idea for the creator who received them.

- Two title options in the channel's own style (look at its recent titles), each under 70 characters. Make them specific and honest; no clickbait the video could not deliver.
- "hook": the first 10 seconds of the video, spoken by the creator, one or two sentences.
- "why": one sentence for the creator on why this should work, pointing at the evidence (how many viewers asked, on which kind of videos).
- "search_query": what a viewer would type into YouTube search to find a video like this, 2 to 6 words, no channel name. It's used to check whether this video already exists.`;

export async function writeIdea(
  card: AskCard,
  comments: Comment[],
  context: { channelTitle: string; recentTitles: string[] },
  meter: Meter,
): Promise<VideoIdea> {
  const sample = comments
    .slice(0, 12)
    .map((c) => `- ${c.text.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");
  const out = await structured({
    model: MODELS.ideas,
    system: IDEAS_SYSTEM,
    user: `Channel: ${context.channelTitle}
Recent titles:
${context.recentTitles.slice(0, 12).map((t) => `- ${t}`).join("\n")}

The ask: ${card.ask}
What viewers want: ${card.summary}
${card.viewerCount} different viewers asked, across ${card.videos.length} videos.

Some of their comments:
${sample}`,
    schema: IdeaSchema,
    effort: "low",
    maxTokens: 4000,
    meter,
  });
  return { titles: [out.title_a, out.title_b], hook: out.hook, why: out.why, searchQuery: out.search_query };
}
