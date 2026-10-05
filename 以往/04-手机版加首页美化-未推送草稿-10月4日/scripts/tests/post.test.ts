/*
 * post（看完医生）里不碰浏览器的部分：长文本截断、分段数、进度、并发。
 * Run with: npx tsx scripts/tests/post.test.ts
 */
import { check, finish } from "./_check";
import { clipEstimate, clipText, clockText, mapLimit, progressText, splitAtQuiet } from "../../src/lib/audio";

// cutting a long transcript
const short = "医生说吃药";
check("短文本不动", clipText(short) === short);
const long = "开头" + "中".repeat(10_000) + "结尾的医嘱两周后复诊";
const cut = clipText(long, 4000);
check("截断后不超过 4000 字", cut.length <= 4000, cut.length);
check("保留开头", cut.startsWith("开头"));
check("保留结尾", cut.endsWith("结尾的医嘱两周后复诊"));
check("标出中间省略", cut.includes("中间省略"));
check("正好 4000 字不截", clipText("a".repeat(4000)).length === 4000);

// how many clips, and the progress line
check("10 秒一段", clipEstimate(10) === 1);
check("28 秒一段", clipEstimate(28) === 1);
check("60 分钟约 129 段", clipEstimate(3600) === 129, clipEstimate(3600));
check("没声音 0 段", clipEstimate(0) === 0);
check("进度文字", progressText(3, 40) === "正在转写 3/40");
check("进度不超过总数", progressText(41, 40) === "正在转写 40/40");
check("计时 mm:ss", clockText(65) === "01:05");
check("计时过一小时", clockText(3600) === "1:00:00");

// the real splitter: 90 seconds of 16 kHz tone with a quiet gap every 20 seconds
const RATE = 16_000;
const samples = new Float32Array(90 * RATE);
for (let i = 0; i < samples.length; i++) samples[i] = (i / RATE) % 20 < 19 ? 0.3 * Math.sin(i / 5) : 0;
const clips = splitAtQuiet(samples);
check("90 秒切成 4 段", clips.length === 4, clips.map((c) => c.length / RATE));
check("每段不超过 28 秒", clips.every((c) => c.length <= 28 * RATE));
check("切完总长不变", clips.reduce((n, c) => n + c.length, 0) === samples.length);

// four at a time, order kept, progress reported once per item
(async () => {
  let running = 0;
  let peak = 0;
  const seen: number[] = [];
  const out = await mapLimit(
    Array.from({ length: 10 }, (_, i) => i),
    4,
    async (x) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5 + (x % 3) * 3));
      running--;
      return x * 2;
    },
    (done) => seen.push(done),
  );
  check("结果按原顺序", JSON.stringify(out) === JSON.stringify([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]));
  check("同时最多 4 个", peak === 4, peak);
  check("进度 1..10", JSON.stringify(seen) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  finish("post");
})();
