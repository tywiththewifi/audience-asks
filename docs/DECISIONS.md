# Decisions

Short records of the choices that shaped Audience Asks. Each one says what we picked, what we gave up, and when we'd change our mind.

## D1. No `search.list`

**Decision:** find a channel's videos through its uploads playlist (`channels.list` → `playlistItems.list`), never through `search.list`.

**Why:** `search.list` costs 100 quota units a call. The uploads playlist costs 1 unit per 50 videos. A full channel read is about 32 units instead of 130+, so the free 10,000-unit quota covers roughly 300 channels a day instead of about 75.

**Trade-off:** we only see the latest uploads, not "most popular ever". For "what do viewers want *now*", recent is what we want anyway.

## D2. Three AI steps instead of one

**Decision:** sort → group → ideas, as separate calls with separate models.

**Why:**
- **Cost.** Sorting touches every comment, so it runs on Claude Haiku 5.5 ($0.10 per million input tokens). Only the 10–20% of comments that are asks reach the larger model.
- **Checkability.** Each step has a narrow JSON contract that zod validates, and each can be evaluated alone (EVALS.md measures sort accuracy separately from citation accuracy).
- **Streaming.** Cards can render after step 2 while step 3 writes ideas in parallel.
- **Failure isolation.** A failed idea call breaks one card, not the run.

**Trade-off:** more moving parts and one more round trip than a single giant prompt. A single prompt was also worse at keeping comment ids straight across thousands of comments.

## D3. Topics must cite comments, and we check every citation

**Decision:** the grouping step must return comment refs and exact quotes for each topic. Code checks that every ref exists in the input and every quote appears word for word in the comment it points at (`src/lib/pipeline/grounding.ts`). A topic that fails gets one scoped retry with the exact problems listed; if it still fails, it is dropped.

**Why:** the product's whole promise is "here are the real comments". A plausible-sounding comment nobody wrote is the worst failure this app can have. Dropping a topic is a much smaller failure than showing a fake one.

**Trade-off:** we sometimes lose a real topic that the model mis-cited. EVALS.md tracks how often (topics dropped).

## D4. Short refs (`c41`) instead of YouTube comment ids

**Decision:** the model sees `[c41]`, not `UgzvY_leAU83fwauql14AaABAg`. Code maps refs back to ids.

**Why:** 26-character random ids cost tokens and are easy to garble by one character. Short refs are cheap and an invented one is easy to detect.

## D5. Rank by distinct viewers, not comment count

**Decision:** a card's rank is the number of distinct commenter channels in it, then total likes.

**Why:** one superfan posting the same question five times is one viewer. Creators care about how many people want something.

## D6. Thin evidence is labelled, not hidden

**Decision:** every card carries `strong` (8+ viewers over 2+ videos), `some` (3+ viewers) or `thin`.

**Why:** a single well-liked, very specific comment can still be a good video. Hiding it would be paternalistic; showing it unlabelled would overstate it.

## D7. A cheap pre-filter before the model

**Decision:** comments with fewer than 8 letters ("🔥🔥🔥", "first!") skip the sort step.

**Why:** they can't contain an ask, and on big channels they are a large share of comments. This is the only place we decide something without the model, and it is deliberately conservative.

## D8. Cache by step inputs

**Decision:** cache each step's output by a hash of its exact inputs, for 24 hours.

**Why:** it makes Retry cheap (only the failed step reruns), saves YouTube quota for repeat visitors, and makes the evals reproducible when caching is on.

**Trade-off:** on serverless hosts the disk cache only lives as long as the instance. A shared store (Vercel KV, Redis) is the next step if traffic grows.

## D9. Server-sent events over WebSockets

**Decision:** one `GET` returning `text/event-stream`, parsed with `fetch` and a 20-line parser.

**Why:** the stream is one-way, works on Vercel's Node runtime without extra infrastructure, and a plain `fetch` lets the UI read 429 and error bodies (which `EventSource` hides).

## D10. Structured outputs, checked twice

**Decision:** every model call uses the API's JSON-schema output mode, and the SDK re-validates the result with zod.

**Why:** schema mode removes malformed JSON as a failure class; zod catches anything else and turns it into a labelled step error instead of a crash. Refusals and `max_tokens` stops are also turned into labelled, retryable errors.

## D11. The Anthropic key can come from `AUDIENCE_ASKS_ANTHROPIC_KEY`

**Decision:** read `AUDIENCE_ASKS_ANTHROPIC_KEY` first, then `ANTHROPIC_API_KEY`.

**Why:** the cloud environment this was built in reserves `ANTHROPIC_API_KEY` for its own use and strips it from sessions. A second name keeps local, CI and Vercel setups standard.
