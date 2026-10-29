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

Honest provenance: the labels were written by Claude Code in a pass separate from the pipeline, before any pipeline output existed, and are waiting on a human spot-check. They are a reasonable first gold set, not an independent human one. The class balance is what real comments look like: 135 other, 41 praise, 13 questions, 6 requests, 3 complaints, 2 spam. That is why the ask precision and recall columns matter more than the headline accuracy.

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

_Pending the first run with an API key. This table is pasted from `evals/results/latest.md`._

## What we'd add next

- A second human labeller and agreement stats on the gold set.
- A topic-quality judge: does each topic read as one video a creator could make?
- Fixtures in more languages (the sort prompt claims to handle any language; only a few comments here test it).
