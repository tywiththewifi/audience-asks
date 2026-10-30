/**
 * MCP server exposing one tool, audience_asks(channel), so Claude can answer
 * "what do my viewers want next?" from inside a chat. Runs over stdio:
 *
 *   claude mcp add audience-asks -- npx tsx /path/to/audience-asks/mcp/server.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { toMarkdown } from "../src/lib/markdown";
import { withEarlierState } from "../src/lib/pipeline/cards";
import { checkIdea } from "../src/lib/pipeline/existing";
import { runAudienceAsks } from "../src/lib/pipeline/run";
import type { AskCard, DateRange } from "../src/lib/types";

const server = new McpServer({ name: "audience-asks", version: "0.1.0" });

server.registerTool(
  "audience_asks",
  {
    title: "Audience Asks",
    description:
      "Reads the comments on a YouTube channel's recent videos and returns what viewers keep asking for: ranked topics with how many distinct viewers asked, real quoted comments with links, and a video idea for each, plus which asks a past video already answers. Use it when a creator asks what their audience wants, what to make next, or what questions keep coming up.",
    inputSchema: {
      channel: z.string().describe("A channel @handle, channel URL or UC… channel id"),
      videos: z.number().int().min(5).max(50).optional().describe("How many recent videos to read (default 30)"),
      months: z
        .number()
        .int()
        .min(0)
        .max(36)
        .optional()
        .describe("Only read videos from the last N months (default 12). 0 reads the latest videos whatever their age."),
      kind: z.enum(["question", "request", "complaint"]).optional().describe("Only return this kind of ask"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ channel, videos, months, kind }) => {
    const cards = new Map<string, AskCard>();
    const errors: string[] = [];
    let title = channel;
    let span: { comments?: DateRange; videos?: DateRange } = {};
    for await (const ev of runAudienceAsks(channel, { maxVideos: videos ?? 30, months })) {
      if (ev.type === "channel") {
        title = ev.channel.title;
        span = { comments: ev.range, videos: ev.videoRange };
      }
      if (ev.type === "card") cards.set(ev.card.id, ev.card);
      if (ev.type === "cards") {
        const earlier = [...cards.values()];
        cards.clear();
        for (const card of withEarlierState(ev.cards, earlier)) cards.set(card.id, card);
      }
      if (ev.type === "coverage") for (const m of ev.matches) if (cards.has(m.cardId)) cards.get(m.cardId)!.answeredBy = m.match;
      if (ev.type === "idea" && cards.has(ev.cardId)) cards.get(ev.cardId)!.idea = ev.idea;
      if (ev.type === "step_error") errors.push(`${ev.step}: ${ev.message}`);
    }
    const list = [...cards.values()].filter((c) => !kind || c.kind === kind);
    if (!list.length) {
      return { isError: errors.length > 0, content: [{ type: "text", text: errors.join("\n") || "No questions or requests found in recent comments." }] };
    }
    const note = errors.length ? `\n\nSome steps had problems: ${errors.join("; ")}` : "";
    return { content: [{ type: "text", text: toMarkdown(title, list, span) + note }] };
  },
);

server.registerTool(
  "check_youtube_for_idea",
  {
    title: "Is this video already on YouTube?",
    description:
      "Searches YouTube for a video idea and says which of the top results already make that video, with links, views and age, plus how a new version could stand out. Use it after audience_asks, or whenever a creator wants to know if an idea is taken. Each call spends 100 YouTube API quota units.",
    inputSchema: {
      ask: z.string().describe("What viewers are asking for, in a sentence"),
      query: z.string().describe("What a viewer would type into YouTube search to find this video"),
      titles: z.array(z.string()).min(1).max(2).optional().describe("Proposed titles for the video"),
      channel_id: z.string().optional().describe("The creator's UC… channel id, to flag videos they already made"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ ask, query, titles, channel_id }) => {
    try {
      const check = await checkIdea({ ask, summary: ask, query, titles: titles ?? [ask], channelId: channel_id });
      const lines = [`**${check.verdict}**: ${check.summary}`, ""];
      if (check.angle) lines.push(`How to stand out: ${check.angle}`, "");
      for (const m of check.matches) {
        lines.push(
          `- [${m.match}] [${m.title}](https://www.youtube.com/watch?v=${m.id}) by ${m.ownChannel ? "your channel" : m.channelTitle}, ${m.publishedAt.slice(0, 10)}${
            m.views === undefined ? "" : `, ${m.views.toLocaleString("en-US")} views`
          }`,
        );
      }
      lines.push("", `Checked the top ${check.searched} results for "${check.query}".`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
    }
  },
);

await server.connect(new StdioServerTransport());
