import type { Episode, ThreadItem } from "./types";

/*
 * 离开时问保存还是放弃: a description or the doctor's orders that were put in the conversation
 * but neither saved nor dropped. Pure, so it can be checked on its own.
 */

export type DraftCard = Extract<ThreadItem, { kind: "description" } | { kind: "orders" }>;

/** The words of the question asked about a draft when the conversation is opened again. */
/** 保存、放弃，或者接着改（队友剧本：退出前保存、放弃和继续编辑） */
export const DRAFT_CHOICES = ["保存", "放弃", "接着改"] as const;
const PROMPT_START = "上次的「";

/**
 * Every card still waiting to be saved, oldest first. A description counts only while its complaint
 * is still on record and it is the newest card for that complaint (a revised one replaces it).
 */
export function unsavedCards(thread: ThreadItem[], episodes: Episode[]): DraftCard[] {
  const newest = new Map<string, string>();
  for (const x of thread) if (x.kind === "description") newest.set(x.episodeId, x.id);
  return thread.filter((x): x is DraftCard => {
    if (x.kind === "orders") return x.state === "draft";
    if (x.kind !== "description" || x.state !== "draft") return false;
    return newest.get(x.episodeId) === x.id && episodes.some((e) => e.id === x.episodeId);
  });
}

/** What the patient calls this card: 肚子痛的病情描述, 急性胃炎的医嘱. */
export function draftName(card: DraftCard, episodes: Episode[]): string {
  if (card.kind === "description") {
    const title = episodes.find((e) => e.id === card.episodeId)?.title;
    return title ? `${title}的病情描述` : "病情描述";
  }
  return card.result.diagnosis ? `${card.result.diagnosis}的医嘱` : "医嘱";
}

/** 上次的「X」还没保存，要保存、放弃，还是接着改？ */
export const draftPrompt = (card: DraftCard, episodes: Episode[]) => `${PROMPT_START}${draftName(card, episodes)}」还没保存，要保存、放弃，还是接着改？`;

/** Is this item the question about a draft, with its two answers still to tap? */
export function isDraftPrompt(item: ThreadItem | undefined): boolean {
  return (
    item?.kind === "ai" &&
    item.text.startsWith(PROMPT_START) &&
    item.chips?.length === DRAFT_CHOICES.length &&
    DRAFT_CHOICES.every((c, i) => item.chips?.[i] === c)
  );
}
