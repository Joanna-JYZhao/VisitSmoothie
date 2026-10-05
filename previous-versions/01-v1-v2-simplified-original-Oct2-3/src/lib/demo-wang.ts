import type { AppState, Episode, FollowUp, Measurement, MetricType, Profile } from "./types";
import { uid, HOUR } from "./utils";
import { holidayBetween } from "./metrics";

/**
 * 演示数据：王秀兰（虚构）· 12 个月的 2 型糖尿病管理。
 * 素材来源：inbox/demo-wang-xiulan.md。
 *
 * 时间轴以 `anchor` 所在的月份为「第 12 个月」，往前倒推 11 个月；
 * 第 11、12 个月的近期事件用「距 anchor 多少天」来定位，保证不会落在未来。
 */
export function buildWangXiulanState(anchor: Date = new Date()): AppState {
  /** 第 k 个月（1-12）的某一天。 */
  const m = (k: number, day: number, hour = 9, minute = 0) =>
    new Date(anchor.getFullYear(), anchor.getMonth() - (12 - k), day, hour, minute, 0, 0).toISOString();
  /** anchor 之前 n 天的某个时刻。 */
  const ago = (days: number, hour: number, minute = 0) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() - days);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const day = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const diagnosedAt = new Date(m(1, 10));

  const profile: Profile = {
    name: "王秀兰",
    gender: "女",
    birthYear: anchor.getFullYear() - 58,
    heightCm: 160,
    weightKg: 67,
    bloodType: null,
    conditions: ["高血压（5 年）", `2 型糖尿病（${diagnosedAt.getFullYear()} 年 ${diagnosedAt.getMonth() + 1} 月确诊）`],
    allergies: ["磺胺类药物"],
    medications: ["缬沙坦 每日一次", "二甲双胍缓释片 1.5g 每日一次"],
    surgeries: [],
    familyHistory: ["母亲 2 型糖尿病"],
    notes: "退休教师。爱吃米饭和甜点，每天傍晚散步 20 分钟。",
    // 虚构号码：演示数据下应急手册只显示、不拨打
    emergencyContact: { name: "陈静", relation: "女儿", phone: "138 0000 0002" },
    createdAt: m(1, 6, 20, 0),
    updatedAt: ago(1, 21, 0),
  };

  /* 第 1 个月：确诊前的症状 */
  const onset: Episode = {
    id: uid(),
    title: "口渴、尿多、容易累",
    tags: ["口渴", "多尿", "乏力", "2 型糖尿病"],
    status: "resolved",
    startedAt: m(1, 2, 8, 0),
    createdAt: m(1, 6, 20, 10),
    updatedAt: m(1, 27, 19, 0),
    lastCheckInAt: m(1, 27, 19, 0),
    snoozedUntil: null,
    entries: [
      { id: uid(), at: m(1, 6, 20, 10), severity: 5, note: "近两周总是口渴，一天要喝两三暖壶水；夜里起夜 3-4 次；白天容易累", location: null, source: "user" },
      { id: uid(), at: m(1, 6, 20, 14), severity: 5, note: "体重没有明显变化；没有视物模糊和手脚麻木", location: null, source: "ai" },
      { id: uid(), at: m(1, 9, 8, 30), severity: 5, note: "症状没有变化，已预约内分泌科", location: null, source: "checkin" },
      { id: uid(), at: m(1, 17, 19, 0), severity: 3, note: "服药一周，口渴减轻，夜尿减到 1-2 次", location: null, source: "checkin" },
      { id: uid(), at: m(1, 27, 19, 0), severity: 1, note: "口渴和乏力基本消失", location: null, source: "user" },
    ],
    messages: [
      { id: uid(), role: "user", content: "口渴、尿多、容易累，大概两周前开始的。", at: m(1, 6, 20, 10), kind: "intake" },
      { id: uid(), role: "assistant", content: "记下了：口渴、尿多、乏力约两周。你母亲有 2 型糖尿病，这几个症状放在一起需要查一下血糖。最近体重有变化吗？", at: m(1, 6, 20, 11) },
      { id: uid(), role: "user", content: "体重没怎么变，就是容易累。眼睛不花，手脚也不麻。", at: m(1, 6, 20, 14) },
      { id: uid(), role: "assistant", content: "好的，都记下来了。建议这几天去内分泌科查空腹血糖和糖化血红蛋白，我可以把这两周的情况整理成一页摘要带给医生。", at: m(1, 6, 20, 14) },
    ],
    lastHint: null,
    suggestedReplies: [],
    done: true,
    summary: null,
    visit: {
      date: day(m(1, 10)),
      hospital: "市人民医院",
      department: "内分泌科",
      diagnosis: "2 型糖尿病（糖化血红蛋白 8.5%，空腹血糖 9.8 mmol/L）",
      treatment: "二甲双胍片 0.5g 每日两次，随餐服用",
      advice: "减少米饭和甜食，每天散步，自测空腹血糖并记录；3 个月后复查糖化血红蛋白",
      archiveSummary:
        "患者因口渴、多尿、乏力约两周就诊于市人民医院内分泌科，查糖化血红蛋白 8.5%、空腹血糖 9.8 mmol/L，诊断为 2 型糖尿病。予二甲双胍 0.5g 每日两次，嘱控制主食和甜食、规律运动、自测空腹血糖。服药一周后口渴和夜尿减轻，约三周后症状基本消失。母亲有 2 型糖尿病，既往高血压 5 年，磺胺类药物过敏。",
      followUp: "3 个月后复查糖化血红蛋白",
      followUpAt: null,
      mode: "glm",
      recordedAt: m(1, 10, 15, 0),
    },
    resolvedAt: m(1, 27, 19, 0),
    relatedEpisodeIds: [],
  };

  /* 第 4-5 个月：二甲双胍加量后的胃肠反应，换缓释片后缓解 */
  const sideEffect: Episode = {
    id: uid(),
    title: "吃药后肚子胀、拉肚子",
    tags: ["腹部", "消化", "腹胀", "腹泻", "药物反应"],
    status: "resolved",
    startedAt: m(4, 3, 19, 0),
    createdAt: m(4, 6, 20, 30),
    updatedAt: m(5, 18, 19, 0),
    lastCheckInAt: m(5, 18, 19, 0),
    snoozedUntil: null,
    entries: [
      { id: uid(), at: m(4, 6, 20, 30), severity: 4, note: "二甲双胍加量后约一周开始，饭后肚子胀，每天 2-3 次稀便", location: "腹部", source: "user" },
      { id: uid(), at: m(4, 9, 19, 0), severity: 5, note: "腹胀更明显，晚饭后最重；没有腹痛和发热", location: "腹部", source: "checkin" },
      { id: uid(), at: m(4, 16, 19, 0), severity: 4, note: "症状持续，食欲下降；仍在按时服药", location: "腹部", source: "checkin" },
      { id: uid(), at: m(5, 6, 19, 30), severity: 2, note: "换成缓释片 3 天，腹胀减轻，大便基本成形", location: "腹部", source: "checkin" },
      { id: uid(), at: m(5, 18, 19, 0), severity: 0, note: "胃肠不适消失", location: null, source: "user" },
    ],
    messages: [
      { id: uid(), role: "user", content: "吃药后肚子胀、拉肚子，加量以后开始的。", at: m(4, 6, 20, 30), kind: "intake" },
      { id: uid(), role: "assistant", content: "记下了：二甲双胍加量后出现腹胀、稀便。这是需要告诉医生的情况，请不要自己停药或减量。一天大概拉几次？有没有腹痛或发烧？", at: m(4, 6, 20, 31) },
      { id: uid(), role: "user", content: "一天两三次，不痛也不烧。", at: m(4, 6, 20, 33) },
      { id: uid(), role: "assistant", content: "好的，都记下来了。我会每隔几天问问变化，下次复诊时把这段记录放进摘要，提醒你告诉医生。", at: m(4, 6, 20, 33) },
    ],
    lastHint: null,
    suggestedReplies: [],
    done: true,
    summary: null,
    visit: {
      date: day(m(5, 3)),
      hospital: "市人民医院",
      department: "内分泌科",
      diagnosis: "二甲双胍相关胃肠道反应",
      treatment: "二甲双胍片改为二甲双胍缓释片 1.5g 每日一次，晚餐后服用",
      advice: "两周内观察胃肠反应；继续自测空腹血糖",
      archiveSummary:
        "患者二甲双胍加量约一周后出现餐后腹胀、每日 2-3 次稀便，无腹痛发热，持续约一个月。就诊于市人民医院内分泌科，考虑为二甲双胍相关胃肠道反应，改用二甲双胍缓释片 1.5g 每日一次、晚餐后服用。换药 3 天后腹胀减轻，约两周后胃肠不适消失。",
      followUp: null,
      mode: "glm",
      recordedAt: m(5, 3, 16, 0),
    },
    resolvedAt: m(5, 18, 19, 0),
    relatedEpisodeIds: [],
  };

  /* 第 8 个月：一次低血糖事件 */
  const hypo: Episode = {
    id: uid(),
    title: "散步后出冷汗、手抖",
    tags: ["低血糖", "出汗", "手抖", "心慌"],
    status: "resolved",
    startedAt: m(8, 14, 18, 40),
    createdAt: m(8, 14, 18, 46),
    updatedAt: m(8, 15, 8, 0),
    lastCheckInAt: m(8, 15, 8, 0),
    snoozedUntil: null,
    entries: [
      { id: uid(), at: m(8, 14, 18, 46), severity: 7, note: "傍晚散步约 40 分钟后出冷汗、手抖、心慌；自测血糖 3.6 mmol/L", location: null, source: "user" },
      { id: uid(), at: m(8, 14, 19, 5), severity: 2, note: "吃了 3 块糖并喝半杯果汁，15 分钟后复测血糖 5.4 mmol/L，症状缓解", location: null, source: "ai" },
      { id: uid(), at: m(8, 15, 8, 0), severity: 0, note: "次日晨起无不适，空腹血糖 6.3 mmol/L", location: null, source: "checkin" },
    ],
    messages: [
      { id: uid(), role: "user", content: "散步回来出冷汗、手抖，心慌，测了血糖是 3.6。", at: m(8, 14, 18, 46), kind: "intake" },
      { id: uid(), role: "assistant", content: "血糖 3.6 属于低血糖。请现在就吃 15 克左右的糖，比如 3 块糖或半杯果汁，坐下休息，15 分钟后再测一次。我先记下来。", at: m(8, 14, 18, 47) },
      { id: uid(), role: "user", content: "吃了糖，15 分钟后测是 5.4，不抖了。", at: m(8, 14, 19, 5) },
      { id: uid(), role: "assistant", content: "好，已经回到安全范围。今天晚饭吃得少，散步又比平时久，可能和这次低血糖有关。我把这次事件记进档案，下次复诊时提醒你告诉医生。", at: m(8, 14, 19, 6) },
    ],
    lastHint: null,
    suggestedReplies: [],
    done: true,
    summary: null,
    visit: null,
    resolvedAt: m(8, 15, 8, 0),
    relatedEpisodeIds: [],
  };

  /* 第 11 个月至今：双脚发麻，正在跟踪。拖了两周以上的症状改为每周问一次，所以最近一次回答是 8 天前。 */
  const numbness: Episode = {
    id: uid(),
    title: "脚麻",
    tags: ["四肢关节", "脚麻", "麻木", "夜间加重"],
    status: "active",
    startedAt: ago(24, 21, 0),
    createdAt: ago(22, 20, 40),
    updatedAt: ago(8, 21, 10),
    lastCheckInAt: ago(8, 21, 10),
    snoozedUntil: null,
    entries: [
      { id: uid(), at: ago(22, 20, 40), severity: 3, note: "两只脚的脚底有点麻，像踩在棉花上，晚上更明显", location: "双脚", source: "user" },
      { id: uid(), at: ago(22, 20, 44), severity: 3, note: "双侧对称；没有疼痛，走路不受影响", location: "双脚", source: "ai" },
      { id: uid(), at: ago(15, 21, 0), severity: 3, note: "没有变化，白天不明显", location: "双脚", source: "checkin" },
      { id: uid(), at: ago(8, 21, 10), severity: 4, note: "夜里麻得更明显，偶尔有针刺感；洗脚时对水温没有以前敏感", location: "双脚", source: "checkin" },
    ],
    messages: [
      { id: uid(), role: "user", content: "脚麻，最近开始的，晚上更明显，有点难受。", at: ago(22, 20, 40), kind: "intake" },
      { id: uid(), role: "assistant", content: "记下了：脚发麻，夜间更明显。是两只脚都麻，还是只有一边？有没有疼痛或者走路不稳？", at: ago(22, 20, 41) },
      { id: uid(), role: "user", content: "两只脚都麻，像踩在棉花上。不痛，走路没问题。", at: ago(22, 20, 44) },
      { id: uid(), role: "assistant", content: "好的，都记下来了。你有糖尿病，脚麻需要让医生看一下。我会每周来问问变化，年度复诊时把这段记录整理好给医生。", at: ago(22, 20, 44) },
      { id: uid(), role: "user", content: "【定时记录】差不多：没有变化，白天不明显", at: ago(15, 21, 0), kind: "checkin" },
      { id: uid(), role: "assistant", content: "收到，和上周一样。平时洗脚后看一眼双脚有没有破皮或水泡，有的话告诉我。", at: ago(15, 21, 0) },
      { id: uid(), role: "user", content: "【定时记录】更严重了：夜里麻得更明显，偶尔有针刺感；洗脚时对水温没有以前敏感", at: ago(8, 21, 10), kind: "checkin" },
      { id: uid(), role: "assistant", content: "记下了，比上周重了一点，还多了针刺感。对水温不敏感这一点很重要，洗脚前请先用手试水温，避免烫伤。年度复诊时请一定告诉医生。", at: ago(8, 21, 10) },
    ],
    lastHint: {
      level: "warn",
      text: "双脚对称发麻、夜间加重已经 3 周，还出现了对水温不敏感。年度复诊时请重点告诉医生；洗脚前先用手试水温，每天看看双脚有没有破损。",
    },
    suggestedReplies: [],
    done: true,
    summary: null,
    visit: null,
    resolvedAt: null,
    relatedEpisodeIds: [],
  };

  // 保证演示时追问一定是到期状态，不受当前钟点影响。
  if (anchor.getTime() - new Date(numbness.lastCheckInAt).getTime() < (7 * 24 + 1) * HOUR) {
    numbness.lastCheckInAt = new Date(anchor.getTime() - (7 * 24 + 2) * HOUR).toISOString();
  }

  /* ---------- 健康指标：12 个月的血糖、糖化、体重、血压 ---------- */

  // 固定种子的伪随机，保证每次载入的演示数据完全一样
  let seed = 20261002;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const jitter = (amp: number) => (rnd() - 0.5) * 2 * amp;
  const r1 = (n: number) => Math.round(n * 10) / 10;

  const measurements: Measurement[] = [];
  const add = (type: MetricType, at: string, value: number, extra: Partial<Measurement> = {}) => {
    if (new Date(at).getTime() > anchor.getTime()) return;
    measurements.push({ id: uid(), type, at, value, source: "user", ...extra });
  };
  /** 一段时间内的空腹血糖：从 from 线性变化到 to，带一点日常波动。 */
  const fbgRun = (k: number, days: number[], from: number, to: number, amp: number, cap?: number) => {
    days.forEach((d, i) => {
      const base = from + ((to - from) * i) / Math.max(days.length - 1, 1);
      let v = r1(base + jitter(amp));
      if (cap != null) v = Math.min(v, cap);
      add("fbg", m(k, d, 7, 10), v);
    });
  };
  const every = (start: number, end: number, step: number) => {
    const out: number[] = [];
    for (let d = start; d <= end; d += step) out.push(d);
    return out;
  };

  // 第 1 个月：确诊，刚开始服药
  add("fbg", m(1, 10, 8, 30), 9.8, { source: "visit", note: "确诊当天医院检查" });
  [14, 17, 20, 23, 26, 28].forEach((d, i) => add("fbg", m(1, d, 7, 10), [9.9, 9.7, 9.8, 9.6, 9.7, 9.6][i]));
  // 第 2 个月：每天记录，从 9.8 慢慢降到 8.1
  every(1, 28, 1).forEach((d, i) => {
    const v = i === 0 ? 9.8 : i === 27 ? 8.1 : r1(9.8 - (1.7 * i) / 27 + jitter(0.18));
    add("fbg", m(2, d, 7, 10), v);
  });
  // 第 3 个月：复诊加量前后
  fbgRun(3, every(2, 28, 2), 8.1, 7.6, 0.15);
  // 第 4-6 个月：继续缓慢下降
  fbgRun(4, every(2, 26, 3), 7.6, 7.3, 0.15);
  fbgRun(5, every(2, 26, 3), 7.3, 7.0, 0.12);
  fbgRun(6, every(2, 26, 3), 6.9, 6.8, 0.1, 7.0);
  // 第 7 个月：假期连续 5 天偏高，之后回落
  const holiday = holidayBetween(day(m(7, 1)), day(m(7, 5)));
  const partyNotes = [
    `${holiday ?? "聚会"}第一天，家庭聚餐，主食和甜点吃得多`,
    "外出吃饭，喝了甜饮料",
    "亲戚来访，吃了蛋糕",
    "连着几天聚餐",
    `${holiday ? "假期" : "聚会"}最后一天`,
  ];
  [8.2, 8.6, 8.9, 8.4, 8.0].forEach((v, i) => add("fbg", m(7, i + 1, 7, 10), v, { note: partyNotes[i] }));
  add("fbg", m(7, 6, 7, 10), 6.9, { note: "恢复平常饮食" });
  fbgRun(7, every(9, 27, 3), 6.8, 6.7, 0.1, 7.0);
  // 第 8 个月：平稳，其间有一次低血糖
  fbgRun(8, [2, 5, 8, 11], 6.7, 6.6, 0.12, 7.0);
  add("ppg", m(8, 14, 18, 46), 3.6, { note: "傍晚散步约 40 分钟后出冷汗、手抖" });
  add("ppg", m(8, 14, 19, 5), 5.4, { note: "吃糖 15 分钟后复测" });
  add("fbg", m(8, 15, 7, 10), 6.3);
  fbgRun(8, [18, 21, 24, 27], 6.6, 6.6, 0.12, 7.0);
  // 第 9 个月
  fbgRun(9, every(2, 26, 3), 6.6, 6.5, 0.15, 7.0);
  // 第 10 个月至今：每周记录 3 次，稳定在 6-7 之间。从 anchor 往回排，最近一次是两天前。
  const tenthStart = new Date(m(10, 1, 0, 0)).getTime();
  const gaps = [2, 2, 3];
  for (let daysAgo = 2, i = 0; ; daysAgo += gaps[i % 3], i++) {
    const at = ago(daysAgo, 7, 10);
    if (new Date(at).getTime() < tenthStart) break;
    add("fbg", at, r1(Math.min(6.9, Math.max(6.1, 6.5 + jitter(0.35)))));
  }

  // 糖化血红蛋白：四次复查
  add("hba1c", m(1, 10, 9, 0), 8.5, { source: "visit", note: "确诊时" });
  add("hba1c", m(3, 12, 9, 0), 7.6, { source: "visit" });
  add("hba1c", m(6, 14, 9, 0), 7.0, { source: "visit" });
  add("hba1c", m(9, 11, 9, 0), 6.8, { source: "visit" });

  // 体重：从 72 kg 降到 67 kg 左右
  add("weight", m(1, 6, 7, 30), 72.0, { note: "建档时" });
  add("weight", m(2, 15, 7, 30), 71.4);
  add("weight", m(3, 12, 9, 0), 70.6, { source: "visit" });
  add("weight", m(4, 15, 7, 30), 70.1);
  add("weight", m(5, 15, 7, 30), 69.2);
  add("weight", m(6, 14, 9, 0), 68.0, { source: "visit" });
  add("weight", m(7, 20, 7, 30), 68.5);
  add("weight", m(8, 15, 7, 30), 67.9);
  add("weight", m(9, 11, 9, 0), 67.6, { source: "visit" });
  add("weight", m(10, 15, 7, 30), 67.7);
  add("weight", m(11, 15, 7, 30), 67.4);
  add("weight", ago(5, 7, 30), 67.2);

  // 血压：高血压 5 年，服缬沙坦
  const bpAt = (at: string, sys: number, dia: number, extra: Partial<Measurement> = {}) =>
    add("bp", at, sys, { value2: dia, ...extra });
  bpAt(m(1, 10, 9, 0), 138, 86, { source: "visit" });
  bpAt(m(1, 20, 8, 0), 140, 88);
  bpAt(m(2, 20, 8, 0), 136, 86);
  bpAt(m(3, 12, 9, 0), 134, 84, { source: "visit" });
  bpAt(m(4, 20, 8, 0), 132, 84);
  bpAt(m(5, 20, 8, 0), 133, 83);
  bpAt(m(6, 14, 9, 0), 130, 82, { source: "visit" });
  bpAt(m(7, 20, 8, 0), 131, 82);
  bpAt(m(8, 20, 8, 0), 128, 80);
  bpAt(m(9, 11, 9, 0), 128, 80, { source: "visit" });
  bpAt(m(10, 20, 8, 0), 128, 79);
  bpAt(m(11, 20, 8, 0), 126, 79);
  bpAt(ago(3, 8, 0), 126, 78);

  /* ---------- 复诊记录（不绑定某次症状的定期复查） ---------- */

  const followUps: FollowUp[] = [
    {
      id: uid(),
      date: day(m(3, 12)),
      hospital: "市人民医院",
      department: "内分泌科",
      reason: "3 个月复查",
      findings: "糖化血红蛋白 7.6%（确诊时 8.5%）；空腹血糖 7.9 mmol/L；血压 134/84 mmHg；体重 70.6 kg",
      plan: "二甲双胍由 0.5g 每日两次加量为 0.5g 每日三次",
      advice: "继续控制主食和甜食；3 个月后复查",
      recordedAt: m(3, 12, 16, 0),
    },
    {
      id: uid(),
      date: day(m(6, 14)),
      hospital: "市人民医院",
      department: "内分泌科",
      reason: "6 个月复查",
      findings: "糖化血红蛋白 7.0%；体重 68 kg，比确诊时下降 4 kg；血压 130/82 mmHg；肝肾功能正常",
      plan: "维持二甲双胍缓释片 1.5g 每日一次",
      advice: "保持饮食和运动；节假日注意饮食",
      recordedAt: m(6, 14, 16, 0),
    },
    {
      id: uid(),
      date: day(m(9, 11)),
      hospital: "市人民医院",
      department: "内分泌科",
      reason: "9 个月复查与眼底检查",
      findings: "糖化血红蛋白 6.8%；眼底检查未见糖尿病视网膜病变；血压 128/80 mmHg；已告知上月一次低血糖",
      plan: "维持原方案",
      advice: "运动前适量加餐，晚餐不要吃得太少；年度复诊时做足部检查并查尿微量白蛋白",
      recordedAt: m(9, 11, 16, 0),
    },
  ];

  return {
    version: 1,
    profile,
    episodes: [numbness, hypo, sideEffect, onset],
    measurements,
    followUps,
    annualSummary: null,
    // 今天就是年度复诊日
    nextVisit: { at: anchor.toISOString(), note: "年度复诊" },
    checkups: [],
    asks: [],
    settings: {
      checkInIntervalHours: 24,
      notificationsEnabled: false,
      longTerm: true,
      trackedMetrics: ["fbg", "hba1c", "weight", "bp"],
      metricReminderHours: 48,
    },
    demo: "wang",
  };
}
