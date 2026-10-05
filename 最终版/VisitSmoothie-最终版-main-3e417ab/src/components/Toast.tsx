"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { cn, uid } from "@/lib/utils";

type ToastTone = "neutral" | "good" | "danger";
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastItem {
  id: string;
  msg: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastApi {
  /** Shows a short message. With an action (usually 撤销) it stays longer so there is time to tap it. */
  show: (msg: string, tone?: ToastTone, action?: ToastAction) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: string) => setItems((x) => x.filter((i) => i.id !== id)), []);
  const show = useCallback<ToastApi["show"]>(
    (msg, tone = "neutral", action) => {
      const id = uid();
      // one message at a time: a new one replaces what is showing
      setItems([{ id, msg, tone, action }]);
      setTimeout(() => dismiss(id), action ? 7000 : 3200);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {/* Under the top bar, not at the bottom: the bottom of the screen belongs to the bar you speak and type into.
          A frosted capsule that drops in, the way a system banner does. */}
      <div className="no-print pointer-events-none fixed inset-x-0 top-[4.25rem] z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div
            key={i.id}
            role="status"
            className="glass pointer-events-auto flex max-w-full animate-pop items-center gap-3 rounded-full border border-white/70 py-1.5 pr-2 pl-2 text-base font-medium text-ink shadow-float"
          >
            {i.tone === "good" && (
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-good-bg text-good">
                <CircleCheck className="h-5 w-5" />
              </span>
            )}
            {i.tone === "danger" && (
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
                <CircleAlert className="h-5 w-5" />
              </span>
            )}
            <span className={cn("min-w-0 py-2 pr-2", i.tone === "neutral" && "pl-2", i.tone === "danger" && "text-danger")}>{i.msg}</span>
            {i.action && (
              <button
                type="button"
                onClick={() => {
                  i.action?.onClick();
                  dismiss(i.id);
                }}
                className="press min-h-11 shrink-0 rounded-full bg-linear-to-b from-brand-600 to-brand-650 px-5 font-semibold text-white shadow-btn transition hover:from-brand-650 hover:to-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                {i.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx;
}
