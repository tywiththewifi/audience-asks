import { useState } from "react";
import type { AskCard, CheckVerdict, IdeaCheck as Check } from "@/lib/types";

const VERDICT: Record<CheckVerdict, { label: string; className: string }> = {
  open: { label: "No close match on YouTube", className: "bg-strong/15 text-strong" },
  some: { label: "A few videos already exist", className: "bg-some/15 text-some" },
  crowded: { label: "Crowded topic", className: "bg-crowded/15 text-crowded" },
  yours: { label: "You already made this", className: "bg-accent/15 text-accent-text" },
};

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function ago(iso: string, now = Date.now()) {
  const days = (now - Date.parse(iso)) / 86_400_000;
  if (days < 1) return "today";
  if (days < 60) return `${Math.round(days)} days ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export function IdeaCheck({ card, channelId, onChecked }: { card: AskCard; channelId?: string; onChecked: (check: Check) => void }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string>();
  const [showAll, setShowAll] = useState(false);
  const check = card.check;
  const idea = card.idea;
  if (!idea) return null;

  const run = async () => {
    setState("loading");
    setError(undefined);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ask: card.ask,
          summary: card.summary,
          titles: idea.titles,
          query: idea.searchQuery ?? card.ask,
          channelId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Check failed (${res.status})`);
      onChecked(body as Check);
      setState("idle");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  };

  if (!check) {
    return (
      <div className="mt-4 border-t border-line pt-4">
        <button onClick={run} disabled={state === "loading"} className="btn-secondary h-9 px-4 text-sm disabled:opacity-60">
          {state === "loading" ? (
            <>
              <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent align-[-2px]" />
              Searching YouTube…
            </>
          ) : (
            "Is this already on YouTube?"
          )}
        </button>
        {state === "error" && <p className="mt-2 text-sm text-red-300">{error}</p>}
      </div>
    );
  }

  const v = VERDICT[check.verdict];
  const shown = showAll ? check.matches : check.matches.slice(0, 3);
  return (
    <div className="mt-4 border-t border-line pt-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${v.className}`}>{v.label}</span>
        <span className="text-xs text-muted">
          {check.matches.filter((m) => m.match === "same").length} of the top {check.searched} results make this video
        </span>
      </div>
      <p className="mt-2">{check.summary}</p>
      {check.angle && (
        <p className="mt-2">
          <span className="text-muted">How to stand out: </span>
          {check.angle}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="mt-3 space-y-2">
          {shown.map((m) => (
            <li key={m.id}>
              <a
                href={`https://www.youtube.com/watch?v=${m.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex gap-3 rounded-xl border border-line bg-ink/50 p-2 hover:border-accent/60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.thumbnail && <img src={m.thumbnail} alt="" referrerPolicy="no-referrer" className="h-12 w-20 shrink-0 rounded-md object-cover" />}
                <span className="min-w-0">
                  <span className="line-clamp-2 font-medium leading-snug">{m.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {m.ownChannel ? <span className="text-accent-text">Your channel</span> : m.channelTitle}
                    {m.views !== undefined && ` · ${compact.format(m.views)} views`} · {ago(m.publishedAt)}
                    {m.seconds !== undefined && m.seconds <= 180 && " · Short"} · {m.match === "same" ? "same idea" : "related"}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {check.matches.length > 3 && (
        <button className="mt-2 text-xs text-muted underline underline-offset-4 hover:text-white" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show fewer" : `Show all ${check.matches.length}`}
        </button>
      )}
      <p className="mt-3 text-xs text-muted">
        Top {check.searched} YouTube results for “{check.query}”{check.cached ? " · from the 24-hour cache" : ` · ${check.quotaUnits} quota units`}
      </p>
    </div>
  );
}
