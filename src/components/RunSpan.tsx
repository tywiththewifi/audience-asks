import { formatDate } from "@/lib/markdown";
import type { PipelineEvent } from "@/lib/types";

type Span = Extract<PipelineEvent, { type: "channel" }>;

const between = (r: { from: string; to: string }) => (
  <>
    <span className="text-white">{formatDate(r.from)}</span> to <span className="text-white">{formatDate(r.to)}</span>
  </>
);

/** Says exactly which videos were read and how old their comments are, since the window picks videos, not comments. */
export function RunSpan({ span }: { span: Span }) {
  const { videoRange, range, videoCount, maxVideos, months, perVideo } = span;
  if (!videoRange) return null;
  const videos =
    videoCount >= maxVideos ? (
      <>
        The {videoCount} latest, posted {between(videoRange)}.
        {months > 0 && ` This channel posts often, so ${videoCount} videos don't reach back the full ${months} months.`}
      </>
    ) : months ? (
      <>
        All {videoCount} posted in the last {months} months: {between(videoRange)}.
      </>
    ) : (
      <>All {videoCount}, posted {between(videoRange)}.</>
    );
  return (
    <dl className="mb-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-2xl border border-line-soft bg-panel px-4 py-3 text-sm text-muted">
      <dt className="text-[11px] font-bold uppercase leading-5 tracking-[0.14em] text-soft">Videos</dt>
      <dd>{videos}</dd>
      {range && (
        <>
          <dt className="text-[11px] font-bold uppercase leading-5 tracking-[0.14em] text-soft">Comments</dt>
          <dd>
            Up to {perVideo} top comments on each of those videos, posted {between(range)}. They&apos;re as recent as the videos they&apos;re on, so
            they show what viewers asked in that stretch.
          </dd>
        </>
      )}
    </dl>
  );
}
