import { DEFAULT_MONTHS, runAudienceAsks } from "@/lib/pipeline/run";
import { allow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HOUR = 60 * 60 * 1000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") ?? "";
  const videos = Math.min(50, Math.max(5, Number(url.searchParams.get("videos") ?? 30) || 30));
  const rawMonths = Number(url.searchParams.get("months") ?? DEFAULT_MONTHS);
  const months = Number.isFinite(rawMonths) ? Math.min(36, Math.max(0, Math.round(rawMonths))) : DEFAULT_MONTHS;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const perHour = Number(process.env.RUNS_PER_HOUR ?? 6);
  if (!allow(ip, perHour, HOUR)) {
    return Response.json({ error: `This demo allows ${perHour} channels an hour per visitor. Try again a little later.` }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      // Keeps proxies from closing the connection during the long grouping call.
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15000);
      try {
        for await (const event of runAudienceAsks(channel, { maxVideos: videos, months })) {
          if (req.signal.aborted) break;
          send(event);
        }
      } catch (err) {
        send({ type: "step_error", step: "fetch", message: (err as Error).message, retryable: true });
        send({ type: "done", stats: null });
      } finally {
        clearInterval(ping);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
