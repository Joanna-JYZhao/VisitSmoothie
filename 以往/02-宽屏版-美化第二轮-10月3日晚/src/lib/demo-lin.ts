import type { AppState, Episode, Profile, Reminder } from "./types";
import { uid } from "./utils";

/*
 * 演示病人：林叔（虚构）。照队友的剧本「虚构患者资料_中英双语.docx」（TriMedManagement,
 * codex/afterdoc-prototype 0b029f4）：档案七项、5 月一次左膝不适的旧记录、这次左膝痛的问诊、
 * 骨科医嘱（原因待查，不加药、不做检查，一周后复诊），以及他自己打开的两个单次提醒。
 * 剧本里的日期以「看病那天」为准，这里放在今天：10 月 1 日开始疼 = 三天前，复诊 = 七天后。
 * 剧本没说的（疼的分数以外的轻重、体温、长期药名）一律不写。
 */

const MS_DAY = 24 * 60 * 60 * 1000;

/** `days` days from today (negative: before) at the given local time. */
function day(days: number, hour: number, minute = 0, now = new Date()) {
  const d = new Date(now.getTime() + days * MS_DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function buildLinState(now = new Date()): AppState {
  const at = (days: number, hour: number, minute = 0) => day(days, hour, minute, now);
  const year = now.getFullYear();
  const may12 = (h: number, m = 0) => new Date(year, 4, 12, h, m).toISOString();

  const profile: Profile = {
    name: "林叔",
    gender: "男",
    birthYear: 1980,
    birthDate: "1980-03-18",
    education: "高中/中专",
    heightCm: null,
    weightKg: null,
    bloodType: null,
    conditions: ["高血压（2022 年门诊医生告知；平时按原处方吃药，药名和剂量记不清，看病时带药盒核对）"],
    familyHistory: ["父亲 高血压", "母亲 2 型糖尿病", "家里没有已确诊的遗传病"],
    allergies: ["吃虾后皮肤发痒、起风团（没做过过敏原检测；没发现药物过敏）"],
    // 长期吃的降压药还没核对，不替他写
    medications: [],
    surgeries: [],
    notes: "",
    emergencyContact: null,
    createdAt: at(-30, 9),
    updatedAt: at(-30, 9),
  };

  // 2026 年 5 月 12 日：走路后左膝不适，看过医生，没有明确诊断，此后缓解
  const mayKnee: Episode = {
    id: uid(),
    title: "左膝不适",
    tags: ["膝盖", "腿", "疼痛"],
    status: "resolved",
    startedAt: may12(8),
    createdAt: may12(20),
    updatedAt: may12(20),
    lastCheckInAt: may12(20),
    snoozedUntil: null,
    entries: [{ id: uid(), at: may12(20), severity: null, note: "走路后左膝不舒服", location: "左膝", source: "user" }],
    messages: [{ id: uid(), role: "user", content: "左边膝盖走路以后不舒服。", at: may12(20), kind: "intake" }],
    lastHint: null,
    suggestedReplies: [],
    done: true,
    summary: null,
    visit: {
      date: may12(12).slice(0, 10),
      diagnosis: "没有明确诊断",
      treatment: "没有可核对的用药记录",
      advice: "医生建议观察变化",
      archiveSummary: "5 月 12 日因走路后左膝不适看过医生。他记得医生建议观察变化；现有资料里没有明确诊断，也没有可核对的用药记录。此后缓解。",
      followUp: null,
      followUpAt: null,
      mode: "fallback",
      recordedAt: may12(20),
    },
    resolvedAt: may12(21),
    relatedEpisodeIds: [],
  };

  // 这次：三天前开始，今天上午看了骨科
  const visitAt = at(0, 10);
  const followUpAt = at(7, 9, 30);
  const knee: Episode = {
    id: uid(),
    title: "左膝疼痛",
    tags: ["膝盖", "腿", "疼痛"],
    status: "active",
    startedAt: at(-3, 9),
    createdAt: at(0, 8, 10),
    updatedAt: at(0, 12),
    lastCheckInAt: at(0, 8, 30),
    snoozedUntil: null,
    entries: [
      {
        id: uid(),
        at: at(0, 8, 30),
        severity: 4,
        exact: true,
        note: "左膝内侧（靠另一条腿那边），像被拉着的酸痛，上楼时像扭着疼；上下楼和久站加重，坐下休息会好一点；没有摔倒或扭伤；没注意到发热、明显红肿或麻木；这次没为膝痛吃药；睡觉基本不受影响，爬楼和上班站着不方便",
        location: "左膝内侧",
        source: "user",
      },
    ],
    messages: [
      {
        id: uid(),
        role: "user",
        content: "我左边膝盖这几天不太舒服，上楼时像扭着疼，坐下来会好一点。之前也疼过一次，我有点担心，不知道该怎么跟医生说。",
        at: at(0, 8, 10),
        kind: "intake",
      },
      { id: uid(), role: "assistant", content: "记下了：左膝这几天不舒服，上楼时像扭着疼，坐下会好一点。你 5 月 12 日记过一次左膝不适。这次和上次比，哪里一样、哪里不一样？", at: at(0, 8, 11) },
      { id: uid(), role: "user", content: "是从 3 天前开始的，在膝盖内侧，靠另一条腿那边，像被拉着的酸痛，大概 4 分。上下楼和站久了更厉害。", at: at(0, 8, 20) },
      { id: uid(), role: "assistant", content: "好的。有没有摔过或者扭到？有没有发热、红肿或者发麻？这次为膝盖吃过药吗？", at: at(0, 8, 21) },
      { id: uid(), role: "user", content: "没摔也没扭，没注意到发热红肿和发麻。没吃药。睡觉没事，就是爬楼和上班站着不方便。", at: at(0, 8, 30) },
      { id: uid(), role: "assistant", content: "都记好了。想问医生的我也记下了：这次和上次是不是同一个问题？需要检查吗？上班时哪些动作要注意？", at: at(0, 8, 31) },
    ],
    lastHint: null,
    suggestedReplies: [],
    done: true,
    summary: null,
    visit: {
      date: visitAt.slice(0, 10),
      hospital: "虚构示范门诊",
      department: "骨科",
      diagnosis: "左膝疼痛，原因待查",
      treatment: "本次未新增药物；本次未开具检查",
      advice: "暂时减少会诱发疼痛的上下楼和久站，记录不适的变化；如症状明显加重，及时就医。",
      archiveSummary:
        "今天上午 10 点在虚构示范门诊骨科看了左膝。病历写的是左膝疼痛，原因待查。没有新加药，也没有开检查。医生让暂时少上下楼、少久站，记下不舒服的变化；明显加重要及时就医。一周后复诊，带上以前的就诊资料和正在吃的药盒。",
      followUp: "一周后骨科复诊，带以前的就诊资料和正在吃的药盒",
      followUpAt,
      mode: "fallback",
      recordedAt: at(0, 12),
    },
    resolvedAt: null,
    relatedEpisodeIds: [mayKnee.id],
  };

  // 他自己打开的两个单次提醒；这次没加药，长期药也没核对，所以没有吃药提醒
  const reminders: Reminder[] = [
    {
      id: uid(),
      todoId: uid(),
      episodeId: knee.id,
      text: "准备病历和药盒",
      kind: "care",
      frequency: "once",
      at: at(6, 20),
      enabled: true,
      createdAt: at(0, 12),
      lastFiredAt: null,
    },
    {
      id: uid(),
      todoId: uid(),
      episodeId: knee.id,
      text: "复诊准备：骨科复诊，带以前的就诊资料和正在吃的药盒",
      kind: "followup",
      frequency: "once",
      at: at(7, 8, 30),
      enabled: true,
      createdAt: at(0, 12),
      lastFiredAt: null,
    },
  ];

  return {
    version: 1,
    profile,
    episodes: [knee, mayKnee],
    measurements: [],
    followUps: [],
    annualSummary: null,
    nextVisit: null,
    checkups: [],
    asks: [],
    thread: [],
    reminders,
    settings: {
      checkInIntervalHours: 24,
      notificationsEnabled: false,
      longTerm: false,
      trackedMetrics: [],
      metricReminderHours: 24,
    },
    demo: "lin",
  };
}
