# How this was built with AI

Audience Asks was built by Tyler working with Claude Code (Anthropic's coding agent) in a cloud session. This page is the honest version of how that went: what the agent did, what it got wrong, and where the human calls were.

## How the work was split

**Tyler decided:**
- the product: which vidIQ gap to fill, after comparing it with vidIQ's existing tools (title ideas, Daily Ideas, AI Coach, Outliers, Remix) and the small third-party comment tools;
- the scope and milestones in the build plan;
- the rule that nothing goes to vidIQ without his review.

**Claude Code did:**
- wrote the build plan with Tyler, including the quota maths that ruled out `search.list`;
- wrote the code, tests, eval harness, MCP server, CI and these docs;
- froze the eval snapshots and wrote the first gold labels;
- ran the checks (type check, unit tests, production build, an MCP handshake over stdio, a browser screenshot of the UI) before each commit.

## Where the AI was useful

- **Breadth in one pass.** The YouTube client, the three-step pipeline, the SSE route and the UI shared one event type from the first commit, so the CLI, the web app, the MCP tool and the evals all run the same generator.
- **Designing for its own failure modes.** The grounding check exists because the agent knows a model is most likely to garble long random ids and to "tidy up" quotes. Short refs (`c41`) and word-for-word quote checks came from that.
- **Tests for the parts that matter.** The unit tests target the decisions a reviewer would worry about: invented comment ids, reworded quotes, one viewer counted five times, channel URL formats.

## Where it was corrected or got stuck

- **The API key.** The first assumption was that `ANTHROPIC_API_KEY` set in the cloud environment would reach the session. It didn't: that name is reserved by the environment and stripped. Tyler spotted the warning in the settings screen; the fix was a second variable name (DECISIONS.md, D11).
- **Proxy-aware fetch.** Node's built-in `fetch` ignores `HTTPS_PROXY`, so the first YouTube call from the dev container failed with a 403 even though `curl` worked. Running with `NODE_USE_ENV_PROXY=1` fixed it; the code didn't need to change.
- **Label bookkeeping.** While writing the 200 gold labels, the agent misplaced five labels in one group of ten, caught it on a re-read against the comment list, and fixed them before saving.
- **The first real run.** The grouping call failed: the SDK refuses non-streaming requests that could run past 10 minutes, and grouping asks for up to 32k output tokens. The fix was to stream every structured call and read the final parsed message (`src/lib/llm.ts`). After that, vidIQ's last 20 videos produced 17 ranked asks in about a minute for $0.28.
- **The evals disagreed with the labels, and the labels were wrong.** Run 1 failed the CI gate on `vidiq`, because the model called viewers' anger at YouTube's Shorts rules a *complaint* and the gold labels said *other*. Claude Code judged that the model was right: on a channel about YouTube, that anger is a demand signal. It flagged the change to Tyler as a product call for him to confirm. The definition changed in both the prompt and the labels, every label was re-read against the new rule, and both runs are published side by side in EVALS.md rather than only the better one.
- **A stale cache.** Changing the sort prompt didn't change the results, because the cache key held the model and the comment ids but not the prompt. Prompts are now part of every step's cache key.
- **Tooling versions.** The newest TypeScript major (7.x) was available, but the agent pinned 5.9 because Next.js's type-check integration hadn't been verified against it.

_Tyler: add your own notes here: where you pushed back, what you'd do differently, and what you'd let the agent do alone next time._

## What we'd tell another team

- Write the event type and the error shapes first; the UI, CLI and evals fall out of them.
- Make the model cite, and check the citations in code. Prompting for honesty is not a control; a substring check is.
- Keep evals on frozen inputs and run them in CI, or prompt changes become arguments.
