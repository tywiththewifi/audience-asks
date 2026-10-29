import { TTL, cacheKey, cached } from "../cache";
import { LLMError, MODELS, Meter } from "../llm";
import { ASK_KINDS, COMMENT_LABELS, type AskCard, type Channel, type Comment, type CommentLabel, type PipelineEvent, type RunStats, type Video } from "../types";
import { Quota, YouTubeError, getChannel, getRecentVideos, getVideoComments, mapLimit, parseChannelInput } from "../youtube";
import { buildCard, rankCards } from "./cards";
import { GROUP_SYSTEM, groupAsks } from "./group";
import { IDEAS_SYSTEM, writeIdea } from "./ideas";
import { SORT_SYSTEM, sortComments, worthSorting } from "./sort";

export type RunOptions = {
  maxVideos?: number;
  commentsPerVideo?: number;
  /** Supply comments directly (evals and tests) instead of calling YouTube. */
  snapshot?: { channel: Channel; videos: Video[]; comments: Comment[] };
  signal?: AbortSignal;
};

type Fetched = { channel: Channel; videos: Video[]; comments: Comment[]; quotaUnits: number };

async function fetchChannelData(input: string, maxVideos: number, perVideo: number): Promise<Fetched> {
  const quota = new Quota();
  const channel = await getChannel(parseChannelInput(input), quota);
  const videos = await getRecentVideos(channel, maxVideos, quota);
  const lists = await mapLimit(videos, 8, (v) => getVideoComments(v, perVideo, quota));
  return { channel, videos, comments: lists.flat(), quotaUnits: quota.units };
}

/**
 * The whole pipeline as a stream of events: fetch, sort, group, ideas.
 * Every step is cached by its inputs, so a retry after a failure only redoes the step that failed.
 */
export async function* runAudienceAsks(input: string, opts: RunOptions = {}): AsyncGenerator<PipelineEvent> {
  const started = Date.now();
  const meter = new Meter();
  const maxVideos = opts.maxVideos ?? 30;
  const perVideo = opts.commentsPerVideo ?? 100;
  const stats: RunStats = {
    videos: 0,
    comments: 0,
    asksConsidered: 0,
    labelCounts: Object.fromEntries(COMMENT_LABELS.map((l) => [l, 0])) as Record<CommentLabel, number>,
    quotaUnits: 0,
    costUsd: 0,
    ms: 0,
    topicsDropped: 0,
    groundingRetries: 0,
    cached: false,
  };
  const finish = (): PipelineEvent => {
    stats.costUsd = Number(meter.costUsd.toFixed(4));
    stats.ms = Date.now() - started;
    return { type: "done", stats };
  };

  // 1. Fetch
  yield { type: "progress", step: "fetch", status: "start", message: "Finding the channel" };
  let data: Fetched;
  try {
    if (opts.snapshot) {
      data = { ...opts.snapshot, quotaUnits: 0 };
    } else {
      const res = await cached(cacheKey("fetch", input.trim().toLowerCase(), maxVideos, perVideo), TTL.day, () =>
        fetchChannelData(input, maxVideos, perVideo),
      );
      data = res.value;
      stats.cached = res.hit;
      stats.quotaUnits = res.hit ? 0 : data.quotaUnits;
    }
  } catch (err) {
    const quotaHit = err instanceof YouTubeError && (err.reason === "quotaExceeded" || err.reason === "dailyLimitExceeded");
    yield {
      type: "step_error",
      step: "fetch",
      message: quotaHit ? "The YouTube API quota for today is used up. It resets at midnight Pacific time." : (err as Error).message,
      retryable: !(err instanceof YouTubeError && err.status === 404),
    };
    yield finish();
    return;
  }
  stats.videos = data.videos.length;
  stats.comments = data.comments.length;
  yield { type: "channel", channel: data.channel };
  yield {
    type: "progress",
    step: "fetch",
    status: "done",
    message: `Found ${data.videos.length} recent videos and read ${data.comments.length.toLocaleString("en-US")} comments`,
  };
  if (!data.comments.length) {
    yield { type: "step_error", step: "fetch", message: "These videos have no public comments to read.", retryable: false };
    yield finish();
    return;
  }

  // 2. Sort
  yield { type: "progress", step: "sort", status: "start", message: "Sorting questions and requests" };
  const candidates = data.comments.filter(worthSorting);
  let labels: Map<string, CommentLabel>;
  try {
    const res = await cached(cacheKey("sort", MODELS.sort, SORT_SYSTEM, candidates.map((c) => c.id)), TTL.day, async () => {
      const r = await sortComments(candidates, meter);
      return { ...r, labels: [...r.labels] };
    });
    labels = new Map(res.value.labels);
    if (res.value.failedBatches) {
      yield {
        type: "step_error",
        step: "sort",
        message: `${res.value.failedBatches} of ${res.value.totalBatches} comment batches could not be sorted. Results use the rest.`,
        retryable: true,
      };
    }
  } catch (err) {
    yield { type: "step_error", step: "sort", message: (err as Error).message, retryable: err instanceof LLMError && err.retryable };
    yield finish();
    return;
  }
  for (const label of labels.values()) stats.labelCounts[label] += 1;
  const asks = candidates.filter((c) => (ASK_KINDS as readonly string[]).includes(labels.get(c.id) ?? ""));
  stats.asksConsidered = asks.length;
  yield {
    type: "progress",
    step: "sort",
    status: "done",
    message: `Sorted ${labels.size.toLocaleString("en-US")} comments: ${stats.labelCounts.question} questions, ${stats.labelCounts.request} requests, ${stats.labelCounts.complaint} complaints`,
  };
  if (!asks.length) {
    yield { type: "step_error", step: "sort", message: "No questions or requests in these comments yet.", retryable: false };
    yield finish();
    return;
  }

  // 3. Group
  yield { type: "progress", step: "group", status: "start", message: `Grouping ${asks.length} asks into topics` };
  let cards: AskCard[];
  try {
    const res = await cached(cacheKey("group", MODELS.group, GROUP_SYSTEM, asks.map((c) => c.id)), TTL.day, () =>
      groupAsks(asks, meter, { channelTitle: data.channel.title }),
    );
    const byId = new Map(data.comments.map((c) => [c.id, c]));
    cards = rankCards(res.value.topics.map((t) => buildCard(t, byId)));
    stats.topicsDropped = res.value.dropped;
    stats.groundingRetries = res.value.retried ? 1 : 0;
  } catch (err) {
    yield { type: "step_error", step: "group", message: (err as Error).message, retryable: err instanceof LLMError && err.retryable };
    yield finish();
    return;
  }
  const droppedNote = stats.topicsDropped ? ` (${stats.topicsDropped} dropped for bad citations)` : "";
  yield { type: "progress", step: "group", status: "done", message: `Grouped into ${cards.length} topics${droppedNote}` };
  for (const card of cards) yield { type: "card", card };

  // 4. Ideas, streamed back as each one lands
  yield { type: "progress", step: "ideas", status: "start", message: "Writing a video idea for each topic" };
  const byId = new Map(data.comments.map((c) => [c.id, c]));
  const context = { channelTitle: data.channel.title, recentTitles: data.videos.map((v) => v.title) };
  const queue: PipelineEvent[] = [];
  let wake: (() => void) | undefined;
  let failures = 0;
  const work = mapLimit(cards, 4, async (card) => {
    try {
      const comments = card.commentIds.map((id) => byId.get(id)!).sort((a, b) => b.likeCount - a.likeCount);
      const { value } = await cached(cacheKey("idea", MODELS.ideas, IDEAS_SYSTEM, card.ask, card.commentIds), TTL.day, () =>
        writeIdea(card, comments, context, meter),
      );
      queue.push({ type: "idea", cardId: card.id, idea: value });
    } catch (err) {
      failures += 1;
      queue.push({ type: "idea", cardId: card.id, error: (err as Error).message });
    }
    wake?.();
  });
  let settled = false;
  work.finally(() => {
    settled = true;
    wake?.();
  });
  while (!settled || queue.length) {
    if (!queue.length) await new Promise<void>((r) => (wake = r));
    while (queue.length) yield queue.shift()!;
  }
  await work;
  yield {
    type: "progress",
    step: "ideas",
    status: "done",
    message: failures ? `Wrote ${cards.length - failures} of ${cards.length} video ideas` : `Wrote ${cards.length} video ideas`,
  };
  if (failures) yield { type: "step_error", step: "ideas", message: `${failures} video ideas failed. Retry to fill them in.`, retryable: true };

  yield finish();
}
