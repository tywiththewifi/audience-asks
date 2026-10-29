import type { Channel, Comment, Video } from "./types";

const BASE = "https://www.googleapis.com/youtube/v3";

export class YouTubeError extends Error {
  constructor(message: string, readonly status?: number, readonly reason?: string) {
    super(message);
  }
}

export type ChannelRef =
  | { kind: "id"; value: string }
  | { kind: "handle"; value: string }
  | { kind: "username"; value: string };

/** Accepts @handle, a bare handle, a UC… id, or any youtube.com channel URL. */
export function parseChannelInput(input: string): ChannelRef {
  const raw = input.trim();
  if (!raw) throw new YouTubeError("Paste a channel URL or @handle.");

  let candidate = raw;
  if (/youtube\.com|youtu\.be/i.test(raw)) {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const [first, second] = url.pathname.split("/").filter(Boolean);
    if (!first) throw new YouTubeError("That URL doesn't point at a channel.");
    if (first.startsWith("@")) candidate = decodeURIComponent(first);
    else if (first === "channel" && second) return { kind: "id", value: second };
    else if (first === "user" && second) return { kind: "username", value: second };
    else if (first === "c" && second) candidate = `@${second}`;
    else throw new YouTubeError("That URL doesn't point at a channel. Try the channel's @handle.");
  }

  if (/^UC[\w-]{22}$/.test(candidate)) return { kind: "id", value: candidate };
  const handle = candidate.replace(/^@/, "");
  if (!/^[\w.\-·]{3,100}$/u.test(handle)) throw new YouTubeError(`"${raw}" doesn't look like a channel handle.`);
  return { kind: "handle", value: `@${handle}` };
}

/** Tracks quota units spent, using Google's published costs (every call we make costs 1). */
export class Quota {
  units = 0;
}

async function get<T>(endpoint: string, params: Record<string, string>, quota: Quota): Promise<T> {
  const search = new URLSearchParams(params);
  // In the cloud dev container the key is injected by a proxy; everywhere else it comes from env.
  if (process.env.YOUTUBE_API_KEY) search.set("key", process.env.YOUTUBE_API_KEY);
  quota.units += 1;
  const res = await fetch(`${BASE}/${endpoint}?${search}`, { cache: "no-store" });
  if (!res.ok) {
    let reason: string | undefined;
    let message = `YouTube API ${endpoint} failed with ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
      reason = body.error?.errors?.[0]?.reason;
      if (body.error?.message) message = body.error.message;
    } catch {
      // keep the generic message
    }
    throw new YouTubeError(message, res.status, reason);
  }
  return (await res.json()) as T;
}

type ChannelsResponse = {
  items?: {
    id: string;
    snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } };
    contentDetails: { relatedPlaylists: { uploads: string } };
    statistics?: { subscriberCount?: string };
  }[];
};

export async function getChannel(ref: ChannelRef, quota: Quota): Promise<Channel> {
  const params: Record<string, string> = { part: "snippet,contentDetails,statistics" };
  if (ref.kind === "id") params.id = ref.value;
  else if (ref.kind === "handle") params.forHandle = ref.value;
  else params.forUsername = ref.value;

  const data = await get<ChannelsResponse>("channels", params, quota);
  const item = data.items?.[0];
  if (!item) throw new YouTubeError(`No channel found for ${ref.value}.`, 404, "channelNotFound");
  return {
    id: item.id,
    title: item.snippet.title,
    handle: item.snippet.customUrl,
    thumbnail: item.snippet.thumbnails?.default?.url,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    subscriberCount: item.statistics?.subscriberCount ? Number(item.statistics.subscriberCount) : undefined,
  };
}

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: {
    snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string } } };
    contentDetails: { videoId: string; videoPublishedAt?: string };
  }[];
};

/** Latest uploads via the uploads playlist: 1 unit per 50 videos, instead of 100 for search.list. */
export async function getRecentVideos(channel: Channel, max: number, quota: Quota): Promise<Video[]> {
  const videos: Video[] = [];
  let pageToken: string | undefined;
  while (videos.length < max) {
    const data = await get<PlaylistItemsResponse>(
      "playlistItems",
      {
        part: "snippet,contentDetails",
        playlistId: channel.uploadsPlaylistId,
        maxResults: String(Math.min(50, max - videos.length)),
        ...(pageToken ? { pageToken } : {}),
      },
      quota,
    );
    for (const item of data.items ?? []) {
      if (item.snippet.title === "Private video" || item.snippet.title === "Deleted video") continue;
      videos.push({
        id: item.contentDetails.videoId,
        title: item.snippet.title,
        publishedAt: item.contentDetails.videoPublishedAt ?? item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.medium?.url,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return videos.slice(0, max);
}

type CommentThreadsResponse = {
  nextPageToken?: string;
  items?: {
    id: string;
    snippet: {
      totalReplyCount: number;
      topLevelComment: {
        id: string;
        snippet: {
          textOriginal: string;
          authorDisplayName: string;
          authorChannelId?: { value: string };
          likeCount: number;
          publishedAt: string;
        };
      };
    };
  }[];
};

/** Top-level comments for one video, most relevant first. Disabled comments return an empty list. */
export async function getVideoComments(video: Video, maxPerVideo: number, quota: Quota): Promise<Comment[]> {
  const comments: Comment[] = [];
  let pageToken: string | undefined;
  try {
    while (comments.length < maxPerVideo) {
      const data = await get<CommentThreadsResponse>(
        "commentThreads",
        {
          part: "snippet",
          videoId: video.id,
          maxResults: String(Math.min(100, maxPerVideo - comments.length)),
          order: "relevance",
          textFormat: "plainText",
          ...(pageToken ? { pageToken } : {}),
        },
        quota,
      );
      for (const item of data.items ?? []) {
        const s = item.snippet.topLevelComment.snippet;
        comments.push({
          id: item.snippet.topLevelComment.id,
          videoId: video.id,
          videoTitle: video.title,
          author: s.authorDisplayName,
          authorChannelId: s.authorChannelId?.value,
          text: s.textOriginal,
          likeCount: s.likeCount,
          replyCount: item.snippet.totalReplyCount,
          publishedAt: s.publishedAt,
        });
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
  } catch (err) {
    if (err instanceof YouTubeError && err.reason === "commentsDisabled") return [];
    throw err;
  }
  return comments;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function commentUrl(c: Pick<Comment, "id" | "videoId">) {
  return `https://www.youtube.com/watch?v=${c.videoId}&lc=${c.id}`;
}
