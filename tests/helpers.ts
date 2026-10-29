import type { Comment } from "../src/lib/types";

let n = 0;
export function comment(text: string, extra: Partial<Comment> = {}): Comment {
  n += 1;
  return {
    id: `id${n}`,
    videoId: "v1",
    videoTitle: "Video one",
    author: `@viewer${n}`,
    authorChannelId: `UC${n}`,
    text,
    likeCount: 0,
    replyCount: 0,
    publishedAt: "2026-10-01T00:00:00Z",
    ...extra,
  };
}
