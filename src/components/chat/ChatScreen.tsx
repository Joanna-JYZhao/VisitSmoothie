"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getState, storeActions, useStore } from "@/lib/store";
import { compressImage } from "@/lib/image";
import {
  askDueCheckIns,
  discardDescription,
  discardOrders,
  greet,
  inProgress,
  reviseDescription,
  saveDescription,
  saveOrders,
  sendTurn,
  startOverPre,
  useThreadBusy,
} from "@/lib/thread";
import { StartOver } from "@/components/StartOver";
import { draftChoiceOf, draftChoices, draftPrompt, isDraftPrompt, unsavedCards } from "@/lib/drafts";
import { Thread } from "@/components/chat/Thread";
import { Composer } from "@/components/chat/Composer";
import { useToast } from "@/components/Toast";
import { IconTile } from "@/components/ui";
import { ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { L } from "@/lib/lang";

const MAX_PHOTOS = 4;

/** Asks about the newest card that is still unsaved, unless that question is already the last thing in the conversation. */
function askAboutDraft(): void {
  const { thread, episodes } = getState();
  const card = unsavedCards(thread, episodes).at(-1);
  if (!card || isDraftPrompt(thread.at(-1))) return;
  storeActions.pushThread({ kind: "ai", text: draftPrompt(card, episodes), chips: draftChoices() });
}

/**
 * 保存 or 放弃 said under the question about a draft. Returns false when the sentence is not such an
 * answer, so it goes into the conversation as usual.
 */
function answerDraft(text: string): boolean {
  const { thread, episodes } = getState();
  const choice = draftChoiceOf(text);
  const card = unsavedCards(thread, episodes).at(-1);
  if (!choice || !card || !isDraftPrompt(thread.at(-1))) return false;
  storeActions.pushThread({ kind: "user", text: text.trim() });
  if (choice === "edit") {
    // the card stays a draft: a description is corrected by what is said next; the orders card is right above
    if (card.kind === "description") reviseDescription(card.id);
    else storeActions.pushThread({ kind: "ai", text: L("好，医嘱就在上面，看完再点「保存」。", "OK, the orders are just above. Tap “Save” when you've read them.") });
    return true;
  }
  if (card.kind === "description") {
    if (choice === "save") saveDescription(card.id);
    else if (discardDescription(card.id)) storeActions.pushThread({ kind: "ai", text: L("好，这条没有保存。", "OK, that one wasn't saved.") });
  } else if (choice === "save") {
    saveOrders(card.id);
  } else {
    discardOrders(card.id);
    storeActions.pushThread({ kind: "ai", text: L("好，这次的医嘱没有保存。", "OK, these orders weren't saved.") });
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
  const [confirmNew, setConfirmNew] = useState(false);

  // the daily question about each complaint that is due, once per opening
  useEffect(() => {
    if (asked.current || !state.profile) return;
    asked.current = true;
    // a round left unfinished is shown exactly as it was left: nothing is added until it is finished or dropped (开新的)
    const { thread, episodes } = getState();
    if (inProgress(thread, episodes)) return;
    // 今天哪里不舒服？ — unless it was already said since the patient last spoke
    greet();
    askDueCheckIns();
    // 离开时问保存还是放弃: a card left unsaved last time is asked about once more, at the end
    askAboutDraft();
  }, [state.profile]);

  // the conversation was emptied while open (the demo is rebuilt when the language is switched): greet again
  const empty = state.thread.length === 0;
  useEffect(() => {
    if (asked.current && empty && state.profile) greet();
  }, [empty, state.profile]);

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
      if (files.length > MAX_PHOTOS) toast.show(L(`一次最多 ${MAX_PHOTOS} 张，先看前 ${MAX_PHOTOS} 张`, `Up to ${MAX_PHOTOS} photos at a time. Looking at the first ${MAX_PHOTOS}.`));
      void sendTurn("", images);
    } catch {
      toast.show(L("这张照片打不开，换一张试试", "This photo won't open. Try another one."), "danger");
    }
  };

  // Before the patient has said anything the screen is an invitation, not a thread: the opening
  // question sits in the middle of the page, and the ways to answer sit right under it.
  const opening = !state.thread.some((t) => t.kind === "user");
  // 开新的 is there as soon as anything has been said: an unfinished round is dropped with it,
  // a finished one just leaves the page (what was saved stays saved)
  const unfinished = inProgress(state.thread, state.episodes);
  const going = !busy && (unfinished || !opening);

  /*
   * A phone chat, like Messages: the title at the top, the conversation in the middle, and docked
   * right on top of the tab bar the one way to answer (with the report one tap away above it). The
   * screen fills the column from the header down to the tab bar (flex-1, and -mb-9 takes back the
   * room <main> keeps under its content), so the dock always sits flush on the tab bar and the
   * thread scrolls up under it.
   */
  return (
    <div className="-mb-9 flex min-w-0 flex-1 flex-col">
      {/* while the page is an invitation the name of the page steps back and the question is the headline */}
      {/* the page name and 开新的 share one row, so they can never overlap on a narrow phone */}
      <div className={cn("flex items-center justify-between gap-3", !opening && "mb-4")}>
        <h1 className={cn("min-w-0 animate-fade-up transition-all duration-500", opening ? "t-heading pt-1 text-ink-2" : "t-title text-ink")}>{L("看医生之前", "Before the doctor")}</h1>
        {/* 开新的: only while a round is under way; dropping it is asked once more, below */}
        {going && !confirmNew && <StartOver compact confirming={false} onAsk={() => setConfirmNew(true)} onCancel={() => setConfirmNew(false)} onConfirm={() => undefined} what="" />}
      </div>
      {going && confirmNew && (
        <div className="mb-4">
          <StartOver
            confirming
            onAsk={() => undefined}
            onCancel={() => setConfirmNew(false)}
            onConfirm={() => {
              setConfirmNew(false);
              startOverPre();
            }}
            what={
              unfinished
                ? L("这一次还没问完、没保存，开新的就不要它了。已经保存的记录不受影响。", "This round isn't finished or saved yet. Starting a new one drops it. Records you already saved stay.")
                : L("清空这段对话，从「今天哪里不舒服」重新开始。已经保存的记录不受影响。", "Clear this chat and start again from the first question. Records you already saved stay.")
            }
          />
        </div>
      )}
      <div className={cn("flex flex-1 flex-col pt-2 pb-5", opening ? "justify-center" : "justify-end")}>
        <Thread items={state.thread} busy={busy} onChip={say} opening={opening} />
        {/* scrolled to with room for the dock and the tab bar below it (the page simply stops at its end) */}
        <div ref={end} aria-hidden="true" className="h-px" style={{ scrollMarginBottom: "calc(var(--tab-bar) + 12rem)" }} />
      </div>
      {/* the dock: frosted, edge to edge across the column, sitting on the tab bar; the deeper bottom
          padding keeps the tab bar's raised round mark clear of the input row */}
      <div className="glass sticky z-20 -mx-4 space-y-2.5 px-4 pt-2.5 pb-8 shadow-[0_-1px_0_var(--color-line)]" style={{ bottom: "var(--tab-bar)" }}>
        {report && (
          <button
            type="button"
            onClick={() => router.push(report)}
            className="press flex min-h-12 w-full items-center gap-3 rounded-xl bg-brand-50 py-1 pr-3 pl-1.5 text-left text-base font-medium text-brand-800 transition duration-200 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
          >
            <IconTile size="sm" tone="solid">
              <FileText />
            </IconTile>
            <span className="min-w-0 flex-1 truncate">{L(`给医生看的报告（${reportTitle}）`, `Report for the doctor (${reportTitle})`)}</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-brand-700" />
          </button>
        )}
        <Composer onSend={say} onPhotos={(files) => void photos(files)} disabled={busy} />
      </div>
    </div>
  );
}
