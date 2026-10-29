export type Comment = {
  id: string;
  videoId: string;
  videoTitle: string;
  author: string;
  authorChannelId?: string;
  text: string;
  likeCount: number;
  replyCount: number;
  publishedAt: string;
};

export type Video = {
  id: string;
  title: string;
  publishedAt: string;
  thumbnail?: string;
};

export type Channel = {
  id: string;
  title: string;
  handle?: string;
  thumbnail?: string;
  uploadsPlaylistId: string;
  subscriberCount?: number;
};

export const COMMENT_LABELS = ["question", "request", "complaint", "praise", "other", "spam"] as const;
export type CommentLabel = (typeof COMMENT_LABELS)[number];

/** The labels that can become an "ask". */
export const ASK_KINDS = ["question", "request", "complaint"] as const;
export type AskKind = (typeof ASK_KINDS)[number];

export type Evidence = "strong" | "some" | "thin";

export type Proof = { commentId: string; quote: string; comment: Comment };

export type VideoIdea = {
  titles: [string, string];
  hook: string;
  why: string;
};

export type AskCard = {
  id: string;
  ask: string;
  kind: AskKind;
  summary: string;
  viewerCount: number;
  commentIds: string[];
  videos: { id: string; title: string; count: number }[];
  proof: Proof[];
  evidence: Evidence;
  recentCount: number;
  likeCount: number;
  idea?: VideoIdea;
  ideaError?: string;
};

export type StepName = "fetch" | "sort" | "group" | "ideas";

export type RunStats = {
  videos: number;
  comments: number;
  asksConsidered: number;
  labelCounts: Record<CommentLabel, number>;
  quotaUnits: number;
  costUsd: number;
  ms: number;
  topicsDropped: number;
  groundingRetries: number;
  cached: boolean;
};

export type PipelineEvent =
  | { type: "channel"; channel: Channel }
  | { type: "progress"; step: StepName; status: "start" | "done"; message: string }
  | { type: "card"; card: AskCard }
  | { type: "idea"; cardId: string; idea?: VideoIdea; error?: string }
  | { type: "step_error"; step: StepName; message: string; retryable: boolean }
  | { type: "done"; stats: RunStats };
