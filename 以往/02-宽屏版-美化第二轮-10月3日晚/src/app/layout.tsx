import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";
import { CheckInScheduler } from "@/components/CheckInScheduler";
import { DevSwitch } from "@/components/DevSwitch";

export const metadata: Metadata = {
  title: { default: "医伴 · 你的私人医生助理", template: "%s · 医伴" },
  description: "帮你记录病情和病史，就医时把整理好的信息交给医生。说不清的，我帮你说清楚；记不住的，我帮你记住。",
};

export const viewport: Viewport = {
  // the colour at the very top of every page, so the browser's own bar blends into it
  themeColor: "#edf4f7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full">
        <StoreProvider>
          <ToastProvider>
            <div className="px-3 pt-2 md:contents">
              <DevSwitch />
            </div>
            <AppShell>{children}</AppShell>
            <CheckInScheduler />
          </ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
