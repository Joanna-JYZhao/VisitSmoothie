"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, IdCard, Phone, Pill } from "lucide-react";
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
import { Button, Card, IconTile, PageTitle } from "@/components/ui";

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
    <div className="space-y-8">
      <PageTitle sub="这些内容给医生看的时候会带上（学历除外）。">修改资料</PageTitle>

      {/* the card being edited keeps the tile it has on the profile page, so the form reads as the same thing opened up */}
      <Card tone="raised" className="rise-1 overflow-hidden">
        <div className="light flex items-center gap-4 border-b border-line px-5 py-5 sm:px-6">
          <IconTile tone="solid" size="lg">
            <IdCard />
          </IconTile>
          <span aria-hidden="true" className="t-heading text-ink">
            {state.profile.name}
          </span>
        </div>
        <div className="p-5 sm:p-6">
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
        </div>
      </Card>

      <Card className="rise-2 p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <IconTile tone="info">
            <Pill />
          </IconTile>
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="t-heading text-ink">长期吃的药</h2>
            <p className="t-body mt-1 text-ink-2">打完按回车，可以写好几样。</p>
          </div>
        </div>
        <div className="mt-5">
          <ChipsInput value={more.medications} onChange={(v) => setMore({ ...more, medications: v })} placeholder="比如：降压药" />
        </div>
      </Card>

      <div ref={contact} id="contact" className="rise-3 scroll-mt-24">
        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <IconTile tone="good">
              <Phone />
            </IconTile>
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="t-heading text-ink">紧急联系人</h2>
              <p className="t-body mt-1 text-ink-2">出了状况时，旁边的人可以打给谁。</p>
            </div>
          </div>
          <div className="mt-6">
            <ContactFields draft={more} onChange={setMore} />
          </div>
        </Card>
      </div>

      {error && (
        <div role="alert" className="flex animate-pop items-center gap-3.5 rounded-card border border-danger/15 bg-danger-bg px-5 py-4 shadow-card">
          <IconTile tone="danger">
            <CircleAlert />
          </IconTile>
          <p className="t-lead font-medium text-danger">{error}</p>
        </div>
      )}

      <div className="rise-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" className="press" onClick={() => router.push("/me")}>
          不改了
        </Button>
        <Button size="lg" className="press" onClick={save}>
          保存
        </Button>
      </div>
    </div>
  );
}
