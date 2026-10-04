import { fmtDate } from "@/lib/utils";
import { L } from "@/lib/lang";

/** "已放进主页的 to do list：吃药 2 条、复诊 10 月 17 日" */
export function filedLine(reminders: { kind: string; at?: string | null }[]): string {
  const meds = reminders.filter((r) => r.kind === "medicine").length;
  const visit = reminders.find((r) => r.kind === "followup" && r.at);
  const parts = [
    meds ? L(`吃药 ${meds} 条`, `${meds} medicine${meds === 1 ? "" : "s"}`) : "",
    visit?.at ? L(`复诊 ${fmtDate(visit.at)}`, `follow-up visit ${fmtDate(visit.at)}`) : "",
  ].filter(Boolean);
  const other = reminders.length - meds - (visit ? 1 : 0);
  if (other > 0) parts.push(L(`其他 ${other} 条`, `${other} other`));
  return parts.length
    ? L(`已放进主页的 to do list：${parts.join("、")}。`, `Added to the to do list on the home page: ${parts.join(", ")}.`)
    : L("这次没有要按时提醒的事，记录已经存好了。", "Nothing needs a reminder this time. The record is saved.");
}
