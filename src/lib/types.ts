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
  /** What a viewer would type into YouTube search to find this video. */
  searchQuery?: string;
};

export type SearchResult = {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  views?: number;
  seconds?: number;
  thumbnail?: string;
};

/** How closely an existing video answers the ask. */
export type MatchLevel = "same" | "close";

export type ExistingVideo = SearchResult & { match: MatchLevel; ownChannel: boolean };

/**
 * "open": no top result makes this video. "some": one or two do. "crowded": three or more.
 * "yours": the channel itself already made it, which matters more than anyone else having done so.
 */
export type CheckVerdict = "open" | "some" | "crowded" | "yours";

export type IdeaCheck = {
  query: string;
  verdict: CheckVerdict;
  /** One sentence on what's out there, from the model. */
  summary: string;
  /** One sentence on how to make this video stand out from what exists. */
  angle: string;
  matches: ExistingVideo[];
  searched: number;
  checkedAt: string;
  quotaUnits: number;
  costUsd: number;
  cached: boolean;
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
  check?: IdeaCheck;
};

/** Oldest and newest comment dates (ISO) in a run. */
export type DateRange = { from: string; to: string };

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
  /** Only videos from the last N months were read. 0 means any age. */
  months: number;
  /** Oldest and newest comment read. */
  range?: DateRange;
  /** Oldest and newest video read. */
  videoRange?: DateRange;
};

export type PipelineEvent =
  | {
      type: "channel";
      channel: Channel;
      months: number;
      /** Comment dates. */
      range?: DateRange;
      videoRange?: DateRange;
      videoCount: number;
      maxVideos: number;
      perVideo: number;
    }
  | { type: "progress"; step: StepName; status: "start" | "done"; message: string }
  | { type: "card"; card: AskCard }
  | { type: "idea"; cardId: string; idea?: VideoIdea; error?: string }
  | { type: "step_error"; step: StepName; message: string; retryable: boolean }
  | { type: "done"; stats: RunStats };
