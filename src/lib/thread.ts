"use client";

import type { ChatMeasurement, Episode, Hint, ThreadItem } from "./types";
import { getState, storeActions } from "./store";
import { createBusy } from "./busy";
import { relatedEpisodesOf, requestReply, sendMessage, supplement } from "./episodeAI";
import { refreshSummary } from "./summaries";
import { extractMeasurements, instantAlert } from "./ai/fallback";
import { METRICS, evaluateMeasurement, formatValue } from "./metrics";
import { followUpDate, saveAfter } from "./after";
import { ask } from "./ask";
import { triageFor } from "./triage";
import { buildTodos, explainParts } from "./reminders";
import { CHECKIN_ANSWERS, answerCheckIn, checkInQuestion, isCheckInDue, type CheckInAnswer } from "./checkin";
import { HOUR, firstComplaint, nowISO } from "./utils";

/*
 * 第三版: the main screen is one conversation. The patient only speaks, types or takes a photo;
 * this file decides which of the existing flows that turn belongs to, runs it, and puts what
 * comes back into the conversation as bubbles and cards.
 */

/* ---------- which way a turn goes (plain rules, no model) ---------- */

export type Route =
  /** a photo of what is wrong: a rash, a wound, a swelling */
  | "photo"
  /** "改一下" was tapped on a description: this sentence corrects it */
  | "revise"
  /** one of the three answers to the daily question */
  | "checkin"
  /** the assistant is waiting for an answer about a complaint */
  | "reply"
  /** a blood pressure or glucose reading */
  | "reading"
  /** something is wrong: start asking about it */
  | "complaint"
  /** anything else is a question about one's own records */
  | "question";

export interface Turn {
  text: string;
  /** how many photos came with it */
  photos: number;
}

export interface RouteContext {
  episodes: Episode[];
  /** the conversation so far, without this turn */
  thread: ThreadItem[];
  /** the complaint whose description is being corrected, if any */
  revising?: string | null;
  now?: number;
}

export interface Routed {
  route: Route;
  /** raised by the fixed rules, whichever way the turn goes */
  alert: Hint | null;
  episodeId?: string;
  readings?: ChatMeasurement[];
  answer?: CheckInAnswer;
}

/** A question left unanswered for longer than this no longer claims the next thing that is said. */
const WAITING_HOURS = 6;

/** The complaint the assistant has just asked something about, if it is still waiting for the answer. */
export function awaitingReply(episodes: Episode[], now: number = Date.now()): Episode | null {
  const waiting = episodes.filter((e) => {
    const last = e.messages[e.messages.length - 1];
    return e.status === "active" && e.done === false && last?.role === "assistant" && now - new Date(last.at).getTime() < WAITING_HOURS * HOUR;
  });
  return waiting.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
}

const FEELS_BAD = /难受|疼|痛|不舒服|不得劲/;
/** asking about something on record: "上次肚子痛医生说了什么" names a complaint but is a question */
const ABOUT_THE_PAST = /上次|上回|以前|之前|那次|当时|去年|医生(说|开|讲|让)|医嘱|复诊|复查|档案|记录/;
const ASKS = /[?？]|吗|什么|怎么|为什么|多久|多少|哪|几/;
/** asking what one may do: "头痛能不能吃布洛芬" */
const MAY_I = /能不能|可不可以|怎么吃|怎么用|什么意思|能.{0,8}吗|可以.{0,8}吗/;

/** saying it is happening now: "这几天膝盖疼，之前也疼过，不知道怎么跟医生说" is a complaint, not a question about the past */
const NOW = /这几天|这两天|这些天|今天|今早|今晚|现在|最近|刚才|昨天|昨晚|一直|又(开始)?(疼|痛)/;

/** Is this someone saying that something is wrong now, rather than asking about it? */
export function isComplaint(text: string): boolean {
  if (firstComplaint(text) == null && !FEELS_BAD.test(text)) return false;
  if (ABOUT_THE_PAST.test(text) && ASKS.test(text) && !(NOW.test(text) && FEELS_BAD.test(text))) return false;
  return !MAY_I.test(text);
}

const sameChips = (chips: string[] | undefined) =>
  chips != null && chips.length === CHECKIN_ANSWERS.length && CHECKIN_ANSWERS.every((a, i) => chips[i] === a.label);

/** Decides which flow one turn belongs to. Pure, so it can be checked on its own. */
export function routeTurn(turn: Turn, ctx: RouteContext): Routed {
  const text = turn.text.trim();
  const alert = instantAlert(text);
  // a photo shows the complaint being asked about, or starts one
  if (turn.photos > 0) return { route: "photo", alert, episodeId: awaitingReply(ctx.episodes, ctx.now)?.id };
  if (ctx.revising && ctx.episodes.some((e) => e.id === ctx.revising)) return { route: "revise", alert, episodeId: ctx.revising };
  const last = ctx.thread[ctx.thread.length - 1];
  const answer = CHECKIN_ANSWERS.find((a) => a.label === text);
  if (answer && last?.kind === "ai" && last.episodeId && sameChips(last.chips)) {
    return { route: "checkin", alert, episodeId: last.episodeId, answer: answer.key };
  }
  const waiting = awaitingReply(ctx.episodes, ctx.now);
  if (waiting) return { route: "reply", alert, episodeId: waiting.id };
  const readings = extractMeasurements(text);
  if (readings.length) return { route: "reading", alert, readings };
  if (isComplaint(text)) return { route: "complaint", alert };
  return { route: "question", alert };
}

/* ---------- running a turn ---------- */

const working = createBusy();
const THREAD = "thread";
/** True while the assistant is working on the last turn. */
export const useThreadBusy = () => working.use(THREAD);

/** The complaint whose description the next sentence corrects. Set by "改一下". */
let revising: string | null = null;

const say = (text: string, extra: { chips?: string[]; episodeId?: string } = {}) => storeActions.pushThread({ kind: "ai", text, ...extra });

const latestActive = (episodes: Episode[]) =>
  [...episodes].filter((e) => e.status === "active").sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;

/** The questions are done: the description and the first advice go into the conversation. */
function finishIntake(episodeId: string): void {
  const state = getState();
  const episode = state.episodes.find((e) => e.id === episodeId);
  if (!episode || !state.profile) return;
  storeActions.pushThread({ kind: "description", episodeId, state: "draft" });
  storeActions.pushThread({
    kind: "triage",
    episodeId,
    triage: triageFor(episode, state.profile, { related: relatedEpisodesOf(episode, state.episodes) }),
  });
  void refreshSummary(episodeId);
}

/** Puts the assistant's answer about a complaint into the conversation, and wraps up when it has no more questions. */
function showReply(episodeId: string, res: { reply: string; suggestedReplies: string[]; done: boolean; widget?: "bodymap" | null } | null): void {
  if (!res) {
    say("这次没接上，再说一遍试试。");
    return;
  }
  say(res.reply, res.done ? { episodeId } : { chips: res.suggestedReplies, episodeId });
  // asking where it hurts: a body picture to tap, right under the question
  if (!res.done && res.widget === "bodymap") storeActions.pushThread({ kind: "bodymap", episodeId, state: "open" });
  if (res.done) finishIntake(episodeId);
}

/** A place tapped on the body map: said as "部位：右膝内侧", the answer to the question above it. */
export async function pickBodyArea(itemId: string, area: string): Promise<void> {
  const item = itemOf(itemId);
  if (item?.kind !== "bodymap" || item.state !== "open" || working.has(THREAD)) return;
  storeActions.patchThread(itemId, (x) => (x.kind === "bodymap" ? { ...x, state: "done", picked: area } : x));
  const said = `部位：${area}`;
  storeActions.pushThread({ kind: "user", text: said });
  working.start(THREAD);
  try {
    showReply(item.episodeId, await sendMessage(item.episodeId, said));
  } catch (err) {
    console.warn("[医伴] 身体图这一轮没有走完", err);
    say("这次没弄成，再点一下试试，或者直接说哪里疼。");
  } finally {
    working.stop(THREAD);
  }
}

/**
 * One turn of the conversation: what the patient said or typed, or the photos they took.
 * Everything that happens next is put into the conversation; nothing is returned.
 */
export async function sendTurn(text: string, images: string[] = []): Promise<void> {
  const said = text.trim();
  const state = getState();
  if ((!said && !images.length) || !state.profile || working.has(THREAD)) return;
  const routed = routeTurn({ text: said, photos: images.length }, { episodes: state.episodes, thread: state.thread, revising });
  storeActions.pushThread(images.length ? { kind: "user", text: said, photos: images.length } : { kind: "user", text: said });
  // a danger signal is answered by rule, before any model is asked
  if (routed.alert) storeActions.pushThread({ kind: "alert", hint: routed.alert });

  working.start(THREAD);
  try {
    if (routed.route === "photo") {
      storeActions.pushThread({ kind: "note", text: "正在看照片，大约十几秒。" });
      const seen = await describeSymptomPhoto(images);
      if (typeof seen !== "string") {
        say(
          seen.reason === "unavailable"
            ? "现在认不了照片。用几句话说说看到的样子吧：在哪儿、什么颜色、多大。"
            : seen.reason === "unreadable"
              ? "这张照片上没看清不舒服的地方。换一张近一点、亮一点的，或者直接说说看到的样子。"
              : "这次没看成照片，再发一次试试，或者直接说说看到的样子。",
        );
      } else {
        // the photo itself is not kept: only what it shows, in words, goes on the record
        const line = said ? `${said}。照片：${seen}` : `照片：${seen}`;
        say(`照片上看到：${seen}。`);
        if (routed.episodeId) {
          showReply(routed.episodeId, await sendMessage(routed.episodeId, line));
        } else {
          const episode = storeActions.createEpisode({ text: line, hint: routed.alert });
          showReply(episode.id, await requestReply(episode.id, "intake"));
        }
      }
    } else if (routed.route === "revise" && routed.episodeId) {
      revising = null;
      await supplement(routed.episodeId, said);
      say("改好了，上面的描述已经更新。还有不对的，点「改一下」再说。");
    } else if (routed.route === "checkin" && routed.episodeId && routed.answer) {
      const episode = state.episodes.find((e) => e.id === routed.episodeId);
      if (episode) {
        const outcome = answerCheckIn(episode, routed.answer);
        storeActions.restoreEpisode(outcome.episode);
        say(outcome.reply);
      }
    } else if (routed.route === "reply" && routed.episodeId) {
      // said in words instead of tapped: the body map above has had its answer
      for (const x of getState().thread) {
        if (x.kind === "bodymap" && x.state === "open" && x.episodeId === routed.episodeId) {
          storeActions.patchThread(x.id, (y) => (y.kind === "bodymap" ? { ...y, state: "done" } : y));
        }
      }
      showReply(routed.episodeId, await sendMessage(routed.episodeId, said));
    } else if (routed.route === "reading") {
      for (const r of routed.readings ?? []) {
        const saved = storeActions.addMeasurement({ type: r.type, value: r.value, value2: r.value2, at: nowISO(), source: "user", note: "对话里说的" });
        const hint = evaluateMeasurement(saved);
        if (hint?.level === "urgent") {
          if (hint.text !== routed.alert?.text) storeActions.pushThread({ kind: "alert", hint });
        } else {
          say(`记下了：${METRICS[r.type].label} ${formatValue(saved)}。${hint ? hint.text : ""}`);
        }
      }
    } else if (routed.route === "complaint") {
      const episode = storeActions.createEpisode({ text: said, hint: routed.alert });
      showReply(episode.id, await requestReply(episode.id, "intake"));
    } else {
      const turn = await ask(said);
      if (!turn) say("这个我没接住，换个说法再问一遍。");
      else {
        if (turn.hint?.level === "urgent" && turn.hint.text !== routed.alert?.text) storeActions.pushThread({ kind: "alert", hint: turn.hint });
        storeActions.pushThread({ kind: "answer", text: turn.answer, sources: turn.sources.map((s) => ({ label: s.label, href: s.href })) });
      }
    }
  } catch (err) {
    console.warn("[医伴] 这一轮没有走完", err);
    say("这次没弄成，再说一遍试试。");
  } finally {
    working.stop(THREAD);
  }
}

/* ---------- the buttons on the cards ---------- */

const itemOf = (id: string) => getState().thread.find((x) => x.id === id);

export function saveDescription(itemId: string): void {
  storeActions.patchThread(itemId, (x) => (x.kind === "description" ? { ...x, state: "saved" } : x));
  say("存进就诊记录了。去看医生的时候，点卡片上的「给医生看」。");
}

/** "改一下": nothing to fill in, the patient just says what is wrong with it. */
export function reviseDescription(itemId: string): void {
  const item = itemOf(itemId);
  if (item?.kind !== "description") return;
  revising = item.episodeId;
  say("哪里不对？直接说，比如「不对，是饭后才疼」。");
}

/** Drops the complaint. Returns what is needed to bring it back. */
export function discardDescription(itemId: string): Episode | null {
  const item = itemOf(itemId);
  if (item?.kind !== "description") return null;
  const episode = getState().episodes.find((e) => e.id === item.episodeId) ?? null;
  if (revising === item.episodeId) revising = null;
  storeActions.deleteEpisode(item.episodeId);
  storeActions.patchThread(itemId, (x) => (x.kind === "description" ? { ...x, state: "discarded" } : x));
  return episode;
}

export function restoreDescription(itemId: string, episode: Episode): void {
  storeActions.restoreEpisode(episode);
  storeActions.patchThread(itemId, (x) => (x.kind === "description" ? { ...x, state: "draft" } : x));
}

export function saveOrders(itemId: string): void {
  const item = itemOf(itemId);
  if (item?.kind !== "orders" || item.state !== "draft") return;
  saveAfter(item.result, item.episodeId, item.mode);
  storeActions.patchThread(itemId, (x) => (x.kind === "orders" ? { ...x, state: "saved" } : x));
  say("存进就诊记录了。要我接着做哪一样？点上面卡片里的按钮就行。");
}

export function discardOrders(itemId: string): void {
  storeActions.patchThread(itemId, (x) => (x.kind === "orders" ? { ...x, state: "discarded" } : x));
}

/** 整理要做的事并提醒: what was prescribed and ordered as a list, and the follow-up visit as a reminder. */
export function listTodos(itemId: string): void {
  const item = itemOf(itemId);
  if (item?.kind !== "orders") return;
  const r = item.result;
  const at = followUpDate(r);
  if (at) {
    // the date is kept with the record as before; the reminder itself is set on the to-do card
    if (item.episodeId) {
      storeActions.updateEpisode(item.episodeId, (e) => (e.visit ? { ...e, visit: { ...e.visit, followUpAt: at } } : e));
    } else {
      storeActions.setNextVisit({ at, note: r.followUpNote ?? "复查" });
    }
  }
  const todos = buildTodos(r);
  if (!todos.length) {
    say("这次的医嘱里没有认出要吃的药或要做的事。");
    return;
  }
  say("这是医嘱里要做的事。哪些要提醒、多久提醒一次，你来定，定好点「设好了」。");
  storeActions.pushThread({ kind: "todo", ordersItemId: itemId, episodeId: item.episodeId, todos, state: "draft" });
}

/** 给我解释一下: the parts that can be explained, to pick from. */
export function explainOrders(itemId: string): void {
  const item = itemOf(itemId);
  if (item?.kind !== "orders") return;
  storeActions.pushThread({ kind: "explain", ordersItemId: itemId, parts: explainParts(item.result) });
}

/* ---------- 症状照片 ---------- */

/** What a photo of the complaint shows, in words, or why it could not be read. */
async function describeSymptomPhoto(images: string[]): Promise<string | { reason: "unavailable" | "unreadable" | "failed" }> {
  try {
    const res = await fetch("/api/symptom-photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images }) });
    const data = (await res.json()) as { description?: string; reason?: "unavailable" | "unreadable" | "failed" };
    if (res.ok && data.description) return data.description;
    return { reason: data.reason ?? "failed" };
  } catch {
    return { reason: "failed" };
  }
}

/* ---------- opening pre ---------- */

export const GREETING = "今天哪里不舒服？";

/** Should opening the page say 今天哪里不舒服？ No while a round of questions is going on, or when it was already said since the patient last spoke. */
export function needsGreeting(thread: ThreadItem[], episodes: Episode[], now: number = Date.now()): boolean {
  if (awaitingReply(episodes, now)) return false;
  for (let i = thread.length - 1; i >= 0; i--) {
    const x = thread[i];
    if (x.kind === "user") return true;
    if (x.kind === "ai" && x.text === GREETING) return false;
  }
  return true;
}

export function greet(): void {
  const { thread, episodes } = getState();
  if (needsGreeting(thread, episodes)) say(GREETING);
}

/* ---------- the three shortcuts ---------- */

/** 去看医生 and 导出 open the page for the doctor when there is one. Returns where to go, or says why not. */
export function doctorPage(which: "visit" | "export"): string | null {
  const { episodes } = getState();
  const episode = which === "visit" ? latestActive(episodes) : [...episodes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  if (episode) return `/doctor/${episode.id}`;
  say(which === "visit" ? "先告诉我哪里不舒服，我来整理。" : "现在还没有可以导出的内容。先说一句哪里不舒服，或者拍一张医嘱。");
  return null;
}

/* ---------- the daily question ---------- */

/** On opening: one question for each complaint that is due, unless it was already asked today. */
export function askDueCheckIns(now: number = Date.now()): void {
  const state = getState();
  const today = new Date(now).toDateString();
  for (const e of state.episodes) {
    if (!isCheckInDue(e, state.settings, now)) continue;
    const asked = state.thread.some((x) => x.kind === "ai" && x.episodeId === e.id && sameChips(x.chips) && new Date(x.at).toDateString() === today);
    if (!asked) say(checkInQuestion(e, now), { chips: CHECKIN_ANSWERS.map((a) => a.label), episodeId: e.id });
  }
}
