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
import { FileText } from "lucide-react";

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

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
      <h1 className="mb-3 text-2xl font-semibold text-ink">看医生之前</h1>
      <div className="flex-1 space-y-3 pb-4">
        <Thread items={state.thread} busy={busy} onChip={say} />
        <div ref={end} aria-hidden="true" className="h-px" />
      </div>
      {/* stays at the bottom edge while the conversation scrolls above it */}
      <div className="sticky bottom-0 z-10 space-y-2 border-t border-line bg-canvas/95 pt-2.5 pb-3 backdrop-blur">
        {report && (
          <button
            type="button"
            onClick={() => router.push(report)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-50 px-4 text-lg font-medium text-brand-800 transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
          >
            <FileText className="h-5 w-5" />
            给医生看的报告（{reportTitle}）
          </button>
        )}
        <Composer onSend={say} onPhotos={(files) => void photos(files)} disabled={busy} />
      </div>
    </div>
  );
}
