import { useState } from "react";
import type { AskCard, Evidence, IdeaCheck as Check } from "@/lib/types";
import { formatDate } from "@/lib/markdown";
import { commentUrl } from "@/lib/youtube";
import { IdeaCheck } from "./IdeaCheck";

const EVIDENCE: Record<Evidence, { label: string; className: string; hint: string }> = {
  strong: { label: "Strong evidence", className: "bg-strong/15 text-strong", hint: "8+ different viewers across 2+ videos" },
  some: { label: "Some evidence", className: "bg-some/15 text-some", hint: "3+ different viewers" },
  thin: { label: "Thin evidence", className: "bg-thin/15 text-thin", hint: "Fewer than 3 viewers. Worth a look, not a bet." },
};

const KIND: Record<AskCard["kind"], string> = { question: "Question", request: "Request", complaint: "Complaint" };

export function Card({
  card,
  rank,
  ideasRunning,
  channelId,
  onCopy,
  onChecked,
}: {
  card: AskCard;
  rank: number;
  ideasRunning: boolean;
  channelId?: string;
  onCopy: () => Promise<void>;
  onChecked: (check: Check) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showVideos, setShowVideos] = useState(false);
  const ev = EVIDENCE[card.evidence];

  return (
    <li className="animate-rise rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-muted">#{rank}</span>
        <span className="rounded-full border border-line px-2 py-0.5 text-muted">{KIND[card.kind]}</span>
        <span className={`rounded-full px-2 py-0.5 ${ev.className}`} title={ev.hint}>
          {ev.label}
        </span>
        {card.recentCount > 0 && <span className="text-muted">{card.recentCount} in the last 30 days</span>}
      </div>

      <h2 className="mt-3 text-xl font-bold leading-snug tracking-[-0.01em]">{card.ask}</h2>
      <p className="mt-1 text-sm text-muted">
        <strong className="font-semibold text-white">{card.viewerCount}</strong> viewer{card.viewerCount === 1 ? "" : "s"} asked on{" "}
        <button className="underline decoration-line underline-offset-4 hover:decoration-accent" onClick={() => setShowVideos((v) => !v)}>
          {card.videos.length} video{card.videos.length === 1 ? "" : "s"}
        </button>
        {card.likeCount > 0 && <> · {card.likeCount.toLocaleString("en-US")} likes on those comments</>}
      </p>
      {card.answeredBy && (
        <p className="mt-2 text-sm">
          <span className={card.answeredBy.level === "answers" ? "text-strong" : "text-some"} aria-hidden>
            {card.answeredBy.level === "answers" ? "✓ " : "◐ "}
          </span>
          <span className="text-muted">{card.answeredBy.level === "answers" ? "Already answered in " : "Partly covered in "}</span>
          <a
            className="underline decoration-line underline-offset-4 hover:decoration-accent"
            href={`https://www.youtube.com/watch?v=${card.answeredBy.videoId}`}
            target="_blank"
            rel="noreferrer"
          >
            “{card.answeredBy.title}”
          </a>
          <span className="text-muted"> ({formatDate(card.answeredBy.publishedAt)}). Point viewers there.</span>
        </p>
      )}
      {showVideos && (
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {card.videos.map((v) => (
            <li key={v.id}>
              <a className="hover:text-white" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">
                {v.title}
              </a>{" "}
              <span className="text-xs">({v.count})</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm">{card.summary}</p>

      <ul className="mt-4 space-y-2">
        {card.proof.map((p) => (
          <li key={p.commentId} className="rounded-xl border-l-2 border-accent bg-ink/70 px-4 py-3 text-sm">
            <p>“{p.quote}”</p>
            <a
              href={commentUrl(p.comment)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-xs text-muted hover:text-white"
            >
              {p.comment.author} · {formatDate(p.comment.publishedAt)} · on “{p.comment.videoTitle}” ↗
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-2xl border border-line-soft bg-raised/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-text">Video idea</p>
          {card.idea && (
            <button
              onClick={() => onCopy().then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
              className="btn-secondary h-7 px-3 text-xs"
            >
              {copied ? "Copied" : "Copy idea"}
            </button>
          )}
        </div>
        {card.idea ? (
          <div className="mt-2 space-y-2 text-sm">
            <ul className="space-y-1 font-medium">
              <li>{card.idea.titles[0]}</li>
              <li>{card.idea.titles[1]}</li>
            </ul>
            <p>
              <span className="text-muted">Hook: </span>
              {card.idea.hook}
            </p>
            <p>
              <span className="text-muted">Why it should work: </span>
              {card.idea.why}
            </p>
          </div>
        ) : card.ideaError ? (
          <p className="mt-2 text-sm text-red-300">This idea didn&apos;t come through ({card.ideaError}). The topic and comments above are still valid.</p>
        ) : ideasRunning ? (
          <div className="mt-3 space-y-2" aria-label="Writing the idea">
            <div className="h-3 w-3/4 animate-pulse rounded bg-line" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-line" />
          </div>
        ) : null}
        <IdeaCheck card={card} channelId={channelId} onChecked={onChecked} />
      </div>
    </li>
  );
}
