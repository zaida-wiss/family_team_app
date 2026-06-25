import type { Account, Member } from "@shared/types";
import { MemberAvatar } from "../../components/MemberAvatar";
import styles from "./MemberPicker.module.css";

type Props = {
  account: Account;
  members: Member[];
  onSelect: (memberId: string) => void;
};

export function MemberPicker({ account, members, onSelect }: Props) {
  return (
    <main className={styles.picker}>
      <p className="eyebrow">Familj</p>
      <h1>{account.name}</h1>
      <p className={styles.prompt}>Vem är du?</p>
      <div className={styles.grid}>
        {members.map((member) => (
          <button
            className={styles.button}
            key={member.id}
            onClick={() => onSelect(member.id)}
            type="button"
          >
            <MemberAvatar member={member} showArchedName />
          </button>
        ))}
      </div>
    </main>
  );
}
