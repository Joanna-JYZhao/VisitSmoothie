"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BatteryFull, Signal, Wifi } from "lucide-react";

/*
 * On a computer the whole app lives inside one phone drawn in the middle of the window. The phone's
 * screen is an iframe showing this same address, so the app in it is exactly the app a real phone
 * gets: phone width, its own scrolling, its own bar fixed at the bottom. Same origin, same data.
 *
 * This outer layer only draws the phone. It mounts nothing of the app itself (no store, no
 * redirects, no reminders), so there is never a second copy of the app's logic running.
 *
 * On a real phone (a narrow window), or when this page is already inside a frame, there is no
 * shell at all and the app fills the window.
 */

const SCREEN_W = 390;
const SCREEN_H = 844;
const BEZEL = 12;
const STATUS_H = 44;
const HOME_H = 22;
/** below this window width it is a phone (or as narrow as one): no shell */
const MIN_WINDOW = 600;
/** room kept around the phone for the margin and the line under it */
const AROUND = 84;

/** "pending" until the window can be looked at, then "app" or "frame:<scale>". A string, so equal answers are the same value. */
function readShape(): string {
  if (window.self !== window.top || window.innerWidth < MIN_WINDOW) return "app";
  const scale = Math.min(1, (window.innerHeight - AROUND) / (SCREEN_H + BEZEL * 2), (window.innerWidth - 32) / (SCREEN_W + BEZEL * 2));
  return `frame:${Math.max(0.45, scale).toFixed(3)}`;
}
function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}
const pendingShape = () => "pending";

export function PhoneShell({ children }: { children: React.ReactNode }) {
  const shape = useSyncExternalStore(subscribeResize, readShape, pendingShape);
  if (shape === "pending") return null;
  if (shape === "app") return <>{children}</>;
  return <PhoneFrame scale={Number(shape.slice("frame:".length))} />;
}

function useClock(): string {
  const now = () => {
    const d = new Date();
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const [time, setTime] = useState(now);
  useEffect(() => {
    const t = setInterval(() => setTime(now()), 20_000);
    return () => clearInterval(t);
  }, []);
  return time;
}

function PhoneFrame({ scale }: { scale: number }) {
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const time = useClock();
  // Where the phone starts: wherever this window is. Fixed from then on; changing it would reload the app.
  const [src] = useState(() => window.location.pathname + window.location.search + window.location.hash);

  // The app inside says where it is each time it moves, and the address bar follows. A reload, or
  // dragging the window narrow, then opens the same place instead of where the phone started.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const data = e.data as { type?: unknown; href?: unknown } | null;
      if (data?.type !== "yiban:location" || typeof data.href !== "string") return;
      if (!data.href.startsWith("/") || data.href.startsWith("//")) return;
      if (data.href === window.location.pathname + window.location.search + window.location.hash) return;
      router.replace(data.href, { scroll: false });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  const w = SCREEN_W + BEZEL * 2;
  const h = SCREEN_H + BEZEL * 2;
  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden">
      {/* Printing this outer page would print a picture of a phone. The sheet for the doctor is printed from inside. */}
      <p className="print-only p-8 text-xl leading-relaxed text-ink">
        这是电脑上的手机外壳，这一层没有可以打印的内容。要打印给医生看的一页，请在手机画面里点「打印」。
      </p>
      <div className="no-print relative shrink-0" style={{ width: w * scale, height: h * scale }}>
        <div
          className="absolute top-0 left-0 origin-top-left rounded-[3.4rem] bg-ink shadow-float"
          style={{ width: w, height: h, padding: BEZEL, transform: `scale(${scale})` }}
        >
          <div className="flex h-full w-full flex-col overflow-hidden rounded-[2.7rem] bg-canvas">
            {/* the phone's own status bar: part of the picture, not of the app */}
            <div
              aria-hidden="true"
              className="relative flex shrink-0 items-center justify-between bg-canvas-tint px-8 text-[15px] font-semibold text-ink"
              style={{ height: STATUS_H }}
            >
              <span className="tabular-nums">{time}</span>
              <span className="absolute top-2.5 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-ink" />
              <span className="flex items-center gap-1.5">
                <Signal className="h-4 w-4" />
                <Wifi className="h-4 w-4" />
                <BatteryFull className="h-5 w-5" />
              </span>
            </div>
            <iframe
              ref={frame}
              src={src}
              title="医伴"
              allow="microphone; camera; clipboard-write"
              className="block w-full min-h-0 flex-1 border-0 bg-canvas"
            />
            <div aria-hidden="true" className="flex shrink-0 items-center justify-center bg-canvas" style={{ height: HOME_H }}>
              <span className="h-[5px] w-32 rounded-full bg-ink" />
            </div>
          </div>
        </div>
      </div>
      <p className="no-print text-base text-ink-2">医伴 · 在手机里操作</p>
    </main>
  );
}
