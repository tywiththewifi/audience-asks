# Architecture

## Request path

```
Browser                    Next.js route handler (/api/asks, Node runtime)                 External
───────                    ────────────────────────────────────────────────                ────────
paste @handle ──GET──────▶ rate limit (per IP)
                           runAudienceAsks()  ── async generator of events ──┐
                             1. fetch  ── cached 24h by channel ───────────────────────▶ YouTube Data API v3
                                          channels.list(forHandle)          1 unit
                                          playlistItems.list(uploads)       1 unit / 50 videos
                                          commentThreads.list × videos      1 unit / video
                             2. sort   ── cached by comment ids ───────────────────────▶ Claude Haiku 5.5
                                          batches of 80, 6 in parallel, zod-checked JSON
                             3. group  ── cached by ask ids ───────────────────────────▶ Claude Opus 5.5
                                          topics must cite comment refs + exact quotes
                                          grounding check → one scoped retry → drop
                             4. ideas  ── cached per topic ────────────────────────────▶ Claude Opus 5.5
                                          4 in parallel, streamed as each finishes
◀──text/event-stream────── progress · channel · card · idea · step_error · done
render cards as they land
```

The pipeline is one async generator (`src/lib/pipeline/run.ts`). The route handler, the CLI (`npm run asks`), the MCP server and the evals all drive the same generator, so there is only one code path to test.

## Events

| Event | When | Payload |
|---|---|---|
| `progress` | a step starts or finishes | step, status, human message ("Read 4,812 comments") |
| `channel` | channel resolved | title, handle, avatar |
| `card` | after grouping, one per topic, ranked | the ask, viewer count, videos, three proof comments, evidence |
| `idea` | as each idea call returns | card id + titles, hook, why — or an error for that card only |
| `step_error` | a step failed or partly failed | step, message, whether a retry can help |
| `done` | always last | comments, quota units, cost in USD, time |

Cards render before their ideas exist, so the creator is reading real comments within seconds of the grouping step, while ideas fill in.

## Quota maths

The free YouTube Data API quota is 10,000 units a day. Every call this app makes costs 1 unit.

| Call | Units | For 30 videos |
|---|---|---|
| `channels.list` (forHandle) | 1 | 1 |
| `playlistItems.list` (uploads playlist, 50 per page) | 1 per page | 1 |
| `commentThreads.list` (100 comments per page) | 1 per page | 30 |
| **Total for one channel** | | **≈ 32** |

That is about 300 fresh channels a day on the free quota, before caching. `search.list` would cost 100 units per call; we never use it (see DECISIONS.md, D1).

## Caching

`src/lib/cache.ts` is a two-level cache: process memory, then JSON files in `CACHE_DIR` (defaults to the OS temp dir, which is `/tmp` on Vercel).

| Key | TTL | Why |
|---|---|---|
| channel input + video count + comments per video | 24 h | comments change slowly; saves quota |
| sort model + the exact comment ids | 24 h | a retry after a group failure doesn't re-sort |
| group model + the exact ask ids | 24 h | |
| ideas model + topic + its comment ids | 24 h | a retry only rewrites ideas that failed |

Caching by inputs (not by channel) is what makes "Retry" cheap: completed steps hit the cache and only the failed step runs again.

## Cost per channel

Measured numbers live in [EVALS.md](./EVALS.md). The sort step sends every comment through the cheapest model; the grouping step sends only the questions, requests and complaints (usually 10–20% of comments) through the larger one.

## Where things live

```
src/lib/youtube.ts           YouTube client, input parsing, quota counter
src/lib/llm.ts               structured Claude calls, error mapping, cost meter
src/lib/pipeline/sort.ts     step 1 prompt + batching
src/lib/pipeline/group.ts    step 2 prompt + scoped retry
src/lib/pipeline/grounding.ts   citation and quote checks, duplicate merging
src/lib/pipeline/ideas.ts    step 3 prompt
src/lib/pipeline/cards.ts    viewer counts, evidence badges, ranking
src/lib/pipeline/run.ts      the event stream that ties it together
src/app/api/asks/route.ts    SSE route handler
src/components/              UI
mcp/server.ts                MCP tool
evals/                       snapshots, labels, eval runner
```
