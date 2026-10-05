/* 第三版: which way one turn of the conversation goes. Run with: npx tsx scripts/tests/thread.test.ts */
import { check, finish } from "./_check";
import type { Episode, ThreadItem } from "../../src/lib/types";
import { GREETING, awaitingReply, isComplaint, needsGreeting, routeTurn } from "../../src/lib/thread";
import { triageFor } from "../../src/lib/triage";

// Fixed "now": Saturday 3 Oct 2026, 09:30 local time.
const now = new Date(2026, 9, 3, 9, 30, 0).getTime();
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

function episode(over: Partial<Episode> = {}): Episode {
  return {
    id: "e1",
    title: "肚子痛",
    tags: [],
    status: "active",
    startedAt: iso(120),
    createdAt: iso(120),
    updatedAt: iso(2),
    lastCheckInAt: iso(120),
    entries: [],
    messages: [
      { id: "m1", role: "user", content: "肚子痛", at: iso(3), kind: "intake" },
      { id: "m2", role: "assistant", content: "记下了。是什么时候开始的？", at: iso(2) },
    ],
    done: false,
    relatedEpisodeIds: [],
    ...over,
  };
}
const route = (text: string, ctx: { episodes?: Episode[]; thread?: ThreadItem[]; revising?: string | null; photos?: number } = {}) =>
  routeTurn({ text, photos: ctx.photos ?? 0 }, { episodes: ctx.episodes ?? [], thread: ctx.thread ?? [], revising: ctx.revising, now });

/* pre: a photo shows what is wrong */
const fresh = route("", { photos: 2 });
check("a photo with nothing going on starts a new round of questions", fresh.route === "photo" && fresh.episodeId === undefined, fresh);
const shown = route("", { photos: 1, episodes: [episode()] });
check("a photo while the assistant waits is part of that complaint", shown.route === "photo" && shown.episodeId === "e1", shown);
check("a photo after the questions are done starts a new one", route("", { photos: 1, episodes: [episode({ done: true })] }).episodeId === undefined);
check("words with a photo are still checked for danger", route("腿上这片红的，喘不上气", { photos: 1 }).alert?.level === "urgent");

/* danger signals are raised by rule on every sentence, and the turn still goes its way */
const chest = route("胸口很闷，喘不上气");
check("a danger signal raises the alarm and the complaint is still taken up", chest.alert?.level === "urgent" && chest.route === "complaint", chest);
check("an ordinary complaint raises no alarm", route("这两天右膝盖疼").alert === null);
const low = route("刚才测了血糖 3.4");
check("a dangerously low reading is an alarm and is still recorded as a reading", low.alert?.level === "urgent" && low.route === "reading", low);

/* answering the assistant's question */
const waiting = route("昨天晚上", { episodes: [episode()] });
check("what is said while the assistant waits is the answer", waiting.route === "reply" && waiting.episodeId === "e1", waiting);
check("even a sentence that looks like a question goes to the open complaint", route("什么时候开始的我也说不清", { episodes: [episode()] }).route === "reply");
check("a finished round of questions no longer claims the next sentence", route("上次医生说了什么", { episodes: [episode({ done: true })] }).route === "question");
check("nor does a question left unanswered since yesterday", awaitingReply([episode({ messages: [{ id: "m", role: "assistant", content: "有多难受？", at: iso(24 * 60) }] })], now) === null);
check("nor a complaint that is over", awaitingReply([episode({ status: "resolved" })], now) === null);

/* a reading */
const bp = route("今天量血压 150/95");
check("a blood pressure is a reading", bp.route === "reading" && bp.readings?.[0]?.type === "bp" && bp.readings[0].value === 150 && bp.readings[0].value2 === 95, bp);
check("a fasting glucose is a reading", route("今天空腹血糖 6.5").route === "reading");

/* saying that something is wrong */
check("naming a complaint starts the questions", route("这两天右膝盖疼").route === "complaint");
check("so does plain 'I feel unwell'", route("浑身不舒服，很难受").route === "complaint" && isComplaint("肚子疼怎么办"));
check("a spoken opening does not hide the complaint", route("医生你好，我嗓子疼了三天了").route === "complaint");

/* everything else is a question about one's own records */
check("asking what the doctor said is a question", route("上次医生说了什么").route === "question");
check("林叔: a complaint now that also mentions the last time and how to tell the doctor is a complaint", route("我左边膝盖这几天不太舒服，上楼时像扭着疼，坐下来会好一点。之前也疼过一次，我有点担心，不知道该怎么跟医生说。").route === "complaint");
check("林叔: asking what the doctor said last time is still a question", route("上次膝盖疼医生是怎么说的？").route === "question");
check("asking about an earlier complaint is a question, although it names one", route("上次肚子痛医生开了什么药？").route === "question" && !isComplaint("上次肚子痛医生开了什么药？"));
check("asking whether a medicine may be taken is a question", route("头痛能不能吃布洛芬").route === "question");
check("asking about food is a question", route("虾能不能吃").route === "question");
check("the shortcut for one's history is a question", route("把我的病史讲一遍").route === "question");

/* 改一下: the next sentence corrects the description */
const fix = route("不对，是饭后才疼", { episodes: [episode({ done: true })], revising: "e1" });
check("after 改一下 the next sentence corrects that description", fix.route === "revise" && fix.episodeId === "e1", fix);
check("a correction for a complaint that is gone is not taken as one", route("不对，是饭后才疼", { episodes: [], revising: "e1" }).route !== "revise");

/* the daily question */
const daily: ThreadItem = { id: "t1", at: iso(1), kind: "ai", text: "「肚子痛」今天怎么样了？", chips: ["好多了", "差不多", "更严重了"], episodeId: "e1" };
const tapped = route("更严重了", { episodes: [episode({ done: true })], thread: [daily] });
check("a tap under the daily question is that day's answer", tapped.route === "checkin" && tapped.answer === "worse" && tapped.episodeId === "e1", tapped);
check("the same words without the question before them are not", route("更严重了", { episodes: [episode({ done: true })] }).route !== "checkin");

/* 今天哪里不舒服？ when pre is opened */
const said = (text: string): ThreadItem => ({ id: `u-${text}`, at: iso(5), kind: "user", text });
const greeting: ThreadItem = { id: "g", at: iso(4), kind: "ai", text: GREETING };
check("an empty conversation is greeted", needsGreeting([], [], now));
check("not twice: reopening after the greeting does not repeat it", !needsGreeting([greeting], [], now));
check("nor when a daily question came after it", !needsGreeting([greeting, daily], [episode({ done: true })], now));
check("once the patient has said something since, it is asked again next time", needsGreeting([greeting, said("肚子痛")], [episode({ done: true })], now));
check("not while a round of questions is waiting for an answer", !needsGreeting([said("肚子痛")], [episode()], now));

/* the triage rules on a finished description */
const profile = { name: "李明", gender: "男" as const, birthYear: 1990, conditions: [], allergies: [], medications: [], surgeries: [], familyHistory: [], createdAt: iso(0), updatedAt: iso(0) };
const severe = episode({ title: "胸闷", messages: [{ id: "m1", role: "user", content: "胸口很闷，喘不上气", at: iso(3), kind: "intake" }] });
check("a danger signal on the record makes the advice an emergency", triageFor(severe, profile).level === "emergency", triageFor(severe, profile));
check("no advice names an illness", !/炎|病|症|癌/.test(JSON.stringify(triageFor(episode(), profile))));

finish("thread");
