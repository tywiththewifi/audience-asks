"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSSEParser } from "@/lib/sse";
import type { AskCard, AskKind, Channel, DateRange, PipelineEvent, RunStats, StepName } from "@/lib/types";
import { cardToMarkdown, formatDate, toMarkdown } from "@/lib/markdown";
import { Card } from "./Card";
import { ProgressRail, type StepState } from "./ProgressRail";

const EXAMPLES = ["@vidIQ", "@PeterMcKinnon", "@aliabdaal", "@NileRed"];
const STEPS: StepName[] = ["fetch", "sort", "group", "ideas"];
type Filter = "all" | AskKind;
const DEFAULT_MONTHS = 12;
const WINDOWS = [
  { months: 6, label: "Last 6 months" },
  { months: 12, label: "Last 12 months" },
  { months: 0, label: "Any time" },
];

const freshSteps = (): Record<StepName, StepState> =>
  Object.fromEntries(STEPS.map((s) => [s, { status: "idle" as const }])) as Record<StepName, StepState>;

export function AsksApp({ initialChannel, videos, initialMonths }: { initialChannel: string; videos?: number; initialMonths?: number }) {
  const [input, setInput] = useState(initialChannel);
  const [months, setMonths] = useState(
    WINDOWS.some((w) => w.months === initialMonths) ? (initialMonths as number) : DEFAULT_MONTHS,
  );
  const [range, setRange] = useState<{ range?: DateRange; months: number }>();
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState(freshSteps);
  const [channel, setChannel] = useState<Channel>();
  const [cards, setCards] = useState<AskCard[]>([]);
  const [stats, setStats] = useState<RunStats | null>();
  const [fatal, setFatal] = useState<string>();
  const [filter, setFilter] = useState<Filter>("all");
  const [recentOnly, setRecentOnly] = useState(false);
  const abort = useRef<AbortController>(null);
  const lastRun = useRef("");

  const handle = useCallback((ev: PipelineEvent) => {
    switch (ev.type) {
      case "channel":
        setChannel(ev.channel);
        setRange({ range: ev.range, months: ev.months });
        break;
      case "progress":
        setSteps((s) => ({ ...s, [ev.step]: { status: ev.status === "start" ? "active" : "done", message: ev.message } }));
        break;
      case "step_error":
        setSteps((s) => ({ ...s, [ev.step]: { status: "error", message: ev.message, retryable: ev.retryable } }));
        break;
      case "card":
        setCards((c) => [...c, ev.card]);
        break;
      case "idea":
        setCards((c) => c.map((card) => (card.id === ev.cardId ? { ...card, idea: ev.idea, ideaError: ev.error } : card)));
        break;
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
      setRange(undefined);
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
    () => cards.filter((c) => (filter === "all" || c.kind === filter) && (!recentOnly || c.recentCount > 0)),
    [cards, filter, recentOnly],
  );
  const counts = useMemo(() => {
    const n = { all: cards.length, question: 0, request: 0, complaint: 0 };
    for (const c of cards) n[c.kind] += 1;
    return n;
  }, [cards]);

  const exportMarkdown = () => {
    const blob = new Blob([toMarkdown(channel?.title ?? lastRun.current, visible, range?.range)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audience-asks-${(channel?.handle ?? "channel").replace(/^@/, "")}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const started = running || cards.length > 0 || Object.values(steps).some((s) => s.status !== "idle");

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <header className="max-w-2xl">
        <p className="text-sm font-medium text-accent">Audience Asks</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">What do your viewers keep asking for?</h1>
        <p className="mt-3 text-base text-muted">
          Paste any YouTube channel. We read the comments on its recent videos and rank what viewers ask for, with the real
          comments behind each one and a video idea to answer it.
        </p>
      </header>

      <form
        className="mt-8 flex flex-col gap-3 sm:flex-row"
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
          className="h-12 w-full rounded-xl border sm:flex-1 border-line bg-panel px-4 text-base outline-none placeholder:text-muted/70 focus:border-accent"
        />
        <label className="sr-only" htmlFor="window">
          Which videos to read
        </label>
        <select
          id="window"
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="h-12 rounded-xl border border-line bg-panel px-3 text-sm outline-none focus:border-accent"
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
          className="h-12 rounded-xl bg-accent px-6 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {running ? "Reading…" : "Read the comments"}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>Try</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setInput(ex);
              void run(ex);
            }}
            className="rounded-full border border-line px-3 py-1 hover:border-accent hover:text-white"
          >
            {ex}
          </button>
        ))}
      </div>

      {fatal && (
        <div role="alert" className="mt-8 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
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
            {range?.range && (
              <p className="mb-4 text-sm text-muted">
                Comments from <span className="text-white">{formatDate(range.range.from)}</span> to{" "}
                <span className="text-white">{formatDate(range.range.to)}</span>
                {range.months ? `, on videos from the last ${range.months} months` : ", on the latest videos of any age"}
              </p>
            )}
            {cards.length > 0 && (
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <div role="tablist" aria-label="Filter asks" className="flex flex-wrap gap-1 rounded-xl border border-line bg-panel p-1">
                  {(["all", "question", "request", "complaint"] as const).map((f) => (
                    <button
                      key={f}
                      role="tab"
                      aria-selected={filter === f}
                      onClick={() => setFilter(f)}
                      className={`rounded-lg px-3 py-1.5 text-sm capitalize ${filter === f ? "bg-accent-soft text-white" : "text-muted hover:text-white"}`}
                    >
                      {f === "all" ? "All" : `${f}s`} <span className="text-muted">{counts[f]}</span>
                    </button>
                  ))}
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-sm">
                  <input type="checkbox" checked={recentOnly} onChange={(e) => setRecentOnly(e.target.checked)} className="accent-accent" />
                  Asked in the last 30 days
                </label>
                <button onClick={exportMarkdown} className="ml-auto rounded-xl border border-line px-3 py-2 text-sm hover:border-accent">
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
                  onCopy={() => navigator.clipboard.writeText(cardToMarkdown(card))}
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
              <p className="rounded-xl border border-line p-6 text-sm text-muted">Nothing matches these filters.</p>
            )}
          </div>
        </section>
      )}

      <footer className="mt-20 text-xs text-muted">
        An independent concept by Tyler (<a className="underline hover:text-white" href="https://github.com/tywiththewifi/audience-asks">source</a>). Not affiliated with vidIQ or YouTube. Comments are read
        through the public YouTube Data API.
      </footer>
    </main>
  );
}
