"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getState, storeActions, useStore } from "@/lib/store";
import { fireDue, reminderMessage } from "@/lib/reminders";
import { checkInQuestion, dueEpisodes } from "@/lib/checkin";
import { METRICS, dayKey, dueMetrics } from "@/lib/metrics";

const NOTIFIED_KEY = "yiban.notified";

/** Fires a browser notification once per due check-in while the app is open. */
export function CheckInScheduler() {
  const { state, ready } = useStore();
  const router = useRouter();

  // 医嘱提醒: checked every half minute while the app is open; each one goes off once per time slot,
  // as a message in the conversation and, when allowed, a notification
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const now = Date.now();
      const { fire, mark } = fireDue(getState().reminders, now);
      // the same follow-up visit on file twice goes off once: its twins are marked as well
      for (const id of mark) storeActions.updateReminder(id, (x) => ({ ...x, lastFiredAt: new Date(now).toISOString() }));
      for (const { reminder: r, slot } of fire) {
        const text = reminderMessage(r, slot);
        storeActions.pushThread({ kind: "ai", text });
        const s = getState().settings;
        if (s.notificationsEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            const n = new Notification("医伴提醒你", { body: text, tag: `yiban-reminder-${r.id}` });
            n.onclick = () => {
              window.focus();
              router.push("/post");
              n.close();
            };
          } catch (err) {
            console.warn("通知发送失败", err);
          }
        }
      }
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [ready, router]);

  useEffect(() => {
    if (!ready || !state.settings.notificationsEnabled) return;
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const tick = () => {
      const due = dueEpisodes(state);
      const metrics = state.settings.longTerm ? dueMetrics(state.measurements, state.settings) : [];
      if (!due.length && !metrics.length) return;
      let notified: Record<string, string> = {};
      try {
        notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}");
      } catch {
        notified = {};
      }
      let changed = false;
      for (const e of due) {
        if (notified[e.id] === e.lastCheckInAt) continue;
        try {
          const n = new Notification("医伴想问你", {
            body: `${checkInQuestion(e)} 点开选一个答案就行。`,
            tag: `yiban-${e.id}`,
          });
          n.onclick = () => {
            window.focus();
            router.push("/");
            n.close();
          };
        } catch (err) {
          console.warn("通知发送失败", err);
        }
        notified[e.id] = e.lastCheckInAt;
        changed = true;
      }
      // at most one metric reminder per day
      const today = dayKey(new Date());
      if (metrics.length && notified.metrics !== today) {
        try {
          const n = new Notification("医伴提醒你", {
            body: `该记${metrics.map((t) => METRICS[t].label).join("、")}了，打开填一个数就行。`,
            tag: "yiban-metrics",
          });
          n.onclick = () => {
            window.focus();
            router.push("/");
            n.close();
          };
        } catch (err) {
          console.warn("通知发送失败", err);
        }
        notified.metrics = today;
        changed = true;
      }
      if (changed) {
        try {
          localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified));
        } catch {
          /* ignore */
        }
      }
    };

    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [ready, state, router]);

  return null;
}
