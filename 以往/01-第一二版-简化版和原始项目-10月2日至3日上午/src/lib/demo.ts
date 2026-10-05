import type { AppState, Episode, Profile } from "./types";
import { uid, HOUR } from "./utils";

/** A date `daysAgo` days before today at the given local time. */
function at(daysAgo: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** 演示数据：李明（虚构）· 一次进行中的肚子痛，加三条既往记录。 */
export function buildDemoState(): AppState {
  const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
  const profile: Profile = {
    name: "李明",
    gender: "男",
    birthYear: 1990,
    heightCm: 175,
    weightKg: 70,
    bloodType: "A",
    conditions: ["慢性胃炎"],
    allergies: ["青霉素"],
    medications: [],
    surgeries: ["阑尾切除（2015）"],
    familyHistory: ["父亲 高血压"],
    notes: "",
    // a made-up number: the emergency page shows it but does not dial it while a demo is loaded
    emergencyContact: { name: "周婷", relation: "妻子", phone: "138 0000 0001" },
    createdAt: at(300, 10),
    updatedAt: at(300, 10),
  };

  const gastritis: Episode = {
    id: uid(),
    title: "胃痛",
    tags: ["腹部", "消化", "疼痛", "反酸"],
    status: "resolved",
    startedAt: at(95, 19, 40),
    createdAt: at(95, 21, 0),
    updatedAt: at(86, 9, 0),
    lastCheckInAt: at(86, 9, 0),
    snoozedUntil: null,
    entries: [
      { id: uid(), at: at(95, 21, 0), severity: 6, note: "晚饭后胃部隐痛，伴反酸、嗳气", location: "上腹部", source: "user" },
      { id: uid(), at: at(94, 8, 10), severity: 7, note: "早上空腹时疼痛加重，吃东西后稍缓解", location: "上腹部", source: "checkin" },
      { id: uid(), at: at(94, 23, 30), severity: 8, note: "夜里痛醒，一阵一阵的绞痛，没有呕吐", location: "上腹部", source: "user" },
      { id: uid(), at: at(93, 14, 0), severity: 4, note: "就诊后开始服用奥美拉唑，疼痛减轻", location: "上腹部", source: "ai" },
      { id: uid(), at: at(90, 20, 0), severity: 2, note: "基本不痛了，偶尔反酸", location: "上腹部", source: "checkin" },
      { id: uid(), at: at(86, 9, 0), severity: 0, note: "已完全缓解，停药后无复发", location: null, source: "user" },
    ],
    messages: [
      { id: uid(), role: "user", content: "胃痛，今天晚饭后开始的，上腹部隐隐作痛，还有点反酸。", at: at(95, 21, 0), kind: "intake" },
      { id: uid(), role: "assistant", content: "记下了：晚饭后上腹隐痛，还有反酸。你有慢性胃炎的病史，这次是一直持续地痛，还是一阵一阵的？", at: at(95, 21, 1) },
      { id: uid(), role: "user", content: "持续的隐痛，空腹的时候更明显。", at: at(95, 21, 5) },
      { id: uid(), role: "assistant", content: "好的。有没有恶心、呕吐，或者大便发黑的情况？", at: at(95, 21, 5) },
      { id: uid(), role: "user", content: "没有呕吐，大便正常。", at: at(95, 21, 8) },
      { id: uid(), role: "assistant", content: "明白，这些我都记好了。如果今晚疼痛加重、出现呕血或黑便，请立即就医。明天我再来问问你。", at: at(95, 21, 8) },
    ],
    lastHint: null,
    suggestedReplies: [],
    done: true,
    summary: null,
    visit: {
      date: at(93, 10, 0).slice(0, 10),
      hospital: "市第一人民医院",
      department: "消化内科",
      diagnosis: "急性胃炎（幽门螺杆菌检测阴性）",
      treatment: "奥美拉唑肠溶胶囊 20mg 每日一次，餐前服用，连续 14 天；铝碳酸镁咀嚼片 餐后嚼服",
      advice: "清淡饮食，避免辛辣、咖啡、酒精；两周后复诊评估",
      archiveSummary:
        "患者约 3 个月前晚饭后出现上腹部隐痛伴反酸，空腹加重、进食缓解，持续 3 天后于市第一人民医院消化内科就诊，诊断为急性胃炎（幽门螺杆菌阴性）。予奥美拉唑 20mg 每日一次 + 铝碳酸镁对症治疗 2 周，医嘱清淡饮食、忌辛辣咖啡酒精。服药后 2 天疼痛明显减轻，1 周左右完全缓解，停药后未复发。",
      followUp: "两周后复诊评估；若复发需考虑胃镜检查",
      followUpAt: null,
      mode: "glm",
      recordedAt: at(93, 14, 0),
    },
    resolvedAt: at(86, 9, 0),
    relatedEpisodeIds: [],
  };

  const cold: Episode = {
    id: uid(),
    title: "感冒发烧",
    tags: ["发热", "呼吸", "咽痛", "咳嗽"],
    status: "resolved",
    startedAt: at(240, 8, 0),
    createdAt: at(240, 9, 30),
    updatedAt: at(233, 20, 0),
    lastCheckInAt: at(233, 20, 0),
    snoozedUntil: null,
    entries: [
      { id: uid(), at: at(240, 9, 30), severity: 5, temp: 37.8, note: "早上起来嗓子疼、头昏，体温 37.8℃", location: "咽喉", source: "user" },
      { id: uid(), at: at(239, 20, 0), severity: 7, temp: 38.9, note: "体温升到 38.9℃，全身酸痛，开始咳嗽", location: null, source: "checkin" },
      { id: uid(), at: at(238, 12, 0), severity: 5, temp: 37.5, note: "社区医院就诊后服布洛芬，体温降到 37.5℃", location: null, source: "ai" },
      { id: uid(), at: at(236, 20, 0), severity: 3, note: "不发烧了，还有点咳嗽和流鼻涕", location: null, source: "checkin" },
      { id: uid(), at: at(233, 20, 0), severity: 0, note: "症状完全消失", location: null, source: "user" },
    ],
    messages: [
      { id: uid(), role: "user", content: "感冒发烧，今天早上开始嗓子疼、头昏，量了体温 37.8。", at: at(240, 9, 30), kind: "intake" },
      { id: uid(), role: "assistant", content: "记下了：嗓子疼、头昏、体温 37.8℃。有没有咳嗽、鼻塞或者全身酸痛？", at: at(240, 9, 31) },
    ],
    lastHint: null,
    suggestedReplies: [],
    done: true,
    summary: null,
    visit: {
      date: at(238, 10, 0).slice(0, 10),
      hospital: "社区卫生服务中心",
      department: "全科",
      diagnosis: "急性上呼吸道感染",
      treatment: "布洛芬缓释胶囊 退热；多饮水、休息",
      advice: "若 3 天后仍高热或出现胸痛、呼吸困难需复诊",
      archiveSummary:
        "患者约 8 个月前出现咽痛、头昏伴低热，次日体温升至 38.9℃ 并出现咳嗽、全身酸痛，于社区卫生服务中心全科就诊，诊断为急性上呼吸道感染，予布洛芬退热并嘱休息补液。2 天后体温恢复正常，1 周内症状完全消失。",
      followUp: null,
      followUpAt: null,
      mode: "glm",
      recordedAt: at(238, 12, 0),
    },
    resolvedAt: at(233, 20, 0),
    relatedEpisodeIds: [],
  };

  const headache: Episode = {
    id: uid(),
    title: "头痛",
    tags: ["头部", "疼痛", "失眠"],
    status: "resolved",
    startedAt: at(31, 15, 0),
    createdAt: at(31, 16, 0),
    updatedAt: at(29, 9, 0),
    lastCheckInAt: at(29, 9, 0),
    snoozedUntil: null,
    entries: [
      { id: uid(), at: at(31, 16, 0), severity: 5, note: "下午开始两侧太阳穴胀痛，前一晚只睡了 4 小时", location: "太阳穴", source: "user" },
      { id: uid(), at: at(30, 22, 0), severity: 3, note: "补觉后减轻，仍有轻微胀感", location: "太阳穴", source: "checkin" },
      { id: uid(), at: at(29, 9, 0), severity: 0, note: "完全缓解", location: null, source: "user" },
    ],
    messages: [
      { id: uid(), role: "user", content: "头痛，下午开始的，两边太阳穴胀痛，昨晚只睡了 4 个小时。", at: at(31, 16, 0), kind: "intake" },
      { id: uid(), role: "assistant", content: "记下了：两侧太阳穴胀痛，前一晚睡眠不足。有没有伴随恶心、怕光，或者看东西模糊？", at: at(31, 16, 1) },
      { id: uid(), role: "user", content: "没有，就是胀。", at: at(31, 16, 3) },
      { id: uid(), role: "assistant", content: "好的，都记下了。先补觉、少看屏幕，我明天再来问你。如果出现剧烈头痛、呕吐或意识模糊，请立即就医。", at: at(31, 16, 3) },
    ],
    lastHint: null,
    suggestedReplies: [],
    done: true,
    summary: null,
    visit: null,
    resolvedAt: at(29, 9, 0),
    relatedEpisodeIds: [],
  };

  // The ongoing one is placed relative to "now", so the daily question is always due when the demo opens.
  const current: Episode = {
    id: uid(),
    title: "肚子痛",
    tags: ["腹部", "疼痛", "消化", "反酸"],
    status: "active",
    startedAt: hoursAgo(51),
    createdAt: hoursAgo(50),
    updatedAt: hoursAgo(26),
    lastCheckInAt: hoursAgo(26),
    snoozedUntil: null,
    entries: [
      { id: uid(), at: hoursAgo(50), severity: 7, note: "晚饭后开始痛，位置在肚脐上方，持续隐痛，比较难受", location: "肚脐上方", source: "user" },
      { id: uid(), at: hoursAgo(38), severity: 6, note: "早上稍缓解，空腹时仍隐隐作痛", location: "肚脐上方", source: "checkin" },
      { id: uid(), at: hoursAgo(33), severity: 4, note: "吃了点粥后好一些，没有呕吐和腹泻", location: "肚脐上方", source: "ai" },
      { id: uid(), at: hoursAgo(26), severity: 5, note: "晚饭后又加重，伴轻微反酸", location: "肚脐上方", source: "checkin" },
    ],
    messages: [
      { id: uid(), role: "user", content: "肚子痛，晚饭后开始的，肚脐上面一点，一直隐隐地痛，比较难受。", at: hoursAgo(50), kind: "intake" },
      { id: uid(), role: "assistant", content: "记下了：晚饭后开始，肚脐上方一直隐痛。你 3 个月前记过一次类似的胃痛，当时是急性胃炎。这次有没有反酸、恶心或者呕吐？", at: hoursAgo(50) },
      { id: uid(), role: "user", content: "有一点反酸，没有吐。", at: hoursAgo(50) },
      { id: uid(), role: "assistant", content: "好的。是空腹的时候更痛，还是吃完饭更痛？", at: hoursAgo(50) },
      { id: uid(), role: "user", content: "吃完饭更痛。", at: hoursAgo(50) },
      { id: uid(), role: "assistant", content: "明白，这些我都记好了。先吃清淡、温软的东西，别碰辛辣和咖啡。如果出现呕血、黑便或者痛得明显加重，请立即就医。明天我再来问你。", at: hoursAgo(50) },
      { id: uid(), role: "user", content: "【定时记录】差不多：早上稍缓解，空腹时仍隐隐作痛", at: hoursAgo(38), kind: "checkin" },
      { id: uid(), role: "assistant", content: "收到，比昨晚好一点。空腹时隐痛和上次胃炎很像，今天按时吃饭，少量多餐。", at: hoursAgo(38) },
      { id: uid(), role: "user", content: "吃了点粥好多了，没有吐也没有拉肚子。", at: hoursAgo(33) },
      { id: uid(), role: "assistant", content: "很好，吃东西后缓解，没有呕吐腹泻。我晚点再来问你。", at: hoursAgo(33) },
      { id: uid(), role: "user", content: "【定时记录】更严重了：晚饭后又加重，伴轻微反酸", at: hoursAgo(26), kind: "checkin" },
      { id: uid(), role: "assistant", content: "记下了，晚饭后又加重，还有反酸。这次和 3 个月前的急性胃炎比较像。明天如果吃完饭还是加重，建议去消化内科看一下，点「给医生看」我会把这两天的记录整理好。", at: hoursAgo(26) },
    ],
    lastHint: {
      level: "info",
      text: "这次和 3 个月前的「胃痛」（急性胃炎）比较像。如果超过 3 天还没好，或者出现呕血、黑便，请尽快就医。",
    },
    suggestedReplies: [],
    done: true,
    summary: null,
    visit: null,
    resolvedAt: null,
    relatedEpisodeIds: [gastritis.id],
  };

  return {
    version: 1,
    profile,
    episodes: [current, headache, gastritis, cold],
    measurements: [],
    followUps: [],
    annualSummary: null,
    nextVisit: null,
    checkups: [],
    asks: [],
    settings: {
      checkInIntervalHours: 24,
      notificationsEnabled: false,
      longTerm: false,
      trackedMetrics: [],
      metricReminderHours: 24,
    },
    demo: "liming",
  };
}
