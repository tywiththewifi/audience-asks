import type { AskCard, ChannelHealth, Comment, CommentLabel, Outlier, Video, VideoSentiment } from "../types";

/** A video counts as an outlier at this multiple of the median video read. */
export const OUTLIER_MULTIPLE = 2;
const MIN_VIDEOS_FOR_OUTLIERS = 5;

export function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Praise and complaints per video, oldest video first. */
export function sentimentByVideo(videos: Video[], comments: Comment[], labels: Map<string, CommentLabel>): VideoSentiment[] {
  const byVideo = new Map(videos.map((v) => [v.id, { id: v.id, title: v.title, publishedAt: v.publishedAt, praise: 0, complaint: 0, comments: 0 }]));
  for (const c of comments) {
    const row = byVideo.get(c.videoId);
    if (!row) continue;
    row.comments += 1;
    const label = labels.get(c.id);
    if (label === "praise") row.praise += 1;
    if (label === "complaint") row.complaint += 1;
  }
  return [...byVideo.values()].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
}

/** Videos doing OUTLIER_MULTIPLE× the median views of the videos read, with the ask they drew most. */
export function findOutliers(videos: Video[], cards: AskCard[], asksByVideo: Map<string, number>): ChannelHealth["outliers"] {
  const withViews = videos.filter((v): v is Video & { views: number } => typeof v.views === "number");
  const medianViews = median(withViews.map((v) => v.views));
  if (withViews.length < MIN_VIDEOS_FOR_OUTLIERS || !medianViews) return { medianViews, videos: [] };
  const out: Outlier[] = [];
  for (const v of withViews) {
    const multiple = v.views / medianViews;
    if (multiple < OUTLIER_MULTIPLE) continue;
    let topAsk: string | undefined;
    let best = 0;
    for (const card of cards) {
      const n = card.videos.find((x) => x.id === v.id)?.count ?? 0;
      if (n > best) [best, topAsk] = [n, card.ask];
    }
    out.push({ id: v.id, title: v.title, publishedAt: v.publishedAt, views: v.views, multiple: Number(multiple.toFixed(1)), asks: asksByVideo.get(v.id) ?? 0, topAsk });
  }
  return { medianViews, videos: out.sort((a, b) => b.multiple - a.multiple) };
}

export function channelHealth(
  videos: Video[],
  comments: Comment[],
  labels: Map<string, CommentLabel>,
  cards: AskCard[],
  asks: Comment[],
): ChannelHealth {
  const perVideo = sentimentByVideo(videos, comments, labels);
  const asksByVideo = new Map<string, number>();
  for (const c of asks) asksByVideo.set(c.videoId, (asksByVideo.get(c.videoId) ?? 0) + 1);
  return {
    sentiment: {
      praise: perVideo.reduce((n, v) => n + v.praise, 0),
      complaint: perVideo.reduce((n, v) => n + v.complaint, 0),
      perVideo,
    },
    outliers: findOutliers(videos, cards, asksByVideo),
  };
}
