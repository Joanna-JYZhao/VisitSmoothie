"use client";

/*
 * 新手引导：注册后第一次进首页时出现。蒙版压暗全屏，只有当前目标被高亮圈出来，
 * 旁边飘一个气泡写引导语，一步一步走完 pre → post → to do → profile → report → 应急。
 * 走完（或跳过）写入 settings.tourDone，之后不再出现。
 */

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui";

export const TOUR_FLAG = "yiban.tour";

interface GuideStep {
  /** data-guide 的值；没有就是居中的全局卡片 */
  target?: string;
  title: string;
  body: string;
  button: string;
}

const STEPS: GuideStep[] = [
  { title: "欢迎使用 VisitSmoothie", body: "你的私人就诊管家，帮你把看病变简单。", button: "开始探索" },
  { target: "pre", title: "诊前准备", body: "描述你的不适，一键生成给医生看的「就诊摘要」。", button: "下一步" },
  { target: "post", title: "诊后解析", body: "拍处方或传录音，自动翻译成清晰的「就诊计划」。", button: "下一步" },
  { target: "todo", title: "待办与答疑", body: "用药复查自动生成提醒。有疑问随时在底部提问。", button: "下一步" },
  { target: "profile", title: "个人中心", body: "管理你的账号信息与个性化就诊偏好。", button: "下一步" },
  { target: "report", title: "健康档案", body: "所有的历史摘要和护理计划都在此安全归档。", button: "下一步" },
  { target: "sos", title: "紧急求助", body: "AI 不做诊断。突发严重不适，请立刻点击此处寻求人工干预。", button: "完成" },
  { title: "准备就绪", body: "欢迎使用 VisitSmoothie，让每一次就诊都清晰、安心。", button: "开始使用" },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const MASK = "rgba(18, 59, 49, 0.55)"; // brand-ink 55%，和青瓷主题一致

export function GuideTour({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const total = STEPS.length - 2; // 高亮步骤数（不含首尾两张全局卡片）

  const measure = useCallback(() => {
    if (!current.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-guide="${current.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [current.target]);

  // 每换一步：把目标滚到屏幕中间再量位置；窗口变化时跟着量
  useLayoutEffect(() => {
    if (!current.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-guide="${current.target}"]`);
    el?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    measure();
    const t = window.setTimeout(measure, 150);
    const again = () => measure();
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
    };
  }, [step, current.target, measure]);

  // Esc 跳过
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish]);

  const hl = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;

  // 气泡位置：优先放目标下方，放不下就放上方；水平与目标居中并夹进屏幕
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bw = Math.min(360, vw - 32);
  const EST_H = 200;
  let bubblePos: React.CSSProperties = { width: bw, left: "50%", top: "50%", transform: "translate(-50%,-50%)" };
  let arrowUp = false; // 气泡在目标下方时，小箭头朝上指
  if (hl) {
    const belowY = hl.top + hl.height + 16;
    const room = belowY + EST_H <= vh;
    arrowUp = room;
    const top = room ? belowY : Math.max(16, hl.top - 16 - EST_H);
    const centerX = hl.left + hl.width / 2;
    const left = Math.min(Math.max(16, centerX - bw / 2), vw - bw - 16);
    bubblePos = { width: bw, top, left };
  }

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="新手引导">
      {/* 透明层吃掉点击；高亮洞由下面那个 div 的巨型 box-shadow 画出来 */}
      <div className="absolute inset-0" />
      {hl ? (
        <div
          className="pointer-events-none absolute rounded-[26px] transition-all duration-300 ease-out"
          style={{ ...hl, boxShadow: `0 0 0 9999px ${MASK}`, outline: "2px solid rgba(255,255,255,0.85)" }}
        />
      ) : (
        <div className="absolute inset-0 transition-all duration-300" style={{ background: MASK }} />
      )}

      <div
        className="animate-fade-up absolute rounded-3xl border border-line/70 bg-surface p-6 shadow-hero"
        style={bubblePos}
      >
        {hl && (
          <span
            aria-hidden="true"
            className="absolute h-3.5 w-3.5 rotate-45 border-line/70 bg-surface"
            style={
              arrowUp
                ? { top: -8, left: "calc(50% - 7px)", borderLeftWidth: 1, borderTopWidth: 1 }
                : { bottom: -8, left: "calc(50% - 7px)", borderRightWidth: 1, borderBottomWidth: 1 }
            }
          />
        )}
        {step > 0 && !last && <div className="text-sm font-semibold text-brand-600">{`${step} / ${total}`}</div>}
        <h3 className="t-title mt-1 text-ink">{current.title}</h3>
        <p className="t-body mt-2.5 text-ink-2">{current.body}</p>
        <div className="mt-6 flex items-center gap-4">
          <Button size="md" className="flex-1" onClick={() => (last ? onFinish() : setStep(step + 1))}>
            {current.button}
          </Button>
          {!last && (
            <button
              type="button"
              onClick={onFinish}
              className="shrink-0 text-sm text-ink-3 underline underline-offset-4 transition hover:text-ink"
            >
              跳过
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
