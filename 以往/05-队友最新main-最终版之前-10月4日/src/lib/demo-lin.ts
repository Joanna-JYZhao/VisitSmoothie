import type { AppState, Episode, Lang, Profile, Reminder } from "./types";

/*
 * 演示病人：林叔（虚构）。照队友的剧本「虚构患者资料_中英双语.docx」（TriMedManagement,
 * codex/afterdoc-prototype 0b029f4）：档案七项、5 月一次左膝不适的旧记录、这次左膝痛的问诊、
 * 骨科医嘱（原因待查，不加药、不做检查，一周后复诊），以及他自己打开的两个单次提醒。
 * 剧本里的日期以「看病那天」为准，这里放在今天：10 月 1 日开始疼 = 三天前，复诊 = 七天后。
 * 剧本没说的（疼的分数以外的轻重、体温、长期药名）一律不写。
 * 每条记录按现在保存的格式：标题是主要症状一个短语；复诊记录关联它复诊的那条（R001 → R006 → R004 高血压随访，
 * R002 → R010 左膝）；看过医生的有按医嘱存下的治疗计划（疗程、到哪天）和下次复诊、要带的东西。
 *
 * English: the same story from the English side of the script, chosen by `lang`. Only the words
 * differ. Dates, times, ids and structure are identical in both languages, so switching the
 * interface language can rebuild the demo without stranding a page that shows a record by id.
 * Stored option values (gender, education) and the keyword tags stay as the app stores them:
 * the profile form maps the options to labels, and the tags are never shown, only matched by
 * the (Chinese) rules.
 */

const MS_DAY = 24 * 60 * 60 * 1000;

/** `days` days from today (negative: before) at the given local time. */
function day(days: number, hour: number, minute = 0, now = new Date()) {
  const d = new Date(now.getTime() + days * MS_DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Fixed ids, the same in both languages and on every load. */
const ID = {
  knee: "lin-knee",
  may: "lin-may",
  eveReminder: "lin-reminder-eve",
  eveTodo: "lin-todo-eve",
  dayReminder: "lin-reminder-day",
  dayTodo: "lin-todo-day",
} as const;

/**
 * 既往病史（资料里的「既往病史 Medical history」十条，加上他自己补的吸烟史），一行一条，
 * 放在「补充以往病史」写进去的同一个地方：手术进 surgeries，其余进 conditions（见 addPastHistory）。
 * 日期照资料原文写（队友更新版「林叔_患者测试数据_更新版」），不随演示日期移动。
 */
const HISTORY_ZH = [
  "2022-08-16 患者自述在门诊确诊高血压，后续按原处方服药",
  "2025-12-08 右侧颈肩酸胀，低头工作后明显，使用就医前整理",
  "2026-05-12 左膝内侧活动后酸痛，使用就医前整理",
  "2026-05-19 患者补记：左膝不适比上周减轻，未保存当次医嘱",
  "2026-06-18 食虾后出现皮肤发痒和风团，皮肤科记录为皮疹、原因待查",
  "2026-08-03 咽部不适就诊，保存就医后医嘱与解释对话",
  "2026-09-22 头昏，全科记录为高血压控制欠佳；病历写明现用药缬沙坦，新增氨氯地平",
  "2026-09-26 上腹阵发性绞痛（中秋晚餐后），使用就医前整理，已去消化内科，单据未上传",
  "2026-09-29 患者记录双侧脚踝傍晚轻度水肿，已加入复诊问题",
  "2026-10-03 左膝内侧疼痛复发，骨科诊断左膝骨关节炎（早期）",
  "吸烟约 20 年，每天约 10 支；2026-08 咽部不适后自述在减量（2026-09-15 自己添加）",
];
const HISTORY_EN = [
  "2022-08-16 Says a clinic diagnosed high blood pressure; has taken the original prescription since",
  "2025-12-08 Aching and stiffness on the right side of the neck and shoulder, worse after working with the head down; pre-visit notes prepared",
  "2026-05-12 Aching on the inner side of the left knee after activity; pre-visit notes prepared",
  "2026-05-19 Added by himself: left knee discomfort less than the week before; that visit's orders were not saved",
  "2026-06-18 Itching and hives after eating shrimp; dermatology recorded a rash, cause to be determined",
  "2026-08-03 Saw a doctor for throat discomfort; doctor's orders and the explanation chat saved",
  "2026-09-22 Light-headedness; general practice recorded poorly controlled high blood pressure; the record names the current medicine valsartan and adds amlodipine",
  "2026-09-26 Cramping upper-abdominal pain that came and went (after the Mid-Autumn dinner); pre-visit notes prepared; went to gastroenterology, papers not uploaded",
  "2026-09-29 Noticed mild swelling of both ankles in the evenings; added to the questions for the next visit",
  "2026-10-03 Pain on the inner side of the left knee came back; orthopaedics diagnosed early left knee osteoarthritis",
  "Smoker for about 20 years, about 10 cigarettes a day; says he has been cutting down since the throat trouble in 2026-08 (added by himself on 2026-09-15)",
];

const SURGERY_ZH = "2008-06 阑尾切除术，术后恢复良好，无后续问题（2026-09-15 自己添加）";
const SURGERY_EN = "2008-06 Appendectomy; recovered well, no later problems (added by himself on 2026-09-15)";

/**
 * 队友更新版的十份报告 R001–R010 的日期以「2026-10-04 12:00」为准（报告的状态、待办都截至那时）。
 * 演示哪天打开，就把整天数平移到哪天：偏移 = 打开那天的本地日期 − 2026-10-04，钟点不变。
 * 写死日期的话，过几天再演示，还在跟踪的记录就会显得过期。10 月 4 日打开时与资料一致。
 */
function docDay(now: Date) {
  const base = new Date(2026, 9, 4).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const offset = Math.round((today - base) / MS_DAY);
  return (ymd: string, hm = "12:00") => {
    const [y, m, d] = ymd.split("-").map(Number);
    const [h, mi] = hm.split(":").map(Number);
    return new Date(y, m - 1, d + offset, h, mi);
  };
}

/** One of the ten reports, in both languages. Only what the report list and a record page need. */
interface Report {
  n: string;
  /** when it began (or was first written down, when the document gives no start) */
  start: [string, string];
  /** the last thing in the document about it */
  last: [string, string];
  active: boolean;
  /** open, but no daily question about it: the document only has the notes made before a visit */
  quiet?: boolean;
  tags: string[];
  title: [string, string];
  /** one sentence, from the document */
  note: [string, string];
  visit?: { date: string; time: string; department: [string, string]; hospital?: [string, string]; diagnosis: [string, string]; treatment: [string, string] };
  /** 复诊: the report this one follows up */
  of?: string;
  /** the Clinical Plan as saved from the orders: a course in days, or running until a date (the next visit), or until ended */
  plan?: { kind: "medicine" | "care" | "caution" | "followup"; text: [string, string]; days?: number; until?: [string, string] }[];
  /** the next visit and what to bring, when the orders give one */
  next?: { at: [string, string]; note: [string, string]; prepare: [string, string][] };
}

const REPORTS: Report[] = [
  {
    n: "001", start: ["2025-11-19", "20:16"], last: ["2026-03-10", "08:45"], active: false, tags: ["高血压"],
    title: ["高血压定期复查", "Blood pressure check-up"],
    plan: [
      { kind: "medicine", text: ["继续按原处方吃降压药", "Keep taking the blood pressure medicine as first prescribed"], until: ["2026-03-10", "18:12"] },
      { kind: "care", text: ["保留家庭血压记录", "Keep the home blood pressure readings"], until: ["2026-03-10", "18:12"] },
    ],
    note: ["定期复查血压，没有新的不适；带家庭血压记录，想请医生解释记录、核对用药、定下次随访", "Regular blood pressure check, nothing new; brought his home readings, wanted them explained, his medicine checked and the next visit set"],
    visit: { date: "2025-11-20", time: "18:42", department: ["全科", "General practice"], diagnosis: ["高血压随访：继续按原处方执行，保留家庭血压记录", "Blood pressure follow-up: carry on with the original prescription, keep the home readings"], treatment: ["继续按原处方执行（单据上没有新的药名或剂量）", "Carry on with the original prescription (no new medicine name or dose on the slip)"] },
  },
  {
    // pre-visit notes only: whether he then saw a doctor, or got better, the document doesn't say — so it stays open, quietly
    n: "005", start: ["2025-12-05", "12:00"], last: ["2025-12-08", "08:32"], active: true, quiet: true, tags: ["颈部", "肩膀", "酸胀"],
    title: ["右侧颈肩酸胀", "Aching right neck and shoulder"],
    note: ["右侧颈部到肩膀上方酸胀、紧绷，低头工作半小时左右更明显，休息后减轻（只做了就医前整理）", "Aching and tightness from the right side of the neck to the top of the shoulder, worse after about half an hour of head-down work, better with rest (pre-visit notes only)"],
  },
  {
    n: "006", start: ["2026-03-09", "19:24"], last: ["2026-03-24", "12:00"], active: false, tags: ["高血压"],
    title: ["高血压定期复查", "Blood pressure check-up"], of: "001",
    plan: [
      { kind: "medicine", text: ["继续执行现有处方", "Carry on with the current prescription"], until: ["2026-09-12", "18:35"] },
      { kind: "care", text: ["每次量血压都记下读数、日期和时间", "Write down every reading with its date and time"], until: ["2026-09-12", "18:35"] },
      { kind: "followup", text: ["复诊：两周后上午全科复查", "Follow-up: GP check in two weeks, in the morning"] },
    ],
    next: { at: ["2026-03-24", "09:00"], note: ["两周后上午全科复查", "GP check in two weeks, in the morning"], prepare: [["带上家庭血压原始记录", "Bring the home blood pressure readings"]] },
    note: ["定期随访，带近两周家庭血压原始记录，想问不同时间的数值怎么记", "Regular follow-up with two weeks of home readings; wanted to ask how to record readings taken at different times"],
    visit: { date: "2026-03-10", time: "18:12", department: ["全科", "General practice"], diagnosis: ["高血压随访：保留每次读数及日期、时间，3 月 24 日上午全科复查", "Blood pressure follow-up: keep every reading with its date and time; GP follow-up on the morning of Mar 24"], treatment: ["继续执行现有处方", "Carry on with the current prescription"] },
  },
  {
    n: "002", start: ["2026-05-09", "12:00"], last: ["2026-05-19", "12:00"], active: false, tags: ["膝盖", "腿", "疼痛"],
    title: ["左膝内侧活动后酸痛", "Aching inner left knee after activity"],
    note: ["左膝内侧活动后酸痛，走路多和上下楼明显，休息后减轻；5 月 19 日补记：比上周减轻，未保存当次医嘱", "Aching on the inner left knee after activity, worse with a lot of walking and on stairs, better with rest; added on May 19: less than the week before, that visit's orders were not saved"],
    // he saw a doctor (the orders of "that visit" were not saved): without a visit the list would say he got better without one
    visit: { date: "2026-05-12", time: "12:00", department: ["", ""], diagnosis: ["当次医嘱没有保存", "The orders from that visit were not saved"], treatment: ["当次医嘱没有保存", "The orders from that visit were not saved"] },
  },
  {
    n: "003", start: ["2026-06-18", "18:26"], last: ["2026-06-20", "12:00"], active: false, tags: ["皮肤", "皮疹", "发痒"],
    title: ["吃虾后皮肤发痒、起风团", "Itchy skin and hives after shrimp"],
    note: ["吃虾后皮肤发痒、起风团", "Itchy skin and hives after eating shrimp"],
    visit: { date: "2026-06-18", time: "18:26", department: ["皮肤科", "Dermatology"], diagnosis: ["皮疹，原因待查", "Rash, cause to be determined"], treatment: ["上传图片中的药物区域模糊，药名和次数无法确认", "The medicine part of the photo was blurred; name and frequency could not be confirmed"] },
  },
  {
    n: "007", start: ["2026-08-03", "19:05"], last: ["2026-08-05", "20:09"], active: false, tags: ["喉咙", "咽部"],
    title: ["咽部不适", "Throat discomfort"],
    note: ["咽部不适就诊；8 月 5 日补记：已经比之前轻很多，吞咽没有不方便", "Saw a doctor for throat discomfort; added on Aug 5: much better than before, no trouble swallowing"],
    visit: { date: "2026-08-03", time: "19:05", department: ["全科", "General practice"], diagnosis: ["咽部不适，原因待查", "Throat discomfort, cause to be determined"], treatment: ["本次未新增药物", "No new medicine this time"] },
  },
  {
    n: "004", start: ["2026-09-11", "19:48"], last: ["2026-09-22", "17:48"], active: false, tags: ["高血压"],
    title: ["高血压定期复查", "Blood pressure check-up"], of: "006",
    plan: [
      { kind: "care", text: ["保留近期血压原始记录", "Keep recent blood pressure readings"], until: ["2026-09-22", "17:48"] },
      { kind: "followup", text: ["复诊：下次全科随访", "Follow-up: next GP visit"] },
    ],
    next: { at: ["2026-09-22", "17:48"], note: ["下次全科随访", "Next GP visit"], prepare: [["带上现用药的原处方或药盒", "Bring the original prescription or the boxes of the medicines in use"]] },
    note: ["定期随访，带近两周原始记录；想确认下次随访时间、补齐处方资料", "Regular follow-up with two weeks of readings; wanted to set the next visit and fill in his prescription details"],
    visit: { date: "2026-09-12", time: "18:35", department: ["全科", "General practice"], diagnosis: ["高血压随访：保留近期原始记录，补齐现用药的原处方或药盒信息", "Blood pressure follow-up: keep recent readings, bring the original prescription or medicine box details"], treatment: ["本次未附原处方", "Original prescription not attached this time"] },
  },
  {
    n: "008", start: ["2026-09-19", "12:00"], last: ["2026-10-03", "21:12"], active: true, tags: ["头部", "头晕", "高血压"],
    title: ["头昏、头部昏沉", "Light-headed and foggy"],
    plan: [
      { kind: "medicine", text: ["缬沙坦胶囊 80 mg，每日 1 次，口服", "Valsartan capsules 80 mg, once daily, by mouth"] },
      { kind: "medicine", text: ["苯磺酸氨氯地平片 5 mg，每日 1 次，早晨口服", "Amlodipine besylate tablets 5 mg, once daily, in the morning, by mouth"] },
    ],
    note: ["9 月 19 日起头昏、头部昏沉感，不是天旋地转；9 月 17、18 日漏服降压药", "Light-headed and foggy since Sep 19, not spinning; missed his blood pressure medicine on Sep 17 and 18"],
    visit: { date: "2026-09-22", time: "17:48", department: ["全科", "General practice"], hospital: ["社区卫生服务中心", "Community health centre"], diagnosis: ["原发性高血压（血压控制欠佳）", "Primary hypertension (blood pressure poorly controlled)"], treatment: ["继续缬沙坦胶囊 80 mg，每日 1 次，口服；加用苯磺酸氨氯地平片 5 mg，每日 1 次，早晨口服", "Continue valsartan capsules 80 mg, once daily, by mouth; add amlodipine besylate tablets 5 mg, once daily, in the morning, by mouth"] },
  },
  {
    n: "009", start: ["2026-09-25", "23:00"], last: ["2026-09-26", "16:30"], active: true, tags: ["腹部", "腹痛"],
    title: ["上腹阵发性绞痛", "Cramping upper-abdominal pain that came and went"],
    plan: [{ kind: "care", text: ["做腹部 B 超（医生开的）", "Have the abdominal ultrasound the doctor ordered"] }],
    note: ["中秋晚餐后上腹部正中偏右一阵一阵绞着疼，后半夜自行缓解；已去消化内科，医生开了腹部 B 超，单据未上传", "After the Mid-Autumn dinner, cramping pain that came and went in the upper middle-right belly, gone by the small hours; went to gastroenterology, an abdominal ultrasound was ordered, papers not uploaded"],
    visit: { date: "2026-09-26", time: "16:30", department: ["消化内科", "Gastroenterology"], diagnosis: ["单据没有上传；医生开了腹部 B 超", "Papers not uploaded; the doctor ordered an abdominal ultrasound"], treatment: ["单据没有上传", "Papers not uploaded"] },
  },
  {
    n: "010", start: ["2026-10-01", "12:00"], last: ["2026-10-03", "16:05"], active: true, tags: ["膝盖", "腿", "疼痛"],
    title: ["左膝内侧疼痛", "Pain on the inner left knee"], of: "002",
    plan: [
      { kind: "medicine", text: ["双氯芬酸二乙胺乳胶剂外用，涂于左膝内侧，每日 3 次，疗程 2 周", "Diclofenac diethylamine emulgel on the inner side of the left knee, 3 times a day, for 2 weeks"], days: 14 },
      { kind: "caution", text: ["暂不加用口服止痛药", "No oral painkiller for now"], until: ["2026-10-11", "08:30"] },
      { kind: "followup", text: ["复诊：一周后骨科复诊", "Follow-up: orthopaedics in a week"] },
    ],
    next: { at: ["2026-10-11", "08:30"], note: ["一周后骨科复诊", "Orthopaedics follow-up in a week"], prepare: [["带以前的就诊资料和正在吃的药盒", "Bring previous records and current medicine boxes"]] },
    note: ["10 月 1 日爬山后左膝内侧关节缝处疼痛，下楼时明显，和 5 月同一部位", "Pain at the inner joint line of the left knee after a hill walk on Oct 1, worse going downstairs, the same place as in May"],
    visit: { date: "2026-10-03", time: "16:05", department: ["骨科", "Orthopaedics"], hospital: ["区人民医院", "District People's Hospital"], diagnosis: ["左膝骨关节炎（早期），内侧为主", "Early left knee osteoarthritis, mainly the inner side"], treatment: ["双氯芬酸二乙胺乳胶剂外用，涂于左膝内侧，每日 3 次，疗程 2 周；暂不加用口服止痛药", "Diclofenac diethylamine emulgel, apply to the inner side of the left knee, 3 times a day for 2 weeks; no oral painkiller for now"] },
  },
];

/** The ten reports as records. Nothing beyond the document: no severity, no temperature. */
function reportEpisodes(now: Date, lang: Lang): Episode[] {
  const t = (pair: [string, string]) => (lang === "en" ? pair[1] : pair[0]);
  const on = docDay(now);
  const iso = (ymd: string, hm?: string) => on(ymd, hm).toISOString();
  const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // the state of the record as the document gives it: 2026-10-04 12:00
  const asOf = iso("2026-10-04", "12:00");
  return REPORTS.map((r) => {
    const id = `lin-r${r.n}`;
    const v = r.visit;
    const last = iso(...r.last);
    const visitAt = v ? iso(v.date, v.time) : null;
    const nextAt = r.next ? iso(...r.next.at) : null;
    // the plan as post saves it: each line from the day of the visit, to the end of its course, to its date, or until ended
    const planItems = (r.plan ?? []).map((x, i) => ({
      id: `${id}-p${i + 1}`,
      kind: x.kind,
      text: t(x.text),
      startedAt: visitAt!,
      endsAt: x.kind === "followup" ? nextAt : x.days ? new Date(new Date(visitAt!).getTime() + x.days * MS_DAY).toISOString() : x.until ? iso(...x.until) : null,
      endedAt: null,
    }));
    return {
      id,
      // the main complaint in a phrase; a follow-up is linked to the record it follows up
      title: t(r.title),
      ...(r.of ? { followUpOf: `lin-r${r.of}` } : {}),
      tags: r.tags,
      status: r.active ? "active" : "resolved",
      startedAt: iso(...r.start),
      createdAt: iso(...r.start),
      updatedAt: last,
      lastCheckInAt: r.active ? asOf : last,
      // a quiet record is never asked about: the snooze runs past any demo
      snoozedUntil: r.quiet ? new Date(now.getTime() + 3650 * 86_400_000).toISOString() : null,
      entries: [{ id: `${id}-e1`, at: iso(...r.start), severity: null, note: t(r.note), source: "user" as const }],
      messages: [],
      lastHint: null,
      suggestedReplies: [],
      done: true,
      summary: null,
      visit: v
        ? {
            date: ymdOf(on(v.date, v.time)),
            ...(v.hospital ? { hospital: t(v.hospital) } : {}),
            ...(t(v.department) ? { department: t(v.department) } : {}),
            diagnosis: t(v.diagnosis),
            treatment: t(v.treatment),
            followUp: r.next ? t(r.next.note) : null,
            followUpAt: nextAt,
            mode: "fallback" as const,
            recordedAt: iso(v.date, v.time),
            planItems,
            next: r.next ? { at: nextAt, note: t(r.next.note), prepare: r.next.prepare.map(t) } : null,
          }
        : null,
      resolvedAt: r.active ? null : last,
      relatedEpisodeIds: [],
    };
  });
}

export function buildLinState(now = new Date(), lang: Lang = "zh"): AppState {
  const t = (zh: string, en: string) => (lang === "en" ? en : zh);
  const at = (days: number, hour: number, minute = 0) => day(days, hour, minute, now);

  const profile: Profile = {
    name: t("林叔", "Uncle Lin"),
    gender: "男",
    birthYear: 1980,
    birthDate: "1980-03-18",
    education: "高中/中专",
    heightCm: null,
    weightKg: null,
    bloodType: null,
    conditions: [
      t(
        "高血压（2022 年门诊医生告知；平时按原处方吃药，药名和剂量记不清，看病时带药盒核对）",
        "High blood pressure (a clinic doctor told him in 2022; takes his medicine as first prescribed, can't remember the name or dose, will bring the medicine box to check)",
      ),
      // 以往病史，一行一条
      ...(lang === "en" ? HISTORY_EN : HISTORY_ZH),
    ],
    familyHistory:
      lang === "en"
        ? ["Father: high blood pressure", "Mother: type 2 diabetes", "No confirmed inherited disease in the family"]
        : ["父亲 高血压", "母亲 2 型糖尿病", "家里没有已确诊的遗传病"],
    allergies: [
      t(
        "吃虾后皮肤发痒、起风团（没做过过敏原检测；没发现药物过敏）",
        "Itchy skin and hives after eating shrimp (never had an allergy test; no drug allergy noticed)",
      ),
    ],
    // 长期吃的降压药还没核对，不替他写
    medications: [],
    surgeries: [t(SURGERY_ZH, SURGERY_EN)],
    notes: "",
    emergencyContact: null,
    createdAt: at(-30, 9),
    updatedAt: at(-30, 9),
  };


  // 他自己打开的两个单次提醒；这次没加药，长期药也没核对，所以没有吃药提醒
  const reminders: Reminder[] = [
    {
      id: ID.eveReminder,
      todoId: ID.eveTodo,
      episodeId: "lin-r010",
      text: t("准备病历和药盒", "Prepare records and medicine boxes"),
      kind: "care",
      frequency: "once",
      at: at(6, 20),
      enabled: true,
      createdAt: at(0, 12),
      lastFiredAt: null,
    },
    {
      id: ID.dayReminder,
      todoId: ID.dayTodo,
      episodeId: "lin-r010",
      text: t(
        "复诊准备：骨科复诊，带以前的就诊资料和正在吃的药盒",
        "Follow-up prep: orthopaedics follow-up, bring previous records and current medicine boxes",
      ),
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
    // the ten records from the teammates' updated document; R002 and R010 replace the old script's two knee records
    episodes: reportEpisodes(now, lang),
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
