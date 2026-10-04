import { spawn, execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const nextCli = path.join(root, "node_modules/next/dist/bin/next");
const ports = Array.from({ length: 21 }, (_, i) => 3000 + i);
let child = null;
let stopping = false;

function stop() {
  stopping = true;
  if (child?.pid && child.exitCode == null && child.signalCode == null) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* The owned group already exited. */ }
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, stop);

function thisProjectListens(port) {
  try {
    const pids = execFileSync("/usr/sbin/lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\s+/);
    return pids.some((pid) => {
      try {
        const command = execFileSync("/bin/ps", ["-p", pid, "-o", "command="], { encoding: "utf8" });
        if (!/next-server|next\/dist\/bin\/next/.test(command)) return false;
        const cwd = execFileSync("/usr/sbin/lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").find((line) => line.startsWith("n"))?.slice(1);
        return cwd && realpathSync(cwd) === root;
      } catch { return false; }
    });
  } catch { return false; }
}

async function available(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

async function waitForPage(url) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (stopping) throw new Error("启动已取消。");
    if (child && (child.exitCode != null || child.signalCode != null)) throw new Error("网页服务未能启动，请查看上方日志。");
    try {
      const response = await fetch(`${url}/welcome`, { signal: AbortSignal.timeout(2000), redirect: "manual" });
      const ready = response.status === 200;
      await response.body?.cancel();
      if (ready) return;
    } catch { /* Next.js is still starting or compiling the welcome page. */ }
    await delay(400);
  }
  throw new Error("网页在 90 秒内没有准备好，请查看上方日志后重新启动。");
}

function openBrowser(url) {
  execFileSync("/usr/bin/open", [url], { stdio: "inherit" });
  console.log(`\n网页已打开：${url}`);
}

async function main() {
  if (process.platform !== "darwin") throw new Error("此双击入口适用于 macOS；其他系统请运行 npm run dev。");
  process.chdir(root);
  console.log("VisitSmoothie · 正在启动网页…");

  for (const port of ports) {
    if (thisProjectListens(port)) {
      const url = `http://127.0.0.1:${port}`;
      console.log("检测到本项目已启动，复用已有服务。");
      await waitForPage(url);
      openBrowser(url);
      return;
    }
  }

  if (!existsSync(nextCli)) {
    console.log("首次启动：正在安装项目依赖…");
    const install = spawn("npm", ["ci", "--no-audit", "--no-fund"], { cwd: root, stdio: "inherit", detached: true });
    child = install;
    const code = await new Promise((resolve, reject) => { install.once("error", reject); install.once("exit", resolve); });
    child = null;
    if (stopping) return;
    if (code !== 0) throw new Error("依赖安装失败，请确认 npm 和网络可用。");
  }

  let port;
  for (const candidate of ports) {
    if (await available(candidate)) { port = candidate; break; }
  }
  if (!port) throw new Error("3000–3020 端口均被占用，请关闭不需要的服务后重试。");
  if (stopping) return;

  const url = `http://127.0.0.1:${port}`;
  console.log(`项目：${root}\n地址：${url}\n首次编译稍需等待。请保持此终端窗口打开；按 Ctrl+C 停止网页服务。\n`);
  child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, stdio: "inherit", detached: true });
  const exited = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal })); });
  // Handle early startup failures while readiness is still being checked.
  exited.catch(() => {});
  await waitForPage(url);
  openBrowser(url);
  const result = await exited;
  if (!stopping && (result.code !== 0 || result.signal)) throw new Error("网页服务已异常退出，请查看上方日志。");
}

main().catch((error) => {
  stop();
  console.error(`\n${error.message}`);
  process.exitCode = stopping && error.message === "启动已取消。" ? 0 : 1;
});
