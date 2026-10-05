import type { EmergencyContact, Profile } from "./types";
import { L, pick } from "./lang";
import { GLUCOSE_LOW } from "./metrics";
import { ageOf } from "./utils";

/*
 * 应急手册: what to do when something happens, put together from the profile by plain rules.
 * No model is involved, so the page is there the instant it is opened and says the same thing
 * every time. The wording is general first-aid knowledge; it only describes what to do and
 * never names what the trouble might be, except for low blood sugar in someone with diabetes.
 *
 * Every sentence exists in Chinese and in English, step for step, with the same numbers. The
 * shared blocks read the language when they are read, never when this module loads.
 */

export interface SosBlock {
  /** which rule produced it, for tests and keys */
  key: string;
  title: string;
  /** one line of background for whoever is helping */
  why?: string;
  steps: string[];
}

export interface SosSelfGroup {
  key: string;
  title: string;
  items: string[];
}

export interface SosPlan {
  /** "林叔，男，46 岁" */
  who: string;
  bloodType: string | null;
  /** the note says so: it goes on the first screen, where whoever helps will see it */
  pregnant: boolean;
  conditions: string[];
  allergies: string[];
  medications: string[];
  contact: EmergencyContact | null;
  /**
   * What a bystander reads, in order: the steps for someone who has collapsed, then a block for
   * each condition. With epilepsy that block comes before the collapse steps, because a seizure
   * is the thing a bystander is most likely to be looking at.
   */
  blocks: SosBlock[];
  /** for the person themselves: when to go at once */
  self: SosSelfGroup[];
}

const RULES = {
  // people often write the brand on the box: 格华止 is metformin, 诺和…/优泌…/来得时/甘舒霖 are insulins
  diabetes: /糖尿病|血糖高|胰岛素|二甲双胍|格列|降糖|格华止|拜糖平|诺和|优泌|来得时|甘舒霖/,
  hypertension: /高血压|血压高|降压|沙坦|地平|洛尔|普利/,
  stroke: /脑梗|中风|脑卒中|脑出血|脑血栓/,
  heart: /冠心病|心脏病|心梗|心肌梗|心绞痛|房颤|心衰|心力衰竭|心律/,
  // operations on the heart, spelled out: a bare "支架" may be a ureteral or biliary stent
  heartSurgery: /心脏支架|冠脉支架|冠状动脉支架|心脏搭桥|冠脉搭桥|搭桥手术|起搏器|心脏瓣膜|换瓣|心脏手术/,
  epilepsy: /癫痫|羊癫疯|羊角风/,
  asthma: /哮喘|慢阻肺|肺气肿/,
  // brands as on the box: 拜阿司匹灵 aspirin, 波立维/泰嘉 clopidogrel, 倍林达 ticagrelor,
  // 拜瑞妥 rivaroxaban, 泰毕全 dabigatran, 艾乐妥 apixaban
  thinner: /华法林|利伐沙班|达比加群|阿哌沙班|氯吡格雷|阿司匹林|替格瑞洛|抗凝|拜阿司匹灵|波立维|泰嘉|倍林达|拜瑞妥|泰毕全|艾乐妥/,
  // "备孕期" is someone hoping to be pregnant, not someone who is
  pregnant: /怀孕|(?<!备)孕期|孕\s*\d+\s*周|怀着/,
} as const;

/** The closing line, in Chinese. Kept as it was for comparisons; show `notSure()` instead. */
export const NOT_SURE = "拿不准的时候，直接打 120 问，接线员会告诉你怎么做。";

/** The closing line of the page and of the copied text, in the language being shown. */
export function notSure(): string {
  return L(NOT_SURE, "If you are not sure, call 120 and ask. The operator will tell you what to do.");
}

const COLLAPSE_TEXT = {
  zh: {
    title: "如果我晕倒了、叫不醒",
    steps: [
      "拍拍我的肩膀，大声叫我，看我有没有反应。",
      "没有反应：马上拨打 120，说清楚在哪里，同时请旁边的人去找自动体外除颤器（除颤仪）。",
      "看我的胸口有没有起伏。有呼吸就让我侧躺，松开领口，守着我；不要喂水、喂药、喂吃的。",
      "没有呼吸，或者只是偶尔喘一下：马上做胸外按压。两手叠在一起，按在胸口正中，用力往下按，每分钟 100 到 120 次，不要停。除颤仪拿来了就打开，照它说的做。",
      "急救人员到了，把这一页给他们看。",
    ],
  },
  en: {
    title: "If I collapse and you cannot wake me",
    steps: [
      "Tap my shoulders and shout to me. See if I respond.",
      "If I do not respond: call 120 now and tell them exactly where we are. At the same time, ask someone nearby to bring an AED (defibrillator).",
      "Look at my chest to see if it moves. If I am breathing, lay me on my side, loosen my collar and stay with me. Do not give me water, medicine or food.",
      "If I am not breathing, or only gasp now and then: start chest compressions now. Put one hand on top of the other. Press hard and fast on the centre of my chest, 100 to 120 times a minute. Do not stop. When the AED arrives, turn it on and do what it says.",
      "When the ambulance crew arrives, show them this page.",
    ],
  },
};

/** The same steps for anyone who has collapsed, whatever the reason, in the language being shown. */
export const COLLAPSE: SosBlock = {
  key: "collapse",
  get title() {
    return pick(COLLAPSE_TEXT.zh, COLLAPSE_TEXT.en).title;
  },
  get steps() {
    return pick(COLLAPSE_TEXT.zh, COLLAPSE_TEXT.en).steps;
  },
};

/** In the general list. For someone with epilepsy, seizures are left to their own group. */
const OUT_COLD = { zh: "神志不清、晕倒、抽搐", en: "Confused, fainting or having a seizure" };
const OUT_COLD_EPILEPSY = { zh: "神志不清、晕倒", en: "Confused or fainting" };

const SIGNS = {
  call: {
    zh: {
      title: "马上拨打 120",
      items: [
        "胸口痛或闷，尤其是同时喘不上气、出冷汗",
        "突然嘴歪、一边手脚没力气或发麻、说话不清楚",
        "突然头痛得特别厉害",
        "喘不上气，嘴唇发紫",
        OUT_COLD.zh,
        "嘴唇或喉咙肿了，全身起疹子",
      ],
    },
    en: {
      title: "Call 120 now",
      items: [
        "Chest pain or tightness, especially with trouble breathing or a cold sweat",
        "Suddenly a drooping mouth, weakness or numbness in the arm or leg on one side, or unclear speech",
        "A sudden, very bad headache",
        "Struggling to breathe, lips turning blue",
        OUT_COLD.en,
        "Swollen lips or throat, a rash all over the body",
      ],
    },
  },
  er: {
    zh: {
      title: "尽快去急诊",
      items: ["吐血，大便发黑或带血", "烧到 39 度以上，一直退不下来", "肚子痛得越来越厉害", "受伤后血止不住"],
    },
    en: {
      title: "Go to the emergency room soon",
      items: [
        "Vomiting blood, or black or bloody stools",
        "A fever of 39 °C or higher that will not come down",
        "Stomach pain that keeps getting worse",
        "Bleeding from an injury that will not stop",
      ],
    },
  },
};

const signs = (key: keyof typeof SIGNS): SosSelfGroup => ({
  key,
  get title() {
    return pick(SIGNS[key].zh, SIGNS[key].en).title;
  },
  get items() {
    return pick(SIGNS[key].zh, SIGNS[key].en).items;
  },
});

/** Danger signs that hold for everyone. The first group means 120, the second the emergency room. */
export const GENERAL_SIGNS: SosSelfGroup[] = [signs("call"), signs("er")];

/** The general signs for this person: with epilepsy, a seizure is covered by their own group. */
function generalSigns(epilepsy: boolean): SosSelfGroup[] {
  if (!epilepsy) return GENERAL_SIGNS;
  const from = pick(OUT_COLD.zh, OUT_COLD.en);
  const to = pick(OUT_COLD_EPILEPSY.zh, OUT_COLD_EPILEPSY.en);
  return GENERAL_SIGNS.map((g) => ({ ...g, items: g.items.map((x) => (x === from ? to : x)) }));
}

/** "家人" is what the profile form stores when no name was given: data, shown in the reader's words. */
export function contactName(name: string): string {
  return name === "家人" ? L("家人", "family") : name;
}

/* ---------- reading the profile without putting words in the person's mouth ---------- */

/** A clause about someone else ("妈妈有糖尿病") says nothing about this person. */
const FAMILY = /爸|妈|父|母|爷|奶|外公|外婆|姥|哥|姐|弟|妹|儿子|女儿|孩子|老公|丈夫|妻子|爱人|老伴|亲戚|家里人|家族|遗传/;
/** A word turned around by what comes right before it: "没有怀孕", "不吃降压药", "准备怀孕". */
const DENIED_BEFORE = /(没|未|无|不|否认|计划|打算|准备|想)[有得患是在吃用过要再]*$/;
/** A clause that opens with a denial covers its whole list: "没有高血压、糖尿病". */
const DENIED_CLAUSE = /^\s*我?(没|未|无|否认)/;
// a bracket starts a new clause too: "2 型糖尿病（母亲也有）" is still the person's own diabetes
const CLAUSE = /[，,。；;！!？?\n（）()]/;
/** List entries that say there is nothing: "无", "没有过敏", "否认药物过敏史". */
const NOTHING = /^(无|没|没有|都没有|暂无|否认|不详|不知道|不清楚|none|null)(已知的?)?(药物|食物)?(过敏|过敏史|病史|慢性病)?$/i;

/**
 * Whether the person's own words say they have it. The note is free text, so a relative's
 * illness or a denial written there must not put something on this page they never said.
 */
function mentioned(text: string, rule: RegExp): boolean {
  const all = new RegExp(rule.source, "g");
  for (const clause of text.split(CLAUSE)) {
    if (FAMILY.test(clause) || DENIED_CLAUSE.test(clause)) continue;
    // exec resets lastIndex to 0 when it runs out, so the regex is ready for the next clause
    for (let m = all.exec(clause); m; m = all.exec(clause)) {
      if (!DENIED_BEFORE.test(clause.slice(0, m.index))) return true;
    }
  }
  return false;
}

const listed = (xs: string[] | undefined) => (xs ?? []).map((x) => x.trim()).filter((x) => x && !NOTHING.test(x));

type SosSource = Pick<Profile, "conditions" | "medications" | "notes"> & Partial<Pick<Profile, "surgeries">>;

/** The three places a condition can show: what they said, what they take, what was done to them. */
function sources(profile: SosSource) {
  return {
    said: [...listed(profile.conditions), profile.notes ?? ""].join("\n"),
    meds: listed(profile.medications).join("\n"),
    ops: listed(profile.surgeries).join("\n"),
  };
}

export function sosFlags(profile: SosSource) {
  const { said, meds, ops } = sources(profile);
  // a condition counts when the person said so, or when they take a medicine used for it
  const has = (rule: RegExp) => mentioned(said, rule) || rule.test(meds);
  return {
    diabetes: has(RULES.diabetes),
    hypertension: has(RULES.hypertension),
    stroke: has(RULES.stroke),
    heart: has(RULES.heart) || mentioned(said, RULES.heartSurgery) || mentioned(ops, RULES.heartSurgery),
    epilepsy: has(RULES.epilepsy),
    asthma: has(RULES.asthma),
    // only the note: a past "孕期糖尿病" among the conditions does not mean pregnant now
    pregnant: mentioned(profile.notes ?? "", RULES.pregnant),
  };
}

/** Medicines on file that make bleeding harder to stop, by name only: the dose is on the medicine list. */
export function bloodThinners(medications: string[]): string[] {
  return listed(medications)
    .filter((m) => RULES.thinner.test(m))
    .map((m) => m.replace(/[（(].*$/, "").replace(/\s.*$/, "").replace(/\d.*$/, "").trim() || m);
}

/** "I have diabetes" → "Because I have diabetes"; "My blood pressure is high" → "Because my blood pressure is high". */
function because(title: string): string {
  return L(`因为${title}`, `Because ${title.startsWith("I ") ? title : title.charAt(0).toLowerCase() + title.slice(1)}`);
}

export function buildSos(profile: Profile): SosPlan {
  const flags = sosFlags(profile);
  const { said, meds } = sources(profile);
  const allergies = listed(profile.allergies);
  const blocks: SosBlock[] = [];
  const self: SosSelfGroup[] = [];

  // Titles use the person's own word for it. Known only from a medicine, it says the medicine;
  // known only from an operation, it says the operation. The page must not tell a stranger
  // "我有糖尿病" or "我有心脏病" when the person never said so.
  const sugar = mentioned(said, /糖尿病/)
    ? L("我有糖尿病", "I have diabetes")
    : mentioned(said, /血糖高/)
      ? L("我血糖高", "I have high blood sugar")
      : L("我在用降糖药", "I take diabetes medicine");
  const bpSaid = mentioned(said, /高血压/) || mentioned(said, /血压高/);
  const pressure = mentioned(said, /高血压/)
    ? L("我有高血压", "I have high blood pressure")
    : mentioned(said, /血压高/)
      ? L("我血压高", "My blood pressure is high")
      : L("我在吃降压药", "I take blood pressure medicine");
  const heart =
    mentioned(said, RULES.heart) || RULES.heart.test(meds) ? L("我有心脏病", "I have heart disease") : L("我的心脏做过手术", "I have had heart surgery");

  if (flags.diabetes) {
    blocks.push({
      key: "diabetes",
      title: sugar,
      why: L(
        "如果我晕倒、出冷汗、手抖、说胡话，可能是血糖太低；血糖太高也会让人迷糊。",
        "If I faint, sweat, shake or talk nonsense, my blood sugar may be too low. Blood sugar that is too high can also make a person confused.",
      ),
      steps: [
        L(
          "我还清醒、能咽东西：给我吃糖。四五块糖，或者半杯果汁、含糖饮料都行。过 15 分钟没好转，再吃一次。",
          "If I am awake and can swallow: give me sugar. 4 or 5 sweets (candies), or half a glass of juice or a sugary drink. If I am not better after 15 minutes, give me sugar again.",
        ),
        L(
          "我叫不醒，或者咽不下去：不要往我嘴里放任何东西，让我侧躺，马上拨打 120。",
          "If you cannot wake me, or I cannot swallow: do not put anything in my mouth. Lay me on my side and call 120 now.",
        ),
        L("不要给我打胰岛素，也不要喂我降糖药。", "Do not give me insulin or any diabetes medicine."),
        L("我缓过来以后，也请陪我去医院看一下，或者联系我的家人。", "When I feel better, please still take me to a hospital for a check, or contact my family."),
      ],
    });
    self.push({
      key: "diabetes",
      title: because(sugar),
      // the English names the unit: some English readers count blood sugar in mg/dL, where 3.9 would be read wrong
      items: [
        L(
          `血糖低于 ${GLUCOSE_LOW}：马上吃 15 克糖（四五块糖，或者半杯果汁、含糖饮料），15 分钟后再测。还低就再吃一次；吃了两次还是低，去医院。`,
          `Blood sugar below ${GLUCOSE_LOW} mmol/L: eat 15 grams of sugar now, such as 4 or 5 sweets (candies), or half a glass of juice or a sugary drink. Test again after 15 minutes. If it is still low, eat sugar again. If it is still low after two times, go to hospital.`,
        ),
        L(
          "血糖到 16.7 以上，同时恶心呕吐、肚子痛、喘气又深又快，或者人迷糊了：马上去医院。",
          "Blood sugar 16.7 mmol/L or higher, with feeling sick or vomiting, stomach pain, deep fast breathing, or confusion: go to hospital now.",
        ),
        L("血糖连着两三次都在 13.9 以上：尽快联系医生。", "Blood sugar 13.9 mmol/L or higher two or three times in a row: contact your doctor soon."),
        L(
          "脚上的伤口红肿、流脓、发黑，或者突然看东西模糊：尽快去医院。",
          "A wound on the foot that is red and swollen, has pus or turns black, or sudden blurred vision: go to hospital soon.",
        ),
        L(
          "发烧、拉肚子、吃不下东西的那几天：多测几次血糖，药怎么吃先问医生。",
          "On days with fever or diarrhoea, or when you cannot eat: test your blood sugar more often, and ask your doctor how to take your medicine.",
        ),
      ],
    });
  }

  if (flags.hypertension || flags.stroke) {
    blocks.push({
      key: "pressure",
      title: flags.hypertension && (bpSaid || !flags.stroke) ? pressure : L("我以前有过脑血管的病", "I have had a stroke before"),
      steps: [
        L(
          "我突然嘴歪、一边手脚没力气或发麻、说话不清楚：马上拨打 120，记下是几点开始的。",
          "If my mouth suddenly droops, my arm or leg on one side goes weak or numb, or my speech is unclear: call 120 now. Note the time it started.",
        ),
        L(
          "等救护车的时候：让我躺下或半躺；如果我吐了，把我的头偏向一边；不要喂水、喂药、喂吃的。",
          "While you wait for the ambulance: let me lie down or half sit up. If I vomit, turn my head to one side. Do not give me water, medicine or food.",
        ),
        L("不要给我加吃降压药。", "Do not give me extra blood pressure medicine."),
      ],
    });
    if (flags.hypertension) {
      self.push({
        key: "pressure",
        title: because(pressure),
        items: [
          // either number on its own is enough, the same rule as the readings page
          L(
            "高压到 180 以上，或者低压到 110 以上：坐下休息 10 分钟再测。还是这么高，今天就去医院。",
            "Top number 180 or higher, or bottom number 110 or higher: sit down, rest for 10 minutes and measure again. If it is still this high, go to hospital today.",
          ),
          L(
            "血压高，同时头痛得厉害、胸闷、看东西模糊或手脚没力气：马上拨打 120。",
            "High blood pressure with a bad headache, chest tightness, blurred vision, or weak arms or legs: call 120 now.",
          ),
        ],
      });
    }
  }

  if (flags.heart) {
    blocks.push({
      key: "heart",
      title: heart,
      steps: [
        L(
          "我胸口痛或闷、出冷汗、喘不上气：让我马上停下来，坐着或半躺着，拨打 120。不要让我自己走去医院。",
          "If I have chest pain or tightness, a cold sweat, or I cannot catch my breath: make me stop at once and sit or half lie down. Call 120. Do not let me walk to the hospital.",
        ),
        L(
          "我身上带着医生开的急救药的话，帮我拿出来，由我自己按医生说的用。",
          "If I carry emergency medicine from my doctor, get it out for me. Let me take it myself, the way my doctor said.",
        ),
        L(
          "我没有反应、没有呼吸：马上做胸外按压，请旁边的人去找自动体外除颤器（除颤仪）。除颤仪拿来了就打开，照它说的做。",
          "If I do not respond and am not breathing: start chest compressions now, and ask someone nearby to bring an AED. When the AED arrives, turn it on and do what it says.",
        ),
      ],
    });
    self.push({
      key: "heart",
      title: because(heart),
      items: [
        L(
          "胸口痛或闷，休息几分钟也不见好，或者痛到左胳膊、下巴、后背：马上拨打 120，不要自己开车。",
          "Chest pain or tightness that does not go away after a few minutes of rest, or pain that spreads to the left arm, jaw or back: call 120 now. Do not drive yourself.",
        ),
        L("心跳突然特别快、特别乱，同时头晕、眼前发黑：马上就医。", "Heartbeat suddenly very fast or very irregular, with dizziness or vision going dark: get medical help now."),
      ],
    });
  }

  if (flags.epilepsy) {
    blocks.push({
      key: "epilepsy",
      title: L("我有癫痫", "I have epilepsy"),
      steps: [
        L(
          "我抽搐的时候：记下是几点开始抽的。不要按住我，不要往我嘴里塞任何东西。把旁边的硬东西挪开，在我头下面垫点软的。",
          "While I am having a seizure: note the time it started. Do not hold me down. Do not put anything in my mouth. Move hard objects away and put something soft under my head.",
        ),
        L("抽完以后：让我侧躺，陪着我，直到我清醒。", "After the seizure: lay me on my side and stay with me until I am fully awake."),
        L(
          "抽了 5 分钟还不停，或者一次接着一次，或者抽完一直叫不醒：马上拨打 120。",
          "If the seizure is still going after 5 minutes, or one seizure follows another, or I do not wake up afterwards: call 120 now.",
        ),
      ],
    });
    self.push({
      key: "epilepsy",
      title: L("因为我有癫痫", "Because I have epilepsy"),
      items: [L("发作比平时久，或者一天里发作好几次：马上就医。", "A seizure that lasts longer than usual, or several seizures in one day: get medical help now.")],
    });
  }

  if (flags.asthma) {
    blocks.push({
      key: "asthma",
      title: L("我的肺不好，容易喘", "My lungs are weak and I get breathless easily"),
      steps: [
        L("我喘得厉害的时候：扶我坐直，不要让我躺下，松开领口。", "When I am very short of breath: help me sit up straight. Do not let me lie down. Loosen my collar."),
        L("帮我找随身带的吸入药，由我自己用。", "Find the inhaler I carry and let me use it myself."),
        L(
          "嘴唇发紫、说不出整句话，或者用了药也不见好：马上拨打 120。",
          "If my lips turn blue, I cannot finish a sentence, or the medicine does not help: call 120 now.",
        ),
      ],
    });
    self.push({
      key: "asthma",
      title: L("因为我容易喘", "Because I get breathless easily"),
      items: [L("用了平时的吸入药还是喘，说话都费劲：马上就医。", "Still breathless after the usual inhaler, and even talking is hard: get medical help now.")],
    });
  }

  if (allergies.length) {
    blocks.push({
      key: "allergy",
      title: L(`我对${allergies.join("、")}过敏`, `I am allergic to ${allergies.join(", ")}`),
      steps: [
        L("请告诉急救人员和医生，不要给我用这些。", "Please tell the ambulance crew and the doctors. Do not give me these."),
        L(
          "如果我嘴唇或喉咙肿了、全身起疹子、喘不上气：马上拨打 120。",
          "If my lips or throat swell, I get a rash all over, or I cannot breathe: call 120 now.",
        ),
      ],
    });
  }

  const thinners = bloodThinners(profile.medications);
  if (thinners.length) {
    blocks.push({
      key: "thinner",
      title: L("我在吃让血不容易止住的药", "I take medicine that makes bleeding hard to stop"),
      steps: [
        L(
          `我在吃${thinners.join("、")}。我受伤出血时，请用干净的布用力按住伤口，并告诉急救人员。`,
          `I take ${thinners.join(", ")}. If I am hurt and bleeding, press hard on the wound with a clean cloth, and tell the ambulance crew.`,
        ),
      ],
    });
  }

  if (flags.pregnant) {
    self.push({
      key: "pregnant",
      title: L("因为我怀孕了", "Because I am pregnant"),
      items: [L("肚子痛、出血，或者胎动明显变少：马上去产科急诊。", "Belly pain, bleeding, or the baby moving much less than usual: go to a maternity emergency unit now.")],
    });
  }

  const contact = profile.emergencyContact;
  const age = ageOf(profile.birthYear);
  // the stored gender is data ("男"/"女"); only its wording changes with the language
  const gender = profile.gender === "男" ? L("男", "male") : profile.gender === "女" ? L("女", "female") : "";
  return {
    who: [profile.name, gender, L(`${age} 岁`, `${age} years old`)].filter(Boolean).join(L("，", ", ")),
    bloodType: profile.bloodType ? L(`${profile.bloodType} 型`, profile.bloodType) : null,
    pregnant: flags.pregnant,
    conditions: listed(profile.conditions),
    allergies,
    medications: listed(profile.medications),
    contact: contact && contact.phone.trim() ? contact : null,
    // a seizure is what a bystander is most likely to be looking at, so that block leads
    blocks: [...blocks.filter((b) => b.key === "epilepsy"), COLLAPSE, ...blocks.filter((b) => b.key !== "epilepsy")],
    self: [...self, ...generalSigns(flags.epilepsy)],
  };
}

/**
 * Digits only, for a tel: link ("138 0000 0002" → "13800000002"). Only the first number counts:
 * an extension or a second number after it ("转 8008", "/ 139…") would otherwise be run into it
 * and dial somebody else.
 */
export function dialable(phone: string): string {
  const first = /[+\d][\d\s\-–—()（）.]*/.exec(phone)?.[0] ?? "";
  return first.replace(/[^\d+]/g, "");
}

/**
 * The whole page as plain text, for copying to a family member, in the same order as the page.
 * Without a profile it is the general part only: nothing about who the person is, and no claim
 * that they have no allergies.
 */
export function sosToText(plan: SosPlan | null): string {
  const out: string[] = [L("【医伴 · 应急手册】", "[Yiban · Emergency guide]")];
  if (plan) {
    out.push(
      L(`我是：${plan.who}${plan.bloodType ? `，${plan.bloodType}血` : ""}`, `I am ${plan.who}${plan.bloodType ? `, blood type ${plan.bloodType}` : ""}`),
    );
    if (plan.pregnant) out.push(L("我怀孕了", "I am pregnant"));
    if (plan.conditions.length) out.push(L(`我有：${plan.conditions.join("、")}`, `I have: ${plan.conditions.join(", ")}`));
    out.push(
      L(
        `过敏：${plan.allergies.length ? plan.allergies.join("、") : "没有已知的过敏"}`,
        `Allergies: ${plan.allergies.length ? plan.allergies.join(", ") : "no known allergies"}`,
      ),
    );
    if (plan.medications.length) out.push(L(`长期在吃的药：${plan.medications.join("、")}`, `Regular medicines: ${plan.medications.join(", ")}`));
    const c = plan.contact;
    if (c) {
      out.push(
        L(
          `紧急联系人：${c.relation ? `${c.relation} ` : ""}${c.name} ${c.phone}`,
          `Emergency contact: ${c.relation ? `${c.relation} ` : ""}${contactName(c.name)} ${c.phone}`,
        ),
      );
    }
  }
  for (const b of plan?.blocks ?? [COLLAPSE]) {
    out.push("", b.title);
    if (b.why) out.push(b.why);
    b.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`));
  }
  out.push("", L("—— 下面是给我自己看的 ——", "—— The rest is for me ——"), L("这些情况，不要等", "Do not wait if this happens"));
  for (const g of plan?.self ?? GENERAL_SIGNS) {
    out.push(L(`${g.title}：`, `${g.title}:`));
    g.items.forEach((s) => out.push(`- ${s}`));
  }
  out.push(
    "",
    notSure(),
    plan
      ? L("（按档案生成的急救常识，不能代替医生。）", "(First-aid advice made from my record. It does not replace a doctor.)")
      : L("（通用的急救常识，不能代替医生。）", "(General first-aid advice. It does not replace a doctor.)"),
  );
  return out.join("\n");
}
