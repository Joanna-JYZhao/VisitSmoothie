"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Download, Droplets, HardDrive, Info, Play, Sparkles, Timer, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { aiHealth, type AiHealth } from "@/lib/ai/client";
import { cn, fmtISODate } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { Button, Card, IconTile, LinkButton, Modal, PageHeader, SectionTitle, Select, Spinner, Toggle, type IconTone } from "@/components/ui";

type Perm = NotificationPermission | "unsupported";
const INTERVALS = [
  { hours: 12, label: "一天两次" },
  { hours: 24, label: "每天一次" },
  { hours: 48, label: "两天一次" },
];
const METRIC_CADENCE = [
  { hours: 24, label: "每天" },
  { hours: 48, label: "两天一次" },
  { hours: 72, label: "三天一次" },
  { hours: 168, label: "每周" },
  { hours: 0, label: "不提醒" },
];

/** One row of a settings group, the way iOS Settings lays one out: tile, title, detail, then the control under it. */
function Block({
  title,
  detail,
  icon,
  iconTone = "brand",
  mark,
  children,
}: {
  title: string;
  detail?: React.ReactNode;
  icon: React.ReactNode;
  iconTone?: IconTone;
  /** a small mark beside the title, like a status light */
  mark?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-4">
      <IconTile tone={iconTone} className="mt-0.5">
        {icon}
      </IconTile>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2.5 text-lg font-medium text-ink">
          {title}
          {mark}
        </p>
        {detail && <p className="t-body mt-1 text-ink-2">{detail}</p>}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { state, updateSettings, resetAll, exportJSON } = useStore();
  const router = useRouter();
  const toast = useToast();
  const [perm, setPerm] = useState<Perm>(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [pinging, setPinging] = useState(false);
  const [confirm, setConfirm] = useState<null | "reset">(null);

  useEffect(() => {
    let alive = true;
    aiHealth().then((h) => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, []);

  const notifyOn = state.settings.notificationsEnabled && perm === "granted";
  const interval = state.settings.checkInIntervalHours;

  const toggleNotify = async (on: boolean) => {
    if (perm === "unsupported") return;
    if (!on) {
      updateSettings({ notificationsEnabled: false });
      toast.show("已关掉提醒");
      return;
    }
    const p = perm === "granted" ? "granted" : await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") {
      updateSettings({ notificationsEnabled: true });
      try {
        new Notification("医伴", { body: "提醒已经打开。到了该问你的时候，我会来提醒。" });
      } catch {
        /* ignore */
      }
      toast.show("已打开提醒", "good");
    } else {
      toast.show("浏览器没有允许通知。请在地址栏左边的网站设置里允许", "danger");
    }
  };

  const ping = async () => {
    setPinging(true);
    const h = await aiHealth(true);
    setHealth(h);
    setPinging(false);
    if (h.ok) toast.show(`连接正常，用了 ${((h.latencyMs ?? 0) / 1000).toFixed(1)} 秒`, "good");
    else toast.show(h.configured ? "没连上，请检查 Key 和网络" : "还没有配置 API Key", "danger");
  };

  const download = () => {
    const blob = new Blob([exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yiban-backup-${fmtISODate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.show("备份文件已经下载", "good");
  };

  // the AI row glows by its state: checking, connected, not reachable, not set up
  const aiTone: IconTone = !health ? "neutral" : health.configured && health.ok !== false ? "solid" : health.configured ? "warn" : "neutral";
  const aiLight = !health
    ? "bg-line-strong"
    : health.configured && health.ok !== false
      ? "bg-good shadow-[0_0_0_3px_var(--color-good-bg)]"
      : health.configured
        ? "bg-warn shadow-[0_0_0_3px_var(--color-warn-bg)]"
        : "bg-line-strong";

  return (
    <div className="space-y-6 pb-2">
      <PageHeader back={{ href: "/me", label: "我的档案" }} title="设置" />

      <section className="rise-1">
        <SectionTitle>提醒</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          <Block icon={<Timer />} title="多久问我一次" detail="有不舒服在跟踪时，我按这个节奏在首页问你怎么样了。拖了两周以上的，改成每周问一次。">
            <Select
              value={String(interval)}
              aria-label="多久问我一次"
              onChange={(e) => {
                updateSettings({ checkInIntervalHours: Number(e.target.value) });
                toast.show("已改好", "good");
              }}
            >
              {INTERVALS.map((i) => (
                <option key={i.hours} value={i.hours}>
                  {i.label}
                </option>
              ))}
            </Select>
          </Block>
          {state.settings.longTerm && (
            <Block icon={<Droplets />} iconTone="info" title="多久提醒我记血糖" detail="血压和体重最多每周提醒一次。">
              <Select
                value={String(state.settings.metricReminderHours)}
                aria-label="多久提醒我记血糖"
                onChange={(e) => {
                  updateSettings({ metricReminderHours: Number(e.target.value) });
                  toast.show("已改好", "good");
                }}
              >
                {METRIC_CADENCE.map((c) => (
                  <option key={c.hours} value={c.hours}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Block>
          )}
          {perm === "unsupported" || perm === "denied" ? (
            <Block
              icon={<BellOff />}
              iconTone="neutral"
              title="弹出提醒"
              detail={
                perm === "unsupported"
                  ? "这个浏览器不能弹出提醒。打开医伴时，首页照样会问你。"
                  : "浏览器不允许这个网站发通知。请在地址栏左边的网站设置里允许，再回来打开。"
              }
            />
          ) : (
            <Toggle
              checked={notifyOn}
              onChange={(v) => void toggleNotify(v)}
              icon={<Bell />}
              iconTone={notifyOn ? "solid" : "brand"}
              label="弹出提醒"
              detail="网页开着的时候，到时间会弹出一条通知。关掉网页就不会提醒了。"
            />
          )}
        </Card>
      </section>

      <section className="rise-2">
        <SectionTitle>我的数据</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          <Block
            icon={<HardDrive />}
            iconTone="neutral"
            title="数据存在哪里"
            detail="档案和记录只存在这台设备的浏览器里，每个账号分开存。只有在你和医伴说话、整理给医生看的内容、认照片和语音的时候，相关内容才会发给 AI 模型。"
          />
          <Block icon={<Download />} title="备份" detail="把档案和全部记录存成一个文件。">
            <Button variant="secondary" className="press" onClick={download}>
              <Download className="h-5 w-5" />
              下载备份
            </Button>
          </Block>
          <Block icon={<Play />} iconTone="info" title="看看演示" detail="林叔是虚构的病人，有一次左膝痛的记录。打开演示会先退出你的账号，你的档案和记录不受影响。">
            <LinkButton href="/demo/lin" variant="secondary" className="press">
              林叔的演示
            </LinkButton>
          </Block>
          <Block icon={<Trash2 />} iconTone="danger" title="全部清空" detail="删掉这个账号的档案和所有记录，从头开始。账号本身还在。">
            <Button variant="dangerSoft" className="press" onClick={() => setConfirm("reset")}>
              全部清空
            </Button>
          </Block>
        </Card>
      </section>

      <section className="rise-3">
        <SectionTitle>关于</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          <Block
            icon={<Info />}
            iconTone="neutral"
            title="使用须知"
            detail="医伴只帮你记录、整理和提醒，不做诊断，不建议用药。指标的范围是一般的标准，你自己的目标听医生的。胸痛、喘不上气、神志不清、大出血这类急事，请立即拨打 120。"
          />
          <Block
            icon={<Sparkles />}
            iconTone={aiTone}
            title="AI 连接"
            mark={<span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 rounded-full transition-all duration-300", aiLight, !health && "animate-breathe")} />}
            detail={
              !health ? (
                <span className="inline-flex items-center gap-2.5">
                  <Spinner className="h-5 w-5" />
                  正在检查…
                </span>
              ) : health.configured ? (
                <>
                  已连接智谱 GLM。对话 {health.model}，认照片 {health.visionModel}，听语音 {health.speechModel}
                  {health.ok === true && health.latencyMs != null && `。刚才测试用了 ${(health.latencyMs / 1000).toFixed(1)} 秒`}
                  {health.ok === false && "。刚才测试没连上，对话会先用内置规则顶上"}
                  。Key 和模型名在项目根目录的 .env.local 里改。
                </>
              ) : (
                "还没有配置 GLM API Key。现在用内置规则回答，不能听语音、认照片。把 Key 填进 .env.local 再重启就可以了。"
              )
            }
          >
            <Button variant="secondary" className="press" onClick={ping} loading={pinging}>
              测试连接
            </Button>
          </Block>
        </Card>
      </section>

      <Modal
        open={confirm === "reset"}
        title="全部清空？"
        onClose={() => setConfirm(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              不清了
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetAll();
                setConfirm(null);
                router.replace("/onboarding");
              }}
            >
              全部清空
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3.5">
          <IconTile tone="solidDanger" size="lg">
            <Trash2 />
          </IconTile>
          <p className="t-lead pt-1.5 text-ink">档案、全部记录和对话都会删掉，找不回来。</p>
        </div>
      </Modal>
    </div>
  );
}
