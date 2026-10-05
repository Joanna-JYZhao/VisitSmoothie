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
import { L } from "@/lib/lang";

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
      setError(L("紧急联系人的电话好像不完整，请再看一眼。", "The emergency contact's phone number looks incomplete. Please check it."));
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
    toast.show(L("已保存", "Saved"), "good");
    router.push("/me");
  };

  return (
    <div className="space-y-6 pb-2">
      <PageTitle sub={L("这些内容给医生看的时候会带上（学历除外）。", "All of this goes to the doctor along with your records (except education).")}>
        {L("修改资料", "Edit profile")}
      </PageTitle>

      {/* the card being edited keeps the tile it has on the profile page, so the form reads as the same thing opened up */}
      <Card tone="raised" className="rise-1 overflow-hidden">
        <div className="light flex items-center gap-3.5 border-b border-line px-4 py-4">
          <IconTile tone="solid" size="lg">
            <IdCard />
          </IconTile>
          <span aria-hidden="true" className="t-heading text-ink">
            {state.profile.name}
          </span>
        </div>
        <div className="p-4">
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

      <Card className="rise-2 p-4">
        <div className="flex items-start gap-3.5">
          <IconTile tone="info">
            <Pill />
          </IconTile>
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="t-heading text-ink">{L("长期吃的药", "Regular medicines")}</h2>
            <p className="t-body mt-1 text-ink-2">{L("打完按回车，可以写好几样。", "Press Enter after each one. You can add several.")}</p>
          </div>
        </div>
        <div className="mt-5">
          <ChipsInput value={more.medications} onChange={(v) => setMore({ ...more, medications: v })} placeholder={L("比如：降压药", "e.g. blood pressure pills")} />
        </div>
      </Card>

      <div ref={contact} id="contact" className="rise-3 scroll-mt-24">
        <Card className="p-4">
          <div className="flex items-start gap-3.5">
            <IconTile tone="good">
              <Phone />
            </IconTile>
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="t-heading text-ink">{L("紧急联系人", "Emergency contact")}</h2>
              <p className="t-body mt-1 text-ink-2">{L("出了状况时，旁边的人可以打给谁。", "Who people nearby can call if something happens.")}</p>
            </div>
          </div>
          <div className="mt-6">
            <ContactFields draft={more} onChange={setMore} />
          </div>
        </Card>
      </div>

      {error && (
        <div role="alert" className="flex animate-pop items-center gap-3.5 rounded-card border border-danger/15 bg-danger-bg px-4 py-4">
          <IconTile tone="danger">
            <CircleAlert />
          </IconTile>
          <p className="t-lead font-medium text-danger">{error}</p>
        </div>
      )}

      <div className="rise-4 grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" className="press" onClick={() => router.push("/me")}>
          {L("不改了", "Cancel")}
        </Button>
        <Button size="lg" className="press" onClick={save}>
          {L("保存", "Save")}
        </Button>
      </div>
    </div>
  );
}
