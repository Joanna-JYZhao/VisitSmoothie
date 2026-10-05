import { mentions } from "./utils";

/*
 * 口语到医生说法的对照表。患者说了口语词，下一轮先用大白话确认一次，确认了才在记录里写
 * 「医生的说法（患者原话：……）」。这里只做对照，不做判断：对上了也只是换个说法，不代表任何病。
 */

export interface Colloquial {
  /** 患者可能怎么说 */
  re: RegExp;
  /** 医生的说法 */
  term: string;
  /** 用来确认的大白话：「是{plain}吗？」 */
  plain: string;
  /** 这是在说「怎么个疼法 / 怎么个难受法」 */
  quality?: boolean;
}

export const COLLOQUIAL: Colloquial[] = [
  { re: /拧着疼|拧着痛|绞着疼|绞着痛|揪着疼|揪着痛|拧劲儿?疼/, term: "绞痛", plain: "一阵一阵拧着的那种疼", quality: true },
  { re: /一跳一跳|一蹦一蹦|突突地?跳|跳着疼|跳着痛|一抽一抽地?跳/, term: "搏动性疼痛", plain: "像心跳一样一下一下跳着疼", quality: true },
  { re: /火辣辣|火烧火燎|烧得慌|像火烧/, term: "烧灼感", plain: "像火烧一样辣辣的", quality: true },
  { re: /像针扎|针扎一样|针扎似的|扎着疼|扎着痛|像被扎/, term: "刺痛", plain: "像针扎一样一下一下的疼", quality: true },
  { re: /胀胀的|胀得慌|胀鼓鼓|鼓鼓的/, term: "胀痛", plain: "胀胀的、撑着的那种难受", quality: true },
  { re: /闷闷的|闷着疼|闷着痛|闷闷地疼/, term: "闷痛", plain: "闷闷的、压着的那种疼", quality: true },
  { re: /隐隐的|隐隐约约地?疼|一点点疼|丝丝拉拉/, term: "隐痛", plain: "不太重、隐隐约约一直在的疼", quality: true },
  { re: /酸酸的|酸溜溜|酸得慌|又酸又疼/, term: "酸痛", plain: "酸酸的、使不上劲的那种疼", quality: true },
  { re: /抽着疼|抽着痛|一抽一抽地?疼|扯着疼|扯着痛|牵着疼/, term: "牵扯痛", plain: "一动就扯着、抽着疼", quality: true },
  { re: /钝钝的|木木地疼/, term: "钝痛", plain: "钝钝的、说不上尖的疼", quality: true },
  { re: /像被压着|压着疼|压得慌|压着块石头/, term: "压迫感", plain: "像有东西压着", quality: true },
  { re: /头晕眼花/, term: "头晕伴视物模糊", plain: "头晕，同时看东西发花" },
  { re: /天旋地转|转圈圈|房子在转|东西在转/, term: "眩晕", plain: "觉得周围东西在转" },
  { re: /头重脚轻|脑袋发沉|头发沉/, term: "头昏沉", plain: "脑袋沉、站不稳的感觉" },
  { re: /眼前发黑|眼冒金星/, term: "黑矇", plain: "眼前突然一黑、看不见" },
  { re: /看东西模糊|看不清东西|眼睛花/, term: "视物模糊", plain: "看东西模模糊糊" },
  { re: /拉稀|窜稀|跑肚|水泻/, term: "腹泻", plain: "大便稀、次数多" },
  { re: /拉不出来|解不下来|好几天没大便/, term: "便秘", plain: "大便解不出来" },
  { re: /肚子咕噜咕噜|肚子咕咕叫/, term: "肠鸣", plain: "肚子里咕噜咕噜响" },
  { re: /心里发慌|心慌慌|心扑通扑通|心怦怦|心里扑腾/, term: "心悸", plain: "自己能感觉到心跳得慌" },
  { re: /喘不过气|上不来气|透不过气/, term: "呼吸困难", plain: "气不够用、喘不上来" },
  { re: /烧心|心口烧/, term: "反酸烧心", plain: "胸口后面像火烧，有时还泛酸水" },
  { re: /反胃|泛酸水|往上冒酸水/, term: "反酸", plain: "酸水往上冒" },
  { re: /恶心想吐|想吐又吐不出/, term: "恶心", plain: "想吐的感觉" },
  { re: /起疙瘩|起包|起红点|起红疹|长疙瘩/, term: "皮疹", plain: "皮肤上起了疙瘩或红点" },
  { re: /没劲|没力气|浑身发软|浑身软|身上软/, term: "乏力", plain: "浑身没力气" },
  { re: /嗓子冒烟|嗓子干/, term: "咽干", plain: "嗓子发干" },
  { re: /嗓子哑|说不出话|声音哑/, term: "声音嘶哑", plain: "嗓子哑了、声音变了" },
  { re: /嗓子里有东西|嗓子堵|喉咙堵/, term: "咽部异物感", plain: "嗓子里像有东西堵着" },
  { re: /鼻子不通气|鼻子堵/, term: "鼻塞", plain: "鼻子堵、不通气" },
  { re: /冒虚汗|出虚汗/, term: "多汗", plain: "没怎么动也出汗" },
  { re: /一阵冷一阵热|忽冷忽热|打摆子/, term: "寒战发热交替", plain: "一会儿发冷一会儿发热" },
  { re: /麻嗖嗖|像蚂蚁爬|针刺样麻|木木的/, term: "感觉异常（麻木、蚁走感）", plain: "麻麻的、像有蚂蚁在爬" },
  { re: /腿抽筋|脚抽筋|小腿抽筋/, term: "肌肉痉挛", plain: "肌肉突然抽紧、抽筋" },
  { re: /耳朵嗡嗡|耳朵里响|耳朵蝉叫/, term: "耳鸣", plain: "耳朵里嗡嗡响" },
  { re: /尿得勤|老想尿|总跑厕所|总想上厕所/, term: "尿频", plain: "小便次数多" },
  { re: /尿尿疼|撒尿疼|尿的时候疼|小便疼/, term: "尿痛", plain: "小便的时候疼" },
  { re: /睡不踏实|老是醒|睡不着觉/, term: "失眠", plain: "睡不着或者睡不踏实" },
  { re: /吃不下饭|不想吃饭|没胃口/, term: "食欲减退", plain: "不想吃东西" },
];

export interface ColloquialHit {
  /** 患者原话里的那几个字 */
  said: string;
  term: string;
  plain: string;
  quality: boolean;
}

/** 一句话里出现的口语说法（被否定的不算：「不是针扎那种」不算说了针扎）。 */
export function findColloquial(text: string): ColloquialHit[] {
  const out: ColloquialHit[] = [];
  for (const c of COLLOQUIAL) {
    const m = text.match(c.re);
    if (!m || !mentions(text, m[0])) continue;
    if (out.some((x) => x.term === c.term)) continue;
    out.push({ said: m[0], term: c.term, plain: c.plain, quality: c.quality === true });
  }
  return out;
}

/** 确认的问法：「是一阵一阵拧着的那种疼吗？医生管这个叫『绞痛』。」 */
export function confirmQuestion(hit: Pick<ColloquialHit, "term" | "plain">): string {
  return `是${hit.plain}吗？医生管这个叫『${hit.term}』。`;
}

/** 确认后写进记录的说法：「绞痛（患者原话：拧着疼）」 */
export function confirmedNote(hit: Pick<ColloquialHit, "term" | "said">): string {
  return `${hit.term}（患者原话：${hit.said}）`;
}

/** 确认问句里问的是哪个说法 */
export function termAsked(text: string): string | null {
  return text.match(/『([^』]+)』/)?.[1] ?? null;
}
