import type { AskCard, Comment, Evidence } from "../types";
import type { GroundedTopic } from "./grounding";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export function viewerKey(c: Comment) {
  return c.authorChannelId ?? c.author;
}

export function evidenceFor(viewers: number, videos: number): Evidence {
  if (viewers >= 8 && videos >= 2) return "strong";
  if (viewers >= 3) return "some";
  return "thin";
}

export function buildCard(topic: GroundedTopic, byId: Map<string, Comment>, now = Date.now()): AskCard {
  const comments = topic.commentIds.map((id) => byId.get(id)).filter((c): c is Comment => Boolean(c));
  const viewers = new Set(comments.map(viewerKey));

  const perVideo = new Map<string, { id: string; title: string; count: number }>();
  for (const c of comments) {
    const v = perVideo.get(c.videoId) ?? { id: c.videoId, title: c.videoTitle, count: 0 };
    v.count += 1;
    perVideo.set(c.videoId, v);
  }
  const videos = [...perVideo.values()].sort((a, b) => b.count - a.count);

  // Proof: the model's grounded quotes first, then the most-liked remaining comments.
  const proof: AskCard["proof"] = [];
  for (const q of topic.quotes) {
    const c = byId.get(q.commentId);
    if (c && proof.length < 3) proof.push({ commentId: c.id, quote: q.quote, comment: c });
  }
  for (const c of [...comments].sort((a, b) => b.likeCount - a.likeCount)) {
    if (proof.length >= 3) break;
    if (proof.some((p) => p.commentId === c.id)) continue;
    const text = c.text.trim();
    proof.push({ commentId: c.id, quote: text.length > 220 ? `${text.slice(0, 217)}…` : text, comment: c });
  }

  const slug = topic.ask
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return {
    id: `${slug}-${topic.commentIds[0]?.slice(-6) ?? "x"}`,
    ask: topic.ask,
    kind: topic.kind,
    summary: topic.summary,
    viewerCount: viewers.size,
    commentIds: comments.map((c) => c.id),
    videos,
    proof,
    evidence: evidenceFor(viewers.size, videos.length),
    recentCount: comments.filter((c) => now - Date.parse(c.publishedAt) < THIRTY_DAYS).length,
    likeCount: comments.reduce((n, c) => n + c.likeCount, 0),
  };
}

export function rankCards(cards: AskCard[]) {
  return [...cards].sort((a, b) => b.viewerCount - a.viewerCount || b.likeCount - a.likeCount);
}

/** The final ranked list, keeping what already arrived for each card: its idea, YouTube check and past-video match. */
export function withEarlierState(final: AskCard[], earlier: AskCard[]) {
  const byId = new Map(earlier.map((c) => [c.id, c]));
  return final.map((c) => {
    const e = byId.get(c.id);
    return e ? { ...c, idea: e.idea, ideaError: e.ideaError, check: e.check, answeredBy: e.answeredBy } : c;
  });
}
