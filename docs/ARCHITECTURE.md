# Architecture

## Request path

```
Browser                    Next.js route handler (/api/asks, Node runtime)                 External
───────                    ────────────────────────────────────────────────                ────────
paste @handle ──GET──────▶ rate limit (per IP)
                           runAudienceAsks()  ── async generator of events ──┐
                             1. fetch  ── cached 24h by channel ───────────────────────▶ YouTube Data API v3
                                          channels.list(forHandle)          1 unit
                                          playlistItems.list(uploads)       1 unit / 50 videos (200 read)
                                          commentThreads.list × videos      1 unit / video
                             2. sort   ── cached by comment ids ───────────────────────▶ Claude Haiku 5.5
                                          batches of 80, 6 in parallel, zod-checked JSON
                             3. group  ── cached by ask ids ───────────────────────────▶ Claude Opus 5.5, fast mode
                                          topics must cite comment refs + exact quotes
                                          each topic checked and sent as soon as it's written
                                          grounding check → one scoped retry → drop
                             4. ideas  ── cached per topic ────────────────────────────▶ Claude Opus 5.5
                                          4 in parallel, each starting as its card lands
                             5. coverage ─ once grouping is done, cached ───────────────▶ Claude Haiku 5.5
                                          asks matched to the last 200 uploads' titles
◀──text/event-stream────── progress · channel · card · cards · idea · coverage · step_error · done
render cards as they land
```

The pipeline is one async generator (`src/lib/pipeline/run.ts`). The route handler, the CLI (`npm run asks`), the MCP server and the evals all drive the same generator, so there is only one code path to test.

## Events

| Event | When | Payload |
|---|---|---|
| `progress` | a step starts or finishes | step, status, human message ("Read 4,812 comments") |
| `channel` | channel resolved | title, handle, avatar |
| `card` | while grouping, as soon as each topic is written and checked | the ask, viewer count, videos, three proof comments, evidence |
| `cards` | when grouping is done | every card, ranked; it replaces the ones sent so far, since duplicates are merged at the end |
| `idea` | as each idea call returns | card id + titles, hook, why — or an error for that card only |
| `coverage` | when the back-catalogue match returns | for each answered ask: the past video and "answers" or "partly" |
| `step_error` | a step failed or partly failed | step, message, whether a retry can help |
| `done` | always last | comments, quota units, cost in USD, time |

The grouping answer is JSON, read as it streams (`src/lib/json-stream.ts`): each topic is checked and sent the moment its closing brace arrives, so the first card shows a few seconds into the step and its idea starts while the model is still writing the rest. The page slots each card in at its rank. See DECISIONS.md, D17.

## Quota maths

The free YouTube Data API quota is 10,000 units a day. Every call this app makes costs 1 unit.

| Call | Units | For 30 videos |
|---|---|---|
| `channels.list` (forHandle) | 1 | 1 |
| `playlistItems.list` (uploads playlist, 50 per page, the latest 200 for the back catalogue) | 1 per page | 4 |
| `commentThreads.list` (100 comments per page) | 1 per page | 30 |
| **Total for one channel** | | **≈ 35** |

That is about 285 fresh channels a day on the free quota, before caching. `search.list` costs 100 units per call, so reading a channel never uses it (see DECISIONS.md, D1).

The "already on YouTube?" check is the exception, and it runs only when someone presses the button on an idea:

| Call | Units |
|---|---|
| `search.list` (top 10 videos for the idea's search query) | 100 |
| `videos.list` (views and lengths for those 10) | 1 |
| **Total per check** | **101** |

Then one Claude Haiku 5.5 call rates each result as the same video, a related one, or different (about $0.0005). See DECISIONS.md, D13.

## Caching

`src/lib/cache.ts` is a two-level cache: process memory, then JSON files in `CACHE_DIR` (defaults to the OS temp dir, which is `/tmp` on Vercel).

| Key | TTL | Why |
|---|---|---|
| channel input + video count + comments per video | 24 h | comments change slowly; saves quota |
| sort model + the exact comment ids | 24 h | a retry after a group failure doesn't re-sort |
| group model + the exact ask ids | 24 h | |
| ideas model + topic + its comment ids | 24 h | a retry only rewrites ideas that failed |
| search query (the YouTube check) | 24 h | each search costs 100 units |
| check model + ask + titles + result ids | 24 h | the same results get the same ratings |
| coverage model + the asks + the catalogue's video ids | 24 h | a retry doesn't re-match |

Caching by inputs (not by channel) is what makes "Retry" cheap: completed steps hit the cache and only the failed step runs again.

## Cost per channel

Measured numbers live in [EVALS.md](./EVALS.md). The sort step sends every comment through the cheapest model; the grouping step sends only the questions, requests and complaints (usually 10–20% of comments) through the larger one, in fast mode at twice the standard price. A 30-video run on vidIQ costs about $0.60, roughly $0.41 of it for grouping.

## Where things live

```
src/lib/youtube.ts           YouTube client, input parsing, quota counter
src/lib/llm.ts               structured Claude calls, error mapping, cost meter
src/lib/json-stream.ts       pulls finished items out of a JSON answer while it streams
src/lib/pipeline/sort.ts     step 1 prompt + batching
src/lib/pipeline/group.ts    step 2 prompt + scoped retry, topics handed over as they stream
src/lib/pipeline/grounding.ts   citation and quote checks, duplicate merging
src/lib/pipeline/ideas.ts    step 3 prompt
src/lib/pipeline/cards.ts    viewer counts, evidence badges, ranking
src/lib/pipeline/existing.ts the "already on YouTube?" check: search, ratings, verdict
src/lib/pipeline/coverage.ts asks matched to the channel's own past videos
src/lib/pipeline/run.ts      the event stream that ties it together
src/app/api/asks/route.ts    SSE route handler
src/app/api/check/route.ts   the YouTube check, one JSON POST per idea
src/components/              UI
mcp/server.ts                MCP tool
evals/                       snapshots, labels, eval runner
```
