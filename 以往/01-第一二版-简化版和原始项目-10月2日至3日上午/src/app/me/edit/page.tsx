"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { BasicFields, ContactFields, HistoryFields, draftFromProfile, profileFromDraft, validateBasics } from "@/components/ProfileForm";
import { useToast } from "@/components/Toast";
import { Button, Card, PageHeader } from "@/components/ui";

export default function EditProfilePage() {
  const { state, setProfile } = useStore();
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState(() => (state.profile ? draftFromProfile(state.profile) : null));
  const [error, setError] = useState<string | null>(null);
  const contact = useRef<HTMLDivElement>(null);
  // "去填一个" on the emergency page lands on the contact, not at the top of a long form
  useEffect(() => {
    if (window.location.hash !== "#contact") return;
    const t = setTimeout(() => contact.current?.scrollIntoView({ block: "center" }), 150);
    return () => clearTimeout(t);
  }, []);
  if (!draft || !state.profile) return null;

  const save = () => {
    const problem = validateBasics(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setProfile(profileFromDraft(draft, state.profile));
    toast.show("已保存", "good");
    router.push("/me");
  };

  return (
    <div className="space-y-5">
      <PageHeader back={{ href: "/me", label: "我的档案" }} title="修改档案" sub="这些内容每次给医生看的时候都会带上。" />
      <Card className="p-5">
        <BasicFields draft={draft} onChange={setDraft} />
      </Card>
      <Card className="p-5">
        <HistoryFields draft={draft} onChange={setDraft} />
      </Card>
      <div ref={contact} id="contact" className="scroll-mt-24">
        <Card className="p-5">
          <h2 className="text-xl font-semibold text-ink">紧急联系人</h2>
          <p className="mt-1 mb-4 text-base leading-relaxed text-ink-2">出了状况时，旁边的人可以打给谁。</p>
          <ContactFields draft={draft} onChange={setDraft} />
        </Card>
      </div>
      {error && (
        <p role="alert" className="text-lg font-medium text-danger">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={() => router.push("/me")}>
          不改了
        </Button>
        <Button size="lg" onClick={save}>
          保存
        </Button>
      </div>
    </div>
  );
}
