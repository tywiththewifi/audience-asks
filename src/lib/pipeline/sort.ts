import { z } from "zod";
import { COMMENT_LABELS, type Comment, type CommentLabel } from "../types";
import { LLMError, MODELS, type Meter, structured } from "../llm";
import { mapLimit } from "../youtube";

export const SORT_BATCH = 80;

const SortSchema = z.object({
  labels: z.array(z.object({ ref: z.string(), label: z.enum(COMMENT_LABELS) })),
});

export const SORT_SYSTEM = `You label YouTube comments for a creator who wants to know what their viewers are asking for.

Give every comment exactly one label:
- question: the viewer asks something they want answered (how, why, what gear, will you, can you explain…). Rhetorical or joking questions are not questions.
- request: the viewer asks the creator to make, cover, review, try or bring back something ("do a video on…", "part 2 please", "review the X next").
- complaint: the viewer reports a problem with the content, audio, pacing, sponsor, upload schedule or a product the creator showed, in a way the creator could act on.
- praise: thanks, compliments, "great video" and similar, with no ask inside.
- other: jokes, timestamps, reactions, opinions, chatting with other viewers, anything else.
- spam: scams, bots, self-promotion, links to unrelated channels, "check my channel".

If a comment both praises and asks, the ask wins. Comments can be in any language; label them the same way.
Return one entry per comment, using the ref shown in brackets.`;

export function formatSortBatch(batch: Comment[], offset: number) {
  return batch.map((c, i) => `[c${offset + i}] ${c.text.replace(/\s+/g, " ").slice(0, 600)}`).join("\n");
}

/** Cheap pre-filter: very short or letter-free comments can never be an ask worth a card. */
export function worthSorting(c: Comment) {
  const letters = c.text.match(/\p{L}/gu)?.length ?? 0;
  return letters >= 8;
}

export type SortResult = {
  labels: Map<string, CommentLabel>;
  failedBatches: number;
  totalBatches: number;
  missing: number;
};

export async function sortComments(comments: Comment[], meter: Meter, concurrency = 6): Promise<SortResult> {
  const batches: Comment[][] = [];
  for (let i = 0; i < comments.length; i += SORT_BATCH) batches.push(comments.slice(i, i + SORT_BATCH));

  const labels = new Map<string, CommentLabel>();
  let failedBatches = 0;
  let missing = 0;

  await mapLimit(batches, concurrency, async (batch) => {
    const refs = new Map(batch.map((c, i) => [`c${i}`, c.id]));
    const run = () =>
      structured({
        model: MODELS.sort,
        system: SORT_SYSTEM,
        user: `Label these ${batch.length} comments.\n\n${formatSortBatch(batch, 0)}`,
        schema: SortSchema,
        effort: "low",
        maxTokens: 8000,
        meter,
      });
    let out;
    try {
      out = await run();
    } catch (err) {
      if (!(err instanceof LLMError) || !err.retryable) throw err;
      try {
        out = await run();
      } catch {
        failedBatches += 1;
        return;
      }
    }
    const seen = new Set<string>();
    for (const { ref, label } of out.labels) {
      const id = refs.get(ref);
      if (!id || seen.has(id)) continue; // ignore refs the model invented
      seen.add(id);
      labels.set(id, label);
    }
    for (const id of refs.values()) {
      if (!seen.has(id)) {
        missing += 1;
        labels.set(id, "other");
      }
    }
  });

  return { labels, failedBatches, totalBatches: batches.length, missing };
}
