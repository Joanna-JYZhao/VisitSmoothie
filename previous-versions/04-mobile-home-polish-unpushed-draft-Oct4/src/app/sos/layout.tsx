import type { Metadata } from "next";

/*
 * Here only for the name. A bookmark or a home-screen shortcut takes the page title, and this
 * page is opened on its own, so it is called what it is. `absolute` leaves out the root template
 * ("%s · 医伴"): a phone cuts long names short under a home-screen icon.
 * No `appleWebApp` on purpose: it would turn on standalone mode, and on an iPhone a standalone
 * shortcut keeps its own storage, so it would open without the profile.
 */
export const metadata: Metadata = { title: { absolute: "应急手册" } };

/** Next needs a layout to render its children; this one adds nothing around them. */
export default function SosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
