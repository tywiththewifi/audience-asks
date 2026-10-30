"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSSEParser } from "@/lib/sse";
import type { AskCard, AskKind, Channel, ChannelHealth, PipelineEvent, RunStats, StepName } from "@/lib/types";
import { cardToMarkdown, toMarkdown } from "@/lib/markdown";
import { Card } from "./Card";
import { ProgressRail, type StepState } from "./ProgressRail";
import { HealthPanel, type Coverage } from "./HealthPanel";
import { RunSpan } from "./RunSpan";

const STEPS: StepName[] = ["fetch", "sort", "group", "ideas", "coverage"];
type Filter = "all" | AskKind;
const DEFAULT_MONTHS = 12;
const WINDOWS = [
  { months: 6, label: "Videos from the last 6 months" },
  { months: 12, label: "Videos from the last 12 months" },
  { months: 0, label: "Videos of any age" },
];

const freshSteps = (): Record<StepName, StepState> =>
  Object.fromEntries(STEPS.map((s) => [s, { status: "idle" as const }])) as Record<StepName, StepState>;

export function AsksApp({ initialChannel, videos, initialMonths }: { initialChannel: string; videos?: number; initialMonths?: number }) {
  const [input, setInput] = useState(initialChannel);
  const [months, setMonths] = useState(
    WINDOWS.some((w) => w.months === initialMonths) ? (initialMonths as number) : DEFAULT_MONTHS,
  );
  const [span, setSpan] = useState<Extract<PipelineEvent, { type: "channel" }>>();
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState(freshSteps);
  const [channel, setChannel] = useState<Channel>();
  const [cards, setCards] = useState<AskCard[]>([]);
  const [stats, setStats] = useState<RunStats | null>();
  const [fatal, setFatal] = useState<string>();
  const [filter, setFilter] = useState<Filter>("all");
  const [recentOnly, setRecentOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [health, setHealth] = useState<ChannelHealth>();
  const [coverage, setCoverage] = useState<Coverage>({ status: "pending" });
  const abort = useRef<AbortController>(null);
  const lastRun = useRef("");

  const handle = useCallback((ev: PipelineEvent) => {
    switch (ev.type) {
      case "channel":
        setChannel(ev.channel);
        setSpan(ev);
        break;
      case "progress":
        setSteps((s) => ({ ...s, [ev.step]: { status: ev.status === "start" ? "active" : "done", message: ev.message } }));
        break;
      case "step_error":
        if (ev.step === "coverage") setCoverage({ status: "error" });
        setSteps((s) => ({ ...s, [ev.step]: { status: "error", message: ev.message, retryable: ev.retryable } }));
        break;
      case "card":
        setCards((c) => [...c, ev.card]);
        break;
      case "idea":
        setCards((c) => c.map((card) => (card.id === ev.cardId ? { ...card, idea: ev.idea, ideaError: ev.error } : card)));
        break;
      case "health":
        setHealth(ev.health);
        break;
      case "coverage": {
        const byCard = new Map(ev.matches.map((m) => [m.cardId, m.match]));
        setCards((c) => c.map((card) => ({ ...card, answeredBy: byCard.get(card.id) })));
        setCoverage({ status: "done", catalogSize: ev.catalogSize });
        break;
      }
      case "done":
        setStats(ev.stats);
        break;
    }
  }, []);

  const run = useCallback(
    async (value: string) => {
      const target = value.trim();
      if (!target) return;
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      lastRun.current = target;
      setRunning(true);
      setSteps(freshSteps());
      setChannel(undefined);
      setSpan(undefined);
      setHealth(undefined);
      setCoverage({ status: "pending" });
      setCards([]);
      setStats(undefined);
      setFatal(undefined);
      const url = new URL(window.location.href);
      url.searchParams.set("channel", target);
      if (months === DEFAULT_MONTHS) url.searchParams.delete("months");
      else url.searchParams.set("months", String(months));
      window.history.replaceState(null, "", url);

      try {
        const query = new URLSearchParams({ channel: target, months: String(months) });
        if (videos) query.set("videos", String(videos));
        const res = await fetch(`/api/asks?${query}`, { signal: ctrl.signal });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        const feed = createSSEParser((d) => handle(d as PipelineEvent));
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          feed(chunk);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setFatal((err as Error).message);
      } finally {
        if (abort.current === ctrl) setRunning(false);
      }
    },
    [handle, videos, months],
  );

  useEffect(() => {
    if (initialChannel) void run(initialChannel);
    // run once for a shared ?channel= link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(
    () =>
      cards.filter(
        (c) => (filter === "all" || c.kind === filter) && (!recentOnly || c.recentCount > 0) && (!openOnly || c.answeredBy?.level !== "answers"),
      ),
    [cards, filter, recentOnly, openOnly],
  );
  const counts = useMemo(() => {
    const n = { all: cards.length, question: 0, request: 0, complaint: 0 };
    for (const c of cards) n[c.kind] += 1;
    return n;
  }, [cards]);

  const exportMarkdown = () => {
    const blob = new Blob([toMarkdown(channel?.title ?? lastRun.current, visible, { comments: span?.range, videos: span?.videoRange }, health)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audience-asks-${(channel?.handle ?? "channel").replace(/^@/, "")}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const started = running || cards.length > 0 || Object.values(steps).some((s) => s.status !== "idle");

  return (
    <>
      <nav className="border-b border-line-soft">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent" aria-hidden>
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                <path d="M4 4h12v9H9l-4 3v-3H4z" />
              </svg>
            </span>
            Audience Asks
          </a>
          <div className="flex items-center gap-2 text-sm">
            <a className="hidden px-3 text-muted hover:text-white sm:inline" href="https://github.com/tywiththewifi/audience-asks/blob/main/docs/ARCHITECTURE.md">
              How it works
            </a>
            <a className="btn-secondary h-9 px-4" href="https://github.com/tywiththewifi/audience-asks">
              Source
            </a>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <header className="hero-glow -mx-4 px-4 pb-2 pt-12 text-center sm:-mx-6 sm:px-6 sm:pt-20">
          <span className="chip h-8 gap-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em]">
            <span className="text-accent-text">Concept</span>
            <span className="h-3 w-px bg-line" aria-hidden />
            <span className="font-medium normal-case tracking-normal text-soft">Video ideas from your own comments</span>
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-6xl">What do your viewers keep asking for?</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Paste any YouTube channel. We read the comments on its recent videos and rank what viewers ask for, with the real
            comments behind each one, a video idea to answer it, and a check of whether that video already exists.
          </p>
        </header>

        <form
          className="mx-auto mt-10 flex max-w-3xl flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(input);
          }}
        >
          <label className="sr-only" htmlFor="channel">
            Channel URL or @handle
          </label>
          <input
            id="channel"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="youtube.com/@channel or @handle"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full rounded-full border border-line bg-panel px-5 text-base outline-none placeholder:text-muted/70 focus:border-accent sm:flex-1"
          />
          <label className="sr-only" htmlFor="window">
            Which videos to read
          </label>
          <select
            id="window"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="select h-12 rounded-full border border-line bg-panel pl-4 text-sm outline-none focus:border-accent"
          >
            {WINDOWS.map((w) => (
              <option key={w.months} value={w.months}>
                {w.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!input.trim() || running}
            className="btn-primary h-12 px-6 text-base disabled:opacity-50"
          >
            {running ? "Reading…" : "Read the comments"}
          </button>
        </form>

        {fatal && (
          <div role="alert" className="mx-auto mt-8 max-w-3xl rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
            {fatal}
          </div>
        )}

        {started && (
          <section className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
              {channel && (
                <div className="mb-5 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {channel.thumbnail && <img src={channel.thumbnail} alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-full" />}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{channel.title}</p>
                    <p className="truncate text-sm text-muted">{channel.handle}</p>
                  </div>
                </div>
              )}
              <ProgressRail steps={steps} onRetry={() => void run(lastRun.current)} running={running} />
              {stats && (
                <p className="mt-5 text-xs leading-relaxed text-muted">
                  {stats.comments.toLocaleString("en-US")} comments from {stats.videos} videos · {stats.quotaUnits} YouTube quota units ·{" "}
                  {stats.costUsd > 0 ? `$${stats.costUsd.toFixed(3)} of AI` : "AI results from cache"} · {(stats.ms / 1000).toFixed(0)}s{stats.cached ? " · comments from the 24-hour cache" : ""}
                </p>
              )}
            </aside>

            <div className="min-w-0">
              {span?.videoRange && <RunSpan span={span} />}
              {health && cards.length > 0 && <HealthPanel health={health} cards={cards} coverage={coverage} />}
              {cards.length > 0 && (
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <div role="tablist" aria-label="Filter asks" className="flex flex-wrap gap-1 rounded-full border border-line bg-panel p-1">
                    {(["all", "question", "request", "complaint"] as const).map((f) => (
                      <button
                        key={f}
                        role="tab"
                        aria-selected={filter === f}
                        onClick={() => setFilter(f)}
                        className={`rounded-full px-3 py-1.5 text-sm capitalize ${filter === f ? "bg-raised text-white" : "text-muted hover:text-white"}`}
                      >
                        {f === "all" ? "All" : `${f}s`} <span className="text-muted">{counts[f]}</span>
                      </button>
                    ))}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-sm">
                    <input type="checkbox" checked={recentOnly} onChange={(e) => setRecentOnly(e.target.checked)} className="accent-accent" />
                    Asked in the last 30 days
                  </label>
                  {coverage.status === "done" && (
                    <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-sm">
                      <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} className="accent-accent" />
                      No video yet
                    </label>
                  )}
                  <button onClick={exportMarkdown} className="btn-secondary ml-auto h-9 px-4 text-sm">
                    Export Markdown
                  </button>
                </div>
              )}

              <ol className="space-y-4">
                {visible.map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    rank={cards.indexOf(card) + 1}
                    ideasRunning={running}
                    channelId={channel?.id}
                    onCopy={() => navigator.clipboard.writeText(cardToMarkdown(card))}
                    onChecked={(check) => setCards((all) => all.map((c) => (c.id === card.id ? { ...c, check } : c)))}
                  />
                ))}
              </ol>

              {running && cards.length === 0 && (
                <div className="space-y-4" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-40 animate-pulse rounded-2xl border border-line bg-panel" />
                  ))}
                </div>
              )}
              {!running && cards.length > 0 && visible.length === 0 && (
                <p className="rounded-2xl border border-line p-6 text-sm text-muted">Nothing matches these filters.</p>
              )}
            </div>
          </section>
        )}

        <footer className="mt-20 text-xs text-muted">
          An independent concept by{" "}
          <a className="underline hover:text-white" href="https://www.tywiththewifi.dev/">
            Tyler
          </a>{" "}
          (<a className="underline hover:text-white" href="https://github.com/tywiththewifi/audience-asks">source</a>). Not affiliated with vidIQ or YouTube. Comments are read
          through the public YouTube Data API.
        </footer>
      </main>
    </>
  );
}
