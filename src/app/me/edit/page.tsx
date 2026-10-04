"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { ChipsInput } from "@/components/ChipsInput";
import {
  ContactFields,
  RegisterFields,
  draftFromProfile,
  missingFields,
  profileFromRegister,
  registerFromProfile,
  validateRegister,
} from "@/components/ProfileForm";
import type { RequiredField } from "@/app/me/profile-data";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, PageTitle } from "@/components/ui";

/** 修改资料: the same seven items as signing up, then medicines and who to call. */
export default function EditProfilePage() {
  const { state, setProfile } = useStore();
  const router = useRouter();
  const toast = useToast();
  const [reg, setReg] = useState(() => (state.profile ? registerFromProfile(state.profile) : null));
  const [more, setMore] = useState(() => (state.profile ? draftFromProfile(state.profile) : null));
  const [missing, setMissing] = useState<RequiredField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const contact = useRef<HTMLDivElement>(null);
  // "去填一个" on the emergency page lands on the contact, not at the top of a long form
  useEffect(() => {
    if (window.location.hash !== "#contact") return;
    const t = setTimeout(() => contact.current?.scrollIntoView({ block: "center" }), 150);
    return () => clearTimeout(t);
  }, []);
  if (!reg || !more || !state.profile) return null;

  const save = () => {
    const bad = validateRegister(reg);
    if (bad) {
      setMissing(missingFields(reg));
      setError(bad);
      return;
    }
    if (more.contactPhone.trim() && more.contactPhone.replace(/\D/g, "").length < 7) {
      setError("紧急联系人的电话好像不完整，请再看一眼。");
      return;
    }
    setProfile(
      profileFromRegister(reg, {
        ...state.profile,
        medications: more.medications,
        emergencyContact: more.contactPhone.trim()
          ? { name: more.contactName.trim() || "家人", relation: more.contactRelation.trim(), phone: more.contactPhone.trim() }
          : null,
      }),
    );
    toast.show("已保存", "good");
    router.push("/me");
  };

  return (
    <div className="space-y-5">
      <PageTitle sub="这些内容给医生看的时候会带上（学历除外）。">修改资料</PageTitle>
      <Card className="p-5">
        <RegisterFields
          nameLocked
          draft={reg}
          onChange={(d) => {
            setReg(d);
            setError(null);
            setMissing((m) => m.filter((f) => missingFields(d).includes(f)));
          }}
          missing={missing}
        />
      </Card>
      <Card className="p-5">
        <Field label="长期吃的药" hint="打完按回车，可以写好几样。">
          <ChipsInput value={more.medications} onChange={(v) => setMore({ ...more, medications: v })} placeholder="比如：降压药" />
        </Field>
      </Card>
      <div ref={contact} id="contact" className="scroll-mt-24">
        <Card className="p-5">
          <h2 className="text-xl font-semibold text-ink">紧急联系人</h2>
          <p className="mt-1 mb-4 text-base leading-relaxed text-ink-2">出了状况时，旁边的人可以打给谁。</p>
          <ContactFields draft={more} onChange={setMore} />
        </Card>
      </div>
      {error && (
        <p role="alert" className="rounded-2xl border border-danger/30 bg-danger-bg px-4 py-3 text-lg font-medium text-danger">
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
