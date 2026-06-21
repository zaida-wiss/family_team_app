import { BriefcaseBusiness, Plus, Users } from "lucide-react";
import { useState } from "react";
import { accountsApi } from "../../api";
import { CreateAccountForm } from "./CreateAccountForm";
import type { AccountType, Membership, User } from "@shared/types";

type Props = {
  user: User;
  memberships: Membership[];
  onSelect: (membership: Membership) => void;
  onLogout: () => void;
  onMembershipsUpdated: (memberships: Membership[]) => void;
};

export function AccountPicker({ user, memberships, onSelect, onLogout, onMembershipsUpdated }: Props) {
  const [creating, setCreating] = useState(false);

  async function handleCreate(name: string, type: AccountType) {
    const { membership } = await accountsApi.setup(name, type);
    const updated = [...memberships, membership];
    onMembershipsUpdated(updated);
    onSelect(membership);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Välkommen, {user.name}</p>
        <h1 className="auth-title">
          {memberships.length === 0 ? "Kom igång" : "Välj konto"}
        </h1>

        {creating ? (
          <CreateAccountForm
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <>
            {memberships.length > 0 && (
              <div className="account-picker-list">
                {memberships.map(({ member, account }) => (
                  <button
                    className="account-picker-row"
                    key={member.id}
                    onClick={() => onSelect({ member, account })}
                    type="button"
                  >
                    <span className="account-icon">
                      {account?.type === "family" ? (
                        <Users size={20} />
                      ) : (
                        <BriefcaseBusiness size={20} />
                      )}
                    </span>
                    <span className="account-picker-info">
                      <strong>{account?.name ?? "Okänt konto"}</strong>
                      <small>{member.isChild ? "Barnkonto" : member.name}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {memberships.length === 0 && (
              <p className="empty-note">
                Du är inte med i något konto. Skapa ett nytt eller vänta på en inbjudan.
              </p>
            )}

            <button
              className="account-picker-row"
              onClick={() => setCreating(true)}
              type="button"
              style={{ marginTop: memberships.length > 0 ? 4 : 0 }}
            >
              <span className="account-icon"><Plus size={20} /></span>
              <span className="account-picker-info">
                <strong>Skapa nytt konto</strong>
                <small>Familj eller arbetsplats</small>
              </span>
            </button>

            <button className="auth-switch" onClick={onLogout} type="button">
              Logga ut
            </button>
          </>
        )}
      </div>
    </main>
  );
}
