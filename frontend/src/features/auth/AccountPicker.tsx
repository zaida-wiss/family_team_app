import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { accountsApi } from "../../api";
import { CreateAccountForm } from "./CreateAccountForm";
import styles from "./Auth.module.css";
import type { Membership, User } from "@shared/types";

type Props = {
  user: User;
  memberships: Membership[];
  onSelect: (membership: Membership) => void;
  onLogout: () => void;
  onMembershipsUpdated: (memberships: Membership[]) => void;
};

export function AccountPicker({ user, memberships, onSelect, onLogout, onMembershipsUpdated }: Props) {
  const [creating, setCreating] = useState(false);

  async function handleCreate(name: string) {
    const { membership } = await accountsApi.setup(name);
    const updated = [...memberships, membership];
    onMembershipsUpdated(updated);
    onSelect(membership);
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className="eyebrow">Välkommen, {user.name}</p>
        <h1 className={styles.title}>
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
              <div className={styles.accountList}>
                {memberships.map(({ member, account }) => (
                  <button
                    className={styles.accountRow}
                    key={member.id}
                    onClick={() => onSelect({ member, account })}
                    type="button"
                  >
                    <span className={styles.accountIcon}><Users size={20} /></span>
                    <span className={styles.accountInfo}>
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
              className={styles.accountRow}
              onClick={() => setCreating(true)}
              type="button"
              style={{ marginTop: memberships.length > 0 ? 4 : 0 }}
            >
              <span className={styles.accountIcon}><Plus size={20} /></span>
              <span className={styles.accountInfo}>
                <strong>Skapa nytt familjekonto</strong>
                <small>Bjud sedan in familjemedlemmar</small>
              </span>
            </button>

            <button className={styles.switchButton} onClick={onLogout} type="button">
              Logga ut
            </button>
          </>
        )}
      </div>
    </main>
  );
}
