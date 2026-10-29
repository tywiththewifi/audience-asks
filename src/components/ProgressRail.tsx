import type { StepName } from "@/lib/types";

export type StepState = { status: "idle" | "active" | "done" | "error"; message?: string; retryable?: boolean };

const LABELS: Record<StepName, string> = {
  fetch: "Read comments",
  sort: "Sort questions and requests",
  group: "Group into topics",
  ideas: "Write video ideas",
};

export function ProgressRail({ steps, onRetry, running }: { steps: Record<StepName, StepState>; onRetry: () => void; running: boolean }) {
  return (
    <ol className="space-y-4" aria-live="polite">
      {(Object.keys(LABELS) as StepName[]).map((name) => {
        const s = steps[name];
        return (
          <li key={name} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
              {s.status === "done" && <span className="h-5 w-5 rounded-full bg-strong/20 text-center text-xs leading-5 text-strong">✓</span>}
              {s.status === "active" && <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
              {s.status === "error" && <span className="h-5 w-5 rounded-full bg-red-500/20 text-center text-xs leading-5 text-red-400">!</span>}
              {s.status === "idle" && <span className="h-2 w-2 rounded-full bg-line" />}
            </span>
            <div className="min-w-0 text-sm">
              <p className={s.status === "idle" ? "text-muted" : "font-medium"}>{LABELS[name]}</p>
              {s.message && <p className={`mt-0.5 ${s.status === "error" ? "text-red-300" : "text-muted"}`}>{s.message}</p>}
              {s.status === "error" && s.retryable && !running && (
                <button onClick={onRetry} className="mt-2 rounded-lg border border-line px-2.5 py-1 text-xs hover:border-accent">
                  Retry (finished steps are cached)
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
