import type { Comment } from "../types";

export type RawTopic = {
  ask: string;
  kind: "question" | "request" | "complaint";
  summary: string;
  comment_refs: string[];
  quotes: { ref: string; quote: string }[];
};

export type GroundedTopic = Omit<RawTopic, "comment_refs" | "quotes"> & {
  commentIds: string[];
  quotes: { commentId: string; quote: string }[];
};

export type TopicProblem = { topic: RawTopic; problems: string[] };

/**
 * The number in a ref like "v12". Models sometimes echo the whole line ("v12. Some title"), so this
 * reads only the leading ref. Anything else is undefined, and callers drop it.
 */
export function refNumber(ref: string, prefix: string): number | undefined {
  const m = ref.trim().match(new RegExp(`^${prefix}(\\d+)(?![\\d])`, "i"));
  return m ? Number(m[1]) : undefined;
}

export function normalize(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/** A quote is grounded when it appears word for word (after whitespace and quote-mark normalisation) in the comment. */
export function quoteIsInComment(quote: string, text: string) {
  const q = normalize(quote).replace(/^["'.\s]+|["'.\s]+$/g, "");
  if (q.length < 6) return false;
  return normalize(text).includes(q);
}

/**
 * The grounding check. A topic survives only if every comment it cites exists in the input
 * and every quote is really inside the comment it points at. Anything else is a hallucination,
 * and we would rather drop a topic than show a creator a comment nobody wrote.
 */
export function groundTopics(topics: RawTopic[], refs: Map<string, Comment>): { valid: GroundedTopic[]; invalid: TopicProblem[] } {
  const valid: GroundedTopic[] = [];
  const invalid: TopicProblem[] = [];

  for (const topic of topics) {
    const problems: string[] = [];
    const ids = new Set<string>();
    for (const ref of topic.comment_refs) {
      const c = refs.get(ref);
      if (!c) problems.push(`cites ${ref}, which is not in the input`);
      else ids.add(c.id);
    }

    const quotes: GroundedTopic["quotes"] = [];
    for (const q of topic.quotes) {
      const c = refs.get(q.ref);
      if (!c) {
        problems.push(`quotes ${q.ref}, which is not in the input`);
        continue;
      }
      if (!quoteIsInComment(q.quote, c.text)) {
        problems.push(`the quote "${q.quote.slice(0, 80)}" is not in ${q.ref}`);
        continue;
      }
      ids.add(c.id);
      if (!quotes.some((x) => x.commentId === c.id)) quotes.push({ commentId: c.id, quote: q.quote.trim() });
    }

    if (ids.size === 0) problems.push("cites no comments");
    if (topic.quotes.length === 0) problems.push("has no quotes");

    if (problems.length) invalid.push({ topic, problems });
    else valid.push({ ask: topic.ask, kind: topic.kind, summary: topic.summary, commentIds: [...ids], quotes });
  }

  return { valid, invalid };
}

/** Share of comments two topics have in common, relative to the smaller one. */
export function overlap(a: string[], b: string[]) {
  const sb = new Set(b);
  const shared = a.filter((x) => sb.has(x)).length;
  return shared / Math.max(1, Math.min(a.length, b.length));
}

/** Folds topics that share most of their comments into the bigger one. */
export function mergeDuplicates(topics: GroundedTopic[], threshold = 0.6): { topics: GroundedTopic[]; merged: number } {
  const sorted = [...topics].sort((x, y) => y.commentIds.length - x.commentIds.length);
  const kept: GroundedTopic[] = [];
  let merged = 0;
  for (const t of sorted) {
    const host = kept.find((k) => overlap(k.commentIds, t.commentIds) >= threshold);
    if (!host) {
      kept.push({ ...t, commentIds: [...t.commentIds], quotes: [...t.quotes] });
      continue;
    }
    merged += 1;
    host.commentIds = [...new Set([...host.commentIds, ...t.commentIds])];
    for (const q of t.quotes) if (!host.quotes.some((h) => h.commentId === q.commentId)) host.quotes.push(q);
  }
  return { topics: kept, merged };
}
