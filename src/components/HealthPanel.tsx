import { useState } from "react";
import { formatDate } from "@/lib/markdown";
import type { AskCard, ChannelHealth } from "@/lib/types";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export type Coverage = { status: "pending" | "done" | "error"; catalogSize?: number };

function Tile({ label, value, children }: { label: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line-soft bg-ink/60 p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-[-0.01em]">{value}</p>
      {children && <p className="mt-1 text-xs leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

/** Praise above the baseline, complaints below, one column per video, oldest on the left. */
function SentimentChart({ perVideo }: { perVideo: ChannelHealth["sentiment"]["perVideo"] }) {
  const [active, setActive] = useState<number>();
  const max = Math.max(1, ...perVideo.map((v) => Math.max(v.praise, v.complaint)));
  const shown = active === undefined ? undefined : perVideo[active];
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Praise and complaints on each video</p>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-praise" aria-hidden /> Praise
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-complaint" aria-hidden /> Complaints
          </span>
        </div>
      </div>
      <p className="mt-1 h-4 truncate text-xs text-muted" aria-live="polite">
        {shown
          ? `${formatDate(shown.publishedAt)} · ${shown.title} · ${shown.praise} praise, ${shown.complaint} complaints of ${shown.comments} comments`
          : "Oldest video on the left. Hover or focus a column for details."}
      </p>
      <div className="relative mt-2 flex h-28 items-stretch gap-[2px]" onMouseLeave={() => setActive(undefined)}>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-line" aria-hidden />
        {perVideo.map((v, i) => (
          <div
            key={v.id}
            tabIndex={0}
            role="img"
            aria-label={`${v.title}, ${formatDate(v.publishedAt)}: ${v.praise} praise, ${v.complaint} complaints`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(undefined)}
            className={`flex min-w-0 max-w-6 flex-1 flex-col rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${active === i ? "bg-white/5" : ""}`}
          >
            <div className="flex flex-1 items-end justify-center pb-px">
              <div className="w-full max-w-4 rounded-t bg-praise" style={{ height: `${(v.praise / max) * 100}%` }} />
            </div>
            <div className="flex flex-1 items-start justify-center pt-px">
              <div className="w-full max-w-4 rounded-b bg-complaint" style={{ height: `${(v.complaint / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer hover:text-white">View as a table</summary>
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-soft">
                <th className="py-1 pr-3 font-medium">Video</th>
                <th className="py-1 pr-3 font-medium">Posted</th>
                <th className="py-1 pr-3 text-right font-medium">Praise</th>
                <th className="py-1 text-right font-medium">Complaints</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {perVideo.map((v) => (
                <tr key={v.id} className="border-t border-line-soft">
                  <td className="max-w-0 truncate py-1 pr-3 sm:max-w-xs">{v.title}</td>
                  <td className="whitespace-nowrap py-1 pr-3">{formatDate(v.publishedAt)}</td>
                  <td className="py-1 pr-3 text-right">{v.praise}</td>
                  <td className="py-1 text-right">{v.complaint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function HealthPanel({ health, cards, coverage }: { health: ChannelHealth; cards: AskCard[]; coverage: Coverage }) {
  const { praise, complaint, perVideo } = health.sentiment;
  const opinions = praise + complaint;
  const answered = cards.filter((c) => c.answeredBy?.level === "answers").length;
  const partly = cards.filter((c) => c.answeredBy?.level === "partly").length;
  const { medianViews, videos: outliers } = health.outliers;

  return (
    <section aria-labelledby="health-title" className="mb-5 rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <p id="health-title" className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-text">
        Channel health
      </p>
      <p className="mt-1 text-sm text-muted">Beyond views: how viewers feel, which videos break out, and whether the channel already answers what they ask.</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          label="Asks already answered"
          value={coverage.status === "done" ? `${answered} of ${cards.length}` : coverage.status === "error" ? "—" : "Checking…"}
        >
          {coverage.status === "done"
            ? `have a video in the latest ${coverage.catalogSize} uploads${partly ? `, and ${partly} more are partly covered` : ""}. The rest are open.`
            : coverage.status === "error"
              ? "The check didn't finish. Retry to run it again."
              : "Matching each ask to the channel's past videos."}
        </Tile>
        <Tile label="Praise vs complaints" value={opinions ? `${Math.round((praise / opinions) * 100)}% praise` : "No opinions"}>
          {opinions ? `${praise.toLocaleString("en-US")} praise and ${complaint.toLocaleString("en-US")} complaints across these comments.` : null}
        </Tile>
        <Tile label="Outlier videos" value={medianViews === undefined ? "—" : `${outliers.length} of ${perVideo.length}`}>
          {medianViews === undefined ? "View counts weren't available." : `got 2× or more the typical ${compact.format(medianViews)} views.`}
        </Tile>
      </div>

      {perVideo.length > 1 && opinions > 0 && <SentimentChart perVideo={perVideo} />}

      {outliers.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium">Outliers, and what viewers asked on them</p>
          <ul className="mt-2 space-y-2">
            {outliers.slice(0, 3).map((o) => (
              <li key={o.id} className="rounded-xl border border-line-soft bg-ink/60 px-3 py-2 text-sm">
                <a className="font-medium hover:underline" href={`https://www.youtube.com/watch?v=${o.id}`} target="_blank" rel="noreferrer">
                  {o.title}
                </a>
                <p className="mt-0.5 text-xs text-muted">
                  <span className="font-medium text-white">{o.multiple}×</span> typical views · {compact.format(o.views)} views · {formatDate(o.publishedAt)}
                  {o.topAsk ? ` · Top ask: ${o.topAsk}` : o.asks ? ` · ${o.asks} asks, none in a ranked topic` : " · No asks"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
