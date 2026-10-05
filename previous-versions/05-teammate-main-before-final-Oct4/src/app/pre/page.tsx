"use client";

import { ChatScreen } from "@/components/chat/ChatScreen";

/** pre: before seeing the doctor. Say what is wrong; the questions, the description and the triage advice come back here. */
export default function PrePage() {
  return <ChatScreen mode="pre" />;
}
