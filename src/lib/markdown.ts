import type { AskCard, DateRange } from "./types";
import { commentUrl } from "./youtube";

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function cardToMarkdown(card: AskCard) {
  const lines = [
    `## ${card.ask}`,
    "",
    `${card.viewerCount} viewers asked across ${card.videos.length} video${card.videos.length === 1 ? "" : "s"} · evidence: ${card.evidence} · ${card.kind}`,
    "",
    card.summary,
    "",
  ];
  for (const p of card.proof) lines.push(`> "${p.quote}" — ${p.comment.author}, ${formatDate(p.comment.publishedAt)} ([on "${p.comment.videoTitle}"](${commentUrl(p.comment)}))`, "");
  if (card.idea) {
    lines.push(
      "**Video idea**",
      "",
      `- ${card.idea.titles[0]}`,
      `- ${card.idea.titles[1]}`,
      "",
      `Hook: ${card.idea.hook}`,
      "",
      `Why it should work: ${card.idea.why}`,
      "",
    );
  }
  if (card.check) {
    const same = card.check.matches.filter((m) => m.match === "same");
    lines.push(`**Already on YouTube?** ${card.check.summary}`, "");
    if (card.check.angle) lines.push(`How to stand out: ${card.check.angle}`, "");
    for (const m of same.slice(0, 5)) {
      lines.push(`- [${m.title}](https://www.youtube.com/watch?v=${m.id}) — ${m.ownChannel ? "your channel" : m.channelTitle}, ${formatDate(m.publishedAt)}`);
    }
    if (same.length) lines.push("");
  }
  return lines.join("\n");
}

export function toMarkdown(channelTitle: string, cards: AskCard[], span: { comments?: DateRange; videos?: DateRange } = {}) {
  const parts = [
    span.videos && `Videos posted ${formatDate(span.videos.from)} to ${formatDate(span.videos.to)}.`,
    span.comments && `Comments posted ${formatDate(span.comments.from)} to ${formatDate(span.comments.to)}.`,
  ].filter(Boolean);
  const header = parts.length ? [parts.join(" "), ""] : [];
  return [`# What ${channelTitle}'s viewers are asking for`, "", ...header, ...cards.map(cardToMarkdown)].join("\n");
}
