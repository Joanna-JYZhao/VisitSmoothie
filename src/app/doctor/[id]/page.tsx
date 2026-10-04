"use client";

import { useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { EpisodeSheet } from "@/components/EpisodeSheet";
import { LinkButton, Notice } from "@/components/ui";
import { FileSearch } from "lucide-react";
import { L } from "@/lib/lang";

export default function DoctorEpisodePage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const episode = state.episodes.find((e) => e.id === id);
  if (!episode) {
    return (
      <Notice
        icon={<FileSearch className="h-6 w-6" />}
        title={L("找不到这条记录", "This record cannot be found")}
        action={<LinkButton href="/">{L("回到今天", "Back to today")}</LinkButton>}
      >
        {L("它可能已经被删除了。", "It may have been deleted.")}
      </Notice>
    );
  }
  return <EpisodeSheet episode={episode} />;
}