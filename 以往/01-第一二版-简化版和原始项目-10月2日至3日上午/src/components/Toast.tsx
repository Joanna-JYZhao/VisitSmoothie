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
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div
            key={i.id}
            role="status"
            className={cn(
              "pointer-events-auto flex max-w-full animate-fade-up items-center gap-2.5 rounded-2xl py-1.5 pr-2 pl-4 text-base font-medium shadow-float",
              i.tone === "good" ? "bg-good text-white" : i.tone === "danger" ? "bg-danger text-white" : "bg-ink text-white",
            )}
          >
            {i.tone === "good" && <CircleCheck className="h-5 w-5 shrink-0" aria-hidden="true" />}
            {i.tone === "danger" && <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />}
            <span className="min-w-0 py-2 pr-2">{i.msg}</span>
            {i.action && (
              <button
                type="button"
                onClick={() => {
                  i.action?.onClick();
                  dismiss(i.id);
                }}
                className="min-h-11 shrink-0 rounded-xl bg-white/20 px-4 font-semibold transition hover:bg-white/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
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
