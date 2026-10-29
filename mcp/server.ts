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
import { runAudienceAsks } from "../src/lib/pipeline/run";
import type { AskCard, DateRange } from "../src/lib/types";

const server = new McpServer({ name: "audience-asks", version: "0.1.0" });

server.registerTool(
  "audience_asks",
  {
    title: "Audience Asks",
    description:
      "Reads the comments on a YouTube channel's recent videos and returns what viewers keep asking for: ranked topics with how many distinct viewers asked, real quoted comments with links, and a video idea for each. Use it when a creator asks what their audience wants, what to make next, or what questions keep coming up.",
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
    let range: DateRange | undefined;
    for await (const ev of runAudienceAsks(channel, { maxVideos: videos ?? 30, months })) {
      if (ev.type === "channel") {
        title = ev.channel.title;
        range = ev.range;
      }
      if (ev.type === "card") cards.set(ev.card.id, ev.card);
      if (ev.type === "idea" && cards.has(ev.cardId)) cards.get(ev.cardId)!.idea = ev.idea;
      if (ev.type === "step_error") errors.push(`${ev.step}: ${ev.message}`);
    }
    const list = [...cards.values()].filter((c) => !kind || c.kind === kind);
    if (!list.length) {
      return { isError: errors.length > 0, content: [{ type: "text", text: errors.join("\n") || "No questions or requests found in recent comments." }] };
    }
    const note = errors.length ? `\n\nSome steps had problems: ${errors.join("; ")}` : "";
    return { content: [{ type: "text", text: toMarkdown(title, list, range) + note }] };
  },
);

await server.connect(new StdioServerTransport());
