"use client";

import Link from "next/link";
import { ChevronLeft, Copy, PencilLine, Phone, Printer, Siren } from "lucide-react";
import { useStore } from "@/lib/store";
import { COLLAPSE, GENERAL_SIGNS, NOT_SURE, buildSos, dialable, sosToText, type SosBlock, type SosSelfGroup } from "@/lib/sos";
import { cn, copyText } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { Button, TextLink } from "@/components/ui";

/**
 * Keeps a number with the words beside it, so no line ends in "拨打" with "120" on the next, or
 * splits "15 分钟". A number run into letters ("100mg") is left alone: a medicine name in a step
 * still wraps where it normally would, instead of being pushed apart.
 */
const glue = (s: string) =>
  s.replace(/(?<=\d) (?=[\u4e00-\u9fff])|(?<=[\u4e00-\u9fff]) (?=[\d.]+(?:[\s\u3000-\u303f\uff00-\uffef]|$))/g, "\u00a0");

/**
 * 应急手册: opened directly at /sos, without going through the rest of the app. The first screen
 * is for whoever is standing next to the person: who they are, what they have, what they are
 * allergic to, whom to call, and what to do if they collapse. Further down is for the person
 * themselves. Everything on it comes from the profile by plain rules, so it is there the moment
 * it opens, and it makes no requests of its own.
 */
export default function SosPage() {
  const { state } = useStore();
  const toast = useToast();
  const profile = state.profile;
  const plan = profile ? buildSos(profile) : null;
  const blocks = plan?.blocks ?? [COLLAPSE];
  const lead = blocks.findIndex((b) => b.key === COLLAPSE.key);
  // a demo's contact number is made up: it is shown, never dialled
  const demo = state.demo != null;

  const copy = async () => {
    const ok = await copyText(sosToText(plan));
    toast.show(ok ? "已复制，可以发给家里人" : "没复制成功，可以改用打印", ok ? "good" : "danger");
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-danger text-white print:bg-transparent print:text-ink">
        {/* on paper the content runs the full width, so the title has to line up with it */}
        <div className="mx-auto w-full max-w-[36rem] px-4 pt-3 pb-4 print:max-w-none print:px-0 print:pt-0">
          <div className="flex items-center gap-3">
            <Siren className="h-8 w-8 shrink-0" aria-hidden="true" />
            <h1 className="min-w-0 flex-1 text-[1.65rem] leading-tight font-semibold">应急手册</h1>
            <a
              href="tel:120"
              className="no-print inline-flex min-h-14 shrink-0 items-center gap-2 rounded-2xl bg-white px-5 text-xl font-semibold text-danger shadow-float transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
            >
              <Phone className="h-6 w-6" aria-hidden="true" />
              拨打 120
            </a>
          </div>
          <p className="mt-1.5 text-xl leading-snug">{plan ? "我出了状况的话，请看这一页" : "突发状况时怎么做"}</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[36rem] space-y-5 px-4 pt-5 pb-16">
        {plan ? (
          <section aria-label="我是谁" className="rounded-card border-2 border-danger/30 bg-danger-bg/60 p-5 print:border print:bg-transparent">
            {/* one sentence that may break only after a comma: never "36" on one line and "岁" on the next */}
            <p className="text-2xl leading-snug font-semibold text-ink">
              {`我是${plan.who}${plan.bloodType ? `，${plan.bloodType}血` : ""}`.replace(/ /g, "\u00a0")}
            </p>
            {plan.pregnant && <p className="mt-1.5 text-xl leading-snug font-semibold text-ink">我怀孕了</p>}
            <dl className="mt-3 space-y-2 text-xl leading-relaxed text-ink">
              {plan.conditions.length > 0 && <Fact label="我有">{plan.conditions.join("、")}</Fact>}
              <Fact label="过敏" strong={plan.allergies.length > 0}>
                {plan.allergies.length ? plan.allergies.join("、") : "没有已知的过敏"}
              </Fact>
            </dl>
            <div className="mt-4 border-t border-danger/20 pt-4">
              {plan.contact ? (
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                  <div className="min-w-0 text-xl leading-relaxed text-ink">
                    <p className="text-lg text-ink-2">紧急联系人</p>
                    <p>
                      <span className="mr-3 font-semibold">
                        {plan.contact.relation ? `${plan.contact.relation} ` : ""}
                        {plan.contact.name}
                      </span>
                      <span className="inline-block tabular-nums">{plan.contact.phone}</span>
                    </p>
                  </div>
                  {demo ? (
                    <p className="rounded-xl bg-surface px-3 py-2 text-base text-ink-2">演示号码，不能拨打</p>
                  ) : (
                    <a
                      href={`tel:${dialable(plan.contact.phone)}`}
                      className="no-print inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 text-xl font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 sm:w-auto"
                    >
                      <Phone className="h-5 w-5" aria-hidden="true" />
                      打给{plan.contact.relation || plan.contact.name}
                    </a>
                  )}
                </div>
              ) : (
                <div className="no-print flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg text-ink">还没有填紧急联系人。</p>
                  <Link
                    href="/me/edit#contact"
                    className="inline-flex min-h-12 items-center rounded-xl px-2 text-lg font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                  >
                    去填一个
                  </Link>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-card border border-line bg-surface-2 p-5">
            <p className="text-xl leading-relaxed text-ink">这里还没有档案。建档以后，这一页会写上你是谁、有什么病、对什么过敏、该联系谁。</p>
            <Link
              href="/onboarding"
              className="no-print mt-2 -ml-2 inline-flex min-h-12 items-center rounded-xl px-2 text-lg font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              去建档
            </Link>
          </section>
        )}

        {/* everything up to and including the collapse steps is what to do first, so it is red */}
        {blocks.map((b, i) => (
          <Steps key={b.key} block={b} tone={i <= lead ? "danger" : "plain"} />
        ))}
        {plan && plan.medications.length > 0 && (
          <section className="rounded-card border border-line bg-surface p-5 shadow-card print:border-0 print:p-0 print:shadow-none">
            <h2 className="text-2xl leading-snug font-semibold text-ink">我长期在吃的药</h2>
            <Bullets items={plan.medications} dot="bg-brand-600" className="mt-3" />
          </section>
        )}

        <div className="flex items-center gap-3 pt-3">
          <span className="h-px flex-1 bg-line-strong" aria-hidden="true" />
          <span className="text-lg font-medium text-ink-2">下面是给我自己看的</span>
          <span className="h-px flex-1 bg-line-strong" aria-hidden="true" />
        </div>

        <section aria-labelledby="sos-self">
          <h2 id="sos-self" className="text-2xl font-semibold text-ink">
            这些情况，不要等
          </h2>
          <div className="mt-3 space-y-4">
            {(plan?.self ?? GENERAL_SIGNS).map((g) => (
              <SelfGroup key={g.key} group={g} />
            ))}
          </div>
          <p className="mt-4 text-xl leading-relaxed font-medium text-ink">{glue(NOT_SURE)}</p>
        </section>

        <div className="no-print space-y-3 border-t border-line pt-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-5 w-5" aria-hidden="true" />
              打印随身带
            </Button>
            <Button variant="secondary" onClick={copy}>
              <Copy className="h-5 w-5" aria-hidden="true" />
              复制发给家人
            </Button>
          </div>
          <p className="text-base leading-relaxed text-ink-2">
            这一页的地址是固定的。把它存进浏览器书签，或者用浏览器菜单里的「添加到主屏幕」，要用的时候一点就开。
          </p>
          <div className="-ml-2 flex flex-wrap gap-x-3">
            <TextLink href={profile ? "/me/edit#contact" : "/onboarding"}>
              <PencilLine className="mr-1 h-5 w-5" aria-hidden="true" />
              {profile ? "改档案和联系人" : "去建档"}
            </TextLink>
            <TextLink href="/" tone="plain">
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              回到医伴
            </TextLink>
          </div>
        </div>

        <p className="text-base leading-relaxed text-ink-2">
          {plan ? "这一页是按档案生成的急救常识，不能代替医生。档案改了，这一页会跟着变。" : "这一页是通用的急救常识，不能代替医生。"}
        </p>
      </main>
    </div>
  );
}

function Fact({ label, strong, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[2.5em] shrink-0 text-ink-2">{label}</dt>
      <dd className={cn("min-w-0 flex-1", strong && "font-semibold text-danger")}>{children}</dd>
    </div>
  );
}

function Steps({ block, tone }: { block: SosBlock; tone: "danger" | "plain" }) {
  const danger = tone === "danger";
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card print:border-0 print:p-0 print:shadow-none">
      <h2 className={cn("text-2xl leading-snug font-semibold", danger ? "text-danger" : "text-ink")}>{glue(block.title)}</h2>
      {block.why && <p className="mt-1.5 text-xl leading-relaxed text-ink">{glue(block.why)}</p>}
      <ol className="mt-3 space-y-3">
        {block.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-semibold tabular-nums",
                // on paper the fill may be dropped, so the number gets a ring and dark ink instead
                "print:border print:border-ink print:bg-transparent print:text-ink",
                danger ? "bg-danger text-white" : "bg-brand-50 text-brand-800",
              )}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 text-xl leading-relaxed text-ink">{glue(s)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SelfGroup({ group }: { group: SosSelfGroup }) {
  const call = group.key === "call";
  return (
    <div
      className={cn(
        "rounded-card border p-5",
        call ? "border-danger/30 bg-danger-bg/60" : "border-line bg-surface shadow-card",
        "print:border-0 print:bg-transparent print:p-0 print:shadow-none",
      )}
    >
      <h3 className={cn("text-xl font-semibold", call ? "text-danger" : "text-ink")}>{glue(group.title)}</h3>
      <Bullets items={group.items.map(glue)} dot={call ? "bg-danger" : "bg-brand-600"} className="mt-2" />
    </div>
  );
}

function Bullets({ items, dot, className }: { items: string[]; dot: string; className?: string }) {
  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((x, i) => (
        <li key={i} className="flex gap-2.5 text-xl leading-relaxed text-ink">
          <span className={cn("mt-[0.62em] h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden="true" />
          <span className="min-w-0 flex-1">{x}</span>
        </li>
      ))}
    </ul>
  );
}
