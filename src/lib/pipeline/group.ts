import { z } from "zod";
import type { Comment } from "../types";
import { LLMError, MODELS, type Meter, structured } from "../llm";
import { type GroundedTopic, type RawTopic, groundTopics, mergeDuplicates, quoteIsInComment } from "./grounding";

/** Upper bound on comments sent to the grouping step. Above it we keep the most-liked ones. */
export const GROUP_MAX_COMMENTS = 1500;

const TopicSchema = z.object({
  ask: z.string(),
  kind: z.enum(["question", "request", "complaint"]),
  summary: z.string(),
  comment_refs: z.array(z.string()),
  quotes: z.array(z.object({ ref: z.string(), quote: z.string() })),
});
const GroupSchema = z.object({ topics: z.array(TopicSchema) });

export const GROUP_SYSTEM = `You help a YouTube creator see what their audience keeps asking for.

You get comments that were already sorted as questions, requests or complaints. Group them into topics: one topic per distinct thing viewers want, so that a creator could answer the whole topic with one video.

Rules:
- Write "ask" in the viewer's voice, short and concrete, under 90 characters. Good: "How do you light a small room on a budget?" Bad: "Lighting questions".
- "summary" is one plain sentence on what viewers want and why, for the creator.
- "comment_refs" lists every comment ref that belongs to the topic. Use only refs that appear in the input, exactly as written (for example c41). Never invent a ref.
- "quotes" has 1 to 3 of the clearest comments. Each quote is copied character for character from that comment's text, at least a few words long; you may cut it short but never reword, translate or fix spelling.
- A topic needs at least 2 comments, unless a single comment is so specific and well-liked that the creator should see it.
- Do not split one want into near-duplicate topics. Do not create a topic for generic praise.
- Skip comments that fit no topic. Return at most 20 topics, the strongest first.`;

export function formatGroupInput(comments: Comment[]) {
  return comments
    .map((c, i) => {
      const likes = c.likeCount ? ` (${c.likeCount} likes)` : "";
      return `[c${i}] video "${c.videoTitle.slice(0, 60)}"${likes}: ${c.text.replace(/\s+/g, " ").slice(0, 700)}`;
    })
    .join("\n");
}

export type GroupResult = {
  topics: GroundedTopic[];
  dropped: number;
  retried: boolean;
  mergedDuplicates: number;
  rawTopicCount: number;
  /** First-pass citation health, before the retry. Evals track these. */
  firstPass: { refs: number; validRefs: number; quotes: number; validQuotes: number; topics: number; invalidTopics: number };
};

function citationStats(topics: RawTopic[], refs: Map<string, Comment>) {
  let n = 0;
  let ok = 0;
  let qn = 0;
  let qok = 0;
  for (const t of topics) {
    for (const r of t.comment_refs) {
      n += 1;
      if (refs.has(r)) ok += 1;
    }
    for (const q of t.quotes) {
      qn += 1;
      const c = refs.get(q.ref);
      if (c && quoteIsInComment(q.quote, c.text)) qok += 1;
    }
  }
  return { refs: n, validRefs: ok, quotes: qn, validQuotes: qok };
}

export async function groupAsks(
  asks: Comment[],
  meter: Meter,
  context: { channelTitle: string },
): Promise<GroupResult> {
  const chosen =
    asks.length > GROUP_MAX_COMMENTS ? [...asks].sort((a, b) => b.likeCount - a.likeCount).slice(0, GROUP_MAX_COMMENTS) : asks;
  const refs = new Map(chosen.map((c, i) => [`c${i}`, c]));
  const input = formatGroupInput(chosen);
  const user = `Channel: ${context.channelTitle}\n${chosen.length} comments:\n\n${input}`;

  const first = await structured({
    model: MODELS.group,
    system: GROUP_SYSTEM,
    user,
    schema: GroupSchema,
    effort: "medium",
    maxTokens: 32000,
    // The one long call. Retrying it would run past the route's 5-minute limit, so a stall surfaces as a retryable error.
    timeoutMs: 200_000,
    maxRetries: 0,
    meter,
  });

  const firstPass = groundTopics(first.topics as RawTopic[], refs);
  const firstStats = {
    ...citationStats(first.topics as RawTopic[], refs),
    topics: first.topics.length,
    invalidTopics: firstPass.invalid.length,
  };
  let valid = firstPass.valid;
  let dropped = 0;
  let retried = false;

  if (firstPass.invalid.length) {
    // One retry, scoped to the broken topics, with the exact problems spelled out.
    retried = true;
    const problems = firstPass.invalid
      .map(({ topic, problems }, i) => `${i + 1}. "${topic.ask}": ${problems.join("; ")}`)
      .join("\n");
    try {
      const fix = await structured({
        model: MODELS.group,
        system: GROUP_SYSTEM,
        user: `${user}\n\nYou already grouped these comments, but these topics failed the citation check:\n${problems}\n\nReturn corrected versions of only these topics. Use only refs from the input and copy quotes exactly. Leave out a topic if you cannot ground it.`,
        schema: GroupSchema,
        effort: "medium",
        maxTokens: 16000,
        timeoutMs: 120_000,
        maxRetries: 0,
        meter,
      });
      const second = groundTopics(fix.topics as RawTopic[], refs);
      valid = [...valid, ...second.valid];
      dropped = Math.max(0, firstPass.invalid.length - second.valid.length);
    } catch (err) {
      if (!(err instanceof LLMError)) throw err;
      dropped = firstPass.invalid.length;
    }
  }

  const { topics, merged } = mergeDuplicates(valid);
  return { topics, dropped, retried, mergedDuplicates: merged, rawTopicCount: first.topics.length, firstPass: firstStats };
}
