"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getState, storeActions, useStore } from "@/lib/store";
import { compressImage } from "@/lib/image";
import {
  askDueCheckIns,
  discardDescription,
  discardOrders,
  greet,
  reviseDescription,
  saveDescription,
  saveOrders,
  sendTurn,
  useThreadBusy,
} from "@/lib/thread";
import { DRAFT_CHOICES, draftPrompt, isDraftPrompt, unsavedCards } from "@/lib/drafts";
import { Thread } from "@/components/chat/Thread";
import { Composer } from "@/components/chat/Composer";
import { useToast } from "@/components/Toast";
import { IconTile } from "@/components/ui";
import { ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 4;

/** Asks about the newest card that is still unsaved, unless that question is already the last thing in the conversation. */
function askAboutDraft(): void {
  const { thread, episodes } = getState();
  const card = unsavedCards(thread, episodes).at(-1);
  if (!card || isDraftPrompt(thread.at(-1))) return;
  storeActions.pushThread({ kind: "ai", text: draftPrompt(card, episodes), chips: [...DRAFT_CHOICES] });
}

/**
 * 保存 or 放弃 said under the question about a draft. Returns false when the sentence is not such an
 * answer, so it goes into the conversation as usual.
 */
function answerDraft(text: string): boolean {
  const { thread, episodes } = getState();
  const choice = DRAFT_CHOICES.find((c) => c === text.trim());
  const card = unsavedCards(thread, episodes).at(-1);
  if (!choice || !card || !isDraftPrompt(thread.at(-1))) return false;
  storeActions.pushThread({ kind: "user", text: choice });
  if (choice === "接着改") {
    // the card stays a draft: a description is corrected by what is said next; the orders card is right above
    if (card.kind === "description") reviseDescription(card.id);
    else storeActions.pushThread({ kind: "ai", text: "好，医嘱就在上面，看完再点「保存」。" });
    return true;
  }
  if (card.kind === "description") {
    if (choice === "保存") saveDescription(card.id);
    else if (discardDescription(card.id)) storeActions.pushThread({ kind: "ai", text: "好，这条没有保存。" });
  } else if (choice === "保存") {
    saveOrders(card.id);
  } else {
    discardOrders(card.id);
    storeActions.pushThread({ kind: "ai", text: "好，这次的医嘱没有保存。" });
  }
  // one more left from before: ask about that one too
  askAboutDraft();
  return true;
}

/** What is said or tapped: an answer about a draft, or a turn of the conversation. */
const say = (text: string) => {
  if (!answerDraft(text)) void sendTurn(text);
};

/**
 * pre, before seeing the doctor: one conversation. It opens with 今天哪里不舒服？; the patient
 * speaks, types or sends a photo of what is wrong; questions follow until the description for the
 * doctor is ready. (`mode` is still accepted from the old post page; the screen is pre only.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ChatScreen(_props: { mode?: "pre" | "post" }) {
  const { state } = useStore();
  const router = useRouter();
  const toast = useToast();
  const busy = useThreadBusy();
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  // the daily question about each complaint that is due, once per opening
  useEffect(() => {
    if (asked.current || !state.profile) return;
    asked.current = true;
    // 今天哪里不舒服？ — unless questions are going on, or it was already said since the patient last spoke
    greet();
    askDueCheckIns();
    // 离开时问保存还是放弃: a card left unsaved last time is asked about once more, at the end
    askAboutDraft();
  }, [state.profile]);

  // closing or reloading the page with an unsaved card: the browser's own "leave this page?" prompt
  const unsaved = unsavedCards(state.thread, state.episodes).length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // Keep the newest thing in view. Set directly: smooth scrolling stalls in background tabs.
  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [state.thread.length, busy]);

  if (!state.profile) return null;

  // the newest complaint being followed: its page for the doctor is one tap away
  const latest = [...state.episodes].filter((e) => e.status === "active").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const report = latest ? `/doctor/${latest.id}` : null;
  const reportTitle = latest?.title ?? "";

  const photos = async (files: File[]) => {
    try {
      const images = await Promise.all(files.slice(0, MAX_PHOTOS).map((f) => compressImage(f)));
      if (files.length > MAX_PHOTOS) toast.show(`一次最多 ${MAX_PHOTOS} 张，先看前 ${MAX_PHOTOS} 张`);
      void sendTurn("", images);
    } catch {
      toast.show("这张照片打不开，换一张试试", "danger");
    }
  };

  // Before the patient has said anything the screen is an invitation, not a thread: the opening
  // question sits in the middle of the page, and the ways to answer sit right under it.
  const opening = !state.thread.some((t) => t.kind === "user");

  /*
   * One reading column, like a Messages thread: the title at the top, the conversation in the
   * middle, and at the bottom a sheet the conversation scrolls under, holding the one way to answer.
   */
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-2xl flex-col">
      {/* while the page is an invitation the name of the page steps back and the question is the headline */}
      <h1 className={cn("mb-6 animate-fade-up transition-all duration-500", opening ? "t-heading text-center text-ink-2" : "t-display text-ink")}>看医生之前</h1>
      <div className={cn("flex flex-1 flex-col pb-6", opening ? "justify-center" : "justify-end")}>
        <div className="space-y-5">
          <Thread items={state.thread} busy={busy} onChip={say} opening={opening} />
          <div ref={end} aria-hidden="true" className="h-px" />
        </div>
      </div>
      {/* the sheet: part of the page, not pasted on — a fade above it, a raised surface, the report one tap away inside it */}
      <div className="sticky bottom-0 z-10 -mx-4 px-4 pb-3 sm:-mx-2 sm:px-2">
        <div aria-hidden="true" className="pointer-events-none h-8 bg-linear-to-t from-canvas to-canvas/0" />
        <div className="material-raised space-y-3 rounded-[32px] border border-line/70 p-3">
          {report && (
            <button
              type="button"
              onClick={() => router.push(report)}
              className="press flex min-h-14 w-full items-center gap-3 rounded-full bg-brand-50 py-1 pr-4 pl-1.5 text-left text-lg font-medium text-brand-800 transition duration-200 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              <IconTile size="lg" tone="solid" className="rounded-full">
                <FileText />
              </IconTile>
              <span className="min-w-0 flex-1 truncate">给医生看的报告（{reportTitle}）</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-brand-600" />
            </button>
          )}
          <Composer onSend={say} onPhotos={(files) => void photos(files)} disabled={busy} />
        </div>
      </div>
    </div>
  );
}
