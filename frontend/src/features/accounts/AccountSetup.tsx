import { useState } from "react";
import { ImagePlus, Loader, X } from "lucide-react";
import { MemberAvatar } from "../../components/MemberAvatar";
import { uploadImage } from "../../utils/uploadImage";
import { reportApiError } from "../../api";
import type { Member } from "@shared/types";

type AccountSetupProps = {
  currentMember: Member;
  myAvatarUrl: string | null;
  onUpdateMyAvatar: (avatarUrl: string | null) => Promise<void>;
};

// Rent ANVÄNDAR-innehåll (2026-08-11, Zaidas fynd: "det står fortfarande
// familjekonto under konto i inställningar. Där skall endast uppgifter om
// användaren finnas, inte vilka familjer användaren är med i") — den här
// komponenten visade tidigare ÄVEN ett "Familjens namn"-fält (redigerar
// account.name, det AKTIVA KONTOTS/familjens namn, inte något om
// användaren själv) under Inställningar → Konto → Konto. Flyttad till
// AccountSettings.tsx (Familj → Familjemedlemmar, bakom canManageMembers)
// — samma resonemang som redan användes för "Skapa ny familj" tidigare
// samma dag (flyttad från Konto → Familj → Mina familjekonton).
export function AccountSetup({
  currentMember,
  myAvatarUrl,
  onUpdateMyAvatar
}: AccountSetupProps) {
  const [uploading, setUploading] = useState(false);

  // 2026-08-10, Zaidas önskemål: "Man ska kunna lägga till bild på sitt
  // konto. Då får man automatiskt den bilden i de familjer man är med i,
  // med möjlighet att byta bild inom varje familj." — kontonivå-bilden
  // (User.avatarUrl) är skild från en medlems egen, per-familj satta
  // avatarUrl (MemberEditModal.tsx, som alltid har företräde när satt).
  async function updateMyAvatar(file: File | null) {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const avatarUrl = await uploadImage(file, "avatars");
      await onUpdateMyAvatar(avatarUrl);
    } catch {
      reportApiError("Bilden kunde inte laddas upp");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="settings-sub">
        <h3 className="settings-sub-title">Din profilbild</h3>
        <p className="settings-sub-desc">
          Visas automatiskt i alla familjer du är med i, om inte familjen redan har en egen bild för dig.
        </p>
        <div className="account-setup__avatar-row">
          <MemberAvatar
            member={{
              id: currentMember.id,
              name: currentMember.name,
              avatarUrl: myAvatarUrl,
              color: currentMember.color,
              isChild: currentMember.isChild
            }}
            size="small"
          />
          <label
            aria-label="Välj profilbild"
            className={`icon-button${uploading ? " icon-button--loading" : ""}`}
            title="Välj bild"
          >
            {uploading ? <Loader size={16} className="spin" /> : <ImagePlus size={16} />}
            <input
              accept="image/*"
              disabled={uploading}
              hidden
              onChange={(event) => {
                void updateMyAvatar(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
          {myAvatarUrl ? (
            <button
              aria-label="Ta bort profilbild"
              className="icon-button"
              onClick={() => void onUpdateMyAvatar(null)}
              title="Ta bort bild"
              type="button"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
