/**
 * Freezes the comments of a few public channels so evals run on the same input every time.
 *   npm run evals:snapshot
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { Quota, getChannel, getRecentVideos, getVideoComments, mapLimit, parseChannelInput } from "../src/lib/youtube";

export const EVAL_CHANNELS = ["@vidIQ", "@PeterMcKinnon", "@NileRed", "@aliabdaal", "@JoshuaWeissman"];

const quota = new Quota();
await mkdir("evals/fixtures", { recursive: true });
for (const handle of EVAL_CHANNELS) {
  const channel = await getChannel(parseChannelInput(handle), quota);
  const videos = await getRecentVideos(channel, 10, quota);
  // Commenters are pseudonymised: evals need distinct viewers, not names.
  const pseudo = (s: string) => `viewer-${createHash("sha256").update(s).digest("hex").slice(0, 10)}`;
  const comments = (await mapLimit(videos, 8, (v) => getVideoComments(v, 100, quota)))
    .flat()
    .map((c) => ({ ...c, author: pseudo(c.authorChannelId ?? c.author), authorChannelId: pseudo(c.authorChannelId ?? c.author) }));
  const file = `evals/fixtures/${handle.slice(1).toLowerCase()}.json`;
  await writeFile(file, JSON.stringify({ capturedAt: new Date().toISOString(), channel, videos, comments }, null, 1));
  console.log(`${handle}: ${videos.length} videos, ${comments.length} comments -> ${file}`);
}
console.log(`quota used: ${quota.units} units`);
