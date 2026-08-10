import { useState } from "react";
import { ImagePlus, Loader, X } from "lucide-react";
import { CreateAccountForm } from "../auth/CreateAccountForm";
import { MemberAvatar } from "../../components/MemberAvatar";
import { uploadImage } from "../../utils/uploadImage";
import { reportApiError } from "../../api";
import type { Account, Member } from "@shared/types";

type AccountSetupProps = {
  account: Account;
  currentMember: Member;
  myAvatarUrl: string | null;
  onUpdateAccount: (account: Account) => void;
  onCreateFamily: (name: string) => Promise<void>;
  onUpdateMyAvatar: (avatarUrl: string | null) => Promise<void>;
};

export function AccountSetup({
  account,
  currentMember,
  myAvatarUrl,
  onUpdateAccount,
  onCreateFamily,
  onUpdateMyAvatar
}: AccountSetupProps) {
  const [name, setName] = useState(account.name);
  const [creatingFamily, setCreatingFamily] = useState(false);
  const [uploading, setUploading] = useState(false);

  function saveAccount() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onUpdateAccount({ ...account, name: trimmedName });
  }

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

      <div className="settings-sub">
        <h3 className="settings-sub-title">Kontonamn</h3>
        <label className="field-label">
          Familjens namn
          <input
            className="text-input"
            onChange={(event) => setName(event.target.value)}
            placeholder="t.ex. Familjen Solbacken"
            value={name}
          />
        </label>
        <button className="primary-button" onClick={saveAccount} type="button">
          Spara
        </button>
      </div>

      <div className="settings-sub">
        <h3 className="settings-sub-title">Ny familj</h3>
        <p className="settings-sub-desc">
          Du kan vara med i flera familjer samtidigt — byt mellan dem i hemvyn.
        </p>
        {creatingFamily ? (
          <CreateAccountForm
            onCancel={() => setCreatingFamily(false)}
            onSubmit={async (familyName) => {
              await onCreateFamily(familyName);
              setCreatingFamily(false);
            }}
          />
        ) : (
          <button className="secondary-button" onClick={() => setCreatingFamily(true)} type="button">
            Skapa ny familj
          </button>
        )}
      </div>
    </>
  );
}
