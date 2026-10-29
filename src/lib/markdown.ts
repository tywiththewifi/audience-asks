import type { AskCard } from "./types";
import { commentUrl } from "./youtube";

export function cardToMarkdown(card: AskCard) {
  const lines = [
    `## ${card.ask}`,
    "",
    `${card.viewerCount} viewers asked across ${card.videos.length} video${card.videos.length === 1 ? "" : "s"} · evidence: ${card.evidence} · ${card.kind}`,
    "",
    card.summary,
    "",
  ];
  for (const p of card.proof) lines.push(`> "${p.quote}" — ${p.comment.author} ([on "${p.comment.videoTitle}"](${commentUrl(p.comment)}))`, "");
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
  return lines.join("\n");
}

export function toMarkdown(channelTitle: string, cards: AskCard[]) {
  return [`# What ${channelTitle}'s viewers are asking for`, "", ...cards.map(cardToMarkdown)].join("\n");
}
