export type Gender = "男" | "女" | "其他";
/** The language of the interface and of what the assistant says. */
export type Lang = "zh" | "en";

/** Who to call when something happens. Shown on the emergency page with a call button. */
export interface EmergencyContact {
  name: string;
  /** 女儿、丈夫、朋友… */
  relation: string;
  phone: string;
}

export interface Profile {
  name: string;
  gender: Gender;
  birthYear: number;
  heightCm?: number | null;
  weightKg?: number | null;
  bloodType?: string | null;
  conditions: string[];
  allergies: string[];
  medications: string[];
  surgeries: string[];
  familyHistory: string[];
  notes?: string;
  emergencyContact?: EmergencyContact | null;
  /** 学历. Only used to pitch how plainly things are explained; never shown to a doctor. */
  education?: string | null;
  /** date of birth, YYYY-MM-DD. birthYear is kept in step with it for everything that reads the year. */
  birthDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A symptom is tracked until the user says they are well. Seeing a doctor does not end it. */
export type EpisodeStatus = "active" | "resolved";
export type EntrySource = "user" | "checkin" | "ai";

export interface Entry {
  id: string;
  at: string;
  /** 0-10. An estimate from the user's words unless `exact` is true. */
  severity: number | null;
  /** true only when the user stated the score themselves */
  exact?: boolean;
  /** body temperature in °C, when the user gave one */
  temp?: number | null;
  note: string;
  location?: string | null;
  source: EntrySource;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  kind?: "checkin" | "intake" | "followup";
}

export type HintLevel = "info" | "warn" | "urgent";
export interface Hint {
  level: HintLevel;
  text: string;
}

export type AiMode = "glm" | "fallback";

export interface DoctorSummaryBody {
  /** up to four short lines a doctor must see first */
  glance: string[];
  chiefComplaint: string;
  presentIllness: string;
  timeline: { time: string; event: string }[];
  currentStatus: string;
  relevantHistory: string[];
  priorSimilar: string[];
  hints: Hint[];
  questionsForDoctor: string[];
}

export interface DoctorSummary extends DoctorSummaryBody {
  generatedAt: string;
  mode: AiMode;
}

export interface VisitRecord {
  date: string;
  hospital?: string;
  department?: string;
  diagnosis: string;
  treatment: string;
  advice?: string;
  findings?: string[];
  archiveSummary?: string;
  /** what the doctor said about coming back */
  followUp?: string | null;
  /** when to remind the user about it */
  followUpAt?: string | null;
  mode?: AiMode;
  recordedAt: string;
}

export interface Episode {
  id: string;
  title: string;
  tags: string[];
  status: EpisodeStatus;
  startedAt: string;
  createdAt: string;
  updatedAt: string;
  lastCheckInAt: string;
  snoozedUntil?: string | null;
  entries: Entry[];
  messages: ChatMessage[];
  lastHint?: Hint | null;
  /** when that hint was given: yesterday's advice must not sit on today's screen as if it were new */
  lastHintAt?: string | null;
  suggestedReplies?: string[];
  /** the assistant has finished its questions for now */
  done?: boolean;
  summary?: DoctorSummary | null;
  visit?: VisitRecord | null;
  resolvedAt?: string | null;
  relatedEpisodeIds: string[];
}

/* ---------- health metrics, follow-up visits, yearly summary ---------- */

export type MetricType = "fbg" | "ppg" | "hba1c" | "weight" | "bp";
export type MeasurementSource = "user" | "visit" | "ai";

export interface Measurement {
  id: string;
  type: MetricType;
  /** fbg / ppg: mmol/L; hba1c: %; weight: kg; bp: systolic mmHg */
  value: number;
  /** bp only: diastolic mmHg */
  value2?: number | null;
  at: string;
  note?: string;
  source: MeasurementSource;
}

/** A doctor visit that is not about one tracked symptom (定期复查、年度复诊…). */
export interface FollowUp {
  id: string;
  date: string;
  hospital?: string;
  department?: string;
  reason: string;
  findings: string;
  plan: string;
  advice?: string;
  /** the archive paragraph: everything the doctor said, including remarks like "控制得不错" */
  summary?: string;
  recordedAt: string;
}

/** One health check-up (体检): what the report flagged, kept as the starting point of the record. */
export interface Checkup {
  id: string;
  date: string;
  /** the report's own date could not be read: `date` is then the day it was filed */
  undated?: boolean;
  institution?: string;
  /** items the report itself marked as out of range or wrote into its conclusion */
  abnormal: string[];
  /** the report's closing advice, as printed */
  advice?: string;
  recordedAt: string;
}

/** One question to 问医伴 and its answer. */
export interface AskTurn {
  id: string;
  at: string;
  question: string;
  answer: string;
  /** the records the answer rests on, so each claim can be opened and checked; `text` is the record as it stood then */
  sources: { label: string; href: string; text?: string }[];
  hint?: Hint | null;
  mode: AiMode;
}

export interface Insight {
  kind: "low" | "streak" | "recent" | "trend" | "overdue";
  level: HintLevel;
  title: string;
  text: string;
  at?: string;
}

export interface AnnualEpisodeFact {
  title: string;
  status: EpisodeStatus;
  startedAt: string;
  resolvedAt?: string | null;
  firstNote: string;
  lastNote: string;
  peakSeverity: number | null;
  lastSeverity: number | null;
  hint?: string | null;
  visit?: { date: string; department?: string; diagnosis: string; treatment: string; advice?: string } | null;
}

/** Everything the yearly summary is built from. Computed on the client, used by GLM and by the fallback. */
export interface AnnualFacts {
  periodStart: string;
  periodEnd: string;
  hba1c: { at: string; value: number }[];
  fbgMonthly: { month: string; label: string; count: number; avg: number; min: number; max: number }[];
  weight: { at: string; value: number }[];
  bp: { at: string; value: number; value2: number }[];
  lows: { at: string; value: number; note?: string }[];
  insights: Insight[];
  followUps: FollowUp[];
  episodes: AnnualEpisodeFact[];
}

export interface AnnualSummaryBody {
  /** up to four short lines a doctor must see first */
  glance: string[];
  headline: string;
  overview: string;
  metricTrends: { name: string; trend: string }[];
  medicationChanges: { time: string; change: string }[];
  keyEvents: { time: string; event: string }[];
  patterns: string[];
  currentConcerns: string[];
  hints: Hint[];
  questionsForDoctor: string[];
}

export interface AnnualSummary extends AnnualSummaryBody {
  generatedAt: string;
  mode: AiMode;
  periodStart: string;
  periodEnd: string;
}

export interface Settings {
  /** how often to ask about a tracked symptom, in hours. Long-running symptoms are asked weekly. */
  checkInIntervalHours: number;
  notificationsEnabled: boolean;
  /** "长期管理": shows the metrics the user tracks on the home screen. Off for most people. */
  longTerm: boolean;
  trackedMetrics: MetricType[];
  /** Reminder cadence for glucose, in hours. 0 turns reminders off. */
  metricReminderHours: number;
  /** Chinese unless the user switched. What people recorded themselves stays in the language they used. */
  lang?: Lang;
}

export type DemoPersona = "lin";

export interface AppState {
  version: 1;
  profile: Profile | null;
  episodes: Episode[];
  measurements: Measurement[];
  followUps: FollowUp[];
  annualSummary: AnnualSummary | null;
  /** the next appointment the user asked to be reminded of */
  nextVisit: { at: string; note: string } | null;
  /** health check-up reports, newest last */
  checkups: Checkup[];
  /** questions asked in 问医伴 and their answers, oldest first */
  asks: AskTurn[];
  /** the one conversation on the main screen, oldest first */
  thread: ThreadItem[];
  /** reminders set from the doctor's orders */
  reminders: Reminder[];
  settings: Settings;
  /** Set while a demo dataset is loaded, so a demo link can replace it without asking. */
  demo: DemoPersona | null;
}

/* ---------- AI contracts (shared by client, API routes and fallback) ---------- */

export interface RelatedEpisodeContext {
  title: string;
  date: string;
  diagnosis?: string;
  treatment?: string;
  outcome?: string;
}

export type ChatKind = "intake" | "followup" | "checkin";

export interface EpisodeContext {
  title: string;
  tags: string[];
  status: EpisodeStatus;
  startedAt: string;
  /** when it was first written down; equal to startedAt as long as the user has not said when it began */
  createdAt?: string;
  resolvedAt?: string | null;
  entries: Entry[];
  visit?: Pick<VisitRecord, "date" | "department" | "diagnosis" | "treatment" | "advice"> | null;
}

export interface ChatRequest {
  kind: ChatKind;
  profile: Profile;
  episode: EpisodeContext;
  related: RelatedEpisodeContext[];
  messages: { role: "user" | "assistant"; content: string }[];
  /** Pre-rendered summary of recent health metrics, so the assistant can refer to them. */
  metricsContext?: string;
  /** The user's local date and time as text, so "上周三" can be worked out wherever the server runs. */
  localTime?: string;
  /** Other complaints being tracked right now, as text, so a new one can be connected to them. */
  others?: string;
}

export interface ChatMeasurement {
  type: MetricType;
  value: number;
  value2: number | null;
}

export interface ChatEntry {
  severity: number | null;
  /** the user stated the number themselves */
  exact: boolean;
  temperature: number | null;
  note: string;
  location: string | null;
}

export interface ChatResponse {
  mode: AiMode;
  reply: string;
  entry: ChatEntry | null;
  tags: string[];
  suggestedReplies: string[];
  hint: Hint | null;
  /** Readings the user stated in this message (e.g. "测了血糖 3.6"). */
  measurements: ChatMeasurement[];
  /** A short name for the symptom, given on the first turn ("喉咙痛"). */
  title: string | null;
  /** How long ago it started, when the user said so. */
  onsetHoursAgo: number | null;
  /** The assistant has no more questions for now. */
  done: boolean;
  /** a picture to show with the question: the body map when asking where it hurts */
  widget?: "bodymap" | null;
  error?: string;
}

export interface SummaryRequest {
  profile: Profile;
  episode: Episode;
  related: RelatedEpisodeContext[];
  /** recent readings worth a line on the first screen ("最近血压 148/92（10月3日）"), prepared by the client */
  vitals?: string[];
  /** what the latest check-up flagged, one line each, prepared by the client */
  background?: string[];
}

export interface SummaryResponse {
  mode: AiMode;
  summary: DoctorSummaryBody;
  error?: string;
}

/** "看完医生了": what the doctor said, given as free text and/or photos. */
export interface AfterRequest {
  profile: Profile;
  episode: EpisodeContext | null;
  text?: string;
  /** data URLs of photos: 病历、处方、药盒、化验单 */
  images?: string[];
}

export interface AfterMedication {
  name: string;
  usage: string;
  /** meant to be taken for a long time, as opposed to a short course */
  longTerm: boolean;
}

export interface AfterResult {
  date: string | null;
  hospital: string | null;
  department: string | null;
  diagnosis: string | null;
  findings: string[];
  /** what was done on the spot: 复位、输液、换药… */
  procedures: string[];
  medications: AfterMedication[];
  advice: string | null;
  followUpDays: number | null;
  followUpNote: string | null;
  readings: ChatMeasurement[];
  /** an archive paragraph for later reference */
  summary: string;
  /** things on a photo that could not be read reliably */
  unclear: string[];
}

export interface AfterResponse {
  mode: AiMode;
  result: AfterResult;
  error?: string;
}

/** One free sentence about history, allergies and medicines, split into profile fields. */
export interface ProfileParseResponse {
  mode: AiMode;
  conditions: string[];
  allergies: string[];
  medications: string[];
  surgeries: string[];
  familyHistory: string[];
  error?: string;
}

export interface AnnualRequest {
  profile: Profile;
  facts: AnnualFacts;
}

export interface AnnualResponse {
  mode: AiMode;
  summary: AnnualSummaryBody;
  error?: string;
}

/* ---------- 问医伴: questions about one's own health, answered from the record ---------- */

/** One thing on file that an answer may rest on. The id is what the model cites. */
export interface AskRecord {
  id: string;
  kind: "visit" | "followup" | "episode" | "checkup" | "profile" | "metrics" | "reminder";
  /** short name for the chip under the answer: "9月30日 看医生" */
  label: string;
  /** where the chip leads */
  href: string;
  /** the record itself, as text for the model */
  text: string;
  /** when it happened (ISO), for "上次" questions; empty for things without a date */
  date: string;
  /** the same record in parts, so the rule engine can quote it exactly */
  fields?: {
    reason?: string;
    where?: string;
    diagnosis?: string;
    treatment?: string;
    advice?: string;
    followUp?: string;
    findings?: string;
    /** how long ago it was, worked out on the user's device: "约 3 个月前" */
    ago?: string;
  };
}

export interface AskRequest {
  profile: Profile;
  question: string;
  /** the last few turns, so "那饭前还是饭后？" can be understood */
  history: { question: string; answer: string }[];
  records: AskRecord[];
  localTime?: string;
}

export interface AskResponse {
  mode: AiMode;
  answer: string;
  /** ids of the records the answer used */
  sources: string[];
  /** raised by rule when the question itself describes an emergency */
  hint: Hint | null;
  error?: string;
}

/* ---------- 体检报告建档: a check-up report read into a profile ---------- */

export interface CheckupResult {
  name: string | null;
  gender: Gender | null;
  birthYear: number | null;
  date: string | null;
  institution: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bloodType: string | null;
  conditions: string[];
  allergies: string[];
  medications: string[];
  surgeries: string[];
  familyHistory: string[];
  readings: ChatMeasurement[];
  abnormal: string[];
  advice: string | null;
  unclear: string[];
}

export interface CheckupResponse {
  mode: AiMode;
  result: CheckupResult;
  error?: string;
}

/* ---------- 第三版: one conversation is the whole main screen ---------- */

/** 初步分诊: whether to see a doctor and how soon. Decided by rule; it never names an illness. */
export type TriageLevel = "emergency" | "today" | "soon" | "watch";
export interface Triage {
  level: TriageLevel;
  /** the one line the patient reads: "建议这几天去看医生" */
  title: string;
  /** which department to register with, when the complaint points to one */
  department: string | null;
  /** what to watch for before then */
  note: string;
}

/**
 * One thing in the conversation. Plain bubbles are "user" and "ai"; everything else is a card
 * with its own buttons. The cards hold ids, not copies: the record itself stays in episodes.
 */
export type ThreadItem =
  | { id: string; at: string; kind: "user"; text: string; photos?: number }
  | { id: string; at: string; kind: "ai"; text: string; chips?: string[]; episodeId?: string }
  | { id: string; at: string; kind: "alert"; hint: Hint }
  | { id: string; at: string; kind: "description"; episodeId: string; state: "draft" | "saved" | "discarded" }
  | { id: string; at: string; kind: "triage"; episodeId: string; triage: Triage }
  | { id: string; at: string; kind: "orders"; result: AfterResult; mode: AiMode; episodeId: string | null; state: "draft" | "saved" | "discarded" }
  | { id: string; at: string; kind: "answer"; text: string; sources: { label: string; href: string }[] }
  | { id: string; at: string; kind: "note"; text: string }
  /** 疼痛定位: a body picture to tap, offered while asking where it hurts */
  | { id: string; at: string; kind: "bodymap"; episodeId: string; state: "open" | "done"; picked?: string | null }
  /** 医嘱 a: what to do, with which ones to remind about and how often */
  | { id: string; at: string; kind: "todo"; ordersItemId: string; episodeId: string | null; todos: Todo[]; state: "draft" | "set" }
  /** 医嘱 b: the parts that can be explained, to pick from */
  | { id: string; at: string; kind: "explain"; ordersItemId: string; parts: string[] }
  /** 复诊准备: what to tell the doctor at the next visit */
  | { id: string; at: string; kind: "prep"; episodeId: string | null; text: string };

/** One thing the doctor's orders ask the patient to do. */
export interface Todo {
  id: string;
  kind: "medicine" | "care" | "caution" | "followup";
  /** 洛索洛芬钠片，每日三次，饭后 */
  text: string;
  remind: boolean;
  /** how often: at each dose time, once a day, once on a date, or not at all */
  frequency: "each" | "daily" | "once" | "none";
  /** "08:00" and so on, for each and daily */
  times?: string[];
  /** ISO time, for once (a follow-up visit) */
  at?: string | null;
}

/** A reminder that has been set. Fired by the scheduler while the app is open, as a message and a notification. */
export interface Reminder {
  id: string;
  todoId: string;
  episodeId: string | null;
  text: string;
  kind: Todo["kind"];
  frequency: Todo["frequency"];
  times?: string[];
  at?: string | null;
  enabled: boolean;
  createdAt: string;
  /** the last time it went off, so it does not go off twice for the same slot */
  lastFiredAt?: string | null;
}

type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A thread item before the store has given it an id and a time. */
export type NewThreadItem = OmitEach<ThreadItem, "id" | "at">;
