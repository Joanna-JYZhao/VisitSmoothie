import type { Episode, ThreadItem } from "./types";
import { L, pick } from "./lang";

/*
 * 离开时问保存还是放弃: a description or the doctor's orders that were put in the conversation
 * but neither saved nor dropped. Pure, so it can be checked on its own.
 */

export type DraftCard = Extract<ThreadItem, { kind: "description" } | { kind: "orders" }>;

/** 保存、放弃，或者接着改（队友剧本：退出前保存、放弃和继续编辑）, in Chinese and in English */
const CHOICES_BOTH = [
  ["保存", "放弃", "接着改"],
  ["Save", "Drop", "Keep editing"],
] as const;
/** The three answers in Chinese (what the tests and the stored conversation use). */
export const DRAFT_CHOICES = CHOICES_BOTH[0];
/** The three answers in the language of the interface, as buttons. */
export const draftChoices = (): string[] => [...pick<readonly string[]>(CHOICES_BOTH[0], CHOICES_BOTH[1])];
/** Which of the three a tapped or typed answer is, in either language. */
export function draftChoiceOf(text: string): "save" | "drop" | "edit" | null {
  const t = text.trim();
  for (const set of CHOICES_BOTH) {
    const i = (set as readonly string[]).indexOf(t);
    if (i >= 0) return (["save", "drop", "edit"] as const)[i];
  }
  return null;
}

const PROMPT_START = ["上次的「", "Last time’s “"] as const;

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
    return title ? L(`${title}的病情描述`, `description of ${title}`) : L("病情描述", "description");
  }
  return card.result.diagnosis ? L(`${card.result.diagnosis}的医嘱`, `doctor's orders for ${card.result.diagnosis}`) : L("医嘱", "doctor's orders");
}

/** 上次的「X」还没保存，要保存、放弃，还是接着改？ */
export const draftPrompt = (card: DraftCard, episodes: Episode[]) =>
  L(`${PROMPT_START[0]}${draftName(card, episodes)}」还没保存，要保存、放弃，还是接着改？`, `${PROMPT_START[1]}${draftName(card, episodes)}” isn't saved yet. Save it, drop it, or keep editing?`);

/** Is this item the question about a draft, with its answers still to tap (in either language)? */
export function isDraftPrompt(item: ThreadItem | undefined): boolean {
  if (item?.kind !== "ai" || !PROMPT_START.some((p) => item.text.startsWith(p))) return false;
  return CHOICES_BOTH.some((set) => item.chips?.length === set.length && set.every((c, i) => item.chips?.[i] === c));
}
