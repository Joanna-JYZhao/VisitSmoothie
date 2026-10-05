"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { useStore } from "@/lib/store";
import { hasYearOfData } from "@/lib/metrics";
import { LinkButton, Notice } from "@/components/ui";

/** /doctor without an id: go to whatever there is to show. */
export default function DoctorIndexPage() {
  const { state } = useStore();
  const router = useRouter();
  const active = state.episodes.find((e) => e.status === "active");
  const target = active ? `/doctor/${active.id}` : hasYearOfData(state) ? "/doctor/year" : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (target) return null;
  return (
    <Notice icon={<FileText className="h-6 w-6" />} title="现在没有要给医生看的" action={<LinkButton href="/">回到今天</LinkButton>}>
      在首页说一句哪里不舒服，记下来以后这里就有了。
    </Notice>
  );
}
