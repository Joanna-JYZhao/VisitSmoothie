"use client";

import Link from "next/link";
import { ChevronLeft, Copy, PencilLine, Phone, Pill, Printer, Siren, UserRound } from "lucide-react";
import { useStore } from "@/lib/store";
import { L, getLang } from "@/lib/lang";
import { COLLAPSE, GENERAL_SIGNS, buildSos, contactName, dialable, notSure, sosToText, type SosBlock, type SosSelfGroup } from "@/lib/sos";
import { cn, copyText } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { LangToggle } from "@/components/LangToggle";
import { Button, Card, IconTile, TextLink } from "@/components/ui";

/**
 * Keeps a number with the words beside it, so no line ends in "拨打" with "120" on the next, or
 * splits "15 分钟". A number run into letters ("100mg") is left alone: a medicine name in a step
 * still wraps where it normally would, instead of being pushed apart.
 */
const glueZh = (s: string) =>
  s.replace(/(?<=\d) (?=[\u4e00-\u9fff])|(?<=[\u4e00-\u9fff]) (?=[\d.]+(?:[\s\u3000-\u303f\uff00-\uffef]|$))/g, "\u00a0");
/** The same in English: "Call 120", "15 minutes", "100 to 120 times" each stay on one line. */
const glueEn = (s: string) => s.replace(/(?<=\d) (?=[a-z°])|(?<=[A-Za-z]) (?=[\d.]+(?:[\s,.:;)]|$))/g, "\u00a0");
const glue = (s: string) => (getLang() === "en" ? glueEn(s) : glueZh(s));

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
    toast.show(ok ? L("已复制，可以发给家里人", "Copied. You can send it to your family.") : L("没复制成功，可以改用打印", "Could not copy. Try printing instead."), ok ? "good" : "danger");
  };

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-10 border-b border-line/80 print:static print:border-0 print:bg-transparent">
        {/* on paper the content runs the full width, so the title has to line up with it */}
        <div className="mx-auto w-full max-w-[36rem] px-4 pt-3 pb-3.5 print:max-w-none print:px-0 print:pt-0">
          <div className="flex items-center gap-3">
            <IconTile tone="danger" size="lg" className="print:hidden">
              <Siren aria-hidden="true" />
            </IconTile>
            {/* the English name is twice as long: a size smaller keeps "Emergency" whole beside the 120 button on a phone */}
            <h1 className={cn("min-w-0 flex-1 leading-tight font-semibold tracking-[-0.025em] text-ink", L("text-[1.65rem]", "text-2xl"))}>{L("应急手册", "Emergency guide")}</h1>
            {/* the one red action on the page: glossy, big, always in the corner */}
            <a
              href="tel:120"
              className="tile-danger press no-print inline-flex min-h-14 shrink-0 items-center gap-2 rounded-full px-6 text-xl font-semibold text-white transition duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/30"
            >
              <Phone className="h-6 w-6" aria-hidden="true" />
              {L("拨打 120", "Call 120")}
            </a>
          </div>
          {/* the language switch sits under the 120 button, never beside it: it must not compete for that corner */}
          <div className="mt-2.5 flex items-center gap-3">
            <p className="t-lead min-w-0 flex-1 text-ink-2">
              {plan ? L("我出了状况的话，请看这一页", "If I need help, read this") : L("突发状况时怎么做", "What to do in an emergency")}
            </p>
            <LangToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[36rem] space-y-6 px-4 pt-6 pb-16">
        {plan ? (
          /* the card a stranger reads first, like the Medical ID on a phone: who, what, who to call */
          <section
            aria-label={L("我是谁", "Who I am")}
            className="rise-1 material-raised light overflow-hidden rounded-card border border-line/60 bg-surface print:border print:bg-transparent print:shadow-none"
          >
            <div className="p-6 print:p-0">
              {/* on a phone the tile sits above the name, so even a long name keeps one line */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <IconTile tone="solid" size="lg" className="print:hidden">
                  <UserRound />
                </IconTile>
                <div className="min-w-0 flex-1">
                  {/* one sentence that may break only after a comma: never "36" on one line and "岁" on the next.
                      The English sentence is twice as long, so it is a size smaller to keep the first screen. */}
                  <p className={cn("leading-tight font-semibold tracking-[-0.025em] text-ink", L("text-[1.65rem]", "text-2xl"))}>
                    {L(
                      `我是${plan.who}${plan.bloodType ? `，${plan.bloodType}血` : ""}`.replace(/ /g, "\u00a0"),
                      glueEn(`I am ${plan.who}${plan.bloodType ? `, blood type ${plan.bloodType}` : ""}`),
                    )}
                  </p>
                  {plan.pregnant && <p className="t-lead mt-1.5 font-semibold text-ink">{L("我怀孕了", "I am pregnant")}</p>}
                </div>
              </div>
              <dl className="mt-5 space-y-3 border-t border-line pt-5 text-xl leading-relaxed text-ink">
                {plan.conditions.length > 0 && <Fact label={L("我有", "I have")}>{plan.conditions.join(L("、", ", "))}</Fact>}
                <Fact label={L("过敏", "Allergies")} strong={plan.allergies.length > 0}>
                  {plan.allergies.length ? plan.allergies.join(L("、", ", ")) : L("没有已知的过敏", "No known allergies")}
                </Fact>
              </dl>
            </div>
            <div className="border-t border-line bg-surface-2/60 px-6 py-5 print:border-t print:bg-transparent print:px-0">
              {plan.contact ? (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-4">
                  <div className="flex min-w-0 items-center gap-3 text-xl leading-relaxed text-ink">
                    <IconTile tone="brand" className="print:hidden">
                      <Phone />
                    </IconTile>
                    <div className="min-w-0">
                      <p className="text-base font-medium text-ink-2">{L("紧急联系人", "Emergency contact")}</p>
                      <p className="leading-snug">
                        <span className="mr-3 font-semibold">
                          {plan.contact.relation ? `${plan.contact.relation} ` : ""}
                          {contactName(plan.contact.name)}
                        </span>
                        <span className="inline-block tabular-nums">{plan.contact.phone}</span>
                      </p>
                    </div>
                  </div>
                  {demo ? (
                    <p className="rounded-full bg-surface px-4 py-2 text-base text-ink-2 shadow-edge">{L("演示号码，不能拨打", "Demo number, cannot be dialled")}</p>
                  ) : (
                    <a
                      href={`tel:${dialable(plan.contact.phone)}`}
                      className="press no-print inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-linear-to-b from-brand-600 to-brand-650 px-6 text-xl font-semibold text-white shadow-btn transition duration-200 hover:from-brand-650 hover:to-brand-700 hover:shadow-hero focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 sm:w-auto"
                    >
                      <Phone className="h-5 w-5" aria-hidden="true" />
                      {L(`打给${plan.contact.relation || plan.contact.name}`, `Call ${plan.contact.relation || contactName(plan.contact.name)}`)}
                    </a>
                  )}
                </div>
              ) : (
                <div className="no-print flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconTile tone="neutral">
                      <Phone />
                    </IconTile>
                    <p className="text-lg text-ink">{L("还没有填紧急联系人。", "No emergency contact yet.")}</p>
                  </div>
                  <Link
                    href="/me/edit#contact"
                    className="inline-flex min-h-12 items-center rounded-xl px-2 text-lg font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                  >
                    {L("去填一个", "Add one")}
                  </Link>
                </div>
              )}
            </div>
          </section>
        ) : (
          <Card tone="raised" className="rise-1 p-6">
            <div className="flex items-start gap-4">
              <IconTile tone="neutral" size="lg">
                <UserRound />
              </IconTile>
              <div className="min-w-0 flex-1">
                <p className="t-lead text-ink">
                  {L(
                    "这里还没有档案。建档以后，这一页会写上你是谁、有什么病、对什么过敏、该联系谁。",
                    "There is no record here yet. Once you set up your record, this page will show who you are, your conditions, your allergies and who to call.",
                  )}
                </p>
                <Link
                  href="/onboarding"
                  className="no-print mt-2 -ml-2 inline-flex min-h-12 items-center rounded-xl px-2 text-lg font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                >
                  {L("去建档", "Set up your record")}
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* everything up to and including the collapse steps is what to do first, so it is red */}
        {blocks.map((b, i) => (
          <Steps key={b.key} block={b} tone={i <= lead ? "danger" : "plain"} index={i + 2} />
        ))}
        {plan && plan.medications.length > 0 && (
          <Card className="p-6 print:border-0 print:p-0 print:shadow-none">
            <div className="flex items-center gap-3">
              <IconTile tone="brand" className="print:hidden">
                <Pill />
              </IconTile>
              <h2 className="t-heading text-ink">{L("我长期在吃的药", "My regular medicines")}</h2>
            </div>
            <Bullets items={plan.medications} dot="bg-brand-600" className="mt-4" />
          </Card>
        )}

        <div className="flex items-center gap-4 pt-4">
          <span className="h-px flex-1 bg-line-strong" aria-hidden="true" />
          <span className="text-lg font-medium text-ink-2">{L("下面是给我自己看的", "The rest is for me")}</span>
          <span className="h-px flex-1 bg-line-strong" aria-hidden="true" />
        </div>

        <section aria-labelledby="sos-self">
          <h2 id="sos-self" className="t-title text-ink">
            {L("这些情况，不要等", "Do not wait if this happens")}
          </h2>
          <div className="mt-4 space-y-4">
            {(plan?.self ?? GENERAL_SIGNS).map((g) => (
              <SelfGroup key={g.key} group={g} />
            ))}
          </div>
          <p className="t-lead mt-5 font-medium text-ink">{glue(notSure())}</p>
        </section>

        <div className="no-print space-y-4 border-t border-line pt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" onClick={() => window.print()}>
              <Printer className="h-5 w-5" aria-hidden="true" />
              {L("打印随身带", "Print to carry")}
            </Button>
            <Button variant="secondary" size="lg" onClick={copy}>
              <Copy className="h-5 w-5" aria-hidden="true" />
              {L("复制发给家人", "Copy for family")}
            </Button>
          </div>
          <p className="t-body text-ink-2">
            {L(
              "这一页的地址是固定的。把它存进浏览器书签，或者用浏览器菜单里的「添加到主屏幕」，要用的时候一点就开。",
              "This page's address never changes. Bookmark it, or choose “Add to Home Screen” in your browser menu, so it opens with one tap when you need it.",
            )}
          </p>
          <div className="-ml-2 flex flex-wrap gap-x-3">
            <TextLink href={profile ? "/me/edit#contact" : "/onboarding"}>
              <PencilLine className="mr-1 h-5 w-5" aria-hidden="true" />
              {profile ? L("改档案和联系人", "Edit records and contact") : L("去建档", "Set up your record")}
            </TextLink>
            <TextLink href="/" tone="plain">
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              {L("回到医伴", "Back to Yiban")}
            </TextLink>
          </div>
        </div>

        <p className="t-body text-ink-2">
          {plan
            ? L(
                "这一页是按档案生成的急救常识，不能代替医生。档案改了，这一页会跟着变。",
                "This page is first-aid advice made from your record. It does not replace a doctor. When your record changes, this page changes too.",
              )
            : L("这一页是通用的急救常识，不能代替医生。", "This page is general first-aid advice. It does not replace a doctor.")}
        </p>
      </main>
    </div>
  );
}

function Fact({ label, strong, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      {/* "Allergies" needs a wider label column than "过敏" */}
      <dt className={cn(L("w-[2.5em]", "w-[4.3em]"), "shrink-0 text-ink-2")}>{label}</dt>
      <dd className={cn("min-w-0 flex-1", strong && "font-semibold text-danger")}>{children}</dd>
    </div>
  );
}

/** `index` only staggers the entrance: the first few cards come up one after the other. */
function Steps({ block, tone, index }: { block: SosBlock; tone: "danger" | "plain"; index: number }) {
  const danger = tone === "danger";
  return (
    <section
      className={cn(
        "rounded-card border border-line/80 bg-surface p-6 shadow-card print:border-0 print:p-0 print:shadow-none",
        index <= 4 && `rise-${index}`,
      )}
    >
      <h2 className={cn("t-heading", danger ? "text-danger" : "text-ink")}>{glue(block.title)}</h2>
      {block.why && <p className="t-body mt-2 text-ink">{glue(block.why)}</p>}
      <ol className="mt-4 space-y-4">
        {block.steps.map((s, i) => (
          <li key={i} className="flex gap-3.5">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-semibold tabular-nums",
                // on paper the fill may be dropped, so the number gets a ring and dark ink instead
                "print:border print:border-ink print:bg-transparent print:text-ink print:shadow-none",
                danger ? "tile-danger text-white" : "bg-brand-50 text-brand-800",
              )}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 pt-0.5 text-xl leading-relaxed text-ink">{glue(s)}</span>
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
        "rounded-card border p-6",
        call ? "border-danger/15 bg-danger-bg/70" : "material border-line/80 bg-surface",
        "print:border-0 print:bg-transparent print:p-0 print:shadow-none",
      )}
    >
      <h3 className={cn("t-heading", call ? "text-danger" : "text-ink")}>{glue(group.title)}</h3>
      <Bullets items={group.items.map(glue)} dot={call ? "bg-danger" : "bg-brand-600"} className="mt-3" />
    </div>
  );
}

function Bullets({ items, dot, className }: { items: string[]; dot: string; className?: string }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((x, i) => (
        <li key={i} className="flex gap-3 text-xl leading-relaxed text-ink">
          <span className={cn("mt-[0.62em] h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden="true" />
          <span className="min-w-0 flex-1">{x}</span>
        </li>
      ))}
    </ul>
  );
}
