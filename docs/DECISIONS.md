# Decisions

Short records of the choices that shaped Audience Asks. Each one says what we picked, what we gave up, and when we'd change our mind.

## D1. No `search.list` for reading a channel

**Decision:** find a channel's videos through its uploads playlist (`channels.list` → `playlistItems.list`), never through `search.list`. (The one place search is worth its price is the "already on YouTube?" check, which runs only when asked; see D13.)

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

## D12. Only read the last 12 months by default

**Decision:** skip videos published more than 12 months ago unless the user picks "Any time". Show the comment date range above the results and a date on every quoted comment.

**Why:** "the 30 most recent videos" can reach far back on a channel that posts rarely. For one such channel it went back 18 months, and a fifth of the comments were over a year old. Old asks may already be answered, so they shouldn't rank next to this month's. The uploads playlist runs newest first, so the cutoff also stops paging early and costs no extra quota.

**Trade-off:** a channel that rarely posts gets fewer videos to read, and one with no videos in the window gets a clear message instead of results. "Any time" is one click away.

## D13. "Already on YouTube?" runs when asked, not for every idea

**Decision:** each video idea gets a button that searches YouTube for it (`search.list` for the top 10 results, `videos.list` for their views and lengths), then asks Claude Haiku 5.5 which results already make that video. The verdict (no close match, a few exist, crowded, or "you already made this") is computed in code from those ratings, and every match is shown with its link, views and age.

**Why:** a search costs 100 quota units, three times a whole channel read. Checking all 20 ideas on every run would spend 2,000 units, so the free 10,000 a day would cover five visitors. On demand, a typical visitor checks the two or three ideas they care about. The model only sees result numbers (`r1`…`r10`) and code drops any it wasn't given, the same rule as the comment citations. Results are cached for 24 hours by search query, and checks have their own per-visitor limit (`CHECKS_PER_HOUR`, default 20).

**Trade-off:** "no close match" means none in the top 10 results for one query, not that the video doesn't exist anywhere. The query comes from the idea step ("what a viewer would type"), and the panel shows it so the user can judge it. There's no labelled eval for the match ratings yet; that's the next one to add.

## D14. vidIQ's visual language, not its brand

**Decision:** the UI uses the tokens measured on vidiq.com in October 2026: the `#0a0d15` page, `#0d1017` cards with 16px corners and a `#2d2f39` border, `#a2a7b8` secondary text, the `#0463fd` brand blue, pill buttons with a gradient border, and the Satoshi typeface.

**Why:** this is a concept for vidIQ, so it should look like it could ship inside vidIQ. It keeps its own name and mark and says it isn't affiliated.

**Trade-off:** Satoshi is loaded from Fontshare's API rather than committed, because its license (ITF FFL) allows self-hosting but not publishing the font files in a public repository.

