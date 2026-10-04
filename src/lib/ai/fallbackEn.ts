import type { ChatRequest, ChatResponse, Episode, Hint, Profile } from "../types";

/*
 * The English side of the rules, for when the app is in English. The Chinese rule engine reads
 * Chinese only, so in English:
 *  - danger signals are checked here, in English, before any model is asked (the same safety net);
 *  - with a model, the model runs the questions itself (the Chinese plan cannot read English answers);
 *  - without one, a plain list of questions is asked here, one at a time, until it is done;
 *  - the description for the doctor is put together here when there is no model to write it.
 */

/* ---------- danger signals ---------- */

const NOT = /\b(no|not|never|without|don't|doesn't|didn't|isn't|wasn't|haven't|hasn't)\b[^.,;!?]{0,20}$/i;
/** `re` matches in `text`, and not right after a "no" / "not" ("no chest pain" is not chest pain) */
function says(text: string, re: RegExp): boolean {
  for (const m of text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))) {
    if (!NOT.test(text.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0))) return true;
  }
  return false;
}

const CHEST = /chest (pain|tight|pressure|hurt|ache)|pain in (my|the) chest|tight chest/i;
const BREATH = /can'?t breathe|cannot breathe|short(ness)? of breath|hard to breathe|trouble breathing|struggling to breathe|out of breath|gasping/i;

const URGENT_EN: { re: RegExp; text: string }[] = [
  { re: BREATH, text: "Trouble breathing is a danger sign. Get medical help now or call 120." },
  { re: /faint(ed|ing)?|passed out|unconscious|won'?t wake|confus(ed|ion)|seizure|fit(s)? |convuls/i, text: "Fainting, confusion or a seizure is an emergency. Call 120 now." },
  { re: /vomit(ing|ed)? blood|throw(ing)? up blood|cough(ing|ed)? (up )?blood|blood in (my|the) (stool|poo|urine|pee)|black (stool|poo)|tarry stool|heavy bleeding/i, text: "Vomiting blood, blood in the stool or black stool is a danger sign. Go to the emergency department now." },
  { re: /unbearable|worst (pain|headache) (of my life|ever)|can'?t stand the pain|excruciating|tearing pain/i, text: "Don't put up with pain this bad. Go to the emergency department soon." },
  { re: /(39|40|41)(\.\d)?\s*(°|degrees|℃|c\b)|high fever (that )?(won'?t|doesn'?t) (go down|break)/i, text: "A temperature of 39 °C or more needs a doctor soon. Drink plenty on the way." },
  { re: /slurred speech|can'?t (speak|talk) (properly|clearly)|face (is )?droop|one side of (my|the) (body|face)|numb on one side|weak on one side|double vision/i, text: "Weakness or numbness on one side, slurred speech or double vision is a danger sign. Call 120 now." },
  { re: /(throat|lips?|tongue) (is |are )?(swell|swollen|tight)|hives all over|rash all over/i, text: "A swollen throat or lips, or a rash all over, is a danger sign. If your throat feels tight or you can't breathe, call 120 now." },
  { re: /pregnan[a-z]* .{0,30}(bleed|pain)|(bleed|pain).{0,30}pregnan/i, text: "Pain or bleeding in pregnancy: go to the obstetric emergency department now." },
];

/** A danger signal in an English sentence, or null. */
export function urgentEn(text: string): Hint | null {
  if (says(text, CHEST) && says(text, BREATH)) {
    return { level: "urgent", text: "Chest discomfort together with trouble breathing is a danger sign. Call 120 or go to the emergency department now. Don't drive yourself." };
  }
  for (const u of URGENT_EN) if (says(text, u.re)) return { level: "urgent", text: u.text };
  return null;
}

/* ---------- the questions, without a model ---------- */

interface StepEn {
  key: string;
  /** written into the record as "label: answer" */
  label: string;
  question: string;
  quick: string[];
  /** already said in the patient's own words */
  said: RegExp;
  widget?: "bodymap";
}

const STEPS_EN: StepEn[] = [
  { key: "onset", label: "Started", question: "When did it start?", quick: ["Today", "Yesterday", "A few days ago", "Over a week ago"], said: /\b(since|started|began|ago|yesterday|today|this morning|last (night|week|month)|for \d+|days?|weeks?)\b/i },
  { key: "location", label: "Location", question: "Where exactly is it? You can tap it on the picture below.", quick: ["Not sure"], said: /^location:|\b(left|right|inner|outer|front|back|upper|lower|middle)\b/i, widget: "bodymap" },
  { key: "quality", label: "Feels like", question: "What does it feel like?", quick: ["Aching", "Sharp", "Throbbing", "Burning"], said: /\b(ach(e|ing)|sharp|stab|throb|burn|dull|cramp|pressure|tight|sore|sting|pulling)\b/i },
  { key: "severity", label: "How bad", question: "How bad is it right now?", quick: ["A little", "Quite bad", "Very bad"], said: /\b(a little|mild|quite bad|very bad|severe|terrible|unbearable|\d+\s*(\/|out of)\s*10)\b/i },
  { key: "worse", label: "Worse when", question: "When is it worse?", quick: ["When moving", "At night", "After eating", "No pattern"], said: /\bworse\b|\bwhen i\b|\bafter (eating|meals|walking)\b|\bat night\b/i },
  { key: "relief", label: "Better with", question: "What makes it better?", quick: ["Rest", "Heat", "Medicine", "Nothing so far"], said: /\b(better|eases?|relie(f|ves?)|helps?)\b/i },
  { key: "associated", label: "Also has", question: "Is anything else wrong at the same time?", quick: ["Nothing else", "Fever", "Nausea", "Dizziness"], said: /\b(nothing else|also|as well|fever|nausea|vomit|dizz|cough|swollen|numb)\b/i },
  { key: "measures", label: "Medicines taken", question: "Have you taken anything for it?", quick: ["No medicine", "Took medicine"], said: /\b(took|taken|taking|medicine|medication|pills?|tablets?|ibuprofen|paracetamol|cream|plaster|nothing for it)\b/i },
  { key: "history", label: "Before", question: "Has this happened before?", quick: ["First time", "It has before"], said: /\b(first time|before|again|used to|happened)\b/i },
];

const STOP_EN = /\b(that'?s (all|it)|that is all|enough|stop asking|no more questions|nothing more)\b/i;
const PAIN_EN = /\b(pain|hurts?|ache|aching|sore)\b/i;

export const EN_CLOSE =
  "Got it, I've written it all down. If it gets clearly worse, or you have trouble breathing or feel confused, get medical help right away.";

/** One turn of the conversation by rule, in English: the next question not yet answered, or the close. */
export function fallbackChatEn(req: ChatRequest): ChatResponse {
  const users = req.messages.filter((m) => m.role === "user").map((m) => m.content.trim());
  const assistants = req.messages.filter((m) => m.role === "assistant").map((m) => m.content);
  const last = users[users.length - 1] ?? "";
  const first = req.kind === "intake" || users.length <= 1;
  const all = [req.episode.title, ...users].join("\n");
  const urgent = urgentEn(last);
  // the answer to the question just asked goes on the record as "label: answer"
  const askedBefore = STEPS_EN.find((s) => assistants.length && assistants[assistants.length - 1].includes(s.question));
  const entry = !first && last ? { severity: severityOf(last), exact: /\d\s*(\/|out of)\s*10/i.test(last), temperature: null, note: askedBefore ? `${askedBefore.label}: ${last}`.slice(0, 120) : last.slice(0, 120), location: askedBefore?.key === "location" ? last.replace(/^location:\s*/i, "") : null } : null;
  const base = {
    mode: "fallback" as const,
    entry,
    tags: [],
    measurements: [],
    title: first ? titleEn(users[0] ?? req.episode.title) : null,
    onsetHoursAgo: null,
  };
  if (urgent) return { ...base, reply: "Got it. This needs attention right now. Please read the red note below.", suggestedReplies: ["I'm getting help now", "It has eased"], hint: urgent, done: false };
  if (req.kind === "checkin") return { ...base, reply: "Got it. I'll keep checking in. Tell me any time if it changes.", suggestedReplies: [], hint: null, done: true };
  const closed = assistants.some((a) => !/\?/.test(a));
  if (closed || STOP_EN.test(last)) return { ...base, reply: EN_CLOSE, suggestedReplies: [], hint: null, done: true };
  const pain = PAIN_EN.test(all);
  const next = STEPS_EN.find((s) => {
    if (s.key === "location" && !pain) return false;
    if (s.key === "quality" && !pain) return false;
    if (assistants.some((a) => a.includes(s.question))) return false;
    return !s.said.test(s.key === "location" ? users.join("\n") : all);
  });
  if (!next) return { ...base, reply: EN_CLOSE, suggestedReplies: [], hint: null, done: true };
  return { ...base, reply: `${first ? "Got it." : "Noted."} ${next.question}`, suggestedReplies: next.quick, hint: null, done: false, widget: next.widget ?? null };
}

function severityOf(text: string): number | null {
  const n = text.match(/(\d+)\s*(\/|out of)\s*10/i);
  if (n) return Math.min(10, Number(n[1]));
  if (/\bvery bad|severe|terrible|unbearable\b/i.test(text)) return 8;
  if (/\bquite bad|moderate\b/i.test(text)) return 6;
  if (/\ba little|mild|slight\b/i.test(text)) return 3;
  return null;
}

/** A short name for the complaint from the first sentence: "Left knee, inner side: aching" -> "Left knee, inner side aching". */
export function titleEn(said: string): string {
  const s = said.replace(/^location:\s*/i, "").replace(/[.!?]+$/, "").replace(/:\s*/, " ").trim();
  return s.length > 40 ? `${s.slice(0, 39)}…` : s || "Not feeling well";
}

/* ---------- the description, without a model ---------- */

/** The patient's description in English, by rule: "I'm 46. Since 27 Sep, left knee, inner side aching. Worse when: going upstairs. …" */
export function narrativeEn(episode: Pick<Episode, "title" | "startedAt" | "createdAt" | "entries">, profile: Pick<Profile, "birthYear" | "conditions" | "medications" | "allergies">): string {
  const age = profile.birthYear ? Math.max(0, new Date().getFullYear() - profile.birthYear) : null;
  const known = episode.startedAt !== episode.createdAt;
  const since = known ? `Since ${new Date(episode.startedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ` : "Recently, ";
  const lines = [`${age != null ? `I'm ${age}. ` : ""}${since}${episode.title.charAt(0).toLowerCase()}${episode.title.slice(1)}.`];
  const notes = [...episode.entries].sort((a, b) => a.at.localeCompare(b.at)).map((e) => e.note.trim()).filter((n, i) => n && i > 0);
  for (const n of notes) lines.push(/[.!?]$/.test(n) ? n : `${n}.`);
  if (profile.conditions.length) lines.push(`I have ${profile.conditions.join(", ")}.`);
  if (profile.medications.length) lines.push(`I take ${profile.medications.join(", ")} long term.`);
  if (profile.allergies.length) lines.push(`I'm allergic to ${profile.allergies.join(", ")}.`);
  return lines.join(" ");
}
