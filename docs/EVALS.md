# Evals

The evals answer four questions on a fixed input, so a prompt or model change can be judged by numbers instead of by eye:

1. **Does the sort step label comments correctly?**
2. **Does every comment a topic cites really exist, with the quote really in it?** (target: 100% in the final output)
3. **Are topics distinct, or does the model split one want into near-duplicates?**
4. **What does a channel cost, and how long does it take?**

## The input

`evals/fixtures/` holds a frozen snapshot of the 10 latest videos and up to 100 top comments per video from five public channels in different niches, captured on 29 October 2026 with `npm run evals:snapshot` (60 quota units in total).

| Fixture | Niche | Comments |
|---|---|---|
| `vidiq` | creator education | 457 |
| `petermckinnon` | photography, lifestyle | 775 |
| `nilered` | chemistry | 1,000 |
| `aliabdaal` | productivity, AI tools | 160 |
| `joshuaweissman` | cooking | 1,000 |

Commenter names and channel ids are replaced with stable pseudonyms (`viewer-3f9a…`): the evals need to count distinct viewers, not know who they are.

## The labels

`evals/labels.json` holds 200 comments (40 per channel, drawn by a seeded shuffle in `evals/sample.ts` from comments long enough to be sorted), each with one gold label using the same definitions the sort prompt uses.

Honest provenance: the labels were written by Claude Code in a pass separate from the pipeline, before any pipeline output existed, and are waiting on a human spot-check. They are a reasonable first gold set, not an independent human one. The class balance is what real comments look like: 129 other, 41 praise, 13 questions, 9 complaints, 6 requests, 2 spam (version 2 of the labels; see below). That is why the ask precision and recall columns matter more than the headline accuracy.

## Measures

| Measure | How |
|---|---|
| Sort accuracy | exact label match on the 40 gold comments per channel |
| Ask precision / recall | treating question, request and complaint as "ask" and everything else as "not ask", the distinction that decides what reaches a card |
| Real citations, first pass | share of comment refs in the model's first grouping answer that exist in the input |
| Exact quotes, first pass | share of quotes that appear word for word in the cited comment |
| Topics dropped | topics still failing the grounding check after the one retry |
| Duplicates merged / left | topics folded by the 60%-overlap merge, and pairs still sharing 30%+ of comments afterwards |
| Real citations, final | the same check on the cards a user would see; **CI fails below 100%** |
| Cost and time | metered from API usage at list prices; wall-clock per channel |

CI also fails if sort accuracy on any channel drops below 75%.

## Running them

```bash
AUDIENCE_ASKS_ANTHROPIC_KEY=sk-ant-... npm run evals          # all five channels
AUDIENCE_ASKS_ANTHROPIC_KEY=sk-ant-... npm run evals -- vidiq # one
```

Results go to `evals/results/latest.json` and `evals/results/latest.md`. In CI they also go to the job summary on every pull request, once an `ANTHROPIC_API_KEY` repository secret is set.

## Results

Three runs on the same five snapshots, two on 29 October 2026 and one on 30 October. Claude Haiku 5.5 sorts; Claude Opus 5.5 groups, in fast mode since run 3. A full run of all five channels now costs about $1.15.

### Run 3 (current): grouping in fast mode

| Channel | Comments | Sort accuracy | Ask precision / recall | Real citations (1st pass) | Exact quotes (1st pass) | Topics dropped | Dupes merged / left | Cards | Real citations (final) | Cost | Time |
|---|---|---|---|---|---|---|---|---|---|---|---|
| vidiq | 457 | 88% (n=40) | 75% / 100% | 100% | 100% | 0 | 0 / 0 | 14 | 100% | $0.242 | 16s |
| petermckinnon | 775 | 88% (n=40) | 100% / 100% | 100% | 100% | 0 | 0 / 0 | 17 | 100% | $0.265 | 28s |
| nilered | 1000 | 98% (n=40) | n/a / n/a | 100% | 100% | 0 | 0 / 0 | 14 | 100% | $0.198 | 28s |
| aliabdaal | 160 | 83% (n=40) | 71% / 91% | 100% | 100% | 0 | 0 / 0 | 6 | 100% | $0.106 | 15s |
| joshuaweissman | 1000 | 93% (n=40) | 67% / 100% | 100% | 100% | 0 | 0 / 0 | 20 | 100% | $0.335 | 31s |

The CI gate passes. Grouping took 6–15 seconds per channel instead of 23–40, for about twice the cost. Citations and quotes were still all right on the first pass, nothing was dropped or merged, and topic counts moved by about as much as they do between any two runs (three fewer on petermckinnon, three more on vidiq). The sort step didn't change, so its numbers differ from run 2 only by run-to-run noise. See DECISIONS.md, D17.

### Run 2: after widening the complaint definition

| Channel | Comments | Sort accuracy | Ask precision / recall | Real citations (1st pass) | Exact quotes (1st pass) | Topics dropped | Dupes merged / left | Cards | Real citations (final) | Cost | Time |
|---|---|---|---|---|---|---|---|---|---|---|---|
| vidiq | 457 | 83% (n=40) | 69% / 100% | 100% | 100% | 0 | 0 / 0 | 11 | 100% | $0.117 | 34s |
| petermckinnon | 775 | 88% (n=40) | 80% / 100% | 100% | 100% | 0 | 0 / 1 | 20 | 100% | $0.152 | 54s |
| nilered | 1000 | 98% (n=40) | n/a / n/a | 100% | 100% | 0 | 0 / 0 | 15 | 100% | $0.089 | 46s |
| aliabdaal | 160 | 85% (n=40) | 69% / 100% | 100% | 100% | 0 | 0 / 0 | 7 | 100% | $0.062 | 33s |
| joshuaweissman | 1000 | 95% (n=40) | 80% / 100% | 100% | 100% | 0 | 0 / 0 | 20 | 100% | $0.153 | 45s |

The CI gate passes. Every comment a card cites is real on every channel, and the model got every citation and quote right on the first pass, so the retry never fired.

### Run 1 (baseline)

| Channel | Comments | Sort accuracy | Ask precision / recall | Real citations (1st pass) | Exact quotes (1st pass) | Topics dropped | Dupes merged / left | Cards | Real citations (final) | Cost | Time |
|---|---|---|---|---|---|---|---|---|---|---|---|
| vidiq | 457 | 70% (n=40) | 20% / 50% | 100% | 100% | 0 | 0 / 0 | 12 | 100% | $0.096 | 26s |
| petermckinnon | 775 | 83% (n=40) | 80% / 100% | 100% | 100% | 0 | 0 / 1 | 17 | 100% | $0.143 | 65s |
| nilered | 1000 | 100% (n=40) | n/a / n/a | 100% | 100% | 0 | 0 / 0 | 11 | 100% | $0.076 | 33s |
| aliabdaal | 160 | 85% (n=40) | 69% / 90% | 100% | 100% | 0 | 0 / 0 | 8 | 100% | $0.064 | 30s |
| joshuaweissman | 1000 | 93% (n=40) | 67% / 100% | 100% | 100% | 0 | 0 / 0 | 20 | 100% | $0.147 | 59s |

_(For nilered, no labelled comment was an ask and none was predicted, so ask precision and recall don't apply. Run 1 printed 0% there; the runner now prints n/a.)_

The gate failed on `vidiq` at 70% sort accuracy.

### What changed between the runs, and why

Run 1's failures on `vidiq` were nearly all one pattern: viewers angry about **YouTube's** new Shorts monetization rules ("Richest company on the planet stealing from its own creator base"). The gold labels called these *other*, because the first definition of *complaint* only covered problems with the creator's own video. The model called them *complaint*.

The model had the better product call. vidIQ's channel *is about* YouTube, so its viewers' anger at a YouTube policy is exactly the kind of thing vidIQ could make a video about. In the live app, that topic is the #1 card for vidIQ (22 different viewers across 2 videos).

So the definition changed, in both the prompt and the gold labels:

> complaint: the viewer is frustrated with the video, with a product the creator showed, **or with the subject the channel covers** (for example a platform policy on a channel about that platform), in a way the creator could answer or act on. General venting about life or the world is other.

All 200 gold labels were re-read against the new rule, not just the ones the model disagreed with. Six changed (five on `vidiq`, one on `aliabdaal`), and the list is in `evals/labels.json` under `history`. One of the six ("Invite is probably to creators that don't need it") was a comment the model had labelled *other*, so the change didn't only move labels towards the model.

**The caveat:** changing gold labels after seeing model output is how evals get gamed. The guard here is that the change is one rule, written down, applied to every label, and versioned. The next prompt change should be judged on new labels as well, so these 200 don't become the thing being optimised.

### What the remaining errors look like

- **Praise with a story attached.** "Love the ongoing journal saga Pete! I'm a therapist and…" is *praise* in the gold set and *other* from the model. This is harmless, because neither label reaches a card.
- **Asks the model finds that the labels don't.** Ask precision sits at 69–80% while recall is 100%: the model leans towards calling things asks. That's the right direction for this product, because the grouping step only builds topics where several viewers want the same thing, so a one-off false ask rarely becomes a card.
- **Jokes phrased as questions.** "Why is yours so small, Josh?" was labelled a question.

## What we'd add next

- A second human labeller and agreement stats on the gold set.
- A topic-quality judge: does each topic read as one video a creator could make?
- Fixtures in more languages (the sort prompt claims to handle any language; only a few comments here test it).
