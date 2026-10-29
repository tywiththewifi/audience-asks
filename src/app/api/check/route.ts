import { z } from "zod";
import { LLMError } from "@/lib/llm";
import { checkIdea } from "@/lib/pipeline/existing";
import { allow } from "@/lib/rate-limit";
import { YouTubeError, isQuotaError } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOUR = 60 * 60 * 1000;

const Body = z.object({
  ask: z.string().min(1).max(300),
  summary: z.string().max(1500).default(""),
  titles: z.array(z.string().max(200)).min(1).max(2),
  query: z.string().min(2).max(120),
  channelId: z
    .string()
    .regex(/^UC[\w-]{22}$/)
    .optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "That check request was missing something." }, { status: 400 });

  // Each check spends 100 of the 10,000 daily YouTube quota units, so it gets its own, tighter budget.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const perHour = Number(process.env.CHECKS_PER_HOUR ?? 20);
  if (!allow(`check:${ip}`, perHour, HOUR)) {
    return Response.json({ error: `This demo allows ${perHour} YouTube checks an hour per visitor. Try again a little later.` }, { status: 429 });
  }

  try {
    return Response.json(await checkIdea(parsed.data));
  } catch (err) {
    if (isQuotaError(err)) {
      return Response.json({ error: "The YouTube API quota for today is used up. It resets at midnight Pacific time." }, { status: 503 });
    }
    const status = err instanceof YouTubeError || err instanceof LLMError ? 502 : 500;
    return Response.json({ error: (err as Error).message }, { status });
  }
}
